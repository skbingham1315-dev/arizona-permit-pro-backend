const router = require('express').Router();
const Anthropic = require('@anthropic-ai/sdk');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are an expert AI assistant for Arizona Permit Pro, a platform that tracks building permits and contractor job opportunities across all of Arizona.

You help contractors, builders, and construction professionals:
- Find building permits by location, type, and value
- Discover job opportunities posted by companies
- Understand market trends and activity
- Navigate the platform efficiently

You have access to tools to search real permit data and job listings. Always use the tools to give accurate, data-driven answers. Be concise, helpful, and professional. When showing permits or jobs, summarize the key details clearly.

If asked about pricing or upgrading, mention that Pro ($99/mo) unlocks full contact info and unlimited exports.`;

const TOOLS = [
  {
    name: 'search_permits',
    description: 'Search Arizona building permits by location, type, value range, or keyword. Returns real permit data.',
    input_schema: {
      type: 'object',
      properties: {
        city: { type: 'string', description: 'City name (e.g. Phoenix, Scottsdale, Tucson)' },
        county: { type: 'string', description: 'County name (e.g. Maricopa, Pima)' },
        permit_type: { type: 'string', description: 'Type of permit (e.g. Roofing, Solar, New Construction)' },
        min_value: { type: 'number', description: 'Minimum project value in dollars' },
        max_value: { type: 'number', description: 'Maximum project value in dollars' },
        limit: { type: 'number', description: 'Number of results (default 5, max 10)' },
      },
    },
  },
  {
    name: 'search_jobs',
    description: 'Search job postings on Arizona Permit Pro where companies need contractors and tradespeople.',
    input_schema: {
      type: 'object',
      properties: {
        trade_type: { type: 'string', description: 'Trade type (e.g. Roofing, HVAC, Plumbing, Electrical)' },
        city: { type: 'string', description: 'City name' },
        county: { type: 'string', description: 'County name' },
        limit: { type: 'number', description: 'Number of results (default 5, max 10)' },
      },
    },
  },
  {
    name: 'get_market_stats',
    description: 'Get aggregate market statistics for Arizona permits — total counts, top cities, average values by type.',
    input_schema: {
      type: 'object',
      properties: {
        county: { type: 'string', description: 'Filter by county (optional)' },
        permit_type: { type: 'string', description: 'Filter by permit type (optional)' },
      },
    },
  },
];

async function runTool(toolName, toolInput) {
  if (toolName === 'search_permits') {
    const { city, county, permit_type, min_value, max_value, limit = 5 } = toolInput;
    const conditions = [];
    const values = [];
    let idx = 1;
    if (city)        { conditions.push(`city ILIKE $${idx++}`);        values.push(`%${city}%`); }
    if (county)      { conditions.push(`county ILIKE $${idx++}`);      values.push(`%${county}%`); }
    if (permit_type) { conditions.push(`permit_type ILIKE $${idx++}`); values.push(`%${permit_type}%`); }
    if (min_value)   { conditions.push(`project_value >= $${idx++}`);  values.push(min_value); }
    if (max_value)   { conditions.push(`project_value <= $${idx++}`);  values.push(max_value); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await pool.query(
      `SELECT id, permit_number, permit_type, address, city, county, project_value, issued_date, contractor_name, status
       FROM permits ${where} ORDER BY issued_date DESC LIMIT $${idx}`,
      [...values, Math.min(limit, 10)]
    );
    return rows.length ? rows : 'No permits found matching those criteria.';
  }

  if (toolName === 'search_jobs') {
    const { trade_type, city, county, limit = 5 } = toolInput;
    const conditions = ["status = 'active'", 'expires_at > NOW()'];
    const values = [];
    let idx = 1;
    if (trade_type) { conditions.push(`trade_type ILIKE $${idx++}`); values.push(`%${trade_type}%`); }
    if (city)       { conditions.push(`city ILIKE $${idx++}`);       values.push(`%${city}%`); }
    if (county)     { conditions.push(`county ILIKE $${idx++}`);     values.push(`%${county}%`); }
    const { rows } = await pool.query(
      `SELECT id, title, trade_type, city, county, budget_min, budget_max, timeline, company_name, applications_count, created_at
       FROM jobs WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC LIMIT $${idx}`,
      [...values, Math.min(limit, 10)]
    );
    return rows.length ? rows : 'No job postings found matching those criteria.';
  }

  if (toolName === 'get_market_stats') {
    const { county, permit_type } = toolInput;
    const conditions = [];
    const values = [];
    let idx = 1;
    if (county)      { conditions.push(`county ILIKE $${idx++}`);      values.push(`%${county}%`); }
    if (permit_type) { conditions.push(`permit_type ILIKE $${idx++}`); values.push(`%${permit_type}%`); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [total, byType, topCities] = await Promise.all([
      pool.query(`SELECT COUNT(*) as total, AVG(project_value) as avg_value, SUM(project_value) as total_value FROM permits ${where}`, values),
      pool.query(`SELECT permit_type, COUNT(*) as count, AVG(project_value) as avg_value FROM permits ${where} GROUP BY permit_type ORDER BY count DESC LIMIT 8`, values),
      pool.query(`SELECT city, county, COUNT(*) as count FROM permits ${where} GROUP BY city, county ORDER BY count DESC LIMIT 8`, values),
    ]);

    return {
      summary: total.rows[0],
      by_permit_type: byType.rows,
      top_cities: topCities.rows,
    };
  }

  return 'Unknown tool';
}

router.post('/chat', requireAuth, async (req, res) => {
  const { messages } = req.body;
  if (!messages?.length) return res.status(400).json({ error: 'Messages required' });

  // Limit conversation history to last 10 messages
  const history = messages.slice(-10).map(m => ({ role: m.role, content: m.content }));

  try {
    let response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages: history,
    });

    // Handle tool use in agentic loop
    while (response.stop_reason === 'tool_use') {
      const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');
      const toolResults = [];

      for (const toolUse of toolUseBlocks) {
        const result = await runTool(toolUse.name, toolUse.input);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: JSON.stringify(result),
        });
      }

      response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        tools: TOOLS,
        messages: [
          ...history,
          { role: 'assistant', content: response.content },
          { role: 'user', content: toolResults },
        ],
      });
    }

    const text = response.content.find(b => b.type === 'text')?.text || 'Sorry, I could not generate a response.';
    res.json({ message: text });
  } catch (err) {
    console.error('[AI] Error:', err.message);
    res.status(500).json({ error: 'AI assistant temporarily unavailable' });
  }
});

module.exports = router;
