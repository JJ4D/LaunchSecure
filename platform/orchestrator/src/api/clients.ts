import { Router } from 'express';
import { z } from 'zod';
import { db } from '../lib/database';
import { encryptCredentials, decryptCredentials } from '../lib/crypto';

const router = Router();

// Validation schemas
const createClientSchema = z.object({
  company_name: z.string().min(1),
  business_description: z.string().optional(),
  industry: z.string().optional(),
  employee_count_range: z.string().optional(),
  contact_name: z.string().min(1),
  contact_email: z.string().email(),
  status: z.enum(['active', 'paused', 'inactive']).optional(),
  assigned_frameworks: z.array(z.string()).min(1),
});

const updateClientSchema = createClientSchema.partial();

const createCredentialSchema = z.object({
  provider: z.enum(['aws', 'azure', 'gcp', 'google_workspace']),
  credentials: z.object({}).passthrough(), // Any object for credentials
  region: z.string().optional(),
  account_id: z.string().optional(),
  is_active: z.boolean().optional(),
});

// GET /api/clients - List all clients
router.get('/', async (req, res, next) => {
  try {
    const result = await db.query(
      'SELECT id, company_name, business_description, industry, employee_count_range, contact_name, contact_email, status, assigned_frameworks, created_at, updated_at FROM clients ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

// GET /api/clients/:id - Get client by ID
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      'SELECT id, company_name, business_description, industry, employee_count_range, contact_name, contact_email, status, assigned_frameworks, created_at, updated_at FROM clients WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// POST /api/clients - Create new client
router.post('/', async (req, res, next) => {
  try {
    const data = createClientSchema.parse(req.body);

    const result = await db.query(
      `INSERT INTO clients (company_name, business_description, industry, employee_count_range, contact_name, contact_email, status, assigned_frameworks)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, company_name, business_description, industry, employee_count_range, contact_name, contact_email, status, assigned_frameworks, created_at, updated_at`,
      [
        data.company_name,
        data.business_description || null,
        data.industry || null,
        data.employee_count_range || null,
        data.contact_name,
        data.contact_email,
        data.status || 'active',
        JSON.stringify(data.assigned_frameworks),
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    next(error);
  }
});

// PUT /api/clients/:id - Update client
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = updateClientSchema.parse(req.body);

    // Build dynamic update query
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (data.company_name !== undefined) {
      updates.push(`company_name = $${paramCount++}`);
      values.push(data.company_name);
    }
    if (data.business_description !== undefined) {
      updates.push(`business_description = $${paramCount++}`);
      values.push(data.business_description);
    }
    if (data.industry !== undefined) {
      updates.push(`industry = $${paramCount++}`);
      values.push(data.industry);
    }
    if (data.employee_count_range !== undefined) {
      updates.push(`employee_count_range = $${paramCount++}`);
      values.push(data.employee_count_range);
    }
    if (data.contact_name !== undefined) {
      updates.push(`contact_name = $${paramCount++}`);
      values.push(data.contact_name);
    }
    if (data.contact_email !== undefined) {
      updates.push(`contact_email = $${paramCount++}`);
      values.push(data.contact_email);
    }
    if (data.status !== undefined) {
      updates.push(`status = $${paramCount++}`);
      values.push(data.status);
    }
    if (data.assigned_frameworks !== undefined) {
      updates.push(`assigned_frameworks = $${paramCount++}`);
      values.push(JSON.stringify(data.assigned_frameworks));
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(id);
    const result = await db.query(
      `UPDATE clients SET ${updates.join(', ')} WHERE id = $${paramCount} 
       RETURNING id, company_name, business_description, industry, employee_count_range, contact_name, contact_email, status, assigned_frameworks, created_at, updated_at`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    next(error);
  }
});

// DELETE /api/clients/:id - Delete client
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await db.query('DELETE FROM clients WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// GET /api/clients/:id/credentials - Get credentials for a client
router.get('/:id/credentials', async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      'SELECT id, provider, is_active, region, account_id, created_at, updated_at FROM credentials WHERE client_id = $1 ORDER BY created_at DESC',
      [id]
    );

    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

// POST /api/clients/:id/credentials - Add credentials for a client
router.post('/:id/credentials', async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = createCredentialSchema.parse(req.body);

    // Verify client exists
    const clientCheck = await db.query('SELECT id FROM clients WHERE id = $1', [id]);
    if (clientCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    // Encrypt credentials
    const encrypted = encryptCredentials(data.credentials);

    const result = await db.query(
      `INSERT INTO credentials (client_id, provider, encrypted_credentials, is_active, region, account_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, provider, is_active, region, account_id, created_at, updated_at`,
      [
        id,
        data.provider,
        encrypted,
        data.is_active !== undefined ? data.is_active : true,
        data.region || null,
        data.account_id || null,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    next(error);
  }
});

// PUT /api/clients/:id/credentials/:credentialId - Update credential
router.put('/:id/credentials/:credentialId', async (req, res, next) => {
  try {
    const { id, credentialId } = req.params;
    const data = createCredentialSchema.partial().parse(req.body);

    // Build dynamic update query
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (data.provider !== undefined) {
      updates.push(`provider = $${paramCount++}`);
      values.push(data.provider);
    }
    if (data.credentials !== undefined) {
      updates.push(`encrypted_credentials = $${paramCount++}`);
      values.push(encryptCredentials(data.credentials));
    }
    if (data.is_active !== undefined) {
      updates.push(`is_active = $${paramCount++}`);
      values.push(data.is_active);
    }
    if (data.region !== undefined) {
      updates.push(`region = $${paramCount++}`);
      values.push(data.region);
    }
    if (data.account_id !== undefined) {
      updates.push(`account_id = $${paramCount++}`);
      values.push(data.account_id);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(id, credentialId);
    const result = await db.query(
      `UPDATE credentials SET ${updates.join(', ')} 
       WHERE client_id = $${paramCount} AND id = $${paramCount + 1}
       RETURNING id, provider, is_active, region, account_id, created_at, updated_at`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Credential not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    next(error);
  }
});

// DELETE /api/clients/:id/credentials/:credentialId - Delete credential
router.delete('/:id/credentials/:credentialId', async (req, res, next) => {
  try {
    const { id, credentialId } = req.params;
    const result = await db.query(
      'DELETE FROM credentials WHERE client_id = $1 AND id = $2 RETURNING id',
      [id, credentialId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Credential not found' });
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;

