'use strict';
// UC-01 Register Account (Victim or Advocate, e-mail OTP verification) and UC-02 Log In
const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { pool, tx } = require('../db');
const { sha256Hex } = require('../crypto');
const { appendAudit } = require('../chain');
const { writeAudit } = require('../audit');
const { sendOtp, configured: mailConfigured } = require('../mailer');
const { isEmail, normaliseMobile, validatePassword } = require('../validators');
const { requireAuth, ah } = require('../middleware/auth');

const router = express.Router();
const BCRYPT_COST = 12;
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_COST); // equalises timing for unknown users
const GENERIC_LOGIN_ERROR = 'Invalid login details, or the account is temporarily locked.';
const FEE_TYPES = ['PAID', 'PRO_BONO', 'MIXED'];

const otpHash = (userId, code) => sha256Hex(`${userId}:${code}`);

// Creates a fresh 6-digit code and cancels older unused ones (call inside a transaction)
async function issueOtp(client, userId) {
  await client.query(`UPDATE verification_tokens SET used_at = now() WHERE user_id = $1 AND purpose = 'EMAIL_OTP' AND used_at IS NULL`, [userId]);
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  await client.query(
    `INSERT INTO verification_tokens (user_id, token_hash, purpose, expires_at) VALUES ($1, $2, 'EMAIL_OTP', now() + make_interval(mins => $3))`,
    [userId, otpHash(userId, code), config.otpMinutes]);
  return code;
}

async function deliverOtp(email, code) {
  let emailSent = false;
  try { emailSent = await sendOtp(email, code); } catch (e) { console.error('Could not send OTP e-mail:', e.message); }
  return emailSent;
}

function otpResponseExtras(code) {
  // Demo mode only: lets the app be shown without a mail server
  return config.devShowOtp && !mailConfigured() ? { devOtp: code } : {};
}

// ---------- POST /api/auth/register ----------
router.post('/register', ah(async (req, res) => {
  const b = req.body || {};
  const role = b.role === 'LAWYER' ? 'LAWYER' : 'VICTIM';
  const em = b.email ? String(b.email).trim().toLowerCase() : '';
  const mob = b.mobile ? normaliseMobile(String(b.mobile)) : null;
  const problems = [];
  if (!isEmail(em)) problems.push('Please enter a valid email address. We send your verification code there.');
  if (b.mobile && !mob) problems.push('The mobile number is not valid (example: 03001234567).');
  problems.push(...validatePassword(b.password));
  const alias = b.alias ? String(b.alias).trim().slice(0, 60) : null;
  const fullName = b.fullName ? String(b.fullName).trim().slice(0, 120) : null;
  const city = b.city ? String(b.city).trim().slice(0, 60) : null;

  let lawyer = null; let categories = [];
  if (role === 'LAWYER') {
    const l = b.lawyer || {};
    const barNo = String(l.barCouncilNo || '').trim().toUpperCase();
    const languages = Array.isArray(l.languages) ? l.languages.map((x) => String(x).trim().toLowerCase().slice(0, 20)).filter(Boolean).slice(0, 6) : [];
    if (!fullName || fullName.length < 3) problems.push('Please enter your full name.');
    if (!/^[A-Z0-9][A-Z0-9\/\-. ]{2,39}$/.test(barNo)) problems.push('Please enter your Bar Council enrolment / licence number.');
    if (!l.city || String(l.city).trim().length < 2) problems.push('Please enter the city where you practise.');
    if (!languages.length) problems.push('Please choose at least one language.');
    if (!FEE_TYPES.includes(l.feeType)) problems.push('Please choose a fee type.');
    lawyer = { barNo, barName: l.barCouncilName ? String(l.barCouncilName).trim().slice(0, 80) : null, city: String(l.city || '').trim().slice(0, 60), languages, feeType: l.feeType, bio: l.bio ? String(l.bio).trim().slice(0, 1500) : null };
    categories = Array.isArray(l.categories) ? l.categories.map(String).slice(0, 20) : [];
  }
  if (problems.length) return res.status(400).json({ error: 'validation', messages: problems });

  const generic = { message: 'Registration received. We have sent a 6-digit code to your email. Enter it to verify your account.', email: em };
  const exists = await pool.query('SELECT 1 FROM users WHERE email = $1 OR mobile = $2 LIMIT 1', [em, mob]);
  if (exists.rows.length) {
    await writeAudit({ action: 'REGISTER_DUPLICATE', entityType: 'user', ip: req.ip });
    return res.status(201).json(generic); // same answer as a new account: no account discovery
  }

  const hash = await bcrypt.hash(b.password, BCRYPT_COST);
  let code;
  try {
    code = await tx(async (client) => {
      const r = await client.query(
        `INSERT INTO users (email, mobile, password_hash, role, alias, full_name, preferred_language, status, city)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'PENDING',$8) RETURNING user_id`,
        [em, mob, hash, role, alias, fullName, b.language === 'ur' ? 'ur' : 'en', city || (lawyer && lawyer.city) || null]);
      const userId = r.rows[0].user_id;
      if (lawyer) {
        const lp = await client.query(
          `INSERT INTO lawyer_profiles (user_id, full_name, bar_council_no, bar_council_name, city, languages, fee_type, bio)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING lawyer_id`,
          [userId, fullName, lawyer.barNo, lawyer.barName, lawyer.city, lawyer.languages, lawyer.feeType, lawyer.bio]);
        if (categories.length) {
          await client.query(
            `INSERT INTO lawyer_specialisations (lawyer_id, category_id) SELECT $1::uuid, category_id FROM case_categories WHERE code = ANY($2::text[])`,
            [lp.rows[0].lawyer_id, categories]);
        }
      }
      const c = await issueOtp(client, userId);
      await appendAudit(client, { actorId: userId, action: role === 'LAWYER' ? 'REGISTER_LAWYER' : 'REGISTER', entityType: 'user', entityId: userId, ip: req.ip });
      return c;
    });
  } catch (e) {
    if (e.code === '23505') return res.status(201).json(generic); // duplicate e-mail, mobile or Bar Council number (race)
    throw e;
  }
  const emailSent = await deliverOtp(em, code);
  res.status(201).json({ ...generic, emailSent, ...otpResponseExtras(code) });
}));

// ---------- POST /api/auth/verify-otp ----------
router.post('/verify-otp', ah(async (req, res) => {
  const em = String((req.body && req.body.email) || '').trim().toLowerCase();
  const code = String((req.body && req.body.code) || '').trim();
  if (!isEmail(em) || !/^\d{6}$/.test(code)) {
    return res.status(400).json({ error: 'invalid_code', message: 'Please enter the 6-digit code from your email.' });
  }
  const out = await tx(async (client) => {
    const u = (await client.query(`SELECT user_id, status FROM users WHERE email = $1`, [em])).rows[0];
    if (!u || u.status !== 'PENDING') return { status: 400, body: { error: 'invalid_code', message: 'This code is not valid or has expired. Please request a new code.' } };
    const t = (await client.query(
      `SELECT token_id, token_hash, attempts, expires_at FROM verification_tokens
       WHERE user_id = $1 AND purpose = 'EMAIL_OTP' AND used_at IS NULL ORDER BY created_at DESC LIMIT 1 FOR UPDATE`, [u.user_id])).rows[0];
    if (!t || new Date(t.expires_at) < new Date()) return { status: 400, body: { error: 'expired', message: 'This code has expired. Please request a new code.' } };
    if (t.attempts >= config.otpMaxAttempts) return { status: 429, body: { error: 'too_many_attempts', message: 'Too many wrong codes. Please request a new code.' } };
    const good = crypto.timingSafeEqual(Buffer.from(t.token_hash.trim()), Buffer.from(otpHash(u.user_id, code)));
    if (!good) {
      await client.query('UPDATE verification_tokens SET attempts = attempts + 1 WHERE token_id = $1', [t.token_id]);
      const left = Math.max(0, config.otpMaxAttempts - t.attempts - 1);
      return { status: 400, body: { error: 'invalid_code', message: `That code is not correct. ${left} attempt${left === 1 ? '' : 's'} left.` } };
    }
    await client.query('UPDATE verification_tokens SET used_at = now() WHERE token_id = $1', [t.token_id]);
    await client.query(`UPDATE users SET status = 'ACTIVE' WHERE user_id = $1`, [u.user_id]);
    await appendAudit(client, { actorId: u.user_id, action: 'ACCOUNT_VERIFIED', entityType: 'user', entityId: u.user_id, ip: req.ip });
    return { status: 200, body: { message: 'Your account is verified. You can now log in.' } };
  });
  res.status(out.status).json(out.body);
}));

// ---------- POST /api/auth/resend-otp ----------
router.post('/resend-otp', ah(async (req, res) => {
  const em = String((req.body && req.body.email) || '').trim().toLowerCase();
  const body = { message: 'If this account is waiting for verification, a new code has been sent.' };
  if (!isEmail(em)) return res.json(body);
  const u = (await pool.query(`SELECT user_id FROM users WHERE email = $1 AND status = 'PENDING'`, [em])).rows[0];
  if (!u) return res.json(body);
  const last = (await pool.query(
    `SELECT EXTRACT(EPOCH FROM (now() - created_at)) AS age FROM verification_tokens WHERE user_id = $1 AND purpose = 'EMAIL_OTP' ORDER BY created_at DESC LIMIT 1`, [u.user_id])).rows[0];
  if (last && Number(last.age) < config.otpResendSeconds) {
    const wait = Math.ceil(config.otpResendSeconds - Number(last.age));
    return res.status(429).json({ error: 'wait', retryAfter: wait, message: `Please wait ${wait} seconds before asking for a new code.` });
  }
  const code = await tx((client) => issueOtp(client, u.user_id));
  const emailSent = await deliverOtp(em, code);
  res.json({ ...body, emailSent, ...otpResponseExtras(code) });
}));

// ---------- POST /api/auth/login ----------
router.post('/login', ah(async (req, res) => {
  const { identifier, password } = req.body || {};
  const ident = String(identifier || '').trim();
  if (!ident || typeof password !== 'string' || !password) {
    return res.status(400).json({ error: 'validation', messages: ['Please enter your email or mobile number and your password.'] });
  }
  const r = await pool.query('SELECT * FROM users WHERE email = $1 OR mobile = $2 LIMIT 1', [ident.toLowerCase(), normaliseMobile(ident)]);
  const user = r.rows[0];

  if (!user) {
    await bcrypt.compare(password, DUMMY_HASH);
    await writeAudit({ action: 'LOGIN_FAILED', entityType: 'user', details: { reason: 'unknown_account' }, ip: req.ip });
    return res.status(401).json({ error: 'invalid_credentials', message: GENERIC_LOGIN_ERROR });
  }
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    await writeAudit({ actorId: user.user_id, action: 'LOGIN_BLOCKED', entityType: 'user', entityId: user.user_id, ip: req.ip });
    return res.status(401).json({ error: 'invalid_credentials', message: GENERIC_LOGIN_ERROR });
  }
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    await pool.query(
      `UPDATE users SET
         locked_until = CASE WHEN failed_login_count + 1 >= $2 THEN now() + make_interval(mins => $3) ELSE locked_until END,
         failed_login_count = CASE WHEN failed_login_count + 1 >= $2 THEN 0 ELSE failed_login_count + 1 END
       WHERE user_id = $1`, [user.user_id, config.maxFailedLogins, config.lockMinutes]);
    await writeAudit({ actorId: user.user_id, action: 'LOGIN_FAILED', entityType: 'user', entityId: user.user_id, ip: req.ip });
    return res.status(401).json({ error: 'invalid_credentials', message: GENERIC_LOGIN_ERROR });
  }
  if (user.status === 'PENDING') {
    return res.status(403).json({ error: 'not_verified', email: user.email, message: 'Please verify your account first. Enter the 6-digit code that was sent to your email.' });
  }
  if (user.status !== 'ACTIVE') {
    return res.status(403).json({ error: 'account_unavailable', message: 'This account cannot be used. Please contact support.' });
  }
  await pool.query('UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at = now() WHERE user_id = $1', [user.user_id]);
  const token = jwt.sign({ sub: user.user_id, role: user.role }, config.jwtSecret, { algorithm: 'HS256', expiresIn: `${config.sessionMinutes}m` });
  await writeAudit({ actorId: user.user_id, action: 'LOGIN_SUCCESS', entityType: 'user', entityId: user.user_id, ip: req.ip });
  res.json({ token, user: await publicUser(user.user_id) });
}));

async function publicUser(userId) {
  const r = await pool.query(
    `SELECT u.user_id, u.role, u.alias, u.full_name, u.preferred_language, u.city, lp.verification_status AS lawyer_status, lp.lawyer_id
     FROM users u LEFT JOIN lawyer_profiles lp ON lp.user_id = u.user_id WHERE u.user_id = $1`, [userId]);
  const u = r.rows[0];
  return { id: u.user_id, role: u.role, alias: u.alias, fullName: u.full_name, language: u.preferred_language, city: u.city, lawyerStatus: u.lawyer_status || null, lawyerId: u.lawyer_id || null };
}

router.get('/me', requireAuth, ah(async (req, res) => { res.json({ user: await publicUser(req.user.id) }); }));

router.post('/logout', requireAuth, ah(async (req, res) => {
  await writeAudit({ actorId: req.user.id, action: 'LOGOUT', entityType: 'user', entityId: req.user.id, ip: req.ip });
  res.json({ message: 'Logged out.' });
}));

module.exports = router;
module.exports.publicUser = publicUser;
