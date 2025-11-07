import { Router } from 'express';
import { z } from 'zod';
import { db } from '../lib/database';
import { decryptCredentials } from '../lib/crypto';
import { runPowerpipeBenchmark, getBenchmarkName } from '../lib/powerpipe';
import { verifyToken, verifySuperAdmin } from './auth';

const router = Router();

// Maximum scan duration in milliseconds (30 minutes)
const MAX_SCAN_DURATION_MS = 30 * 60 * 1000;

// Apply auth middleware to all routes
router.use(verifyToken);

const createScanSchema = z.object({
  client_id: z.string().uuid(),
  frameworks: z.array(z.string()).optional(), // If not provided, use client's assigned_frameworks
});

// POST /api/scans - Start a new compliance scan (Super Admin only)
router.post('/', verifySuperAdmin, async (req: any, res, next) => {
  try {
    const data = createScanSchema.parse(req.body);
    const { client_id, frameworks } = data;

    // Get client information
    const clientResult = await db.query(
      'SELECT id, assigned_frameworks FROM clients WHERE id = $1',
      [client_id]
    );

    if (clientResult.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const client = clientResult.rows[0];
    // Parse assigned_frameworks if it's a JSON string
    let clientFrameworks = client.assigned_frameworks;
    if (typeof clientFrameworks === 'string') {
      try {
        clientFrameworks = JSON.parse(clientFrameworks);
      } catch (e) {
        console.error('Failed to parse assigned_frameworks:', e);
        clientFrameworks = [];
      }
    }
    const frameworksToScan = frameworks || clientFrameworks;

    if (!frameworksToScan || frameworksToScan.length === 0) {
      return res.status(400).json({ error: 'No frameworks assigned to client' });
    }

    // Get active credentials for the client
    const credentialsResult = await db.query(
      'SELECT id, provider, encrypted_credentials, region, account_id FROM credentials WHERE client_id = $1 AND is_active = true',
      [client_id]
    );

    if (credentialsResult.rows.length === 0) {
      return res.status(400).json({ error: 'No active credentials found for client' });
    }

    // Create compliance check record
    const checkResult = await db.query(
      `INSERT INTO compliance_checks (client_id, frameworks, status, started_at)
       VALUES ($1, $2, $3, NOW())
       RETURNING id, client_id, frameworks, status, started_at`,
      [client_id, JSON.stringify(frameworksToScan), 'in_progress']
    );

    const complianceCheck = checkResult.rows[0];
    const complianceCheckId = complianceCheck.id;

    // Return immediately with the scan record
    // Parse frameworks for response
    const parsedFrameworks = typeof complianceCheck.frameworks === 'string' 
      ? JSON.parse(complianceCheck.frameworks) 
      : complianceCheck.frameworks;

    res.status(201).json({
      id: complianceCheckId,
      client_id,
      frameworks: parsedFrameworks,
      status: 'in_progress',
      total_controls: 0,
      passed_controls: 0,
      failed_controls: 0,
      error_controls: 0,
      skip_controls: 0,
      started_at: complianceCheck.started_at,
      completed_at: null,
    });

    // Execute scans asynchronously in the background
    // Don't await - let it run in background
    executeScan(complianceCheckId, client_id, frameworksToScan, credentialsResult.rows).catch((error) => {
      console.error('Error executing scan in background:', error);
      // Update status to failed
      db.query(
        'UPDATE compliance_checks SET status = $1, completed_at = NOW() WHERE id = $2',
        ['failed', complianceCheckId]
      ).catch((dbError) => {
        console.error('Error updating scan status to failed:', dbError);
      });
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Error in POST /api/scans:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ error: errorMessage });
  }
});

// Async function to execute the scan in the background
async function executeScan(
  complianceCheckId: string,
  client_id: string,
  frameworksToScan: string[],
  credentials: any[]
) {
  const scanStartTime = Date.now();
  
  try {
    // Check if scan has already timed out before starting
    const checkResult = await db.query(
      'SELECT started_at FROM compliance_checks WHERE id = $1',
      [complianceCheckId]
    );
    
    if (checkResult.rows.length > 0) {
      const startedAt = new Date(checkResult.rows[0].started_at);
      const elapsed = Date.now() - startedAt.getTime();
      
      if (elapsed > MAX_SCAN_DURATION_MS) {
        await db.query(
          'UPDATE compliance_checks SET status = $1, completed_at = NOW() WHERE id = $2',
          ['failed', complianceCheckId]
        );
        console.log(`Scan ${complianceCheckId} timed out before execution (${elapsed}ms elapsed)`);
        return;
      }
    }
    // Archive old findings for this client and frameworks before inserting new ones
    // This preserves historical data for compliance tracking while keeping findings table clean
    // We archive findings for the same client and frameworks being scanned
    await db.query(
        `INSERT INTO findings_history (
          original_finding_id, client_id, compliance_check_id, control_id, control_title,
          control_description, framework, domain, category, scan_status, scan_reason,
          scan_resources, remediation_status, assigned_owner_id, notes, status_history,
          ai_business_context, ai_remediation_guidance, original_created_at, original_updated_at,
          archived_by_scan_id
        )
        SELECT 
          id, client_id, compliance_check_id, control_id, control_title,
          control_description, framework, domain, category, scan_status, scan_reason,
          scan_resources, remediation_status, assigned_owner_id, notes, status_history,
          ai_business_context, ai_remediation_guidance, created_at, updated_at,
          $1
        FROM findings
        WHERE client_id = $2
          AND framework = ANY($3::text[])`,
      [complianceCheckId, client_id, frameworksToScan]
    );

    // Delete old findings for this client and frameworks (they're now archived)
    // This ensures findings table only contains the latest scan results
    await db.query(
      'DELETE FROM findings WHERE client_id = $1 AND framework = ANY($2::text[])',
      [client_id, frameworksToScan]
    );

    const allFindings: any[] = [];
    let totalControls = 0;
    let passedControls = 0;
    let failedControls = 0;
    let errorControls = 0;
    let skipControls = 0;
    const verificationWarnings: string[] = [];

    // Run benchmarks for each framework/provider combination
    let benchmarksRun = 0;
    let benchmarksFailed = 0;
    const benchmarkErrors: string[] = [];
    
    for (const credential of credentials) {
      // Check timeout before each credential iteration
      const elapsed = Date.now() - scanStartTime;
      if (elapsed > MAX_SCAN_DURATION_MS) {
        await db.query(
          'UPDATE compliance_checks SET status = $1, completed_at = NOW() WHERE id = $2',
          ['failed', complianceCheckId]
        );
        console.log(`Scan ${complianceCheckId} timed out during execution (${elapsed}ms elapsed)`);
        return;
      }
      
      const decryptedCreds = decryptCredentials(credential.encrypted_credentials);
      const provider = credential.provider;

      for (const framework of frameworksToScan) {
        // Check timeout before each framework iteration
        const elapsed = Date.now() - scanStartTime;
        if (elapsed > MAX_SCAN_DURATION_MS) {
          await db.query(
            'UPDATE compliance_checks SET status = $1, completed_at = NOW() WHERE id = $2',
            ['failed', complianceCheckId]
          );
          console.log(`Scan ${complianceCheckId} timed out during execution (${elapsed}ms elapsed)`);
          return;
        }
          const benchmarkName = getBenchmarkName(framework, provider);

          if (!benchmarkName) {
            console.warn(`No benchmark found for framework ${framework} and provider ${provider}`);
            continue;
          }

          try {
            benchmarksRun++;
            console.log(`Running benchmark: ${benchmarkName} for provider: ${provider}`);
            
            // Configure credentials (set environment variables for Powerpipe/Steampipe)
            // Then execute benchmark
            const result = await runPowerpipeBenchmark(benchmarkName, decryptedCreds, provider);

            console.log(`Benchmark completed: ${benchmarkName} - Total: ${result.summary.total}, Passed: ${result.summary.passed}, Failed: ${result.summary.failed}`);
            
            // Log verification warnings if present
            if (result.verification?.warnings && result.verification.warnings.length > 0) {
              console.warn(`⚠️ Verification warnings for ${benchmarkName}:`);
              result.verification.warnings.forEach(warning => console.warn(`  - ${warning}`));
            }
            
            if (result.verification?.permission_issues_detected) {
              console.warn(`⚠️ Permission issues detected in ${benchmarkName}: ${result.summary.permission_errors} controls affected`);
            }
            
            if (!result.verification?.control_count_valid) {
              console.error(`❌ Control count validation failed for ${benchmarkName}: ${result.summary.total} controls (expected ${result.verification.expected_range?.min}-${result.verification.expected_range?.max})`);
            }

            // Count controls by status from the actual controls array
            let benchmarkPassed = 0;
            let benchmarkFailed = 0;
            let benchmarkError = 0;
            let benchmarkSkip = 0;
            let benchmarkPermissionErrors = 0;

            for (const control of result.controls) {
              // Extract domain/category from control if available
              const domain = control.domain || extractDomainFromControl(control.control_id);
              const category = control.category || null;

              // Count by status
              if (control.status === 'pass') benchmarkPassed++;
              else if (control.status === 'fail') benchmarkFailed++;
              else if (control.status === 'error') benchmarkError++;
              else if (control.status === 'skip') benchmarkSkip++;
              
              // Track permission errors
              if (control.permission_error) benchmarkPermissionErrors++;

              // Get persistent metadata for this control (notes, assignments, etc.)
              const metadataResult = await db.query(
                'SELECT remediation_status, assigned_owner_id, notes, status_history, ai_business_context, ai_remediation_guidance FROM control_metadata WHERE client_id = $1 AND control_id = $2',
                [client_id, control.control_id]
              );
              
              const metadata = metadataResult.rows[0];
              
              // Use persistent remediation_status if it exists and control is failing, otherwise default
              let remediationStatus: string;
              if (metadata && metadata.remediation_status) {
                // If control passes, mark as resolved; otherwise use persisted status
                remediationStatus = control.status === 'pass' ? 'resolved' : metadata.remediation_status;
              } else {
                remediationStatus = control.status === 'fail' ? 'open' : 
                                   control.status === 'pass' ? 'resolved' : 'open';
              }

              // Insert finding with persistent metadata merged in
              const findingResult = await db.query(
                `INSERT INTO findings (
                  client_id, compliance_check_id, control_id, control_title, control_description,
                  framework, domain, category, scan_status, scan_reason, scan_resources,
                  remediation_status, assigned_owner_id, notes, status_history,
                  ai_business_context, ai_remediation_guidance
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
                RETURNING id`,
                [
                  client_id,
                  complianceCheckId,
                  control.control_id,
                  control.title,
                  control.description || null,
                  framework,
                  domain,
                  category,
                  control.status,
                  control.reason || null,
                  control.resources ? JSON.stringify(control.resources) : null,
                  remediationStatus,
                  metadata?.assigned_owner_id || null,
                  metadata?.notes || null,
                  metadata?.status_history ? JSON.stringify(metadata.status_history) : '[]',
                  metadata?.ai_business_context || null,
                  metadata?.ai_remediation_guidance || null,
                ]
              );

              allFindings.push(findingResult.rows[0]);
            }

            // Add to totals
            totalControls += result.controls.length;
            passedControls += benchmarkPassed;
            failedControls += benchmarkFailed;
            errorControls += benchmarkError;
            skipControls += benchmarkSkip;
            
            // Collect verification warnings
            if (result.verification?.warnings) {
              verificationWarnings.push(...result.verification.warnings.map(w => `${benchmarkName}: ${w}`));
            }
          } catch (error) {
            benchmarksFailed++;
            const errorMsg = error instanceof Error ? error.message : String(error);
            benchmarkErrors.push(`${benchmarkName}: ${errorMsg}`);
            console.error(`Error running benchmark ${benchmarkName}:`, error);
            console.error(`Error details:`, errorMsg);
            // Log the error but continue with other benchmarks
          }
        }
      }

    // If all benchmarks failed, mark scan as failed
    if (benchmarksRun > 0 && benchmarksFailed === benchmarksRun) {
      await db.query(
        'UPDATE compliance_checks SET status = $1, completed_at = NOW() WHERE id = $2',
        ['failed', complianceCheckId]
      );
      throw new Error(`All ${benchmarksRun} benchmark(s) failed to execute. Errors: ${benchmarkErrors.join('; ')}`);
    }
    
    // If no benchmarks ran at all, mark as failed
    if (benchmarksRun === 0) {
      await db.query(
        'UPDATE compliance_checks SET status = $1, completed_at = NOW() WHERE id = $2',
        ['failed', complianceCheckId]
      );
      throw new Error('No benchmarks were executed. Check framework/provider configuration.');
    }

      // Store verification warnings in powerpipe_output JSONB field (or create verification_warnings field)
      const verificationData = {
        warnings: verificationWarnings.length > 0 ? verificationWarnings : undefined,
        warning_count: verificationWarnings.length,
        timestamp: new Date().toISOString(),
      };
      
      // Update compliance check with summary (including all status types)
      await db.query(
        `UPDATE compliance_checks 
         SET status = $1, total_controls = $2, passed_controls = $3, 
             failed_controls = $4, error_controls = $5, skip_controls = $6, 
             completed_at = NOW(), powerpipe_output = COALESCE(powerpipe_output, '{}'::jsonb) || $7::jsonb
         WHERE id = $8`,
        [
          'completed', 
          totalControls, 
          passedControls, 
          failedControls, 
          errorControls, 
          skipControls,
          JSON.stringify({ verification: verificationData }),
          complianceCheckId
        ]
      );

      if (verificationWarnings.length > 0) {
        console.warn(`⚠️ Scan ${complianceCheckId} completed with ${verificationWarnings.length} verification warning(s)`);
      } else {
        console.log(`✅ Scan ${complianceCheckId} completed successfully with verification passed`);
      }
  } catch (error) {
    // Update check status to failed
    await db.query(
      'UPDATE compliance_checks SET status = $1, completed_at = NOW() WHERE id = $2',
      ['failed', complianceCheckId]
    ).catch((dbError) => {
      console.error('Error updating scan status to failed:', dbError);
    });

    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Scan ${complianceCheckId} failed:`, errorMessage);
  }
}

// GET /api/scans - List all scans
router.get('/', async (req, res, next) => {
  try {
    const { client_id, status } = req.query;

    let query = 'SELECT * FROM compliance_checks WHERE 1=1';
    const params: any[] = [];
    let paramCount = 1;

    if (client_id) {
      query += ` AND client_id = $${paramCount++}`;
      params.push(client_id);
    }

    if (status) {
      query += ` AND status = $${paramCount++}`;
      params.push(status);
    }

    query += ' ORDER BY created_at DESC';

    const result = await db.query(query, params);
    
    // Check for timed out scans and mark them as failed
    const now = Date.now();
    const timeoutPromises = result.rows
      .filter((scan: any) => scan.status === 'in_progress')
      .map(async (scan: any) => {
        const startedAt = new Date(scan.started_at);
        const elapsed = now - startedAt.getTime();
        
        if (elapsed > MAX_SCAN_DURATION_MS) {
          await db.query(
            'UPDATE compliance_checks SET status = $1, completed_at = NOW() WHERE id = $2',
            ['failed', scan.id]
          );
          scan.status = 'failed';
          scan.completed_at = new Date();
          console.log(`Scan ${scan.id} timed out (${elapsed}ms elapsed)`);
        }
      });
    
    // Wait for all timeout checks to complete
    await Promise.all(timeoutPromises);
    
    // Parse JSONB fields
    const parsedRows = result.rows.map(row => ({
      ...row,
      frameworks: typeof row.frameworks === 'string' 
        ? JSON.parse(row.frameworks) 
        : row.frameworks,
      powerpipe_output: row.powerpipe_output 
        ? (typeof row.powerpipe_output === 'string' 
            ? JSON.parse(row.powerpipe_output) 
            : row.powerpipe_output)
        : null,
    }));
    
    res.json(parsedRows);
  } catch (error) {
    next(error);
  }
});

// GET /api/scans/:id - Get scan details
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const checkResult = await db.query(
      'SELECT * FROM compliance_checks WHERE id = $1',
      [id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Compliance check not found' });
    }

    // Check if scan has timed out
    const scan = checkResult.rows[0];
    if (scan.status === 'in_progress') {
      const startedAt = new Date(scan.started_at);
      const elapsed = Date.now() - startedAt.getTime();
      
      if (elapsed > MAX_SCAN_DURATION_MS) {
        // Mark as failed
        await db.query(
          'UPDATE compliance_checks SET status = $1, completed_at = NOW() WHERE id = $2',
          ['failed', id]
        );
        // Update the scan object for response
        scan.status = 'failed';
        scan.completed_at = new Date();
        console.log(`Scan ${id} timed out (${elapsed}ms elapsed)`);
      }
    }

    const findingsResult = await db.query(
      'SELECT * FROM findings WHERE compliance_check_id = $1 ORDER BY framework, control_id',
      [id]
    );

    // Parse JSONB fields
    const check = scan;
    const parsedCheck = {
      ...check,
      frameworks: typeof check.frameworks === 'string' 
        ? JSON.parse(check.frameworks) 
        : check.frameworks,
      powerpipe_output: check.powerpipe_output 
        ? (typeof check.powerpipe_output === 'string' 
            ? JSON.parse(check.powerpipe_output) 
            : check.powerpipe_output)
        : null,
    };

    const parsedFindings = findingsResult.rows.map(finding => ({
      ...finding,
      scan_resources: finding.scan_resources 
        ? (typeof finding.scan_resources === 'string' 
            ? JSON.parse(finding.scan_resources) 
            : finding.scan_resources)
        : null,
      status_history: finding.status_history 
        ? (typeof finding.status_history === 'string' 
            ? JSON.parse(finding.status_history) 
            : finding.status_history)
        : [],
    }));

    res.json({
      ...parsedCheck,
      findings: parsedFindings,
    });
  } catch (error) {
    next(error);
  }
});

// Helper function to extract domain from control ID
function extractDomainFromControl(controlId: string): string | null {
  // Try to extract domain from common control ID patterns
  // E.g., "hipaa_164_312_a_1" -> "Access Control"
  // This is a simple heuristic - in production, use control metadata
  
  if (controlId.includes('access') || controlId.includes('312')) {
    return 'Access Control';
  }
  if (controlId.includes('encrypt') || controlId.includes('164.312')) {
    return 'Encryption';
  }
  if (controlId.includes('audit') || controlId.includes('log')) {
    return 'Audit & Logging';
  }
  if (controlId.includes('backup') || controlId.includes('recovery')) {
    return 'Backup & Recovery';
  }
  
  return null;
}

export default router;

