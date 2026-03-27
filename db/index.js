const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false,
});

async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      company_name VARCHAR(255),
      plan VARCHAR(50) DEFAULT 'free',
      stripe_customer_id VARCHAR(255),
      stripe_subscription_id VARCHAR(255),
      subscription_status VARCHAR(50) DEFAULT 'inactive',
      exports_used_this_month INTEGER DEFAULT 0,
      exports_reset_date DATE DEFAULT CURRENT_DATE,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS permits (
      id SERIAL PRIMARY KEY,
      permit_number VARCHAR(100) UNIQUE,
      permit_type VARCHAR(100) NOT NULL,
      status VARCHAR(50) DEFAULT 'active',
      description TEXT,
      address VARCHAR(255),
      city VARCHAR(100),
      county VARCHAR(100),
      state VARCHAR(2) DEFAULT 'AZ',
      zip VARCHAR(10),
      latitude DECIMAL(10, 8),
      longitude DECIMAL(11, 8),
      project_value DECIMAL(12, 2),
      square_footage INTEGER,
      issued_date DATE,
      expires_date DATE,
      contractor_name VARCHAR(255),
      contractor_license VARCHAR(100),
      contractor_phone VARCHAR(20),
      contractor_email VARCHAR(255),
      owner_name VARCHAR(255),
      owner_phone VARCHAR(20),
      source VARCHAR(100),
      source_id VARCHAR(100),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_permits_county ON permits(county);
    CREATE INDEX IF NOT EXISTS idx_permits_type ON permits(permit_type);
    CREATE INDEX IF NOT EXISTS idx_permits_issued_date ON permits(issued_date);
    CREATE INDEX IF NOT EXISTS idx_permits_value ON permits(project_value);
    CREATE INDEX IF NOT EXISTS idx_permits_city ON permits(city);

    CREATE TABLE IF NOT EXISTS jobs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      trade_type VARCHAR(100) NOT NULL,
      city VARCHAR(100),
      county VARCHAR(100),
      budget_min DECIMAL(12,2),
      budget_max DECIMAL(12,2),
      timeline VARCHAR(100),
      permit_id INTEGER REFERENCES permits(id) ON DELETE SET NULL,
      company_name VARCHAR(255),
      contact_name VARCHAR(255),
      contact_phone VARCHAR(20),
      contact_email VARCHAR(255),
      status VARCHAR(50) DEFAULT 'active',
      applications_count INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      expires_at TIMESTAMP DEFAULT NOW() + INTERVAL '30 days'
    );

    CREATE TABLE IF NOT EXISTS job_applications (
      id SERIAL PRIMARY KEY,
      job_id INTEGER REFERENCES jobs(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      message TEXT,
      contact_name VARCHAR(255),
      contact_phone VARCHAR(20),
      contact_email VARCHAR(255),
      status VARCHAR(50) DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(job_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_jobs_trade ON jobs(trade_type);
    CREATE INDEX IF NOT EXISTS idx_jobs_city ON jobs(city);
    CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);

    ALTER TABLE jobs ADD COLUMN IF NOT EXISTS address VARCHAR(255);
    ALTER TABLE jobs ADD COLUMN IF NOT EXISTS zip VARCHAR(10);
    ALTER TABLE jobs ADD COLUMN IF NOT EXISTS latitude DECIMAL(10,8);
    ALTER TABLE jobs ADD COLUMN IF NOT EXISTS longitude DECIMAL(11,8);
  `);
  console.log('Database schema initialized');
}

module.exports = { pool, initSchema };
