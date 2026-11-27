'use strict';
// Creates the tables, loads the starter legal knowledge base and (if ADMIN_EMAIL / ADMIN_PASSWORD are set) the first administrator.
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const config = require('../src/config');
const { pool } = require('../src/db');
const { seedKnowledgeBase } = require('../src/kb/seed');
const { validatePassword, isEmail } = require('../src/validators');

(async () => {
  try {
    await pool.query(fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8'));
    console.log('Database tables are ready.');
    const added = await seedKnowledgeBase(pool);
    console.log('Knowledge base loaded:', Object.entries(added).map(([k, v]) => `${k} +${v}`).join(', '));
    if (config.adminEmail && config.adminPassword) {
      const em = config.adminEmail.trim().toLowerCase();
      const problems = validatePassword(config.adminPassword);
      if (!isEmail(em) || problems.length) console.log('ADMIN_EMAIL / ADMIN_PASSWORD ignored:', !isEmail(em) ? 'invalid email' : problems.join(' '));
      else {
        const has = await pool.query('SELECT 1 FROM users WHERE email = $1', [em]);
        if (!has.rows.length) {
          await pool.query(`INSERT INTO users (email, password_hash, role, alias, status) VALUES ($1,$2,'ADMIN','Administrator','ACTIVE')`, [em, await bcrypt.hash(config.adminPassword, 12)]);
          console.log('Administrator account created:', em);
        }
      }
    }
  } catch (e) {
    console.error('Migration failed:', e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
