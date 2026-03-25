const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
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
  `);
  console.log('Database schema initialized');
}

module.exports = { pool, initSchema };
