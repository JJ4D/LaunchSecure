import { Router } from 'express';
import { z } from 'zod';
import { db } from '../lib/database';
import { verifyToken } from './auth';

const router = Router();

// Apply auth middleware
router.use(verifyToken);

// GET /api/reports/compliance-summary/:clientId - Generate compliance summary report
router.get('/compliance-summary/:clientId', async (req: any, res, next) => {
  try {
    const { clientId } = req.params;
    const user = req.user;

    // Verify access
    if (user.role === 'client_user' && user.client_id !== clientId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get latest compliance check
    const checkResult = await db.query(
      `SELECT * FROM compliance_checks 
       WHERE client_id = $1 AND status = 'completed'
       ORDER BY completed_at DESC LIMIT 1`,
      [clientId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'No completed scans found for client' });
    }

    const complianceCheck = checkResult.rows[0];

    // Get client info
    const clientResult = await db.query(
      'SELECT * FROM clients WHERE id = $1',
      [clientId]
    );

    if (clientResult.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const client = clientResult.rows[0];

    // Get findings summary by framework
    const findingsResult = await db.query(
      `SELECT 
        framework,
        COUNT(*) as total,
        SUM(CASE WHEN scan_status = 'pass' THEN 1 ELSE 0 END) as passed,
        SUM(CASE WHEN scan_status = 'fail' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN remediation_status = 'resolved' THEN 1 ELSE 0 END) as resolved
      FROM findings
      WHERE client_id = $1 AND compliance_check_id = $2
      GROUP BY framework
      ORDER BY framework`,
      [clientId, complianceCheck.id]
    );

    // Calculate overall compliance percentage
    const totalControls = complianceCheck.total_controls || 0;
    const passedControls = complianceCheck.passed_controls || 0;
    const compliancePercentage = totalControls > 0 
      ? Math.round((passedControls / totalControls) * 100) 
      : 0;

    // Generate report
    const report = {
      client: {
        id: client.id,
        company_name: client.company_name,
        industry: client.industry,
        contact_email: client.contact_email,
      },
      scan: {
        id: complianceCheck.id,
        frameworks: complianceCheck.frameworks,
        started_at: complianceCheck.started_at,
        completed_at: complianceCheck.completed_at,
        total_controls: totalControls,
        passed_controls: passedControls,
        failed_controls: complianceCheck.failed_controls || 0,
        compliance_percentage: compliancePercentage,
      },
      framework_summary: findingsResult.rows.map((row: any) => ({
        framework: row.framework,
        total: parseInt(row.total),
        passed: parseInt(row.passed),
        failed: parseInt(row.failed),
        resolved: parseInt(row.resolved),
        compliance_percentage: parseInt(row.total) > 0
          ? Math.round((parseInt(row.passed) / parseInt(row.total)) * 100)
          : 0,
      })),
      generated_at: new Date().toISOString(),
    };

    // Store report in database
    await db.query(
      `INSERT INTO reports (client_id, report_type, generated_at)
       VALUES ($1, $2, NOW())`,
      [clientId, 'compliance_summary']
    );

    res.json(report);
  } catch (error) {
    next(error);
  }
});

// GET /api/reports/findings/:clientId - Generate findings report
router.get('/findings/:clientId', async (req: any, res, next) => {
  try {
    const { clientId } = req.params;
    const { framework, remediation_status } = req.query;
    const user = req.user;

    // Verify access
    if (user.role === 'client_user' && user.client_id !== clientId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    let query = `SELECT f.*, co.name as owner_name 
                 FROM findings f
                 LEFT JOIN client_owners co ON f.assigned_owner_id = co.id
                 WHERE f.client_id = $1`;
    const params: any[] = [clientId];
    let paramCount = 2;

    if (framework) {
      query += ` AND f.framework = $${paramCount++}`;
      params.push(framework);
    }

    if (remediation_status) {
      query += ` AND f.remediation_status = $${paramCount++}`;
      params.push(remediation_status);
    }

    query += ' ORDER BY f.framework, f.control_id';

    const findingsResult = await db.query(query, params);

    // Get client info
    const clientResult = await db.query(
      'SELECT company_name FROM clients WHERE id = $1',
      [clientId]
    );

    const report = {
      client: {
        id: clientId,
        company_name: clientResult.rows[0]?.company_name || 'Unknown',
      },
      filters: {
        framework: framework || 'all',
        remediation_status: remediation_status || 'all',
      },
      findings: findingsResult.rows,
      total_findings: findingsResult.rows.length,
      generated_at: new Date().toISOString(),
    };

    // Store report
    await db.query(
      `INSERT INTO reports (client_id, report_type, generated_at)
       VALUES ($1, $2, NOW())`,
      [clientId, 'findings']
    );

    res.json(report);
  } catch (error) {
    next(error);
  }
});

// GET /api/reports/dashboard-metrics - Get dashboard metrics (current findings + trends)
router.get('/dashboard-metrics', async (req: any, res, next) => {
  try {
    const { client_id, days = 90 } = req.query;
    const user = req.user;

    let clientFilter = '';
    const params: any[] = [];
    let paramCount = 1;

    // If client user, only show their client's data
    if (user.role === 'client_user' && user.client_id) {
      clientFilter = `WHERE client_id = $${paramCount++}`;
      params.push(user.client_id);
    } else if (client_id) {
      clientFilter = `WHERE client_id = $${paramCount++}`;
      params.push(client_id);
    }

    // Get current actionable findings (from latest scan per client)
    // This gets the most recent scan for each client and counts actionable findings
    const whereClause = clientFilter ? `${clientFilter} AND status = 'completed'` : `WHERE status = 'completed'`;
    const currentFindingsQuery = `
      WITH latest_scans AS (
        SELECT DISTINCT ON (client_id) 
          id, client_id, completed_at, 
          passed_controls, failed_controls, error_controls, skip_controls, total_controls
        FROM compliance_checks
        ${whereClause}
        ORDER BY client_id, completed_at DESC
      )
      SELECT 
        COUNT(DISTINCT ls.client_id) as total_clients,
        SUM(ls.failed_controls + COALESCE(ls.error_controls, 0)) as total_actionable_findings,
        SUM(ls.passed_controls) as total_passed,
        SUM(ls.failed_controls) as total_failed,
        SUM(COALESCE(ls.error_controls, 0)) as total_errors,
        SUM(COALESCE(ls.skip_controls, 0)) as total_skips,
        SUM(ls.total_controls) as total_controls,
        CASE 
          WHEN SUM(ls.passed_controls + ls.failed_controls) > 0 
          THEN ROUND((SUM(ls.passed_controls)::numeric / SUM(ls.passed_controls + ls.failed_controls)::numeric) * 100, 1)
          ELSE 0
        END as compliance_percentage
      FROM latest_scans ls
    `;

    const currentResult = await db.query(currentFindingsQuery, params);

    // Get trend data (compliance % over time from historical findings)
    // Simplified: get snapshots from compliance_checks table (one per scan)
    const daysParam = parseInt(days as string, 10) || 90;
    const trendQuery = `
      WITH scan_snapshots AS (
        SELECT 
          DATE(completed_at) as date,
          passed_controls,
          failed_controls,
          error_controls,
          total_controls
        FROM compliance_checks
        ${whereClause}
        AND completed_at >= CURRENT_DATE - INTERVAL '${daysParam} days'
        ORDER BY completed_at DESC
      ),
      daily_aggregates AS (
        SELECT 
          date,
          SUM(passed_controls) as total_passed,
          SUM(failed_controls) as total_failed,
          SUM(COALESCE(error_controls, 0)) as total_error,
          SUM(total_controls) as total_controls
        FROM scan_snapshots
        GROUP BY date
      )
      SELECT 
        date,
        total_passed,
        total_failed,
        total_error,
        total_controls,
        CASE 
          WHEN (total_passed + total_failed) > 0 
          THEN ROUND((total_passed::numeric / (total_passed + total_failed)::numeric) * 100, 1)
          ELSE NULL
        END as compliance_percentage
      FROM daily_aggregates
      ORDER BY date
    `;

    const trendResult = await db.query(trendQuery, params);

    // Get comparison data (current vs 30/60/90 days ago)
    // Get scans from those specific days
    const comparisonQuery = `
      WITH latest_scan AS (
        SELECT DISTINCT ON (client_id) 
          id, client_id, completed_at,
          passed_controls, failed_controls, error_controls
        FROM compliance_checks
        ${whereClause}
        ORDER BY client_id, completed_at DESC
      ),
      scan_30d AS (
        SELECT DISTINCT ON (client_id)
          client_id, passed_controls, failed_controls, error_controls
        FROM compliance_checks
        ${whereClause}
        AND DATE(completed_at) <= CURRENT_DATE - INTERVAL '30 days'
        ORDER BY client_id, completed_at DESC
      ),
      scan_60d AS (
        SELECT DISTINCT ON (client_id)
          client_id, passed_controls, failed_controls, error_controls
        FROM compliance_checks
        ${whereClause}
        AND DATE(completed_at) <= CURRENT_DATE - INTERVAL '60 days'
        ORDER BY client_id, completed_at DESC
      ),
      scan_90d AS (
        SELECT DISTINCT ON (client_id)
          client_id, passed_controls, failed_controls, error_controls
        FROM compliance_checks
        ${whereClause}
        AND DATE(completed_at) <= CURRENT_DATE - INTERVAL '90 days'
        ORDER BY client_id, completed_at DESC
      )
      SELECT 
        COALESCE(SUM(ls.passed_controls), 0) as current_passed,
        COALESCE(SUM(ls.failed_controls), 0) as current_failed,
        COALESCE(SUM(COALESCE(ls.error_controls, 0)), 0) as current_error,
        COALESCE(SUM(s30.passed_controls), 0) as passed_30d_ago,
        COALESCE(SUM(s30.failed_controls), 0) as failed_30d_ago,
        COALESCE(SUM(COALESCE(s30.error_controls, 0)), 0) as error_30d_ago,
        COALESCE(SUM(s60.passed_controls), 0) as passed_60d_ago,
        COALESCE(SUM(s60.failed_controls), 0) as failed_60d_ago,
        COALESCE(SUM(COALESCE(s60.error_controls, 0)), 0) as error_60d_ago,
        COALESCE(SUM(s90.passed_controls), 0) as passed_90d_ago,
        COALESCE(SUM(s90.failed_controls), 0) as failed_90d_ago,
        COALESCE(SUM(COALESCE(s90.error_controls, 0)), 0) as error_90d_ago
      FROM latest_scan ls
      LEFT JOIN scan_30d s30 ON ls.client_id = s30.client_id
      LEFT JOIN scan_60d s60 ON ls.client_id = s60.client_id
      LEFT JOIN scan_90d s90 ON ls.client_id = s90.client_id
    `;

    const comparisonResult = await db.query(comparisonQuery, params);

    const current = currentResult.rows[0] || {};
    const trends = trendResult.rows || [];
    const comparison = comparisonResult.rows[0] || {};

    // Calculate compliance percentages for comparison periods
    const calcCompliance = (passed: number, failed: number) => {
      if (passed + failed === 0) return null;
      return Math.round((passed / (passed + failed)) * 100);
    };

    const currentCompliance = calcCompliance(
      parseInt(current.total_passed) || 0,
      parseInt(current.total_failed) || 0
    );

    res.json({
      current: {
        total_clients: parseInt(current.total_clients) || 0,
        total_actionable_findings: parseInt(current.total_actionable_findings) || 0,
        total_passed: parseInt(current.total_passed) || 0,
        total_failed: parseInt(current.total_failed) || 0,
        total_errors: parseInt(current.total_errors) || 0,
        total_skips: parseInt(current.total_skips) || 0,
        total_controls: parseInt(current.total_controls) || 0,
        compliance_percentage: parseFloat(current.compliance_percentage) || 0,
      },
      trends: trends.map((row: any) => ({
        date: row.date,
        compliance_percentage: row.compliance_percentage,
        total_passed: parseInt(row.total_passed) || 0,
        total_failed: parseInt(row.total_failed) || 0,
        total_error: parseInt(row.total_error) || 0,
        total_controls: parseInt(row.total_controls) || 0,
      })),
      comparison: {
        current: {
          passed: parseInt(comparison.current_passed) || 0,
          failed: parseInt(comparison.current_failed) || 0,
          error: parseInt(comparison.current_error) || 0,
          compliance_percentage: currentCompliance,
        },
        days_30_ago: {
          passed: parseInt(comparison.passed_30d_ago) || 0,
          failed: parseInt(comparison.failed_30d_ago) || 0,
          error: parseInt(comparison.error_30d_ago) || 0,
          compliance_percentage: calcCompliance(
            parseInt(comparison.passed_30d_ago) || 0,
            parseInt(comparison.failed_30d_ago) || 0
          ),
        },
        days_60_ago: {
          passed: parseInt(comparison.passed_60d_ago) || 0,
          failed: parseInt(comparison.failed_60d_ago) || 0,
          error: parseInt(comparison.error_60d_ago) || 0,
          compliance_percentage: calcCompliance(
            parseInt(comparison.passed_60d_ago) || 0,
            parseInt(comparison.failed_60d_ago) || 0
          ),
        },
        days_90_ago: {
          passed: parseInt(comparison.passed_90d_ago) || 0,
          failed: parseInt(comparison.failed_90d_ago) || 0,
          error: parseInt(comparison.error_90d_ago) || 0,
          compliance_percentage: calcCompliance(
            parseInt(comparison.passed_90d_ago) || 0,
            parseInt(comparison.failed_90d_ago) || 0
          ),
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;

