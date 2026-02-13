# PRODUCTION DEPLOYMENT GUIDE - Avatar G Platform

**Version:** 3.0  
**Date:** February 14, 2026  
**Target:** Production Environment  
**Estimated Time:** 30 minutes

---

## OVERVIEW

This guide walks through deploying the Avatar G platform to production. The platform can be deployed to **Vercel** (recommended), **AWS**, **Azure**, or any Node.js hosting provider.

### Deployment Architecture
- **Frontend:** Next.js 14 (App Router)
- **Database:** Supabase PostgreSQL (hosted)
- **Payments:** Stripe (Live mode)
- **Storage:** Supabase Storage (file uploads)
- **CDN:** Vercel Edge Network (automatic)

---

## PREREQUISITES

### Required Accounts
1. **Vercel Account** (or AWS/Azure)
2. **Supabase Project** (production instance)
3. **Stripe Account** (business verified, Live mode enabled)
4. **Domain Name** (e.g., avatarg.ge)

### Required Tools
- Git (version control)
- Node.js 18+ (local testing)
- npm or yarn (package manager)
- Supabase CLI (database migrations)

---

## DEPLOYMENT OPTION 1: VERCEL (RECOMMENDED)

### Step 1: Prepare Repository (5 minutes)

```bash
# 1. Ensure you're on main branch
git checkout main

# 2. Pull latest changes
git pull origin main

# 3. Verify build passes locally
npm run build

# 4. Commit any pending changes
git add .
git commit -m "Production deployment - Feb 14, 2026"
git push origin main
```

---

### Step 2: Create Vercel Project (3 minutes)

**Via Vercel Dashboard:**
1. Go to https://vercel.com/dashboard
2. Click **"Add New Project"**
3. Import Git Repository (GitHub/GitLab/Bitbucket)
4. Select `avatar-g-frontend-v3` repository
5. Configure **Framework Preset:** Next.js
6. Configure **Root Directory:** `./` (default)
7. Click **"Deploy"** (temporary deployment)

**Via Vercel CLI:**
```bash
# Install Vercel CLI
npm i -g vercel

# Login to Vercel
vercel login

# Deploy to production
vercel --prod
```

---

### Step 3: Configure Environment Variables (10 minutes)

#### In Vercel Dashboard:
1. Go to **Project Settings** → **Environment Variables**
2. Add the following variables:

Replace placeholders with your actual values from Stripe Dashboard and Supabase:

**Stripe (Live Keys):**
```
STRIPE_SECRET_KEY=<your-stripe-secret-key>
STRIPE_PUBLISHABLE_KEY=<your-stripe-publishable-key>
STRIPE_WEBHOOK_SECRET=<your-stripe-webhook-secret>
```

**Supabase (Production):**
```
NEXT_PUBLIC_SUPABASE_URL=https://XXXXX.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...(SECRET)
```

**Application:**
```
NEXT_PUBLIC_APP_URL=https://avatarg.ge
NODE_ENV=production
```

3. Click **"Save"**
4. Trigger redeploy: **Deployments** → **...** → **Redeploy**

---

### Step 4: Configure Custom Domain (5 minutes)

#### Add Custom Domain:
1. Go to **Project Settings** → **Domains**
2. Click **"Add Domain"**
3. Enter your domain: `avatarg.ge`
4. Follow DNS configuration instructions:
   - **A Record:** Point to Vercel IP (76.76.21.21)
   - **CNAME:** `www.avatarg.ge` → `cname.vercel-dns.com`
5. Wait for DNS propagation (5-30 minutes)
6. Verify SSL certificate issued (automatic)

---

### Step 5: Configure Stripe Webhook (3 minutes)

#### Update Webhook Endpoint:
1. Go to https://dashboard.stripe.com/webhooks
2. Click your webhook endpoint (or create new)
3. Update **Endpoint URL:** `https://avatarg.ge/api/webhooks/stripe`
4. Select events:
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `charge.refunded`
   - `customer.created`
5. Click **"Update endpoint"**
6. Copy **Signing secret** → Update `STRIPE_WEBHOOK_SECRET` in Vercel
7. Send test webhook to verify connection

---

### Step 6: Run Database Migrations (5 minutes)

```bash
# 1. Install Supabase CLI (if not installed)
npm i -g supabase

# 2. Link to production project
supabase link --project-ref YOUR_PROJECT_REF

# 3. Run all migrations
supabase db push

# OR manually apply migrations
supabase migration up

# 4. Verify tables created
supabase db dump --schema public
```

**Verify Tables:**
- `shops`
- `products`
- `orders`
- `payment_attempts`
- `stripe_events`
- `invoice_counters`
- `invoices`
- `payout_requests`
- `audit_logs`
- `users`

---

### Step 7: Smoke Test (10 minutes)

#### Test Critical Flows:

**1. Homepage**
```
✓ Visit https://avatarg.ge
✓ Verify site loads (no errors)
✓ Check logo and navigation
✓ Test services page link
```

**2. Seller Onboarding**
```
✓ Go to /seller/start
✓ Toggle VAT mode (18% → 0%)
✓ Click "დაიწყე ახლა" (Start Now)
✓ Fill onboarding form
✓ Complete simulation
✓ Verify 20% margin floor displayed
```

**3. Payment Flow (Test Card)**
```
✓ Create test order (₾10.00)
✓ Use test card: 4242 4242 4242 4242
✓ Expiry: 12/34, CVC: 123
✓ Complete payment
✓ Verify webhook received (Stripe dashboard)
✓ Verify order created (Supabase)
✓ Verify invoice generated
```

**4. Admin Dashboard**
```
✓ Login as admin
✓ Visit /dashboard/admin
✓ Check platform metrics (GMV, revenue, sellers)
✓ Visit /dashboard/admin/system-health
✓ Verify all systems green
```

**If All Tests Pass:** ✅ Deployment Complete!

---

## DEPLOYMENT OPTION 2: AWS (Advanced)

### Architecture:
- **Compute:** AWS Amplify (Next.js hosting)
- **Database:** Supabase (hosted) or RDS PostgreSQL
- **CDN:** CloudFront
- **Storage:** S3

### Step 1: Create AWS Amplify App
```bash
# Install Amplify CLI
npm i -g @aws-amplify/cli

# Configure AWS credentials
amplify configure

# Initialize Amplify
amplify init

# Add hosting
amplify add hosting
# Select: Hosting with Amplify Console

# Deploy
amplify publish
```

### Step 2: Configure Environment Variables
1. Go to AWS Amplify Console
2. Select your app
3. Go to **Environment variables**
4. Add same variables as Vercel setup
5. Redeploy

### Step 3: Configure Custom Domain
1. In Amplify Console, go to **Domain management**
2. Add domain: `avatarg.ge`
3. Configure DNS (Route 53 or external)
4. Wait for SSL certificate (automatic)

### Step 4: Follow Steps 5-7 from Vercel guide (Stripe webhook, migrations, smoke test)

---

## DEPLOYMENT OPTION 3: DOCKER (Self-Hosted)

### Dockerfile
```dockerfile
FROM node:18-alpine AS base

# Install dependencies
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# Build application
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT 3000

CMD ["node", "server.js"]
```

### Deploy with Docker
```bash
# Build image
docker build -t avatar-g:latest .

# Run container
docker run -d \
  -p 3000:3000 \
  -e STRIPE_SECRET_KEY=sk_live_XXX \
  -e STRIPE_WEBHOOK_SECRET=whsec_XXX \
  -e NEXT_PUBLIC_SUPABASE_URL=https://XXX.supabase.co \
  -e SUPABASE_SERVICE_ROLE_KEY=eyJXXX \
  --name avatar-g-app \
  avatar-g:latest

# Check logs
docker logs -f avatar-g-app
```

### Docker Compose (with NGINX)
```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY}
      - STRIPE_WEBHOOK_SECRET=${STRIPE_WEBHOOK_SECRET}
      - NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
      - SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
    restart: always

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl
    depends_on:
      - app
    restart: always
```

---

## POST-DEPLOYMENT TASKS

### 1. Enable Monitoring (15 minutes)

**Vercel Analytics (Built-in):**
```bash
# Add to package.json
npm install @vercel/analytics

# Add to app/layout.tsx
import { Analytics } from '@vercel/analytics/react'

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
```

**Sentry (Error Tracking):**
```bash
# Install Sentry
npm install @sentry/nextjs

# Initialize Sentry
npx @sentry/wizard@latest -i nextjs

# Configure sentry.client.config.ts
Sentry.init({
  dsn: "https://XXX@sentry.io/XXX",
  environment: "production",
  tracesSampleRate: 1.0,
})
```

**UptimeRobot (Uptime Monitoring):**
1. Go to https://uptimerobot.com
2. Add new monitor
3. **Monitor Type:** HTTP(s)
4. **URL:** https://avatarg.ge
5. **Monitoring Interval:** 5 minutes
6. **Alert Contacts:** your-email@example.com

---

### 2. Configure Backups (10 minutes)

**Supabase Database Backups:**
```bash
# Manual backup
supabase db dump > backups/backup-$(date +%Y%m%d).sql

# Automated daily backup (cron)
# Add to crontab: crontab -e
0 2 * * * cd /path/to/project && supabase db dump > backups/backup-$(date +%Y%m%d).sql

# Restore from backup
supabase db reset
psql -h db.YOUR_PROJECT.supabase.co -U postgres -d postgres < backup-20260214.sql
```

**Supabase Storage Backups:**
- Automatic backups enabled (7-day retention)
- Manual backup via CLI:
```bash
supabase storage download --bucket avatars --destination ./backups/avatars/
```

---

### 3. Performance Optimization (20 minutes)

**Enable Caching:**
```typescript
// next.config.js
module.exports = {
  async headers() {
    return [
      {
        source: '/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ]
  },
}
```

**Database Indexing:**
```sql
-- Run in Supabase SQL Editor
CREATE INDEX CONCURRENTLY idx_products_shop_id ON products(shop_id);
CREATE INDEX CONCURRENTLY idx_orders_shop_id ON orders(shop_id);
CREATE INDEX CONCURRENTLY idx_orders_buyer_id ON orders(buyer_id);
CREATE INDEX CONCURRENTLY idx_payment_attempts_order_id ON payment_attempts(order_id);
CREATE INDEX CONCURRENTLY idx_stripe_events_event_id ON stripe_events(event_id);
```

**Enable Compression:**
```javascript
// next.config.js
module.exports = {
  compress: true,  // Enable gzip compression
}
```

---

### 4. Security Hardening (15 minutes)

**Add Security Headers:**
```javascript
// next.config.js
module.exports = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()'
          },
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline' https://js.stripe.com; frame-src https://js.stripe.com; connect-src 'self' https://api.stripe.com https://*.supabase.co"
          }
        ]
      }
    ]
  }
}
```

**Enable Rate Limiting (Upstash Redis):**
```bash
# Install Upstash rate limiter
npm install @upstash/ratelimit @upstash/redis

# Configure middleware.ts
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, '10 s'),
})

export async function middleware(req: NextRequest) {
  const ip = req.ip ?? '127.0.0.1'
  const { success } = await ratelimit.limit(ip)
  
  if (!success) return new Response('Too Many Requests', { status: 429 })
  return NextResponse.next()
}
```

---

## ROLLBACK PROCEDURE

### Immediate Rollback (Critical Issue)

**Vercel:**
```bash
# Via Dashboard
1. Go to Deployments
2. Find previous working deployment
3. Click "..." → "Promote to Production"

# Via CLI
vercel rollback
```

**Git Revert:**
```bash
# Revert to previous commit
git revert HEAD
git push origin main

# Vercel auto-deploys from main branch
# Wait 2-3 minutes for deployment
```

**Manual Revert:**
```bash
# Reset to specific commit
git reset --hard COMMIT_HASH
git push origin main --force

# Trigger redeploy in Vercel
vercel --prod
```

---

## TROUBLESHOOTING

### Issue: Build Fails
```
Error: Module not found
```
**Solution:**
```bash
# Clear cache and rebuild
rm -rf .next
npm ci
npm run build
```

---

### Issue: Environment Variables Not Loading
```
Error: STRIPE_SECRET_KEY is not defined
```
**Solution:**
1. Verify variables in Vercel Dashboard
2. Check variable names (exact spelling)
3. Redeploy after adding variables
4. For local: Create `.env.local` file

---

### Issue: Webhook Not Receiving Events
```
Stripe webhook timeout
```
**Solution:**
1. Verify webhook URL in Stripe Dashboard
2. Check HTTPS/SSL is enabled
3. Test with Stripe CLI:
```bash
stripe listen --forward-to https://avatarg.ge/api/webhooks/stripe
stripe trigger payment_intent.succeeded
```
4. Check webhook signature verification code

---

### Issue: Database Connection Failed
```
Error: Could not connect to Supabase
```
**Solution:**
1. Verify `NEXT_PUBLIC_SUPABASE_URL` is correct
2. Check Supabase project status (https://status.supabase.com)
3. Verify RLS policies allow access
4. Test connection:
```bash
curl https://YOUR_PROJECT.supabase.co/rest/v1/?apikey=YOUR_ANON_KEY
```

---

## MAINTENANCE SCHEDULE

### Daily
- Monitor error logs (Sentry/Vercel)
- Check Stripe webhook delivery
- Review system health dashboard

### Weekly
- Review database performance
- Check disk usage (Supabase)
- Analyze user feedback/support tickets

### Monthly
- Update dependencies (`npm update`)
- Review security advisories
- Database vacuum/analyze (automatic in Supabase)
- SSL certificate renewal check (automatic)

---

## DEPLOYMENT CHECKLIST

### Pre-Deployment
- [ ] Code merged to main branch
- [ ] Build passes locally (`npm run build`)
- [ ] All tests passing (`npm test`)
- [ ] Environment variables documented
- [ ] Database migrations ready

### During Deployment
- [ ] Deploy to Vercel/AWS/Azure
- [ ] Configure environment variables
- [ ] Configure custom domain
- [ ] Configure Stripe webhook
- [ ] Run database migrations
- [ ] Verify SSL certificate

### Post-Deployment
- [ ] Smoke test critical flows
- [ ] Monitor error logs (first hour)
- [ ] Check Stripe webhook delivery
- [ ] Verify admin dashboard accessible
- [ ] Enable monitoring (Sentry, Uptime)

---

## SUPPORT & ESCALATION

**Technical Issues:**
- **Email:** tech@avatarg.ge
- **Phone:** +995 XXX XXX XXX
- **Response Time:** < 1 hour (P0), < 4 hours (P1)

**Stripe Issues:**
- **Support:** https://support.stripe.com
- **Phone:** +1 (888) 926-2289
- **Emergency:** support@stripe.com

**Supabase Issues:**
- **Support:** https://supabase.com/support
- **Discord:** https://discord.supabase.com

---

## CONCLUSION

**Deployment Complete! 🚀**

Your Avatar G platform is now live and serving users. Monitor the system closely for the first 24 hours and be ready to address any issues.

**Next Steps:**
1. Monitor error logs
2. Track user signups
3. Watch payment success rate
4. Collect user feedback
5. Plan first iteration improvements

**Celebrate your launch!** 🎉

---

**Generated by:** DevOps Lead  
**Last Updated:** February 14, 2026  
**Version:** 1.0

