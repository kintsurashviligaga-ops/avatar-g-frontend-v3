# Avatar G SaaS - Deployment Checklist

## ✅ Pre-Deployment

### Database
- [ ] Run migration `004_saas_billing_credits.sql` on Supabase
- [ ] Run migration `005_stripe_events_idempotency.sql` on Supabase
- [ ] Verify all tables created: `profiles`, `subscriptions`, `credits`, `credit_transactions`, `stripe_events`, `orchestration_runs`
- [ ] Verify views created: `credit_ledger`
- [ ] Verify functions created: `deduct_credits()`, `add_credits()`, `reset_monthly_credits()`, `update_monthly_allowance()`
- [ ] Check RLS policies enabled on all tables
- [ ] Verify indexes created successfully
- [ ] Backfill existing users with FREE plan + 100 credits

### Stripe Setup
- [ ] Create products in Stripe Dashboard:
  - Avatar G Basic ($30/month)
  - Avatar G Premium ($150/month)
- [ ] Copy Price IDs to environment variables
- [ ] Create webhook endpoint in Stripe
- [ ] Subscribe to events: `checkout.session.completed`, `customer.subscription.*`, `invoice.payment_*`
- [ ] Copy webhook secret to environment variables
- [ ] Test webhook with Stripe CLI: `stripe listen --forward-to localhost:3000/api/billing/webhook`

### Environment Variables
- [ ] Set all required variables in `.env.local` (dev) and Vercel (prod):
  ```
  NEXT_PUBLIC_SUPABASE_URL
  NEXT_PUBLIC_SUPABASE_ANON_KEY
  SUPABASE_SERVICE_ROLE_KEY
  STRIPE_SECRET_KEY
  STRIPE_WEBHOOK_SECRET
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  STRIPE_PRICE_PRO
  STRIPE_PRICE_PREMIUM
  ```

### Code Quality
- [ ] Run `npm install stripe` (if not already installed)
- [ ] Run `npm run lint` - Zero errors
- [ ] Run `npm run typecheck` - Zero errors
- [ ] Run `npm run build` - Successful build
- [ ] Test all API routes locally
- [ ] Review security: No secrets in client code

## 🧪 Local Testing

### User Flow
- [ ] Create new test user account
- [ ] Verify auto-assigned FREE plan
- [ ] Check 100 credits allocated
- [ ] Navigate to `/dashboard/billing`
- [ ] All dashboard widgets render correctly
- [ ] Credits summary shows correct balance
- [ ] Recent jobs section renders (empty state OK)

### Billing Flow
- [ ] Click "Upgrade Plan" button
- [ ] Stripe Checkout opens for Basic plan
- [ ] Complete test payment: `4242 4242 4242 4242`
- [ ] Redirected back to dashboard with success message
- [ ] Webhook received and processed
- [ ] Plan updated to BASIC in database
- [ ] Credits updated to 1,000
- [ ] Dashboard reflects new plan

### Portal Access
- [ ] Click "Manage Billing" button
- [ ] Stripe Customer Portal opens
- [ ] Can view invoices
- [ ] Can update payment method
- [ ] Can cancel subscription
- [ ] Cancel → Plan stays active until period end
- [ ] After period end → Downgraded to FREE

### Agent Execution
- [ ] Test `/api/agents/execute` endpoint:
  ```bash
  curl -X POST http://localhost:3000/api/agents/execute \
    -H "Authorization: Bearer YOUR_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"agentId":"music-studio","action":"generate","input":{"prompt":"test"}}'
  ```
- [ ] With FREE plan:
  - [ ] Access to 'music-studio' works (FREE agent)
  - [ ] Access to 'avatar-g-agent' fails with 403 (PREMIUM required)
- [ ] With 0 credits:
  - [ ] Returns 402 with insufficient credits error
- [ ] Successful execution:
  - [ ] Job created in database
  - [ ] Credits deducted from balance
  - [ ] Transaction logged in `credit_transactions`
  - [ ] Returns jobId

### Credits System
- [ ] View `/api/credits/balance`:
  ```bash
  curl http://localhost:3000/api/credits/balance \
    -H "Authorization: Bearer YOUR_TOKEN"
  ```
- [ ] Balance reflects deductions
- [ ] Monthly allowance correct for plan
- [ ] Next reset date shown
- [ ] Test manual credit add:
  ```sql
  SELECT add_credits('user-uuid', 50, 'Bonus credits');
  ```
- [ ] Balance increases correctly

### Jobs System
- [ ] View `/api/jobs/list`:
  ```bash
  curl http://localhost:3000/api/jobs/list \
    -H "Authorization: Bearer YOUR_TOKEN"
  ```
- [ ] Jobs returned in correct order (newest first)
- [ ] Job status accurate
- [ ] Cost credits recorded
- [ ] Agent ID preserved
- [ ] Filter by status works: `?status=done`
- [ ] Filter by agent works: `?agentId=music-studio`

## 🚀 Production Deployment

### Vercel Setup
- [ ] Add all environment variables to Vercel project
- [ ] Ensure `STRIPE_WEBHOOK_SECRET` is **production** webhook secret
- [ ] Deploy: `git push` (auto-deploys)
- [ ] Verify build succeeded
- [ ] Check deployment logs for errors

### Stripe Production Webhook
- [ ] Update webhook URL in Stripe Dashboard to production:
  ```
  https://yourdomain.com/api/billing/webhook
  ```
- [ ] Ensure using **production API keys**
- [ ] Test webhook delivery from Stripe Dashboard
- [ ] Verify webhook receives events successfully

### Post-Deployment Verification
- [ ] Visit `https://yourdomain.com/dashboard/billing`
- [ ] Page loads without errors
- [ ] All widgets render
- [ ] Click "Upgrade Plan"
- [ ] Complete real payment (will charge real card!)
- [ ] Verify webhook processes correctly
- [ ] Check database for updates
- [ ] Check Stripe Dashboard for subscription
- [ ] Test cancellation flow
- [ ] Test Customer Portal access

### Monitoring Setup
- [ ] Set up Sentry/LogRocket for error tracking
- [ ] Configure Vercel Analytics
- [ ] Set up Stripe email notifications
- [ ] Monitor webhook success rate in Stripe
- [ ] Set up alerts for:
  - Failed payments
  - Webhook failures
  - Database errors
  - Credit deduction failures

## 📊 Post-Launch

### Week 1
- [ ] Monitor webhook delivery rate (target: >99%)
- [ ] Check subscription conversion rate
- [ ] Review error logs daily
- [ ] Verify credit resets working (if month boundary crossed)
- [ ] Test customer support flow
- [ ] Gather user feedback on pricing

### Month 1
- [ ] Analyze plan distribution (FREE/BASIC/PREMIUM)
- [ ] Calculate MRR (Monthly Recurring Revenue)
- [ ] Measure churn rate
- [ ] Review credit utilization per plan
- [ ] Identify most popular agents
- [ ] Optimize pricing if needed

### Ongoing
- [ ] Monthly credit reset verification (1st of each month)
- [ ] Quarterly billing audit
- [ ] Review and update agent costs based on actual cloud costs
- [ ] Monitor for fraudulent usage patterns
- [ ] Update documentation as features evolve

## 🐛 Common Issues & Fixes

### Webhook not working
**Symptom**: Payments complete but plan not updating

**Debug**:
1. Check Vercel logs: `vercel logs`
2. Check Stripe webhook logs in Dashboard
3. Verify `STRIPE_WEBHOOK_SECRET` matches
4. Test signature verification locally

**Fix**:
- Regenerate webhook secret
- Update environment variable
- Redeploy

### Credits not deducting
**Symptom**: Jobs execute but credits don't decrease

**Debug**:
1. Check `credit_transactions` table
2. Review enforcement error logs
3. Verify `deduct_credits()` function exists

**Fix**:
- Re-run migration
- Check Supabase function logs
- Verify database permissions

### Dashboard not loading
**Symptom**: `/dashboard/billing` shows errors

**Debug**:
1. Check browser console
2. Review server logs
3. Verify database records exist
4. Check RLS policies

**Fix**:
- Initialize missing subscription/credits records
- Review and fix RLS policies
- Check auth token validity

## 🎉 Success Criteria

### Technical
- ✅ Zero build errors
- ✅ Zero TypeScript errors
- ✅ Zero ESLint warnings
- ✅ All API routes return correct status codes
- ✅ Webhooks processing with 100% success rate
- ✅ Database functions working correctly
- ✅ RLS policies preventing unauthorized access

### Business
- ✅ Users can sign up and get FREE plan
- ✅ Users can upgrade via Stripe Checkout
- ✅ Payments processing correctly
- ✅ Subscription management working
- ✅ Credits system functional
- ✅ Usage tracking accurate
- ✅ Job execution with enforcement
- ✅ Premium features gated correctly

### User Experience
- ✅ Dashboard loads in <2 seconds
- ✅ Checkout flow smooth (< 5 clicks)
- ✅ Clear credit balance visibility
- ✅ Helpful error messages
- ✅ Mobile-responsive UI
- ✅ No unexplained errors
- ✅ Support documentation accessible

---

## 📞 Support Contacts

- **Stripe Support**: https://support.stripe.com
- **Supabase Support**: https://supabase.com/dashboard/support
- **Vercel Support**: https://vercel.com/support

## 📚 Quick Reference

- **Docs**: `/docs/SAAS_IMPLEMENTATION.md`
- **Migration**: `/supabase/migrations/004_saas_billing_credits.sql`
- **Billing Code**: `/lib/billing/`
- **Dashboard UI**: `/components/dashboard/`
- **API Routes**: `/app/api/billing/`, `/app/api/credits/`, `/app/api/agents/`

---

**Checklist Version**: 1.0.0  
**Last Updated**: 2026-02-12  
**Status**: Ready for Deployment ✅
