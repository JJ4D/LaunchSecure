import { Router } from 'express';
import { db } from '../lib/database';
import { verifyToken, verifySuperAdmin } from './auth';
import { getBenchmarkName, runPowerpipeBenchmark } from '../lib/powerpipe';
import { decryptCredentials } from '../lib/crypto';
import { exec } from 'child_process';
import { promisify } from 'util';

const router = Router();
const execAsync = promisify(exec);
const POWERPIPE_CONTAINER = process.env.POWERPIPE_CONTAINER || 'launchsecure-steampipe-powerpipe';

// Apply auth middleware
router.use(verifyToken);

// GET /api/verification/benchmarks - List all available benchmarks (optionally filtered by provider)
router.get('/benchmarks', async (req, res, next) => {
  try {
    const { provider } = req.query;
    const { discoverAvailableBenchmarks } = await import('../lib/powerpipe');
    
    const benchmarks = await discoverAvailableBenchmarks(provider as string | undefined);
    
    res.json({
      provider: provider || 'all',
      total: benchmarks.length,
      benchmarks: benchmarks.map(b => ({
        name: b.name,
        provider: b.provider,
        framework: b.framework,
        control_count: b.control_count,
      })),
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/verification/benchmark/:provider/:framework - Get benchmark control inventory
router.get('/benchmark/:provider/:framework', async (req, res, next) => {
  try {
    const { provider, framework } = req.params;
    
    const benchmarkName = getBenchmarkName(framework, provider);
    if (!benchmarkName) {
      return res.status(404).json({ error: `Benchmark not found for ${framework} on ${provider}` });
    }

    // Run benchmark in list mode to get all controls without scanning
    try {
      const command = `/usr/bin/docker exec ${POWERPIPE_CONTAINER} powerpipe benchmark run ${benchmarkName} --output json --dry-run`;
      const result = await execAsync(command, { maxBuffer: 10 * 1024 * 1024 });
      
      // Parse JSON to extract control list
      const jsonOutput = result.stdout.trim();
      const benchmarkData = JSON.parse(jsonOutput);
      
      // Extract all control IDs and titles
      const controls: Array<{ control_id: string; title: string; description?: string }> = [];
      const extractControls = (item: any) => {
        if (item.controls && Array.isArray(item.controls)) {
          for (const control of item.controls) {
            if (control.control_id) {
              controls.push({
                control_id: control.control_id,
                title: control.title || '',
                description: control.description || '',
              });
            }
          }
        }
        if (item.groups && Array.isArray(item.groups)) {
          for (const group of item.groups) {
            extractControls(group);
          }
        }
      };
      
      extractControls(benchmarkData);
      
      res.json({
        benchmark: benchmarkName,
        provider,
        framework,
        total_controls: controls.length,
        controls: controls.map(c => ({
          control_id: c.control_id,
          title: c.title,
        })),
      });
    } catch (error) {
      // Fallback: try running actual benchmark (may be slower)
      console.warn('Dry-run failed, running actual benchmark:', error);
      return res.status(500).json({ 
        error: 'Failed to list benchmark controls',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  } catch (error) {
    next(error);
  }
});

// GET /api/verification/scan/:scanId - Get verification report for a scan
router.get('/scan/:scanId', async (req, res, next) => {
  try {
    const { scanId } = req.params;
    
    // Get scan details
    const scanResult = await db.query(
      'SELECT * FROM compliance_checks WHERE id = $1',
      [scanId]
    );
    
    if (scanResult.rows.length === 0) {
      return res.status(404).json({ error: 'Scan not found' });
    }
    
    const scan = scanResult.rows[0];
    
    // Get findings with permission errors
    const findingsResult = await db.query(
      `SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN scan_status = 'error' THEN 1 END) as error_count,
        COUNT(CASE WHEN scan_status = 'pass' THEN 1 END) as pass_count,
        COUNT(CASE WHEN scan_status = 'fail' THEN 1 END) as fail_count,
        COUNT(CASE WHEN scan_status = 'skip' THEN 1 END) as skip_count
      FROM findings 
      WHERE compliance_check_id = $1`,
      [scanId]
    );
    
    const findings = findingsResult.rows[0];
    
    // Extract verification data from powerpipe_output
    let verificationData = null;
    if (scan.powerpipe_output) {
      const powerpipeData = typeof scan.powerpipe_output === 'string' 
        ? JSON.parse(scan.powerpipe_output)
        : scan.powerpipe_output;
      verificationData = powerpipeData.verification;
    }
    
    // Parse frameworks
    const frameworks = typeof scan.frameworks === 'string' 
      ? JSON.parse(scan.frameworks)
      : scan.frameworks;
    
    // Get findings with permission-related errors (from scan_reason)
    const permissionErrorsResult = await db.query(
      `SELECT control_id, control_title, scan_reason 
       FROM findings 
       WHERE compliance_check_id = $1 
         AND scan_status = 'error'
         AND (
           scan_reason ILIKE '%access denied%' OR
           scan_reason ILIKE '%unauthorized%' OR
           scan_reason ILIKE '%forbidden%' OR
           scan_reason ILIKE '%permission%'
         )
       LIMIT 20`,
      [scanId]
    );
    
    res.json({
      scan_id: scanId,
      status: scan.status,
      frameworks,
      control_counts: {
        total: parseInt(findings.total) || 0,
        passed: parseInt(findings.pass_count) || 0,
        failed: parseInt(findings.fail_count) || 0,
        error: parseInt(findings.error_count) || 0,
        skipped: parseInt(findings.skip_count) || 0,
      },
      verification: verificationData || {
        warnings: [],
        warning_count: 0,
      },
      permission_errors: {
        count: permissionErrorsResult.rows.length,
        examples: permissionErrorsResult.rows.map(r => ({
          control_id: r.control_id,
          title: r.control_title,
          reason: r.scan_reason,
        })),
      },
      recommendations: generateRecommendations(scan, findings, permissionErrorsResult.rows.length),
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/verification/coverage/summary - Framework coverage status for super admins
router.get('/coverage/summary', async (req: any, res, next) => {
  try {
    if (!req.user || req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Super admin access required' });
    }

    const coverageResult = await db.query(
      `SELECT 
        fc.framework,
        fc.framework_version,
        COUNT(DISTINCT fc.id) AS total_controls,
        COUNT(DISTINCT CASE WHEN fcm.id IS NOT NULL THEN fc.id END) AS mapped_controls,
        COUNT(DISTINCT CASE WHEN fcm.id IS NULL THEN fc.id END) AS unmapped_controls,
        COUNT(DISTINCT CASE WHEN fcm.id IS NOT NULL AND (fcm.verified IS NOT TRUE) THEN fc.id END) AS unverified_controls
      FROM framework_controls fc
      LEFT JOIN framework_control_mappings fcm
        ON fc.id = fcm.framework_control_id
      GROUP BY fc.framework, fc.framework_version
      ORDER BY fc.framework, fc.framework_version`
    );

    if (coverageResult.rows.length === 0) {
      return res.json({
        has_source_data: false,
        has_mismatch: false,
        frameworks: [],
      });
    }

    const frameworks = coverageResult.rows.map((row) => {
      const total = Number(row.total_controls) || 0;
      const mapped = Number(row.mapped_controls) || 0;
      const unmapped = Number(row.unmapped_controls) || 0;
      const unverified = Number(row.unverified_controls) || 0;
      const coveragePercentage = total > 0 ? Number(((mapped / total) * 100).toFixed(2)) : null;

      return {
        framework: row.framework,
        framework_version: row.framework_version,
        total_controls: total,
        mapped_controls: mapped,
        unmapped_controls: unmapped,
        unverified_controls: unverified,
        coverage_percentage: coveragePercentage,
        has_mismatch: unmapped > 0 || unverified > 0,
      };
    });

    const hasMismatch = frameworks.some((framework) => framework.has_mismatch);

    res.json({
      has_source_data: true,
      has_mismatch: hasMismatch,
      frameworks,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/verification/test-credentials - Test credentials and permissions
router.post('/test-credentials', verifySuperAdmin, async (req, res, next) => {
  try {
    const { client_id, provider } = req.body;
    
    if (!client_id || !provider) {
      return res.status(400).json({ error: 'client_id and provider are required' });
    }
    
    // Get credentials
    const credentialsResult = await db.query(
      'SELECT encrypted_credentials FROM credentials WHERE client_id = $1 AND provider = $2 AND is_active = true LIMIT 1',
      [client_id, provider]
    );
    
    if (credentialsResult.rows.length === 0) {
      return res.status(404).json({ error: 'No active credentials found' });
    }
    
    const decryptedCreds = decryptCredentials(credentialsResult.rows[0].encrypted_credentials);
    
    // Test with a simple benchmark (HIPAA or SOC2)
    const testFramework = provider === 'aws' ? 'HIPAA' : 'SOC2';
    const benchmarkName = getBenchmarkName(testFramework, provider);
    
    if (!benchmarkName) {
      return res.status(400).json({ error: `No benchmark available for ${testFramework} on ${provider}` });
    }
    
    // Run a quick test scan
    const result = await runPowerpipeBenchmark(benchmarkName, decryptedCreds, provider);
    
    res.json({
      success: true,
      provider,
      framework: testFramework,
      benchmark: benchmarkName,
      control_count: result.summary.total,
      permission_errors: result.summary.permission_errors || 0,
      verification: result.verification,
      recommendations: result.verification?.warnings || [],
    });
  } catch (error) {
    next(error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({ 
      error: 'Credential test failed',
      details: errorMessage
    });
  }
});

function generateRecommendations(scan: any, findings: any, permissionErrorCount: number): string[] {
  const recommendations: string[] = [];
  
  const totalControls = parseInt(findings.total) || 0;
  const errorCount = parseInt(findings.error_count) || 0;
  const errorRate = totalControls > 0 ? (errorCount / totalControls) * 100 : 0;
  
  if (permissionErrorCount > 0) {
    recommendations.push(
      `${permissionErrorCount} control(s) failed due to permission errors. Review AWS IAM permissions to ensure full coverage.`
    );
  }
  
  if (errorRate > 20) {
    recommendations.push(
      `High error rate (${errorRate.toFixed(1)}%). This may indicate permission issues or configuration problems.`
    );
  }
  
  if (totalControls < 100) {
    recommendations.push(
      `Low control count (${totalControls}). Verify benchmark coverage and check for missing controls.`
    );
  }
  
  if (scan.status === 'completed' && totalControls === 0) {
    recommendations.push(
      `No controls found. This may indicate a benchmark configuration issue or permission problem.`
    );
  }
  
  return recommendations;
}

export default router;

