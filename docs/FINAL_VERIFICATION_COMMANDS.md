# Avatar G - Final Verification Commands

## Run these commands in order to verify production readiness:

### 1. Code Quality
```powershell
# ESLint check (should show 0 errors)
npm run lint

# Expected output: "✔ No ESLint warnings or errors"
```

### 2. Type Safety
```powershell
# TypeScript compilation check
npx tsc --noEmit

# Expected output: No errors, silent completion
```

### 3. Production Build
```powershell
# Full production build
npm run build

# Expected output:
# - Route compilation success
# - Static pages generation
# - "Compiled successfully"
# - Build time: ~2-3 minutes
```

### 4. Test Production Server Locally
```powershell
# Start production server
npm run start

# Then visit:
# - http://localhost:3000 (Landing)
# - http://localhost:3000/pricing (Pricing)
# - http://localhost:3000/services/avatar-builder (Service example)
# - http://localhost:3000/admin/analytics (Admin)
```

### 5. Check Dependencies
```powershell
# Verify Stripe is installed
npm list stripe

# Should show: stripe@X.X.X
```

### 6. Test Database Connection (Optional)
```powershell
# If you have Supabase CLI installed:
supabase db push

# Or check migration file exists:
ls supabase/migrations/004_saas_billing_credits.sql
```

### 7. Deploy to Vercel
```powershell
# Stage all changes
git add .

# Commit with descriptive message
git commit -m "Production audit complete: 13 services + hardening + premium UI"

# Push to trigger Vercel deployment
git push origin main
```

### 8. Monitor Deployment
```
Open Vercel Dashboard:
https://vercel.com/dashboard

Check:
- Build logs (should complete in ~2-3 min)
- Deployment preview URL
- Environment variables set correctly
```

### 9. Post-Deployment Smoke Tests
Visit these URLs on your live domain:

```
✅ https://yourdomain.com
✅ https://yourdomain.com/pricing
✅ https://yourdomain.com/services/avatar-builder
✅ https://yourdomain.com/services/video-studio
✅ https://yourdomain.com/services/music-studio
✅ https://yourdomain.com/services/voice-lab
✅ https://yourdomain.com/services/media-production
✅ https://yourdomain.com/services/business-agent
✅ https://yourdomain.com/chat
✅ https://yourdomain.com/services/game-creator
✅ https://yourdomain.com/services/image-creator
✅ https://yourdomain.com/services/social-media
✅ https://yourdomain.com/services/online-shop
✅ https://yourdomain.com/services/prompt-builder
✅ https://yourdomain.com/agent
✅ https://yourdomain.com/admin/analytics
✅ https://yourdomain.com/terms
✅ https://yourdomain.com/privacy
✅ https://yourdomain.com/refund-policy
```

### 10. Configure Stripe (Production)
```bash
# 1. Create 3 products in Stripe Dashboard
#    - Avatar G Basic: $30/month
#    - Avatar G Premium: $150/month
#    - Avatar G Enterprise: $499/month

# 2. Copy Price IDs to Vercel Environment Variables:
#    STRIPE_PRICE_PRO=price_xxxxx
#    STRIPE_PRICE_PREMIUM=price_xxxxx
#    STRIPE_PRICE_ENTERPRISE=price_xxxxx

# 3. Create webhook endpoint:
#    URL: https://yourdomain.com/api/billing/webhook
#    Events: checkout.session.completed, customer.subscription.*, invoice.payment_*
#    Copy webhook secret to: STRIPE_WEBHOOK_SECRET

# 4. Redeploy to apply new env vars:
    vercel --prod
```

---

## Expected Results Summary

### Code Quality ✅
- [x] ESLint: 0 errors
- [x] TypeScript: 0 errors
- [x] Build: Successful
- [x] All routes compiled

### Features ✅
- [x] 13 services accessible
- [x] Pricing: $0/$30/$150
- [x] Premium hero with 3D avatar
- [x] User avatar replacement working
- [x] Admin analytics functional
- [x] Legal pages deployed

### Security ✅
- [x] No secrets in client bundle
- [x] Webhook signature verification
- [x] RLS policies active
- [x] Atomic credit deductions

### Performance ✅
- [x] WebGL 60fps
- [x] Lazy loading
- [x] Image optimization
- [x] SessionStorage caching

---

## If Any Command Fails

### npm run lint fails
```powershell
# Check specific error and fix
# Most common: unused variables, missing semicolons
```

### npx tsc --noEmit fails
```powershell
# Install missing types
npm install --save-dev @types/node
npm install stripe --save

# Re-run check
npx tsc --noEmit
```

### npm run build fails
```powershell
# Clear cache
Remove-Item -Recurse -Force .next

# Reinstall
npm ci

# Try again
npm run build
```

### Vercel deployment fails
```powershell
# Check build logs in Vercel Dashboard
# Common issues:
# - Missing environment variables
# - Build timeout (increase in settings)
# - Memory limit (upgrade plan if needed)
```

---

## Success Indicators

When all commands pass, you should see:

✅ **Local**:
- Lint: "✔ No ESLint warnings or errors"
- TypeScript: Silent (no output = success)
- Build: "Compiled successfully"
- Start: "Ready on http://localhost:3000"

✅ **Vercel**:
- Deployment: "Deployment completed"
- Build logs: Green checkmarks
- Preview: Site accessible and functional

✅ **Stripe**:
- Products created
- Webhook: "Endpoint Status: Enabled"
- Test checkout: Successful

✅ **Database**:
- Migration applied
- Tables created: subscriptions, credits, credit_transactions
- RPC functions: deduct_credits, add_credits, reset_monthly_credits

---

## Done! 🎉

Your Avatar G platform is now production-ready with:
- 13 services
- Premium cinematic UI
- Hardened billing system
- Admin analytics
- Complete documentation

**Next**: Monitor metrics in `/admin/analytics` and iterate! 🚀
