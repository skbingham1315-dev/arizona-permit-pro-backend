const router = require('express').Router();
const { pool } = require('../db');
const { requireAuth, isPaidPlan } = require('../middleware/auth');

const TRADE_TYPES = [
  'Roofing', 'HVAC / Mechanical', 'Plumbing', 'Electrical', 'Solar / PV',
  'Swimming Pool / Spa', 'General Contracting', 'Framing / Carpentry',
  'Concrete / Masonry', 'Drywall / Painting', 'Flooring', 'Landscaping',
  'Demolition', 'Excavation / Grading', 'Insulation', 'Windows / Doors',
  'Cabinets / Millwork', 'Tile / Stone', 'Other'
];

// GET all jobs (public - anyone logged in can browse)
router.get('/', requireAuth, async (req, res) => {
  try {
    const { trade, city, county, page = 1, limit = 50, search } = req.query;
    const conditions = ["j.status = 'active'", 'j.expires_at > NOW()'];
    const values = [];
    let idx = 1;

    if (trade && trade !== 'all') { conditions.push(`j.trade_type ILIKE $${idx++}`); values.push(`%${trade}%`); }
    if (city)   { conditions.push(`j.city ILIKE $${idx++}`);   values.push(`%${city}%`); }
    if (county) { conditions.push(`j.county ILIKE $${idx++}`); values.push(`%${county}%`); }
    if (search) {
      conditions.push(`(j.title ILIKE $${idx} OR j.description ILIKE $${idx} OR j.company_name ILIKE $${idx})`);
      values.push(`%${search}%`); idx++;
    }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const offset = (Number(page) - 1) * Number(limit);

    const [countRes, dataRes] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM jobs j ${where}`, values),
      pool.query(`
        SELECT j.*, p.permit_type, p.address as permit_address, p.project_value as permit_value
        FROM jobs j
        LEFT JOIN permits p ON j.permit_id = p.id
        ${where}
        ORDER BY j.created_at DESC
        LIMIT $${idx} OFFSET $${idx + 1}
      `, [...values, Number(limit), offset]),
    ]);

    res.json({ jobs: dataRes.rows, total: parseInt(countRes.rows[0].count), page: Number(page) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

// POST create job (any paid plan or free - free gets 1 post)
router.post('/', requireAuth, async (req, res) => {
  const { title, description, trade_type, city, county, budget_min, budget_max, timeline, permit_id, contact_name, contact_phone, contact_email } = req.body;
  if (!title || !trade_type) return res.status(400).json({ error: 'Title and trade type required' });

  try {
    // Free users limited to 1 active job post
    if (!isPaidPlan(req.user.plan)) {
      const { rows } = await pool.query("SELECT COUNT(*) FROM jobs WHERE user_id = $1 AND status = 'active'", [req.user.id]);
      if (parseInt(rows[0].count) >= 1) {
        return res.status(403).json({ error: 'Free plan limited to 1 job post. Upgrade for unlimited.', upgrade: true });
      }
    }

    const company = req.user.company_name || req.body.company_name;
    const { rows } = await pool.query(`
      INSERT INTO jobs (user_id, title, description, trade_type, city, county, budget_min, budget_max,
        timeline, permit_id, company_name, contact_name, contact_phone, contact_email)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      RETURNING *
    `, [req.user.id, title, description, trade_type, city, county, budget_min||null, budget_max||null,
        timeline||null, permit_id||null, company, contact_name||null, contact_phone||null, contact_email||null]);

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create job' });
  }
});

// GET single job
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT j.*, p.permit_type, p.address as permit_address, p.project_value as permit_value,
             p.city as permit_city, p.latitude, p.longitude
      FROM jobs j LEFT JOIN permits p ON j.permit_id = p.id
      WHERE j.id = $1
    `, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Job not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch job' });
  }
});

// POST apply to job
router.post('/:id/apply', requireAuth, async (req, res) => {
  const { message, contact_name, contact_phone, contact_email } = req.body;
  try {
    const { rows } = await pool.query(`
      INSERT INTO job_applications (job_id, user_id, message, contact_name, contact_phone, contact_email)
      VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (job_id, user_id) DO UPDATE SET message = EXCLUDED.message, contact_phone = EXCLUDED.contact_phone
      RETURNING *
    `, [req.params.id, req.user.id, message||null, contact_name||null, contact_phone||null, contact_email||req.user.email]);

    await pool.query('UPDATE jobs SET applications_count = applications_count + 1 WHERE id = $1', [req.params.id]);
    res.status(201).json({ success: true, application: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to submit application' });
  }
});

// GET my posted jobs
router.get('/mine/posted', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM jobs WHERE user_id = $1 ORDER BY created_at DESC', [req.user.id]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch your jobs' });
  }
});

// DELETE close a job
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    await pool.query("UPDATE jobs SET status = 'closed' WHERE id = $1 AND user_id = $2", [req.params.id, req.user.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to close job' });
  }
});

module.exports = router;
