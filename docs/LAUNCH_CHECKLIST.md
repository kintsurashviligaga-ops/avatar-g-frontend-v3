# 🚀 Avatar G - Launch Checklist

**Production Launch Readiness Guide**  
Last Updated: February 12, 2026

---

## Pre-Launch Checklist

### 1. Environment Variables ✅

**Vercel Dashboard → Project Settings → Environment Variables**

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-role-key

# Stripe (Production Keys)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_PRO=price_...           # Basic $30/mo
STRIPE_PRICE_PREMIUM=price_...        # Premium $150/mo
STRIPE_PRICE_ENTERPRISE=price_...     # Enterprise $499/mo (optional)

# AI Providers (Optional - system uses mock if missing)
OPENAI_API_KEY=sk-...
DEEPSEEK_API_KEY=sk-...

# Application
NEXT_PUBLIC_APP_URL=https://yourdomain.com
NODE_ENV=production
```

### 2. Stripe Configuration ✅

**A) Create Products in Stripe Dashboard:**

1. **Basic Plan**
   - Price: $30/month
   - Recurring: Monthly
   - Copy Price ID → `STRIPE_PRICE_PRO`

2. **Premium Plan**
   - Price: $150/month
   - Recurring: Monthly
   - Copy Price ID → `STRIPE_PRICE_PREMIUM`

3. **Enterprise Plan** (Optional)
   - Price: $499/month
   - Recurring: Monthly
   - Copy Price ID → `STRIPE_PRICE_ENTERPRISE`

**B) Create Webhook Endpoint:**

- URL: `https://yourdomain.com/api/billing/webhook`
- Events to listen:
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.payment_succeeded`
  - `invoice.payment_failed`
- Copy Webhook Secret → `STRIPE_WEBHOOK_SECRET`

**C) Test Webhook:**
```bash
# Install Stripe CLI
stripe listen --forward-to localhost:3000/api/billing/webhook

# Trigger test events
stripe trigger checkout.session.completed
stripe trigger customer.subscription.updated
```

### 3. Database Migrations ✅

**Run Supabase Migrations:**

```bash
# Install Supabase CLI if not already
npm install -g supabase

# Link to your project
supabase link --project-ref your-project-ref

# Run migrations
supabase db push

# Verify tables exist
supabase db tables
```

**Expected Tables:**
- ✅ profiles
- ✅ subscriptions
- ✅ credits
- ✅ credit_transactions
- ✅ jobs
- ✅ stripe_events
- ✅ orchestration_runs

### 4. Domain & DNS Setup ✅

**Vercel Custom Domain:**

1. Go to Vercel Dashboard → Project → Settings → Domains
2. Add your domain: `yourdomain.com`
3. Update DNS records (Vercel will show exact records):
   ```
   A Record:    @ → 76.76.21.21
   CNAME:       www → cname.vercel-dns.com
   ```
4. Wait for DNS propagation (up to 48 hours, usually < 1 hour)

**Update Environment Variables:**
```bash
NEXT_PUBLIC_APP_URL=https://yourdomain.com
```

**Update Robots.txt:**
```txt
# public/robots.txt
User-agent: *
Allow: /

Sitemap: https://yourdomain.com/sitemap.xml
```

### 5. Code Quality Verification ✅

**Run All Checks:**

```powershell
# Lint
npm run lint

# Type check
npm run typecheck

# Production build
npm run build

# Optional: Run locally
npm run start
# Visit http://localhost:3000
```

**Expected Results:**
- ✅ 0 lint errors
- ✅ 0 TypeScript errors
- ✅ Build completes successfully
- ✅ All routes load without errors

### 6. Security Audit ✅

**Checklist:**

- [ ] All API keys in environment variables (not in code)
- [ ] Supabase RLS policies enabled on all tables
- [ ] Stripe webhook signature verification active
- [ ] Rate limiting configured (if applicable)
- [ ] CORS properly configured
- [ ] Authentication required on protected routes
- [ ] Credit deduction functions are atomic (using RPC)
- [ ] Admin routes have role checks (TODO: add before launch)

**Test:**
```bash
# Try accessing protected routes without auth
curl https://yourdomain.com/api/user/stats
# Should return 401 Unauthorized

# Try webhook without signature
curl -X POST https://yourdomain.com/api/billing/webhook
# Should return 400 Bad Request
```

### 7. Feature Testing ✅

**Manual Test Checklist:**

**Landing Page:**
- [ ] Hero 3D scene loads (avatar + orbiting services)
- [ ] Pricing displays correctly ($0, $30, $150)
- [ ] All navigation links work
- [ ] Mobile responsive

**Authentication:**
- [ ] Sign up with email works
- [ ] Sign in works
- [ ] Email verification link works
- [ ] Password reset works

**Dashboard:**
- [ ] 3D scene renders without errors
- [ ] Stats display correctly
- [ ] Core services grid loads
- [ ] Analytics charts show data
- [ ] Navigation to services works

**Billing:**
- [ ] Free plan shows correctly
- [ ] Upgrade to Basic starts Stripe checkout
- [ ] Payment processes successfully
- [ ] Credits allocated after payment
- [ ] Subscription shows in dashboard

**Services:**
- [ ] All 13 service pages load
- [ ] Forms submit correctly
- [ ] Credit costs display
- [ ] "Generate" buttons work (or show coming soon)

**AI Orchestration:**
- [ ] POST `/api/orchestrate` works with valid input
- [ ] Credits deducted correctly
- [ ] Provider selection works (OpenAI/DeepSeek/Mock)
- [ ] Results logged to orchestration_runs table

### 8. Performance Optimization ✅

**Lighthouse Audit:**

```bash
# Install Lighthouse CLI
npm install -g lighthouse

# Run audit
lighthouse https://yourdomain.com --view
```

**Target Scores:**
- Performance: > 80
- Accessibility: > 90
- Best Practices: > 90
- SEO: > 90

**Optimizations Applied:**
- ✅ Dynamic imports for heavy components (3D scenes)
- ✅ next/image for all images
- ✅ Proper cache headers
- ✅ Lazy loading for below-fold content
- ✅ WebGL pauses when tab not visible

### 9. SEO Verification ✅

**Check:**

```bash
# Sitemap
curl https://yourdomain.com/sitemap.xml

# Robots
curl https://yourdomain.com/robots.txt

# Meta tags (view source on key pages)
curl https://yourdomain.com | grep "og:"
```

**Expected:**
- ✅ Sitemap includes all 13 services + key pages
- ✅ Robots.txt allows crawling
- ✅ OpenGraph tags on landing, pricing, dashboard
- ✅ Twitter card meta tags
- ✅ Canonical URLs set

### 10. Monitoring Setup ✅

**Recommended Tools:**

**A) Error Tracking:**
- Sentry: `npm install @sentry/nextjs`
- Or: Vercel built-in error tracking

**B) Analytics:**
- Vercel Analytics (enable in dashboard)
- Google Analytics 4 (add tracking code)
- Plausible (privacy-friendly alternative)

**C) Uptime Monitoring:**
- UptimeRobot (free for 50 monitors)
- Pingdom
- StatusPage.io

**D) Webhook Monitoring:**
- Stripe Dashboard → Developers → Webhooks → View logs
- Set up email alerts for failed webhooks

---

## Launch Day Checklist

### Hour 0: Deploy

```bash
# Final commit
git add .
git commit -m "Production v1.0.0 - Launch ready"
git push origin main

# Vercel auto-deploys from main branch
# Monitor at: https://vercel.com/your-org/avatar-g-frontend-v3/deployments
```

### Hour 1: Smoke Tests

**Test all critical paths:**

1. **Landing → Sign Up → Dashboard**
   - Visit `https://yourdomain.com`
   - Click "Get Started"
   - Complete email verification
   - Land on dashboard
   - **Expected: 3D scene loads, stats show 0**

2. **Upgrade Flow**
   - Dashboard → Billing → Upgrade to Basic
   - Complete Stripe checkout (use test card 4242 4242 4242 4242)
   - Return to dashboard
   - **Expected: Credits show 500, plan shows Basic**

3. **Service Usage**
   - Dashboard → Video Studio
   - Fill form, click Generate
   - **Expected: Credit deduction, job created**

4. **AI Orchestration**
   ```bash
   curl -X POST https://yourdomain.com/api/orchestrate \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "agentId": "chat",
       "taskType": "text-generation",
       "input": {"prompt": "Hello, test message"}
     }'
   ```
   - **Expected: 200 OK, credits deducted, response returned**

### Hour 2-24: Monitor

**Watch for:**

- Server errors (500s) in Vercel logs
- Failed Stripe webhooks
- User signups stuck
- Payment failures
- High latency pages (> 3s load time)

**Dashboard Checks:**

- Vercel: Functions, Bandwidth, Errors
- Stripe: Payments, Subscriptions, Disputes
- Supabase: Database usage, Auth users, API requests

---

## Post-Launch Checklist (Week 1)

### Day 1-3: Stability

- [ ] Monitor error rates daily
- [ ] Check Stripe webhook success rate
- [ ] Verify credits are allocated correctly
- [ ] Test subscription renewals
- [ ] Check email delivery (signup, billing)

### Day 3-7: Optimization

- [ ] Review Lighthouse scores
- [ ] Check Core Web Vitals in Google Search Console
- [ ] Optimize slow API routes
- [ ] Add caching where appropriate
- [ ] Review database query performance

### Day 7: Feature Expansion

- [ ] Implement admin role checks (`/api/admin/*`)
- [ ] Add email notifications (payment failed, low credits)
- [ ] Set up monthly credit reset cron job
- [ ] Connect "Coming Soon" services to real APIs
- [ ] Add team collaboration features (Enterprise tier)

---

## Rollback Plan 🆘

**If critical issues occur:**

1. **Revert Deployment:**
   ```bash
   # In Vercel Dashboard
   Deployments → Select last stable deployment → Promote to Production
   ```

2. **Disable Stripe Webhook:**
   - Stripe Dashboard → Webhooks → Disable endpoint
   - Fix issues locally
   - Redeploy
   - Re-enable webhook

3. **Database Rollback:**
   ```bash
   # If migration issues
   supabase db reset
   supabase db push
   ```

4. **Emergency Maintenance Mode:**
   - Add to `middleware.ts`:
   ```typescript
   if (process.env.MAINTENANCE_MODE === 'true') {
     return NextResponse.redirect('/maintenance');
   }
   ```
   - Set `MAINTENANCE_MODE=true` in Vercel
   - Create `/app/maintenance/page.tsx`

---

## Success Metrics 📊

**Track Weekly:**

- New signups
- Free → Paid conversion rate
- MRR (Monthly Recurring Revenue)
- Churn rate
- Average credits used per user
- Top 5 services by usage
- Error rate < 0.1%
- Uptime > 99.9%

**Goals (Month 1):**
- 100 signups
- 10 paid subscribers
- $500 MRR
- 99.9% uptime
- 4.5+ star user rating

---

## Support & Contact

**Technical Issues:**
- GitHub Issues: [repo-url]/issues
- Email: support@yourdomain.com

**Documentation:**
- [DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md)
- [SAAS_IMPLEMENTATION.md](./SAAS_IMPLEMENTATION.md)
- [PRODUCTION_AUDIT_REPORT.md](./PRODUCTION_AUDIT_REPORT.md)

---

**Status**: ✅ Ready for production launch  
**Last Review**: February 12, 2026  
**Next Review**: Post-launch + 7 days
