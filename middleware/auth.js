const jwt = require('jsonwebtoken');
const { pool } = require('../db');

async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const { rows } = await pool.query('SELECT id, email, company_name, plan, subscription_status FROM users WHERE id = $1', [payload.userId]);
    if (!rows.length) return res.status(401).json({ error: 'User not found' });
    req.user = rows[0];
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Attach user if token present, but don't block if not
async function optionalAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next();
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const { rows } = await pool.query('SELECT id, email, company_name, plan, subscription_status FROM users WHERE id = $1', [payload.userId]);
    if (rows.length) req.user = rows[0];
  } catch {}
  next();
}

function isPaidPlan(plan) {
  return ['starter', 'pro', 'agency'].includes(plan);
}

function isProOrAgency(plan) {
  return ['pro', 'agency'].includes(plan);
}

module.exports = { requireAuth, optionalAuth, isPaidPlan, isProOrAgency };
