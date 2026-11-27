'use strict';
// Usage:  npm run create-admin -- admin@example.com "Str0ng#Password1"
const bcrypt = require('bcryptjs');
const { pool } = require('../src/db');
const { validatePassword, isEmail } = require('../src/validators');

(async () => {
  const [email, password] = process.argv.slice(2);
  try {
    if (!email || !password) throw new Error('Usage: npm run create-admin -- <email> <password>');
    const em = email.trim().toLowerCase();
    if (!isEmail(em)) throw new Error('That is not a valid email address.');
    const p = validatePassword(password); if (p.length) throw new Error(p.join(' '));
    const hash = await bcrypt.hash(password, 12);
    const r = await pool.query(
      `INSERT INTO users (email, password_hash, role, alias, status) VALUES ($1,$2,'ADMIN','Administrator','ACTIVE')
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = 'ADMIN', status = 'ACTIVE', failed_login_count = 0, locked_until = NULL RETURNING user_id`, [em, hash]);
    console.log('Administrator ready:', em, r.rows[0].user_id);
  } catch (e) { console.error(e.message); process.exitCode = 1; } finally { await pool.end(); }
})();
