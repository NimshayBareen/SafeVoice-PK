'use strict';
const jwt = require('jsonwebtoken');
const config = require('../config');
const { pool } = require('../db');

// Checks the JWT, then confirms the account is still ACTIVE (so a suspended user is cut off at once).
async function requireAuth(req, res, next) {
  try {
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'unauthorised', message: 'Please log in.' });
    let payload;
    try {
      payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
    } catch (_) {
      return res.status(401).json({ error: 'session_expired', message: 'Your session has expired. Please log in again.' });
    }
    const r = await pool.query('SELECT user_id, role, status, alias FROM users WHERE user_id = $1', [payload.sub]);
    const u = r.rows[0];
    if (!u || u.status !== 'ACTIVE') return res.status(401).json({ error: 'unauthorised', message: 'Please log in.' });
    req.user = { id: u.user_id, role: u.role, alias: u.alias };
    next();
  } catch (e) { next(e); }
}

const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'forbidden', message: 'Access denied.' });

// A lawyer account whose profile an administrator has verified. Sets req.lawyer.
async function requireVerifiedLawyer(req, res, next) {
  try {
    if (req.user.role !== 'LAWYER') return res.status(403).json({ error: 'forbidden', message: 'Access denied.' });
    const r = await pool.query('SELECT lawyer_id, full_name, verification_status FROM lawyer_profiles WHERE user_id = $1', [req.user.id]);
    const l = r.rows[0];
    if (!l || l.verification_status !== 'VERIFIED') {
      return res.status(403).json({ error: 'lawyer_not_verified', message: 'Your profile has not been verified by an administrator yet.' });
    }
    req.lawyer = { id: l.lawyer_id, name: l.full_name };
    next();
  } catch (e) { next(e); }
}

// Wrap async route handlers so errors reach the error handler
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { requireAuth, requireRole, requireVerifiedLawyer, ah };
