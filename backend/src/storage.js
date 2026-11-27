'use strict';
// Where encrypted files live. Two drivers:
//   disk : files in STORAGE_DIR (simple, good for a laptop)
//   db   : files in the stored_files table (survives redeploys on hosts with temporary disks)
// Only ciphertext is ever written here.
const fs = require('fs/promises');
const path = require('path');
const config = require('./config');
const { pool } = require('./db');

const notFound = () => Object.assign(new Error('file not found'), { code: 'ENOENT' });

const disk = {
  async put(key, data) {
    const abs = path.join(config.storageDir, key);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, data);
  },
  async get(key) { return fs.readFile(path.join(config.storageDir, key)); },
  async remove(key) { await fs.rm(path.join(config.storageDir, key), { force: true }); },
};

const dbDriver = {
  async put(key, data) {
    await pool.query(
      'INSERT INTO stored_files (file_key, data) VALUES ($1, $2) ON CONFLICT (file_key) DO UPDATE SET data = EXCLUDED.data', [key, data]);
  },
  async get(key) {
    const r = await pool.query('SELECT data FROM stored_files WHERE file_key = $1', [key]);
    if (!r.rows.length) throw notFound();
    return r.rows[0].data;
  },
  async remove(key) { await pool.query('DELETE FROM stored_files WHERE file_key = $1', [key]); },
};

module.exports = config.storageDriver === 'db' ? dbDriver : disk;
