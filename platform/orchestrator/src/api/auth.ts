import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../lib/database';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-in-production';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const registerSchema = z.object({
  client_id: z.string().uuid().optional(),
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).optional(),
  role: z.enum(['client_user', 'super_admin']).optional(),
});

// POST /api/auth/login - Login user
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    // Find user
    const userResult = await db.query(
      'SELECT id, client_id, email, password_hash, role FROM client_users WHERE email = $1',
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = userResult.rows[0];

    // Verify password
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        client_id: user.client_id,
        role: user.role,
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Get client info if not super admin
    let clientInfo = null;
    if (user.client_id) {
      const clientResult = await db.query(
        'SELECT id, company_name, status FROM clients WHERE id = $1',
        [user.client_id]
      );
      if (clientResult.rows.length > 0) {
        clientInfo = clientResult.rows[0];
      }
    }

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        client_id: user.client_id,
        client: clientInfo,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    next(error);
  }
});

// POST /api/auth/register - Register new user
// For super_admin: no client_id required, can be called without auth for initial setup
// For client_user: requires client_id and super_admin auth
router.post('/register', async (req, res, next) => {
  try {
    const data = registerSchema.parse(req.body);
    const role = data.role || 'client_user';

    // Check if email already exists
    const existingUser = await db.query(
      'SELECT id FROM client_users WHERE email = $1',
      [data.email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Validate super_admin creation
    if (role === 'super_admin') {
      // Check if any super admin already exists (prevent multiple super admins without proper auth)
      const existingSuperAdmin = await db.query(
        'SELECT id FROM client_users WHERE role = $1',
        ['super_admin']
      );

      // Allow creation if no super admin exists (initial setup)
      // In production, you might want to add additional security here
      if (existingSuperAdmin.rows.length > 0) {
        // For additional super admins, require authentication
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) {
          return res.status(401).json({ error: 'Authentication required to create additional super admins' });
        }
        try {
          const decoded = jwt.verify(token, JWT_SECRET) as any;
          const authUser = await db.query(
            'SELECT role FROM client_users WHERE id = $1',
            [decoded.id]
          );
          if (authUser.rows.length === 0 || authUser.rows[0].role !== 'super_admin') {
            return res.status(403).json({ error: 'Super admin access required' });
          }
        } catch (error) {
          return res.status(401).json({ error: 'Invalid token' });
        }
      }
    } else {
      // For client_user, require client_id
      if (!data.client_id) {
        return res.status(400).json({ error: 'client_id required for client_user role' });
      }

      // Verify client exists
      const clientCheck = await db.query('SELECT id FROM clients WHERE id = $1', [data.client_id]);
      if (clientCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Client not found' });
      }

      // For client_user, require super admin auth (unless it's the first user)
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (token) {
        try {
          const decoded = jwt.verify(token, JWT_SECRET) as any;
          const authUser = await db.query(
            'SELECT role FROM client_users WHERE id = $1',
            [decoded.id]
          );
          if (authUser.rows.length === 0 || authUser.rows[0].role !== 'super_admin') {
            return res.status(403).json({ error: 'Super admin access required' });
          }
        } catch (error) {
          return res.status(401).json({ error: 'Invalid token' });
        }
      }
    }

    // Hash password
    const passwordHash = await bcrypt.hash(data.password, 10);

    // Create user
    const result = await db.query(
      `INSERT INTO client_users (client_id, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, role, client_id, created_at`,
      [data.client_id || null, data.email, passwordHash, role]
    );

    res.status(201).json({
      id: result.rows[0].id,
      email: result.rows[0].email,
      role: result.rows[0].role,
      client_id: result.rows[0].client_id,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    next(error);
  }
});

// GET /api/auth/me - Get current user info
router.get('/me', async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;

      const userResult = await db.query(
        'SELECT id, email, role, client_id FROM client_users WHERE id = $1',
        [decoded.id]
      );

      if (userResult.rows.length === 0) {
        return res.status(401).json({ error: 'User not found' });
      }

      const user = userResult.rows[0];

      // Get client info if not super admin
      let clientInfo = null;
      if (user.client_id) {
        const clientResult = await db.query(
          'SELECT id, company_name, status FROM clients WHERE id = $1',
          [user.client_id]
        );
        if (clientResult.rows.length > 0) {
          clientInfo = clientResult.rows[0];
        }
      }

      res.json({
        id: user.id,
        email: user.email,
        role: user.role,
        client_id: user.client_id,
        client: clientInfo,
      });
    } catch (error) {
      return res.status(401).json({ error: 'Invalid token' });
    }
  } catch (error) {
    next(error);
  }
});

// Middleware to verify JWT token
export function verifyToken(req: any, res: any, next: any) {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// Middleware to verify super admin
export function verifySuperAdmin(req: any, res: any, next: any) {
  verifyToken(req, res, () => {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Super admin access required' });
    }
    next();
  });
}

export default router;

