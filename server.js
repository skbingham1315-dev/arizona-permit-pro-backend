require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');
const { initSchema } = require('./db');

const app = express();

// Parse raw body for Stripe webhook before JSON middleware
app.use('/api/billing/webhook', express.raw({ type: 'application/json' }), (req, res, next) => {
  req.rawBody = req.body;
  next();
});

app.use(express.json());
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));

// Rate limiting
app.use('/api/', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { error: 'Too many requests, please try again later' },
}));
app.use('/api/auth/', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many auth attempts, please try again later' },
}));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/permits', require('./routes/permits'));
app.use('/api/billing', require('./routes/billing'));

app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date() }));

// Scheduled data pipeline - runs daily at 3am
cron.schedule('0 3 * * *', async () => {
  console.log('[Pipeline] Starting daily permit data sync...');
  try {
    const { runPipeline } = require('./scripts/pipeline');
    await runPipeline();
  } catch (err) {
    console.error('[Pipeline] Error:', err.message);
  }
});

const PORT = process.env.PORT || 5000;

async function start() {
  try {
    await initSchema();
    app.listen(PORT, () => {
      console.log(`Arizona Permit Pro API running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
