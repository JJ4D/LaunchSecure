const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://launchsecure:launchsecure_dev_password@localhost:5432/launchsecure',
});

async function createSuperAdmin() {
  const email = 'lewyjohn2014@gmail.com';
  const password = 'Penc!l!996ioio';

  try {
    const hash = await bcrypt.hash(password, 10);
    
    // Check if exists
    const existing = await pool.query('SELECT id FROM client_users WHERE email = $1', [email]);
    
    if (existing.rows.length > 0) {
      // Update existing
      await pool.query(
        'UPDATE client_users SET password_hash = $1, role = $2, client_id = NULL WHERE email = $3',
        [hash, 'super_admin', email]
      );
      console.log('Super admin updated!');
    } else {
      // Create new
      const result = await pool.query(
        'INSERT INTO client_users (client_id, email, password_hash, role) VALUES (NULL, $1, $2, $3) RETURNING id, email, role',
        [email, hash, 'super_admin']
      );
      console.log('Super admin created!', result.rows[0]);
    }
    
    await pool.end();
  } catch (error) {
    console.error('Error:', error);
    await pool.end();
    process.exit(1);
  }
}

createSuperAdmin();

