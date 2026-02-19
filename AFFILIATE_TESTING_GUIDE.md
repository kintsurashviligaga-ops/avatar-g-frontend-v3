# Affiliate System Testing Guide

Complete guide for testing the Avatar G affiliate program implementation.

## Prerequisites

### 1. Environment Variables

Add to your `.env.local`:

```bash
# Admin Access (comma-separated list of admin emails)
ADMIN_EMAILS="admin@myavatar.ge,your-email@example.com"

# Optional: Client-side admin check (for UI only, not security)
NEXT_PUBLIC_ADMIN_EMAILS="admin@myavatar.ge"

# Supabase (should already be configured)
NEXT_PUBLIC_SUPABASE_URL="your-supabase-url"
NEXT_PUBLIC_SUPABASE_ANON_KEY="your-anon-key"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
```

### 2. Database Setup

Ensure you have the affiliate tables:

```sql
-- Check if tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('affiliate_profiles', 'affiliate_clicks', 'affiliate_commissions', 'affiliate_payouts');
```

If tables don't exist, you'll need to create the affiliate migration (see schema section below).

### 3. Authentication

- You must have Supabase auth configured
- Create at least 2 test users:
  1. Regular user (will become affiliate)
  2. Admin user (email must be in ADMIN_EMAILS)

---

## Database Schema (If Not Already Created)

Create migration: `supabase/migrations/010_affiliate_system.sql`

```sql
-- Affiliate Profiles
CREATE TABLE IF NOT EXISTS public.affiliate_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  affiliate_code VARCHAR(20) UNIQUE NOT NULL,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'pending')),
  total_clicks INTEGER DEFAULT 0,
  total_signups INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE INDEX idx_affiliate_profiles_user_id ON public.affiliate_profiles(user_id);
CREATE INDEX idx_affiliate_profiles_code ON public.affiliate_profiles(affiliate_code);
CREATE INDEX idx_affiliate_profiles_status ON public.affiliate_profiles(status);

-- Affiliate Clicks
CREATE TABLE IF NOT EXISTS public.affiliate_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id UUID NOT NULL REFERENCES public.affiliate_profiles(id) ON DELETE CASCADE,
  click_id VARCHAR(50) UNIQUE NOT NULL,
  landing_url TEXT,
  utm_source VARCHAR(100),
  utm_medium VARCHAR(100),
  utm_campaign VARCHAR(100),
  ip_hash VARCHAR(64), -- SHA-256 hash of IP (never store raw IP)
  user_agent TEXT,
  referrer TEXT,
  converted BOOLEAN DEFAULT FALSE,
  converted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_affiliate_clicks_affiliate_id ON public.affiliate_clicks(affiliate_id);
CREATE INDEX idx_affiliate_clicks_click_id ON public.affiliate_clicks(click_id);
CREATE INDEX idx_affiliate_clicks_converted ON public.affiliate_clicks(converted);

-- Affiliate Commissions
CREATE TABLE IF NOT EXISTS public.affiliate_commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id UUID NOT NULL REFERENCES public.affiliate_profiles(id) ON DELETE CASCADE,
  source_type VARCHAR(50) NOT NULL, -- 'subscription', 'order', 'signup_bonus', etc.
  source_id VARCHAR(100), -- Order ID, Subscription ID, etc.
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  commission_rate DECIMAL(5,2), -- e.g., 10.00 for 10%
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'eligible', 'paid', 'reversed')),
  available_at TIMESTAMPTZ, -- When commission becomes eligible for payout
  paid_at TIMESTAMPTZ,
  payout_id UUID REFERENCES public.affiliate_payouts(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_affiliate_commissions_affiliate_id ON public.affiliate_commissions(affiliate_id);
CREATE INDEX idx_affiliate_commissions_status ON public.affiliate_commissions(status);
CREATE INDEX idx_affiliate_commissions_available_at ON public.affiliate_commissions(available_at);

-- Affiliate Payouts
CREATE TABLE IF NOT EXISTS public.affiliate_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id UUID NOT NULL REFERENCES public.affiliate_profiles(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  payout_method VARCHAR(50), -- 'stripe', 'bank_transfer', 'paypal', etc.
  payout_reference VARCHAR(100), -- External transaction ID
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_affiliate_payouts_affiliate_id ON public.affiliate_payouts(affiliate_id);
CREATE INDEX idx_affiliate_payouts_status ON public.affiliate_payouts(status);

-- RLS Policies
ALTER TABLE public.affiliate_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_clicks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_payouts ENABLE ROW LEVEL SECURITY;

-- Users can view their own affiliate profile
CREATE POLICY "Users can view own affiliate profile" ON public.affiliate_profiles
  FOR SELECT USING (auth.uid() = user_id);

-- Users can view their own clicks
CREATE POLICY "Users can view own clicks" ON public.affiliate_clicks
  FOR SELECT USING (
    affiliate_id IN (SELECT id FROM public.affiliate_profiles WHERE user_id = auth.uid())
  );

-- Users can view their own commissions
CREATE POLICY "Users can view own commissions" ON public.affiliate_commissions
  FOR SELECT USING (
    affiliate_id IN (SELECT id FROM public.affiliate_profiles WHERE user_id = auth.uid())
  );

-- Users can view their own payouts
CREATE POLICY "Users can view own payouts" ON public.affiliate_payouts
  FOR SELECT USING (
    affiliate_id IN (SELECT id FROM public.affiliate_profiles WHERE user_id = auth.uid())
  );
```

---

## API Endpoints Reference

### User Endpoints

#### **POST /api/affiliate/register**
Register current user as affiliate.

```bash
curl -X POST http://localhost:3000/api/affiliate/register \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json"
```

Response:
```json
{
  "success": true,
  "affiliate": {
    "id": "uuid",
    "user_id": "uuid",
    "affiliate_code": "REF123XYZ",
    "status": "active"
  }
}
```

#### **GET /api/affiliate/me**
Get current user's affiliate profile.

```bash
curl -X GET http://localhost:3000/api/affiliate/me \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

#### **GET /api/affiliate/commissions**
Get current user's commissions with optional status filter.

```bash
curl -X GET "http://localhost:3000/api/affiliate/commissions?status=eligible" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Admin Endpoints

#### **GET /api/admin/affiliates**
List all affiliates (admin only).

```bash
curl -X GET "http://localhost:3000/api/admin/affiliates?search=REF123&status=active" \
  -H "Authorization: Bearer ADMIN_ACCESS_TOKEN"
```

#### **PATCH /api/admin/affiliates**
Update affiliate status (admin only).

```bash
curl -X PATCH http://localhost:3000/api/admin/affiliates \
  -H "Authorization: Bearer ADMIN_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user-uuid",
    "status": "disabled"
  }'
```

#### **GET /api/admin/payouts/eligible**
Get affiliates eligible for payout (admin only).

```bash
curl -X GET http://localhost:3000/api/admin/payouts/eligible \
  -H "Authorization: Bearer ADMIN_ACCESS_TOKEN"
```

#### **POST /api/admin/payouts/eligible**
Create payout for affiliate (admin only).

```bash
curl -X POST http://localhost:3000/api/admin/payouts/eligible \
  -H "Authorization: Bearer ADMIN_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "affiliateId": "affiliate-uuid",
    "amountCents": 5000,
    "notes": "Monthly payout"
  }'
```

---

## Testing Workflow

### Phase 1: Affiliate Registration

1. **Sign up as regular user**
   - Go to `/auth/signup`
   - Create account: `affiliate1@test.com` / password

2. **Register as affiliate**
   ```bash
   # Option A: Via API
   curl -X POST http://localhost:3000/api/affiliate/register \
     -H "Authorization: Bearer YOUR_TOKEN"
   
   # Option B: Create manual registration endpoint or insert directly
   ```

3. **Verify affiliate created**
   ```sql
   SELECT * FROM affiliate_profiles WHERE user_id = 'your-user-id';
   ```

4. **Access dashboard**
   - Navigate to `/affiliate`
   - Verify you see:
     - Your affiliate code (e.g., `REF123XYZ`)
     - Referral link with copy button
     - Stats cards (all showing 0 initially)
     - Empty tables

### Phase 2: Track Clicks & Signups

1. **Generate referral link**
   - Copy link from dashboard: `https://myavatar.ge/?ref=REF123XYZ`

2. **Simulate click tracking**
   ```sql
   -- Insert test click
   INSERT INTO affiliate_clicks (
     affiliate_id, 
     click_id, 
     landing_url, 
     utm_source,
     ip_hash
   ) VALUES (
     'your-affiliate-id',
     'click_' || gen_random_uuid(),
     'https://myavatar.ge/?ref=REF123XYZ',
     'facebook',
     encode(sha256('127.0.0.1'::bytea), 'hex')
   );
   
   -- Update click count
   UPDATE affiliate_profiles 
   SET total_clicks = total_clicks + 1 
   WHERE id = 'your-affiliate-id';
   ```

3. **Verify click tracked**
   - Refresh `/affiliate` dashboard
   - Check "Total Clicks" stat increased

### Phase 3: Create Commissions

1. **Insert test commission**
   ```sql
   -- Insert pending commission
   INSERT INTO affiliate_commissions (
     affiliate_id,
     source_type,
     source_id,
     amount_cents,
     commission_rate,
     status,
     available_at
   ) VALUES (
     'your-affiliate-id',
     'order',
     'order_123456',
     2500, -- $25.00
     10.00,
     'pending',
     NOW() + INTERVAL '30 days'
   );
   ```

2. **Insert eligible commission**
   ```sql
   -- Insert eligible commission (available for payout)
   INSERT INTO affiliate_commissions (
     affiliate_id,
     source_type,
     source_id,
     amount_cents,
     commission_rate,
     status,
     available_at
   ) VALUES (
     'your-affiliate-id',
     'subscription',
     'sub_789012',
     5000, -- $50.00
     12.00,
     'eligible',
     NOW() - INTERVAL '1 day' -- Already available
   );
   ```

3. **Verify in dashboard**
   - Go to `/affiliate`
   - Check "Eligible Commissions" shows $50.00
   - Check "Pending Commissions" shows $25.00
   - Verify commissions table shows both entries

### Phase 4: Admin Management

1. **Sign in as admin**
   - Use email listed in ADMIN_EMAILS
   - Sign in via `/auth/login`

2. **Access admin pages**
   - Go to `/admin/affiliates`
   - Verify you see all affiliates
   - Test search by code
   - Test status filter

3. **Toggle affiliate status**
   - Click "Disable" button
   - Verify status changes to "disabled"
   - Click "Activate" to re-enable

4. **View payouts queue**
   - Go to `/admin/payouts`
   - Verify you see affiliates with eligible >= $50.00
   - Check total eligible amount displayed

### Phase 5: Create Payout

1. **Create payout**
   - In `/admin/payouts`, click "Create Payout"
   - Verify dialog shows:
     - Affiliate code
     - Eligible amount
     - Notes textarea
   - Enter notes (optional)
   - Click "Confirm"

2. **Verify payout created**
   ```sql
   SELECT * FROM affiliate_payouts 
   WHERE affiliate_id = 'your-affiliate-id' 
   ORDER BY created_at DESC 
   LIMIT 1;
   ```

3. **Verify commissions updated**
   ```sql
   SELECT * FROM affiliate_commissions 
   WHERE payout_id = 'payout-id' 
   AND status = 'paid';
   ```

4. **Check user dashboard**
   - Sign in as affiliate user
   - Go to `/affiliate`
   - Verify "Eligible Commissions" decreased
   - Verify "Paid Commissions" increased
   - Check commissions table shows "paid" status

### Phase 6: Internationalization (i18n)

1. **Test Georgian (default)**
   - All pages should show Georgian text by default
   - Check `/affiliate` page headers
   - Check `/admin/affiliates` page

2. **Switch to English**
   - Change language selector to English
   - Verify all UI text changes
   - Check navigation, buttons, labels

3. **Switch to Russian**
   - Change to Russian
   - Verify Cyrillic text displays correctly

4. **Verify translation keys**
   ```bash
   # Check for missing translations
   grep -r "affiliate\." messages/ka.json
   grep -r "admin\." messages/en.json
   ```

---

## Database Verification Queries

### Check Affiliate Profile
```sql
SELECT 
  ap.affiliate_code,
  ap.status,
  ap.total_clicks,
  ap.total_signups,
  u.email,
  ap.created_at
FROM affiliate_profiles ap
JOIN auth.users u ON u.id = ap.user_id
WHERE ap.user_id = 'your-user-id';
```

### Check Commission Totals
```sql
SELECT 
  ap.affiliate_code,
  COUNT(ac.id) AS total_commissions,
  SUM(CASE WHEN ac.status = 'pending' THEN ac.amount_cents ELSE 0 END) AS pending_cents,
  SUM(CASE WHEN ac.status = 'eligible' THEN ac.amount_cents ELSE 0 END) AS eligible_cents,
  SUM(CASE WHEN ac.status = 'paid' THEN ac.amount_cents ELSE 0 END) AS paid_cents
FROM affiliate_profiles ap
LEFT JOIN affiliate_commissions ac ON ac.affiliate_id = ap.id
WHERE ap.id = 'your-affiliate-id'
GROUP BY ap.id, ap.affiliate_code;
```

### Check Eligible for Payout
```sql
SELECT 
  ap.id AS affiliate_id,
  ap.affiliate_code,
  SUM(ac.amount_cents) AS eligible_amount_cents,
  MAX(apay.created_at) AS last_payout_at
FROM affiliate_profiles ap
LEFT JOIN affiliate_commissions ac ON ac.affiliate_id = ap.id 
  AND ac.status = 'eligible' 
  AND ac.available_at <= NOW()
LEFT JOIN affiliate_payouts apay ON apay.affiliate_id = ap.id
WHERE ap.status = 'active'
GROUP BY ap.id, ap.affiliate_code
HAVING SUM(ac.amount_cents) >= 5000 -- $50 minimum
ORDER BY eligible_amount_cents DESC;
```

### Check Payout History
```sql
SELECT 
  apay.id,
  ap.affiliate_code,
  apay.amount_cents,
  apay.status,
  apay.period_start,
  apay.period_end,
  apay.notes,
  apay.created_at
FROM affiliate_payouts apay
JOIN affiliate_profiles ap ON ap.id = apay.affiliate_id
WHERE apay.affiliate_id = 'your-affiliate-id'
ORDER BY apay.created_at DESC;
```

---

## Troubleshooting

### Issue: "Unauthorized: Admin access required"

**Cause**: Your email is not in ADMIN_EMAILS environment variable.

**Solution**:
1. Add your email to `.env.local`:
   ```bash
   ADMIN_EMAILS="your-email@example.com,other@example.com"
   ```
2. Restart dev server
3. Verify in admin guard:
   ```typescript
   console.log('ADMIN_EMAILS:', process.env.ADMIN_EMAILS);
   ```

### Issue: Affiliate dashboard shows no data

**Cause**: User not registered as affiliate or API endpoint not working.

**Solution**:
1. Check if user has affiliate profile:
   ```sql
   SELECT * FROM affiliate_profiles WHERE user_id = auth.uid();
   ```
2. If no profile exists, call `/api/affiliate/register`
3. Check browser console for API errors
4. Verify Supabase RLS policies allow user to read their own data

### Issue: i18n not working / English showing instead of Georgian

**Cause**: next-intl locale detection or missing translations.

**Solution**:
1. Verify `middleware.ts` has correct locale config
2. Check `i18n.config.ts` has `defaultLocale: 'ka'`
3. Verify translation keys exist in `messages/ka.json`
4. Clear browser cache and cookies
5. Check URL for locale prefix (should be `/ka/affiliate` or just `/affiliate` if Georgian is default)

### Issue: Admin pages accessible by non-admin users

**Cause**: Missing server-side authentication check.

**Solution**:
- Admin API endpoints use `requireAdmin()` which throws 403
- Check that API calls are failing with status 403
- Client-side checks (like `isAdminEmail()`) are only for UI, not security
- Never rely on `NEXT_PUBLIC_*` env vars for authorization

### Issue: Commission totals incorrect

**Cause**: Status filtering or date calculation issue.

**Solution**:
1. Run verification query:
   ```sql
   SELECT status, COUNT(*), SUM(amount_cents)
   FROM affiliate_commissions
   WHERE affiliate_id = 'your-id'
   GROUP BY status;
   ```
2. Check `available_at` dates:
   ```sql
   SELECT * FROM affiliate_commissions
   WHERE affiliate_id = 'your-id'
   AND status = 'eligible'
   AND available_at > NOW(); -- Should be empty
   ```
3. Verify API response matches database

### Issue: Cannot create payout - "Minimum threshold not met"

**Cause**: Eligible commissions total < $50.00 (5000 cents).

**Solution**:
1. Check minimum threshold in `/api/admin/payouts/eligible/route.ts`:
   ```typescript
   const MINIMUM_PAYOUT_CENTS = 5000; // $50
   ```
2. Insert more eligible commissions to reach threshold
3. Or lower threshold for testing (not recommended for production)

---

## Security Checklist

- [x] Never store raw IP addresses (use SHA-256 hash)
- [x] Admin endpoints protected with `requireAdmin()`
- [x] RLS policies enabled on all affiliate tables
- [x] Users can only view their own data
- [x] ADMIN_EMAILS stored server-side only (not NEXT_PUBLIC_*)
- [x] Input validation on all API endpoints
- [x] SQL injection prevented (using parameterized queries)
- [x] XSS prevention (React escapes by default)
- [x] CSRF protection (Supabase auth tokens)

---

## Production Deployment Checklist

1. **Environment Variables**
   - [ ] Set ADMIN_EMAILS in production (Vercel/Railway/etc.)
   - [ ] Do NOT use NEXT_PUBLIC_ADMIN_EMAILS in production (security risk)
   - [ ] Verify Supabase credentials

2. **Database**
   - [ ] Run affiliate migration on production database
   - [ ] Verify RLS policies enabled
   - [ ] Test with production Supabase project

3. **Testing**
   - [ ] Test full affiliate flow in staging
   - [ ] Verify admin access works
   - [ ] Test all 3 languages (ka, en, ru)
   - [ ] Test mobile responsiveness

4. **Monitoring**
   - [ ] Set up error tracking (Sentry, etc.)
   - [ ] Monitor API endpoint performance
   - [ ] Track affiliate conversion rates
   - [ ] Alert on failed payouts

5. **Documentation**
   - [ ] Document payout process for finance team
   - [ ] Create runbook for common admin tasks
   - [ ] Update user-facing affiliate docs

---

## Support

For issues or questions:
1. Check troubleshooting section above
2. Review API endpoint responses in browser dev tools
3. Check Supabase logs for database errors
4. Verify environment variables are set correctly
5. Test with database queries to isolate frontend vs backend issues

---

**Last Updated**: 2026-02-12
**Version**: 1.0.0
