import { Router } from 'express';
import { z } from 'zod';
import { db } from '../lib/database';
import { verifyToken } from './auth';

const router = Router();

// Apply auth middleware to all routes
router.use(verifyToken);

const updateFindingSchema = z.object({
  remediation_status: z.enum(['open', 'in_progress', 'resolved']).optional(),
  assigned_owner_id: z.string().uuid().nullable().optional(),
  notes: z.string().optional(),
});

// GET /api/findings - List findings (filtered by client if not super admin)
// Note: This endpoint returns findings from the latest scan only, as old findings
// are automatically archived to findings_history when new scans run.
router.get('/', async (req: any, res, next) => {
  try {
    const { 
      client_id, 
      framework, 
      scan_status, 
      remediation_status, 
      compliance_check_id, 
      show_all,
      control_id_search,
      date_from,
      date_to
    } = req.query;
    const user = req.user;

    let query = 'SELECT f.*, co.name as owner_name FROM findings f LEFT JOIN client_owners co ON f.assigned_owner_id = co.id WHERE 1=1';
    const params: any[] = [];
    let paramCount = 1;

    // If client user, only show their client's findings
    if (user.role === 'client_user' && user.client_id) {
      query += ` AND f.client_id = $${paramCount++}`;
      params.push(user.client_id);
      
      // For client users, by default only show actionable items (fail + error)
      // unless show_all=true is explicitly requested
      if (show_all !== 'true' && !scan_status) {
        query += ` AND f.scan_status IN ('fail', 'error')`;
      }
    } else if (client_id) {
      query += ` AND f.client_id = $${paramCount++}`;
      params.push(client_id);
    }

    if (framework) {
      query += ` AND f.framework = $${paramCount++}`;
      params.push(framework);
    }

    if (scan_status) {
      query += ` AND f.scan_status = $${paramCount++}`;
      params.push(scan_status);
    }

    if (remediation_status) {
      query += ` AND f.remediation_status = $${paramCount++}`;
      params.push(remediation_status);
    }

    if (compliance_check_id) {
      query += ` AND f.compliance_check_id = $${paramCount++}`;
      params.push(compliance_check_id);
    }

    // Control ID search (case-insensitive partial match)
    if (control_id_search) {
      query += ` AND f.control_id ILIKE $${paramCount++}`;
      params.push(`%${control_id_search}%`);
    }

    // Date range filtering (by created_at)
    if (date_from) {
      query += ` AND f.created_at >= $${paramCount++}`;
      params.push(date_from);
    }
    if (date_to) {
      query += ` AND f.created_at <= $${paramCount++}`;
      params.push(date_to);
    }

    // Order by framework structure: framework → domain → control_id (natural sort)
    // For control_id natural sort, we extract numeric parts and sort them
    // This handles control IDs like "hipaa_164_312_a_1" properly
    query += ` ORDER BY 
      f.framework ASC NULLS LAST,
      f.domain ASC NULLS LAST,
      f.control_id ASC
      LIMIT 1000`;

    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

// GET /api/findings/:id - Get finding details
router.get('/:id', async (req: any, res, next) => {
  try {
    const { id } = req.params;
    const user = req.user;

    let query = 'SELECT f.*, co.name as owner_name, co.email as owner_email FROM findings f LEFT JOIN client_owners co ON f.assigned_owner_id = co.id WHERE f.id = $1';
    const params: any[] = [id];

    // If client user, verify they have access
    if (user.role === 'client_user' && user.client_id) {
      query += ' AND f.client_id = $2';
      params.push(user.client_id);
    }

    const result = await db.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Finding not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// PUT /api/findings/:id - Update finding
router.put('/:id', async (req: any, res, next) => {
  try {
    const { id } = req.params;
    const user = req.user;
    const data = updateFindingSchema.parse(req.body);

    // Get finding details to update both finding and persistent metadata
    const findingCheck = await db.query(
      'SELECT client_id, control_id, status_history FROM findings WHERE id = $1',
      [id]
    );

    if (findingCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Finding not found' });
    }

    const finding = findingCheck.rows[0];
    const { client_id, control_id } = finding;

    // If client user, verify they own this finding
    if (user.role === 'client_user' && user.client_id !== finding.client_id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Build update query
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (data.remediation_status !== undefined) {
      updates.push(`remediation_status = $${paramCount++}`);
      values.push(data.remediation_status);

      // Update status history
      const history = finding.status_history || [];
      history.push({
        status: data.remediation_status,
        changed_by: user.email,
        changed_at: new Date().toISOString(),
      });
      updates.push(`status_history = $${paramCount++}`);
      values.push(JSON.stringify(history));
    }

    if (data.assigned_owner_id !== undefined) {
      updates.push(`assigned_owner_id = $${paramCount++}`);
      values.push(data.assigned_owner_id);
    }

    if (data.notes !== undefined) {
      updates.push(`notes = $${paramCount++}`);
      values.push(data.notes);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    const result = await db.query(
      `UPDATE findings SET ${updates.join(', ')} WHERE id = $${paramCount}
       RETURNING *`,
      values
    );

    const updatedFinding = result.rows[0];

    // Also update persistent metadata table so it persists across scans
    // Get the values we're updating
    const metadataUpdates: string[] = [];
    const metadataValues: any[] = [];
    let metadataParamCount = 1;

    if (data.remediation_status !== undefined) {
      metadataUpdates.push(`remediation_status = $${metadataParamCount++}`);
      metadataValues.push(data.remediation_status);
      
      // Use the same updated history from the finding update above
      metadataUpdates.push(`status_history = $${metadataParamCount++}`);
      metadataValues.push(JSON.stringify(finding.status_history || []));
    }

    if (data.assigned_owner_id !== undefined) {
      metadataUpdates.push(`assigned_owner_id = $${metadataParamCount++}`);
      metadataValues.push(data.assigned_owner_id);
    }

    if (data.notes !== undefined) {
      metadataUpdates.push(`notes = $${metadataParamCount++}`);
      metadataValues.push(data.notes);
    }

    if (metadataUpdates.length > 0) {
      // Build the update clause for ON CONFLICT
      const updateClause = metadataUpdates.join(', ') + ', updated_at = NOW()';
      
      // Build the INSERT values
      const insertFields = ['client_id', 'control_id'];
      const insertValues: any[] = [client_id, control_id];
      let paramCount = 1;

      if (data.remediation_status !== undefined) {
        insertFields.push('remediation_status');
        insertValues.push(data.remediation_status);
      }
      if (data.assigned_owner_id !== undefined) {
        insertFields.push('assigned_owner_id');
        insertValues.push(data.assigned_owner_id);
      }
      if (data.notes !== undefined) {
        insertFields.push('notes');
        insertValues.push(data.notes);
      }
      if (data.remediation_status !== undefined) {
        insertFields.push('status_history');
        insertValues.push(JSON.stringify(finding.status_history || []));
      }

      const placeholders = insertValues.map((_, i) => `$${i + 1}`).join(', ');

      await db.query(
        `INSERT INTO control_metadata (${insertFields.join(', ')}, updated_at)
         VALUES (${placeholders}, NOW())
         ON CONFLICT (client_id, control_id) 
         DO UPDATE SET ${updateClause}`,
        insertValues
      );
    }

    res.json(updatedFinding);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    next(error);
  }
});

// GET /api/findings/history - Get historical findings for compliance progress tracking
router.get('/history', async (req: any, res, next) => {
  try {
    const { 
      client_id, 
      framework, 
      control_id,
      date_from,
      date_to,
      limit
    } = req.query;
    const user = req.user;

    let query = 'SELECT * FROM findings_history WHERE 1=1';
    const params: any[] = [];
    let paramCount = 1;

    // If client user, only show their client's history
    if (user.role === 'client_user' && user.client_id) {
      query += ` AND client_id = $${paramCount++}`;
      params.push(user.client_id);
    } else if (client_id) {
      query += ` AND client_id = $${paramCount++}`;
      params.push(client_id);
    }

    if (framework) {
      query += ` AND framework = $${paramCount++}`;
      params.push(framework);
    }

    if (control_id) {
      query += ` AND control_id = $${paramCount++}`;
      params.push(control_id);
    }

    // Date range filtering (by archived_at)
    if (date_from) {
      query += ` AND archived_at >= $${paramCount++}`;
      params.push(date_from);
    }
    if (date_to) {
      query += ` AND archived_at <= $${paramCount++}`;
      params.push(date_to);
    }

    // Order by archived date (most recent first)
    query += ' ORDER BY archived_at DESC';
    
    // Limit results
    const limitValue = limit ? parseInt(limit as string, 10) : 1000;
    query += ` LIMIT $${paramCount++}`;
    params.push(limitValue);

    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

export default router;

