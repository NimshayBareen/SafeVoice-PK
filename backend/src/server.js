'use strict';
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const config = require('./config');
const { pool } = require('./db');

const app = express();
app.disable('x-powered-by');
if (config.trustProxy) app.set('trust proxy', 1); // needed on hosts such as Render so that rate limits see the real client address
app.use(helmet());
app.use(cors({ origin: config.appUrl }));
app.use(express.json({ limit: '200kb' }));

// Slow down password and code guessing (NFR-1.4)
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 100, standardHeaders: true, legacyHeaders: false,
  message: { error: 'too_many_requests', message: 'Too many attempts. Please wait a few minutes and try again.' } }));
app.use('/api', rateLimit({ windowMs: 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false,
  message: { error: 'too_many_requests', message: 'Too many requests. Please slow down.' } }));

app.get('/api/health', async (req, res) => {
  try { await pool.query('SELECT 1'); res.json({ status: 'ok', database: 'connected' }); }
  catch (e) { res.status(503).json({ status: 'error', database: 'unreachable' }); }
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/cases', require('./routes/cases'));
app.use('/api', require('./routes/intake'));
app.use('/api', require('./routes/legal'));
app.use('/api', require('./routes/evidence'));
app.use('/api', require('./routes/lawyers'));
app.use('/api', require('./routes/requests'));
app.use('/api', require('./routes/vakalatnama'));
app.use('/api', require('./routes/messages'));
app.use('/api', require('./routes/tracking'));
app.use('/api', require('./routes/misc'));
app.use('/api', require('./routes/admin'));

// Optional: serve the built web app (npm run build in /frontend) from the same server
const dist = path.resolve(__dirname, '../../frontend/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use('/api', (req, res) => res.status(404).json({ error: 'not_found', message: 'Not found.' }));

// Central error handler: never reveals internal details to the user
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'file_too_large', message: 'The file is too large.' });
    return res.status(400).json({ error: 'upload_error', message: 'The upload could not be processed.' });
  }
  if (err && err.type === 'entity.parse.failed') return res.status(400).json({ error: 'bad_json', message: 'Invalid request.' });
  console.error(err);
  res.status(500).json({ error: 'server_error', message: 'Something went wrong. Please try again.' });
});

app.listen(config.port, () => {
  console.log(`SafeVoice PK API running on http://localhost:${config.port}`);
  console.log(`Evidence storage: ${config.storageDriver === 'db' ? 'database' : config.storageDir}`);
});
