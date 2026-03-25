# Arizona Permit Pro — Deployment Guide

## Stack
- **Frontend**: Vercel (free tier)
- **Backend + Database**: Railway (~$10/mo)
- **Payments**: Stripe

---

## Step 1 — Set Up Stripe

1. Go to stripe.com → Create account
2. Dashboard → Products → Create 3 products:
   - **Starter** → $49/mo recurring → copy Price ID
   - **Pro** → $99/mo recurring → copy Price ID
   - **Agency** → $199/mo recurring → copy Price ID
3. Developers → API keys → copy Secret Key
4. Developers → Webhooks → Add endpoint:
   - URL: `https://your-backend.up.railway.app/api/billing/webhook`
   - Events: `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`
   - Copy Webhook Secret

---

## Step 2 — Deploy Backend to Railway

1. Go to railway.app → New Project → Deploy from GitHub
2. Connect your GitHub account → push `arizona-permit-pro-backend` to a new repo first:
   ```
   cd /Users/mymac/arizona-permit-pro-backend
   git init
   git add .
   git commit -m "Initial backend"
   gh repo create arizona-permit-pro-backend --private --push --source=.
   ```
3. In Railway → New Project → GitHub Repo → select `arizona-permit-pro-backend`
4. Add a **PostgreSQL** database: New → Database → PostgreSQL
5. Set environment variables in Railway (Settings → Variables):
   ```
   DATABASE_URL        = (auto-filled by Railway when you add Postgres)
   JWT_SECRET          = (generate: openssl rand -base64 64)
   STRIPE_SECRET_KEY   = sk_live_...
   STRIPE_WEBHOOK_SECRET = whsec_...
   STRIPE_STARTER_PRICE_ID = price_...
   STRIPE_PRO_PRICE_ID     = price_...
   STRIPE_AGENCY_PRICE_ID  = price_...
   FRONTEND_URL        = https://your-app.vercel.app
   NODE_ENV            = production
   PORT                = 5000
   ```
6. Deploy — Railway will build with the Dockerfile automatically
7. Copy your Railway backend URL (e.g. `https://arizona-permit-pro-backend.up.railway.app`)

---

## Step 3 — Seed the Database

After Railway deploys and the database is live:
```bash
cd /Users/mymac/arizona-permit-pro-backend
DATABASE_URL="your-railway-postgres-url" node scripts/seed.js
```

Or run the real data pipeline:
```bash
DATABASE_URL="your-railway-postgres-url" node scripts/pipeline/index.js
```

---

## Step 4 — Deploy Frontend to Vercel

1. Push frontend to GitHub:
   ```
   cd /Users/mymac/arizona-permit-pro
   git init
   git add .
   git commit -m "Initial frontend"
   gh repo create arizona-permit-pro --private --push --source=.
   ```
2. Go to vercel.com → New Project → Import from GitHub → select `arizona-permit-pro`
3. Set environment variables in Vercel (Settings → Environment Variables):
   ```
   REACT_APP_GOOGLE_MAPS_API_KEY = AIzaSy...
   REACT_APP_API_URL = https://your-backend.up.railway.app/api
   ```
4. Deploy → Vercel builds and goes live
5. Copy your Vercel URL → go back to Railway and update `FRONTEND_URL`

---

## Step 5 — Restrict Google Maps API Key

1. console.cloud.google.com → Credentials → your API key
2. Application restrictions → HTTP referrers
3. Add: `https://your-app.vercel.app/*`
4. API restrictions → Maps JavaScript API only

---

## Daily Data Pipeline

The backend auto-runs the pipeline every night at 3am via cron.
To manually trigger:
```bash
DATABASE_URL="..." node scripts/pipeline/index.js 90
# The 90 = fetch last 90 days of permits
```

---

## Local Development

**Backend:**
```bash
cd arizona-permit-pro-backend
cp .env.example .env   # fill in your values
npm install
npm run seed           # populate with sample data
npm run dev            # starts on port 5000
```

**Frontend:**
```bash
cd arizona-permit-pro
npm install
npm start              # starts on port 3000
```
