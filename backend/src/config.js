'use strict';
require('dotenv').config();
const path = require('path');
const { parseMasterKey } = require('./crypto');

function need(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name}. Copy .env.example to .env and fill it in.`);
  return v;
}
const bool = (v, d = false) => (v === undefined || v === '' ? d : v === 'true' || v === '1');
const int = (v, d) => (v === undefined || v === '' ? d : parseInt(v, 10));

if (need('JWT_SECRET').length < 32) throw new Error('JWT_SECRET must be at least 32 characters.');

module.exports = {
  port: int(process.env.PORT, 5000),
  databaseUrl: need('DATABASE_URL'),
  dbSsl: bool(process.env.DATABASE_SSL, false),
  jwtSecret: process.env.JWT_SECRET,
  masterKey: parseMasterKey(need('MASTER_KEY')),
  trustProxy: bool(process.env.TRUST_PROXY, false),
  appUrl: process.env.APP_URL || 'http://localhost:5173',

  storageDriver: process.env.STORAGE_DRIVER === 'db' ? 'db' : 'disk',
  storageDir: path.resolve(process.env.STORAGE_DIR || './storage'),
  maxFileMb: int(process.env.MAX_FILE_MB, 25),

  maxFailedLogins: int(process.env.MAX_FAILED_LOGINS, 5),
  lockMinutes: int(process.env.LOCK_MINUTES, 15),
  sessionMinutes: int(process.env.SESSION_MINUTES, 30),

  otpMinutes: int(process.env.OTP_MINUTES, 10),
  otpMaxAttempts: int(process.env.OTP_MAX_ATTEMPTS, 5),
  otpResendSeconds: int(process.env.OTP_RESEND_SECONDS, 60),
  // Prototype/demo only: include the OTP in the API response when no mail server is configured
  devShowOtp: bool(process.env.DEV_SHOW_OTP, false),

  smtp: {
    host: process.env.SMTP_HOST || '',
    port: int(process.env.SMTP_PORT, 465),
    secure: bool(process.env.SMTP_SECURE, true),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || '',
  },

  anthropicKey: process.env.ANTHROPIC_API_KEY || '',
  anthropicModel: process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5',

  adminEmail: process.env.ADMIN_EMAIL || '',
  adminPassword: process.env.ADMIN_PASSWORD || '',
};
