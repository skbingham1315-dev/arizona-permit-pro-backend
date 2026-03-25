const router = require('express').Router();
const { pool } = require('../db');
const { requireAuth, isPaidPlan, isProOrAgency } = require('../middleware/auth');

const FREE_LIMIT = 20;
const STARTER_EXPORT_LIMIT = 50;

function maskContact(permit, plan) {
  if (isProOrAgency(plan)) return permit; // full access
  if (isPaidPlan(plan)) {
    // Starter: show contractor name but mask phone/email
    return {
      ...permit,
      contractor_phone: permit.contractor_phone ? '•••-•••-' + permit.contractor_phone.slice(-4) : null,
      contractor_email: permit.contractor_email ? '••••@' + permit.contractor_email.split('@')[1] : null,
      owner_phone: null,
      owner_name: permit.owner_name ? permit.owner_name[0] + '•'.repeat(permit.owner_name.length - 1) : null,
    };
  }
  // Free: hide all contact info
  return {
    ...permit,
    contractor_phone: null,
    contractor_email: null,
    contractor_license: null,
    owner_name: null,
    owner_phone: null,
  };
}

router.get('/', requireAuth, async (req, res) => {
  try {
    const { county, type, min_value, max_value, search, status, page = 1, limit = 50 } = req.query;
    const plan = req.user.plan;

    const conditions = [];
    const values = [];
    let idx = 1;

    if (county && county !== 'all') {
      conditions.push(`county ILIKE $${idx++}`);
      values.push(county);
    }
    if (type && type !== 'all') {
      conditions.push(`permit_type ILIKE $${idx++}`);
      values.push(`%${type}%`);
    }
    if (min_value) {
      conditions.push(`project_value >= $${idx++}`);
      values.push(Number(min_value));
    }
    if (max_value) {
      conditions.push(`project_value <= $${idx++}`);
      values.push(Number(max_value));
    }
    if (status && status !== 'all') {
      conditions.push(`status = $${idx++}`);
      values.push(status);
    }
    if (search) {
      conditions.push(`(address ILIKE $${idx} OR city ILIKE $${idx} OR contractor_name ILIKE $${idx} OR permit_number ILIKE $${idx})`);
      values.push(`%${search}%`);
      idx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    // Free users capped at FREE_LIMIT results
    const effectiveLimit = plan === 'free' ? Math.min(Number(limit), FREE_LIMIT) : Math.min(Number(limit), 200);
    const offset = (Number(page) - 1) * effectiveLimit;

    const countQuery = `SELECT COUNT(*) FROM permits ${where}`;
    const dataQuery = `
      SELECT id, permit_number, permit_type, status, description, address, city, county,
             latitude, longitude, project_value, square_footage, issued_date,
             contractor_name, contractor_phone, contractor_email, contractor_license,
             owner_name, owner_phone, source
      FROM permits ${where}
      ORDER BY issued_date DESC, id DESC
      LIMIT $${idx} OFFSET $${idx + 1}
    `;

    values.push(effectiveLimit, offset);

    const [countResult, dataResult] = await Promise.all([
      pool.query(countQuery, values.slice(0, -2)),
      pool.query(dataQuery, values),
    ]);

    const maskedPermits = dataResult.rows.map(p => maskContact(p, plan));

    res.json({
      permits: maskedPermits,
      total: parseInt(countResult.rows[0].count),
      page: Number(page),
      limit: effectiveLimit,
      plan,
      is_limited: plan === 'free',
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch permits' });
  }
});

router.get('/export', requireAuth, async (req, res) => {
  if (!isPaidPlan(req.user.plan)) {
    return res.status(403).json({ error: 'Upgrade to export permits', upgrade: true });
  }

  // Check monthly export limit for Starter
  if (req.user.plan === 'starter') {
    const { rows } = await pool.query('SELECT exports_used_this_month, exports_reset_date FROM users WHERE id = $1', [req.user.id]);
    const user = rows[0];
    const resetDate = new Date(user.exports_reset_date);
    const now = new Date();
    if (now > resetDate) {
      await pool.query('UPDATE users SET exports_used_this_month = 0, exports_reset_date = $1 WHERE id = $2', [
        new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().split('T')[0],
        req.user.id,
      ]);
    } else if (user.exports_used_this_month >= STARTER_EXPORT_LIMIT) {
      return res.status(403).json({ error: `Export limit reached (${STARTER_EXPORT_LIMIT}/mo). Upgrade to Pro for unlimited.`, upgrade: true });
    }
    await pool.query('UPDATE users SET exports_used_this_month = exports_used_this_month + 1 WHERE id = $1', [req.user.id]);
  }

  try {
    const { county, type } = req.query;
    const conditions = [];
    const values = [];
    let idx = 1;
    if (county && county !== 'all') { conditions.push(`county ILIKE $${idx++}`); values.push(county); }
    if (type && type !== 'all') { conditions.push(`permit_type ILIKE $${idx++}`); values.push(`%${type}%`); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows } = await pool.query(`SELECT * FROM permits ${where} ORDER BY issued_date DESC LIMIT 5000`, values);

    const headers = ['permit_number','permit_type','status','address','city','county','zip','project_value','square_footage','issued_date','contractor_name','contractor_license','contractor_phone','contractor_email','owner_name','owner_phone','latitude','longitude'];
    const csv = [
      headers.join(','),
      ...rows.map(r => headers.map(h => JSON.stringify(r[h] ?? '')).join(','))
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="az-permits.csv"');
    res.send(csv);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Export failed' });
  }
});

router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM permits WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Permit not found' });
    res.json(maskContact(rows[0], req.user.plan));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch permit' });
  }
});

module.exports = router;
