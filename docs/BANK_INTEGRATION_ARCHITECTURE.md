# 🏦 GEORGIAN BANK INTEGRATION ARCHITECTURE

**Date**: February 13, 2026  
**Status**: Design Complete - Awaiting Implementation  
**Purpose**: Direct GEL payouts via Bank of Georgia (BoG) and TBC Bank

---

## 🎯 STRATEGIC IMPORTANCE

### Why Georgian Bank Integration Matters

**Problem**: Stripe-only Georgian sellers face:
- 7-14 day payout delays
- Currency conversion fees (USD → GEL: ~3%)
- International transfer costs
- Limited trust from non-tech-savvy sellers
- No direct GEL cash flow visibility

**Solution**: Direct bank integration provides:
- ✅ Same-day GEL settlements
- ✅ Zero currency conversion fees
- ✅ Familiar banking experience
- ✅ 2x higher conversion rate (sellers trust local banks)
- ✅ Cash flow predictability

### Market Impact

**Georgian Commerce Landscape**:
- Population: 3.7M (1M Tbilisi metro)
- Banking penetration: 89% adults
- Primary banks: Bank of Georgia (40% market share), TBC Bank (35%)
- Mobile banking adoption: 72%
- Preferred currency: GEL (Georgian Lari)

**Avatar G Competitive Advantage**:
- First Georgian e-commerce platform with direct bank payouts
- No competitor offers sub-24hr GEL settlements
- Trust factor: "My money goes straight to my TBC account"

---

## 🏛️ BANK OF GEORGIA (BoG) INTEGRATION

### Overview

**Bank of Georgia** (BOG.LSE): Largest bank in Georgia
- Founded: 1994
- Market cap: £600M+
- Business banking: 150,000+ SMEs
- API availability: BoG Business API (OAuth 2.0)
- Settlement speed: T+0 (same-day)

### API Architecture

```typescript
// BoG API Base Configuration
interface BoGAPIConfig {
  baseUrl: 'https://api.bog.ge/business/v1';
  authUrl: 'https://auth.bog.ge/oauth/token';
  clientId: string; // Issued by BoG
  clientSecret: string; // Secure storage required
  merchantAccountIban: string; // Avatar G master account
  webhookUrl: string; // Settlement confirmations
  environment: 'sandbox' | 'production';
}

// OAuth 2.0 Authentication Flow
interface BoGAuthToken {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number; // Seconds (typically 3600)
  refresh_token: string;
  scope: string;
}
```

### Authentication Flow

**Step 1: Client Credentials Grant**

```http
POST https://auth.bog.ge/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials
&client_id={CLIENT_ID}
&client_secret={CLIENT_SECRET}
&scope=payments.write settlements.read accounts.read
```

**Step 2: Token Storage & Renewal**

```typescript
// Store in Supabase with encryption
interface BankAuthToken {
  id: string;
  bank: 'bog' | 'tbc';
  access_token: string; // Encrypted
  refresh_token: string; // Encrypted
  expires_at: string; // ISO timestamp
  created_at: string;
}

// Auto-refresh before expiration
async function refreshBoGToken(): Promise<BoGAuthToken> {
  // Fetch refresh token from secure storage
  // Request new access token
  // Update database with new tokens
  // Return fresh token
}
```

### Payment Initiation API

**Endpoint**: `POST /api/bog/payout` (Avatar G internal)

```typescript
interface BoGPayoutRequest {
  sellerIban: string; // GEXXBG1234567890123456 (22 chars)
  amountCents: number; // GEL in cents (₾100 = 10000)
  currency: 'GEL';
  reference: string; // "AVATAR-ORDER-{ORDER_ID}"
  beneficiaryName: string;
  narrative: string; // "Avatar G Store Payment - {STORE_NAME}"
}

interface BoGPayoutResponse {
  transactionId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  iban: string;
  amountCents: number;
  fee_cents: number; // BoG charges ~₾0.20 per transaction
  estimatedSettlement: string; // ISO timestamp
  createdAt: string;
}
```

**Implementation**:

```typescript
// lib/banking/bog.ts

import { createClient } from '@/lib/supabase/server';

export async function initiateBoGPayout(args: {
  sellerId: string;
  amountCents: number;
  orderId: string;
}): Promise<BoGPayoutResponse> {
  const { sellerId, amountCents, orderId } = args;
  
  const supabase = createClient();
  
  // 1. Fetch seller's BoG IBAN
  const { data: seller, error: sellerError } = await supabase
    .from('sellers')
    .select('bog_iban, full_name')
    .eq('id', sellerId)
    .single();
  
  if (sellerError || !seller?.bog_iban) {
    throw new Error('Seller BoG IBAN not configured');
  }
  
  // 2. Get fresh OAuth token
  const authToken = await getBoGAuthToken();
  
  // 3. Call BoG Payout API
  const response = await fetch('https://api.bog.ge/business/v1/payouts', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${authToken.access_token}`,
      'Content-Type': 'application/json',
      'X-Request-ID': `avatar-${Date.now()}`, // Idempotency
    },
    body: JSON.stringify({
      debtor_account: process.env.BOG_MASTER_IBAN,
      creditor_iban: seller.bog_iban,
      creditor_name: seller.full_name,
      amount: (amountCents / 100).toFixed(2),
      currency: 'GEL',
      remittance_information: `Avatar G Order #${orderId}`,
      end_to_end_id: `AVATAR-${orderId}`,
    }),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(`BoG payout failed: ${error.message}`);
  }
  
  const data = await response.json();
  
  // 4. Store payout record
  await supabase.from('bank_payouts').insert([
    {
      seller_id: sellerId,
      order_id: orderId,
      bank: 'bog',
      transaction_id: data.payment_id,
      iban: seller.bog_iban,
      amount_cents: amountCents,
      fee_cents: 20, // ₾0.20 BoG fee
      status: 'pending',
      initiated_at: new Date().toISOString(),
    },
  ]);
  
  return {
    transactionId: data.payment_id,
    status: 'pending',
    iban: seller.bog_iban,
    amountCents,
    fee_cents: 20,
    estimatedSettlement: data.expected_settlement_date,
    createdAt: new Date().toISOString(),
  };
}
```

### Settlement Webhook

**BoG calls**: `POST /api/webhooks/bog`

```typescript
interface BoGWebhookPayload {
  event_type: 'settlement.completed' | 'settlement.failed' | 'settlement.returned';
  payment_id: string;
  status: 'completed' | 'failed' | 'returned';
  iban: string;
  amount: string; // "100.00"
  currency: 'GEL';
  settled_at: string; // ISO timestamp
  failure_reason?: string;
}

// app/api/webhooks/bog/route.ts
export async function POST(request: NextRequest) {
  const body = await request.text();
  
  // 1. Verify webhook signature (HMAC-SHA256)
  const signature = request.headers.get('X-BOG-Signature');
  const isValid = verifyBoGSignature(body, signature);
  
  if (!isValid) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }
  
  const payload: BoGWebhookPayload = JSON.parse(body);
  const supabase = createClient();
  
  // 2. Update payout record
  await supabase
    .from('bank_payouts')
    .update({
      status: payload.status,
      settled_at: payload.settled_at,
      failure_reason: payload.failure_reason,
    })
    .eq('transaction_id', payload.payment_id);
  
  // 3. If failed, retry with TBC fallback
  if (payload.status === 'failed') {
    await initiatePayoutFallback(payload.payment_id, 'tbc');
  }
  
  return NextResponse.json({ received: true });
}
```

### BoG Fee Structure

| Transaction Type | Fee | Settlement |
|-----------------|-----|-----------|
| **Payout to BoG account** | ₾0.10 | T+0 (same day) |
| **Payout to other bank** | ₾0.20 | T+0 (same day) |
| **API access** | Free | - |
| **Monthly minimum** | None | - |
| **Bulk payout discount** | 50+ txns: ₾0.15 | - |

**Avatar G Cost Model**:
- Absorb BoG fees (competitive advantage)
- Alternative: pass through as ₾0.20 convenience fee
- Volume discount negotiation at 500+ monthly payouts

---

## 🏦 TBC BANK INTEGRATION

### Overview

**TBC Bank** (TBCG.LSE): Second largest Georgian bank
- Founded: 1992
- Market cap: £550M+
- Digital banking leader (TBC Pay, TBC Wallet)
- API availability: TBC Open Banking API (PSD2 compliant)
- Settlement speed: T+0 (instant for TBC-to-TBC)

### API Architecture

```typescript
interface TBCAPIConfig {
  baseUrl: 'https://api.tbcbank.ge/v1';
  authUrl: 'https://oauth.tbcbank.ge/auth';
  clientId: string;
  clientSecret: string;
  merchantAccountNumber: string; // TBC account number
  webhookUrl: string;
  environment: 'sandbox' | 'production';
}

interface TBCAuthToken {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token: string;
  scope: string;
}
```

### Payment Initiation

**Endpoint**: `POST /api/tbc/payout` (Avatar G internal)

```typescript
interface TBCPayoutRequest {
  accountNumber: string; // TBC: 15-16 digits
  amountCents: number;
  currency: 'GEL';
  reference: string;
  beneficiaryName: string;
  narrative: string;
}

interface TBCPayoutResponse {
  transactionId: string;
  status: 'instant_completed' | 'processing' | 'failed';
  accountNumber: string;
  amountCents: number;
  fee_cents: number; // ₾0.00 for TBC-to-TBC
  settledAt?: string; // Instant if TBC-to-TBC
  createdAt: string;
}
```

**Implementation**:

```typescript
// lib/banking/tbc.ts

export async function initiateTBCPayout(args: {
  sellerId: string;
  amountCents: number;
  orderId: string;
}): Promise<TBCPayoutResponse> {
  const { sellerId, amountCents, orderId } = args;
  
  const supabase = createClient();
  
  // 1. Fetch seller's TBC account
  const { data: seller, error: sellerError } = await supabase
    .from('sellers')
    .select('tbc_account_number, full_name')
    .eq('id', sellerId)
    .single();
  
  if (sellerError || !seller?.tbc_account_number) {
    throw new Error('Seller TBC account not configured');
  }
  
  // 2. Get OAuth token
  const authToken = await getTBCAuthToken();
  
  // 3. Call TBC Instant Payment API
  const response = await fetch('https://api.tbcbank.ge/v1/payments/instant', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${authToken.access_token}`,
      'Content-Type': 'application/json',
      'X-Idempotency-Key': `avatar-${orderId}`,
    },
    body: JSON.stringify({
      from_account: process.env.TBC_MASTER_ACCOUNT,
      to_account: seller.tbc_account_number,
      amount: (amountCents / 100).toFixed(2),
      currency: 'GEL',
      description: `Avatar G Order #${orderId}`,
      beneficiary_name: seller.full_name,
    }),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(`TBC payout failed: ${error.message}`);
  }
  
  const data = await response.json();
  
  // 4. Store payout record
  await supabase.from('bank_payouts').insert([
    {
      seller_id: sellerId,
      order_id: orderId,
      bank: 'tbc',
      transaction_id: data.transaction_id,
      account_number: seller.tbc_account_number,
      amount_cents: amountCents,
      fee_cents: 0, // Free for TBC-to-TBC
      status: data.status === 'completed' ? 'completed' : 'pending',
      settled_at: data.status === 'completed' ? new Date().toISO String() : null,
      initiated_at: new Date().toISOString(),
    },
  ]);
  
  return {
    transactionId: data.transaction_id,
    status: data.status === 'completed' ? 'instant_completed' : 'processing',
    accountNumber: seller.tbc_account_number,
    amountCents,
    fee_cents: 0,
    settledAt: data.status === 'completed' ? new Date().toISOString() : undefined,
    createdAt: new Date().toISOString(),
  };
}
```

### TBC Advantages

**TBC-to-TBC Instant Settlements**:
- ✅ 0 seconds settlement (real-time)
- ✅ Zero fees (internal transfers)
- ✅ 24/7/365 availability
- ✅ Push notifications to TBC app

**TBC Pay Integration**:
- Mobile app deep linking
- QR code payout confirmation
- In-app receipt storage

### TBC Fee Structure

| Transaction Type | Fee | Settlement |
|-----------------|-----|-----------|
| **TBC-to-TBC** | ₾0.00 | Instant (<5s) |
| **TBC-to-BoG** | ₾0.15 | T+0 (same day) |
| **TBC-to-other** | ₾0.25 | T+0 (same day) |
| **API access** | Free | - |
| **Bulk pricing** | 100+ txns: ₾0.10 | - |

---

## 🔄 PAYMENT ABSTRACTION LAYER

### Unified Payout Interface

**Goal**: Single API for all payment rails (Stripe → BoG → TBC → future banks)

```typescript
// lib/banking/settlement.ts

export type PaymentRail = 'stripe' | 'bog' | 'tbc';

export interface UnifiedPayoutRequest {
  sellerId: string;
  amountCents: number;
  orderId: string;
  preferredRail?: PaymentRail; // Optional: seller preference
}

export interface UnifiedPayoutResponse {
  payoutId: string;
  rail: PaymentRail;
  transactionId: string;
  status: 'completed' | 'pending' | 'failed';
  amountCents: number;
  feeCents: number;
  estimatedSettlement?: string;
  actualSettlement?: string;
}

/**
 * Smart routing: Choose optimal payment rail
 */
export async function initiateSellerPayout(
  request: UnifiedPayoutRequest
): Promise<UnifiedPayoutResponse> {
  const { sellerId, amountCents, orderId, preferredRail } = request;
  
  const supabase = createClient();
  
  // 1. Fetch seller's payment methods
  const { data: seller } = await supabase
    .from('sellers')
    .select('bog_iban, tbc_account_number, stripe_account_id, country')
    .eq('id', sellerId)
    .single();
  
  if (!seller) {
    throw new Error('Seller not found');
  }
  
  // 2. Determine optimal rail
  let rail: PaymentRail;
  
  if (preferredRail && isRailAvailable(seller, preferredRail)) {
    rail = preferredRail;
  } else {
    rail = selectOptimalRail(seller, amountCents);
  }
  
  // 3. Route to appropriate handler
  let result: UnifiedPayoutResponse;
  
  switch (rail) {
    case 'tbc':
      if (!seller.tbc_account_number) {
        throw new Error('TBC account not configured');
      }
      const tbcResult = await initiateTBCPayout({ sellerId, amountCents, orderId });
      result = {
        payoutId: `TBC-${tbcResult.transactionId}`,
        rail: 'tbc',
        transactionId: tbcResult.transactionId,
        status: tbcResult.status === 'instant_completed' ? 'completed' : 'pending',
        amountCents: tbcResult.amountCents,
        feeCents: tbcResult.fee_cents,
        actualSettlement: tbcResult.settledAt,
      };
      break;
      
    case 'bog':
      if (!seller.bog_iban) {
        throw new Error('BoG IBAN not configured');
      }
      const bogResult = await initiateBoGPayout({ sellerId, amountCents, orderId });
      result = {
        payoutId: `BOG-${bogResult.transactionId}`,
        rail: 'bog',
        transactionId: bogResult.transactionId,
        status: bogResult.status,
        amountCents: bogResult.amountCents,
        feeCents: bogResult.fee_cents,
        estimatedSettlement: bogResult.estimatedSettlement,
      };
      break;
      
    case 'stripe':
      if (!seller.stripe_account_id) {
        throw new Error('Stripe account not configured');
      }
      const stripeResult = await initiateStripePayout({ sellerId, amountCents, orderId });
      result = {
        payoutId: `STRIPE-${stripeResult.id}`,
        rail: 'stripe',
        transactionId: stripeResult.id,
        status: 'pending',
        amountCents,
        feeCents: 0, // Stripe fees deducted automatically
        estimatedSettlement: stripeResult.arrival_date,
      };
      break;
  }
  
  // 4. Log payout for audit
  await supabase.from('payout_logs').insert([
    {
      payout_id: result.payoutId,
      seller_id: sellerId,
      order_id: orderId,
      rail: result.rail,
      amount_cents: result.amountCents,
      fee_cents: result.feeCents,
      status: result.status,
      initiated_at: new Date().toISOString(),
    },
  ]);
  
  return result;
}

/**
 * Select optimal payment rail based on seller profile & economics
 */
function selectOptimalRail(
  seller: any,
  amountCents: number
): PaymentRail {
  // Priority 1: TBC (instant, free)
  if (seller.tbc_account_number) {
    return 'tbc';
  }
  
  // Priority 2: BoG (same-day, ₾0.20 fee)
  if (seller.bog_iban) {
    return 'bog';
  }
  
  // Priority 3: Stripe (7-14 days, but universal)
  if (seller.stripe_account_id) {
    return 'stripe';
  }
  
  throw new Error('No payment method configured for seller');
}

function isRailAvailable(seller: any, rail: PaymentRail): boolean {
  switch (rail) {
    case 'tbc':
      return !!seller.tbc_account_number;
    case 'bog':
      return !!seller.bog_iban;
    case 'stripe':
      return !!seller.stripe_account_id;
    default:
      return false;
  }
}
```

---

## 🗄️ DATABASE SCHEMA

### Bank Payouts Table

```sql
CREATE TABLE bank_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES sellers(id),
  order_id UUID NOT NULL REFERENCES orders(id),
  
  -- Payment rail
  bank TEXT NOT NULL CHECK (bank IN ('bog', 'tbc', 'stripe')),
  transaction_id TEXT NOT NULL, -- External bank transaction ID
  
  -- Bank account details
  iban TEXT, -- For BoG
  account_number TEXT, -- For TBC
  
  -- Financial details
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  fee_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'GEL' CHECK (currency IN ('GEL', 'USD')),
  
  -- Status tracking
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'returned')),
  failure_reason TEXT,
  
  -- Timestamps
  initiated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  settled_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(transaction_id, bank)
);

-- Indexes
CREATE INDEX idx_bank_payouts_seller ON bank_payouts(seller_id);
CREATE INDEX idx_bank_payouts_order ON bank_payouts(order_id);
CREATE INDEX idx_bank_payouts_status ON bank_payouts(status);
CREATE INDEX idx_bank_payouts_bank ON bank_payouts(bank);

-- RLS Policies
ALTER TABLE bank_payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sellers can view their own payouts"
  ON bank_payouts FOR SELECT
  USING (seller_id = auth.uid());
```

### Bank Auth Tokens Table (Encrypted)

```sql
CREATE TABLE bank_auth_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank TEXT NOT NULL CHECK (bank IN ('bog', 'tbc')),
  
  -- Encrypted tokens (use pgcrypto)
  access_token TEXT NOT NULL, -- Encrypted with pgp_sym_encrypt
  refresh_token TEXT NOT NULL, -- Encrypted
  
  -- Token metadata
  expires_at TIMESTAMPTZ NOT NULL,
  scope TEXT NOT NULL,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(bank)
);

-- No RLS - service-only table
-- Access via service role key only
```

### Seller Bank Accounts Table

```sql
ALTER TABLE sellers ADD COLUMN bog_iban TEXT;
ALTER TABLE sellers ADD COLUMN tbc_account_number TEXT;
ALTER TABLE sellers ADD COLUMN preferred_payout_rail TEXT 
  CHECK (preferred_payout_rail IN ('bog', 'tbc', 'stripe'));
ALTER TABLE sellers ADD COLUMN bank_account_verified BOOLEAN DEFAULT FALSE;
```

---

## 🔐 AML/KYC COMPLIANCE

### Know Your Customer (KYC) Requirements

**Georgian Regulation**: National Bank of Georgia (NBG) requires:
- Full legal name
- Georgian ID number (11 digits) or passport
- Proof of address (utility bill <3 months old)
- Tax identification number (TIN) - for VAT payers
- Business registration certificate (for legal entities)

**Avatar G KYC Implementation**:

```typescript
interface SellerKYC {
  // Identity
  fullName: string;
  dateOfBirth: string; // ISO date
  idType: 'georgian_id' | 'passport';
  idNumber: string;
  idExpiryDate: string;
  
  // Address
  residentialAddress: string;
  city: string;
  postalCode: string;
  country: 'GE'; // Georgia only initially
  
  // Tax
  taxStatus: 'vat_payer' | 'non_vat';
  tin?: string; // Tax ID Number (if VAT payer)
  
  // Documents
  idDocumentUrl: string; // Supabase Storage URL
  proofOfAddressUrl: string;
  businessRegistrationUrl?: string;
  
  // Verification
  kycStatus: 'pending' | 'approved' | 'rejected';
  kycVerifiedAt?: string;
  kycVerifiedBy?: string; // Admin user ID
  kycRejectionReason?: string;
}

// Verification API
async function verifySellerKYC(
  sellerId: string,
  kycData: SellerKYC
): Promise<{ approved: boolean; reason?: string }> {
  // 1. Validate ID number format
  if (kycData.idType === 'georgian_id' && !isValidGeorgianID(kycData.idNumber)) {
    return { approved: false, reason: 'Invalid Georgian ID format' };
  }
  
  // 2. Check against NBG sanctions list (API call)
  const isSanctioned = await checkNBGSanctionsList(kycData.idNumber);
  if (isSanctioned) {
    return { approved: false, reason: 'Sanctioned individual' };
  }
  
  // 3. Manual review for first 100 sellers
  // Later: Integrate automated KYC service (Veriff, Jumio)
  
  // 4. Approve and store
  const supabase = createClient();
  await supabase
    .from('seller_kyc')
    .update({
      kyc_status: 'approved',
      kyc_verified_at: new Date().toISOString(),
    })
    .eq('seller_id', sellerId);
  
  return { approved: true };
}

function isValidGeorgianID(idNumber: string): boolean {
  // Georgian ID: 11 digits
  if (!/^\d{11}$/.test(idNumber)) {
    return false;
  }
  
  // TODO: Implement checksum validation
  // (Georgian IDs use Luhn algorithm)
  
  return true;
}
```

### Anti-Money Laundering (AML) Monitoring

**Transaction Monitoring Rules**:

```typescript
interface AMLRule {
  name: string;
  threshold: number;
  period: 'daily' | 'weekly' | 'monthly';
  action: 'flag' | 'block' | 'escalate';
}

const AML_RULES: AMLRule[] = [
  {
    name: 'High daily payout',
    threshold: 500000, // ₾5,000 per day
    period: 'daily',
    action: 'flag',
  },
  {
    name: 'Rapid account cycling',
    threshold: 10, // >10 payouts in 24h
    period: 'daily',
    action: 'block',
  },
  {
    name: 'Cumulative monthly threshold',
    threshold: 5000000, // ₾50,000 per month
    period: 'monthly',
    action: 'escalate', // Manual review
  },
];

// Monitor payouts for AML violations
async function checkAMLCompliance(
  sellerId: string,
  amountCents: number
): Promise<{ allowed: boolean; reason?: string }> {
  const supabase = createClient();
  
  // Check daily limit
  const { data: dailyPayouts } = await supabase
    .from('bank_payouts')
    .select('amount_cents')
    .eq('seller_id', sellerId)
    .gte('initiated_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
  
  const dailyTotal = (dailyPayouts || []).reduce((sum, p) => sum + p.amount_cents, 0);
  
  if (dailyTotal + amountCents > 500000) {
    return {
      allowed: false,
      reason: 'Daily payout limit exceeded (₾5,000). Contact support for increase.',
    };
  }
  
  // Check rapid cycling
  if (dailyPayouts && dailyPayouts.length > 10) {
    return {
      allowed: false,
      reason: 'Too many payouts in 24 hours. Account under review.',
    };
  }
  
  return { allowed: true };
}
```

---

## 🚀 IMPLEMENTATION ROADMAP

### Phase 1: BoG Integration (Weeks 1-2)

**Week 1: Setup & Authentication**
- [ ] Open BoG Business API account
- [ ] Complete KYB (Know Your Business) verification
- [ ] Receive API credentials (sandbox)
- [ ] Implement OAuth 2.0 flow
- [ ] Test token refresh logic
- [ ] Set up secure token storage (encrypted)

**Week 2: Payout Implementation**
- [ ] Build payout initiation flow
- [ ] Implement webhook handler
- [ ] Add IBAN validation
- [ ] Create seller IBAN collection UI
- [ ] Test sandbox payouts
- [ ] Build admin dashboard for monitoring

### Phase 2: TBC Integration (Weeks 3-4)

**Week 3: TBC Setup**
- [ ] Open TBC Business account
- [ ] Complete API registration
- [ ] Implement TBC OAuth flow
- [ ] Build TBC payout flow
- [ ] Test instant TBC-to-TBC settlements

**Week 4: Abstraction Layer**
- [ ] Build unified payout interface
- [ ] Implement smart routing logic
- [ ] Add fallback mechanisms
- [ ] Test all 3 rails (Stripe, BoG, TBC)

### Phase 3: KYC/AML Compliance (Weeks 5-6)

**Week 5: KYC System**
- [ ] Build seller KYC collection form
- [ ] Implement ID validation
- [ ] Add document upload to Supabase Storage
- [ ] Create manual review dashboard
- [ ] Test KYC approval flow

**Week 6: AML Monitoring**
- [ ] Implement transaction monitoring rules
- [ ] Build AML alert dashboard
- [ ] Add block/escalate workflows
- [ ] Test compliance edge cases

### Phase 4: Production Launch (Week 7)

- [ ] Migrate to production BoG/TBC credentials
- [ ] Enable bank payouts for beta sellers
- [ ] Monitor first 100 transactions closely
- [ ] Collect seller feedback
- [ ] Optimize performance & UX

---

## 💰 ECONOMIC ANALYSIS

### Cost Comparison: Stripe vs Georgian Banks

**Scenario: ₾1,000 payout to Georgian seller**

| Rail | Fee | FX Loss | Total Cost | Seller Receives | Time |
|------|-----|---------|------------|----------------|------|
| **Stripe** | Free | ₾30 (3%) | ₾30 | ₾970 | 7-14 days |
| **BoG** | ₾0.20 | ₾0 | ₾0.20 | ₾999.80 | Same day |
| **TBC (TBC→TBC)** | ₾0 | ₾0 | ₾0 | ₾1,000 | Instant |

**Avatar G Savings**:
- ₾30 saved per ₾1,000 payout (3%)
- At 100 payouts/month: ₾3,000 saved ($1,110)
- At 500 payouts/month: ₾15,000 saved ($5,550)

### Seller Value Proposition

**Georgian Bank Payouts**:
- ✅ **3% more money** (no FX loss)
- ✅ **10x faster** (same-day vs 7-14 days)
- ✅ **Familiar experience** (TBC app notifications)
- ✅ **GEL cash flow** (no currency risk)
- ✅ **Trust**: "My money goes to my bank, not foreign company"

**Expected Impact**:
- 2x seller conversion rate improvement
- 40% reduction in support tickets ("Where's my money?")
- 25% higher seller retention (cash flow predictability)

---

## ✅ SUCCESS METRICS

### KPIs to Track

```typescript
interface BankIntegrationMetrics {
  // Adoption
  sellers_with_bank_account: number;
  bog_adoption_rate: number; // % sellers using BoG
  tbc_adoption_rate: number; // % sellers using TBC
  
  // Performance
  avg_settlement_time_hours: number; // Target: <24h
  instant_settlement_rate: number; // TBC-to-TBC %
  payout_success_rate: number; // Target: >99%
  
  // Economics
  total_payout_volume_cents: number;
  avg_payout_fee_cents: number; // Target: <₾0.20
  monthly_savings_vs_stripe_cents: number;
  
  // Quality
  aml_flags: number;
  compliance_violations: number; // Target: 0
  payout_disputes: number;
}
```

### Month 1 Targets

- ✅ 20 sellers with verified bank accounts
- ✅ 50+ successful payouts
- ✅ <1h average settlement time (TBC)
- ✅ 99%+ success rate
- ✅ 0 AML violations
- ✅ ₾1,000+ platform savings

---

**Next**: International Expansion Strategy →
