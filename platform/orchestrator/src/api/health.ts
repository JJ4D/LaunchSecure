import { Router } from 'express';
import { db } from '../lib/database';

const router = Router();

router.get('/', async (req, res) => {
  try {
    // Test database connection
    await db.query('SELECT 1');
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        database: 'connected',
      },
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      services: {
        database: 'disconnected',
      },
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;

