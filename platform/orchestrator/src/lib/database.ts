import { Pool } from 'pg';

const connectionString =
  process.env.DATABASE_URL ||
  'postgresql://launchsecure:launchsecure_dev_password@localhost:5432/launchsecure';

const pool = new Pool({
  connectionString,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

export const db = {
  query: async (text: string, params?: any[]) => {
    const start = Date.now();
    try {
      const res = await pool.query(text, params);
      const duration = Date.now() - start;
      console.log('Executed query', { text, duration, rows: res.rowCount });
      return res;
    } catch (error) {
      console.error('Database query error', { text, error });
      throw error;
    }
  },
  getClient: async () => {
    const client = await pool.connect();
    return client;
  },
};

export default pool;

