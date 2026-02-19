# Bank Readiness Architecture - Georgian Payment Integration

## Overview

Avatar G platform is architected for **future integration** with Georgian banking systems while currently operating on Stripe. This document outlines the payment provider abstraction layer and implementation roadmap for Georgian banks.

---

## Payment Provider Abstraction

### Architecture Diagram

```
┌─ User Selects Payment Method ─┐
│ (UI: /account/payments)        │
└────────────────┬────────────────┘
                 │
        ┌────────▼────────┐
        │ PaymentProvider │ (Interface)
        │   Interface     │
        └────────┬────────┘
        │
    ┌───┴───────────────────────────────┐
    │                                   │
┌───▼──────────┐  ┌──────────────┐  ┌──▼──────────┐
│ StripeProvider│  │ TbcProvider  │  │ BogProvider │
│  (Active)    │  │  (Stub)      │  │  (Stub)     │
└──────────────┘  └──────────────┘  └─────────────┘
    │                  │                   │
┌───▼──────────────────▼──────────────────▼────┐
│ API Endpoint Routing                         │
│ POST /api/payments/create-intent             │
│ POST /api/payments/verify-payment            │
│ POST /api/webhooks/[provider]                │
└──────────────────────────────────────────────┘
```

### Interface: PaymentProvider

```typescript
interface PaymentProvider {
  // Create payment session
  createPaymentIntent(
    amountCents: number,
    currency: 'GEL' | 'USD',
    metadata?: Record<string, string>
  ): Promise<PaymentIntent>;

  // Check status
  getPaymentStatus(paymentId: string): Promise<PaymentIntent>;

  // Webhook verification
  verifyWebhookSignature(
    payload: string | Buffer,
    signature: string,
    secret: string
  ): boolean;

  // Process webhook
  processWebhookEvent(
    eventType: string,
    eventPayload: Record<string, any>
  ): Promise<void>;

  // Refund processing
  refund(request: RefundRequest): Promise<RefundResult>;

  // Provider identifier
  getProviderName(): string;
}
```

### Implementation Pattern

All providers follow same interface:

```typescript
export class CustomProvider implements PaymentProvider {
  constructor(apiKey: string, merchantId: string) { }
  
  async createPaymentIntent(...): Promise<PaymentIntent> {
    // Provider-specific implementation
  }
  
  async getPaymentStatus(...): Promise<PaymentIntent> {
    // Provider-specific implementation
  }
  
  // ... etc
}
```

---

## Current Implementation: Stripe

### Status: ✅ PRODUCTION ACTIVE

**File:** `lib/payments/providers/StripeProvider.ts`

### Capabilities
- ✅ Payment intents API
- ✅ Multi-currency (GEL via Stripe)
- ✅ Webhook verification (HMAC-SHA256)
- ✅ Automatic refunds
- ✅ Subscription support
- ✅ Real-time settlement
- ✅ 1% + $0.30 fee per transaction (estimated)

### Integration Points
```
Stripe Payment Intent
    ↓
POST /api/payments/create-intent → Stripe API
    ↓
Client receives clientSecret
    ↓
Client uses Stripe.js → Payment Element
    ↓
User completes payment
    ↓
payment_intent.succeeded webhook
    ↓
Database updated
    ↓
Order fulfilled
```

### Database Record
```sql
-- Stripe payment reference stored
INSERT INTO payments (
  user_id,
  stripe_payment_intent_id,  -- "pi_1Mm123..."
  amount_cents,
  currency,
  status,
  provider
) VALUES (...)
```

---

## Future Implementation: TBC Bank

### Status: 🔄 STUB - Ready for Implementation

**File:** `lib/payments/providers/TbcProvider.ts`

### Georgian Banking Context
- **TBC** = TBC Bank (თიბი კაპიტალი)
- **Largest bank** in Georgia by assets
- **National payment system** participant
- **Merchant portal**: https://ecom.tbcbank.ge/

### Required Credentials

```typescript
interface TbcConfig {
  merchantId: string;        // From TBC merchant portal
  apiKey: string;            // Secure API key
  callbackUrl: string;       // Webhook endpoint
  ipn_username: string;      // IPN credentials (if needed)
  ipn_password: string;      // IPN credentials (if needed)
  hmacKey: string;           // HMAC-SHA256 signature key
}
```

### Integration Specification

#### Payment Creation Request

```xml
<!-- TBC Payment Gateway Request (example format) -->
<?xml version="1.0" encoding="UTF-8"?>
<request>
  <merchant_id>YOUR_MERCHANT_ID</merchant_id>
  <order_id>AG-000001</order_id>
  <amount>5900</amount>  <!-- In cents/tetri -->
  <currency>981</currency>  <!-- ISO 4217: GEL = 981 -->
  <description>Invoice for services</description>
  <return_url>https://avatar-g.com/payments/callback</return_url>
  <language>ka</language>  <!-- Georgian language -->
  <client_ip>192.168.1.1</client_ip>
  <signature>HMAC-SHA256-HASH</signature>
</request>
```

#### Webhook Callback

```javascript
// IPN (Instant Payment Notification) POST
{
  trans_id: "12345678",
  order_id: "AG-000001",
  amount: 5900,
  status: "COMPLETE",  // or FAILED, PENDING
  timestamp: "2024-02-14T10:30:00Z",
  signature: "HMAC-SHA256-HASH"
}
```

#### Verification Flow

```
1. Receive webhook callback
2. Verify HMAC-SHA256 signature
   HMAC = SHA256(payload_string, secret_key)
3. Verify signature matches X-Signature header
4. Update order status in database
5. Return HTTP 200 OK
```

### Implementation Checklist
- [ ] Request official API documentation from TBC
- [ ] Obtain merchant ID from TBC merchant portal
- [ ] Generate/download HMAC key
- [ ] Implement XML request builder
- [ ] Implement XML response parser
- [ ] Add HMAC-SHA256 verification
- [ ] Test on TBC sandbox environment
- [ ] Load test (peak transaction rate)
- [ ] Migrate live customers
- [ ] Monitor transaction success rate

### Key Integration Points
```typescript
export class TbcProvider implements PaymentProvider {
  private merchantId: string;
  private hmacKey: string;

  async createPaymentIntent(
    amountCents: number,
    currency: 'GEL' | 'USD',
    metadata?: Record<string, string>
  ): Promise<PaymentIntent> {
    // 1. Build XML request
    // 2. Sign with HMAC-SHA256
    // 3. POST to TBC API endpoint
    // 4. Parse XML response
    // 5. Return PaymentIntent
    throw new Error('TBC Bank integration not yet implemented');
  }

  verifyWebhookSignature(
    payload: string | Buffer,
    signature: string,
    secret: string
  ): boolean {
    // 1. Compute HMAC-SHA256(payload, secret)
    // 2. Compare with provided signature
    return true; // or false
  }
}
```

### Testing Strategy
```bash
# Development: Use TBC sandbox
# Staging: Load test with 100 tx/sec
# Production: Gradual rollout (5% → 25% → 100%)
```

---

## Future Implementation: Bank of Georgia (BoG)

### Status: 🔄 STUB - Ready for Implementation

**File:** `lib/payments/providers/BogProvider.ts`

### Georgian Banking Context
- **BoG** = საქართველოს ბანკი (Bank of Georgia)
- **Second largest** bank in Georgia
- **ISO 8583 messaging** for transactions
- **Merchant portal**: https://ecom.bog.ge/

### Required Credentials

```typescript
interface BogConfig {
  merchantCode: string;      // 3-digit merchant identifier
  terminalId: string;        // Terminal/shop identifier
  ipek: string;             // Inter-bank PIN Encryption Key
  apiKey: string;           // Authentication key
  callbackUrl: string;      // Webhook/callback URL
}
```

### Integration Specification

#### ISO 8583 Message Format

```
ISO 8583 is international standard for payment card industry
BoG uses subset for e-commerce payments

Frame structure:
├─ Message Type (4 chars): "0100" (authorization request)
├─ Bitmap (32 chars): Field presence indicators
├─ Field Data (variable)
│  ├─ PAN (Primary Account Number)
│  ├─ Processing Code
│  ├─ Amount (amountCents, GEL currency)
│  ├─ STAN (System Trace Audit Number)
│  ├─ Transaction Date/Time
│  ├─ Merchant ID
│  ├─ Terminal ID
│  └─ ... (additional fields)
└─ MAC (Message Auth Code): HMAC signature
```

#### Transaction Request (pseudocode)

```
ISO8583Message {
  messageType: "0100",
  amount: 5900,              // GEL tetri
  merchantCode: "000123",
  terminalId: "12345",
  stan: autoIncrement(),
  timestamp: now(),
  signature: HMAC-SHA256(payload)
}
```

#### Payment Response Types

```
Response Code | Meaning
"00"         | Transaction Approved
"05"         | Do Not Honor
"14"         | Invalid Card Number
"15"         | No Issuer
"30"         | Format Error
"41"         | Lost Card
"43"         | Stolen Card
"51"         | Insufficient Funds
"54"         | Expired Card
"62"         | Restricted Card
... (many more per ISO 8583)
```

### Implementation Checklist
- [ ] Download ISO 8583 message builder library OR write parser
- [ ] Obtain merchant/terminal IDs from BoG
- [ ] Generate IPEK (encryption key)
- [ ] Implement message framing (DER encoding)
- [ ] Implement HMAC-SHA256 signing
- [ ] Build field presence bitmap
- [ ] Add SCA (Strong Customer Authentication) support
- [ ] Test on BoG sandbox
- [ ] Implement response code mapping
- [ ] Handle timeouts and retries
- [ ] Load test (peak tx rate)
- [ ] Security audit (PCI compliance)

### Code Skeleton
```typescript
export class BogProvider implements PaymentProvider {
  private merchantCode: string;
  private terminalId: string;
  private ipek: string;

  async createPaymentIntent(
    amountCents: number,
    currency: 'GEL' | 'USD',
    metadata?: Record<string, string>
  ): Promise<PaymentIntent> {
    // 1. Build ISO 8583 message
    // 2. Encode with IPEK
    // 3. Add field bitmap
    // 4. Sign with HMAC
    // 5. POST to BoG endpoint
    // 6. Parse response
    // 7. Map response code
    throw new Error('BoG integration not yet implemented');
  }

  verifyWebhookSignature(...): boolean {
    // Implement ISO 8583 signature verification
    return true;
  }

  private buildIso8583Message(amountCents: number): string {
    // ISO 8583 message builder
    return "..."; // binary or hex string
  }

  private mapResponseCode(code: string): PaymentStatus {
    const statusMap: Record<string, PaymentStatus> = {
      "00": "succeeded",
      "05": "failed",
      "51": "failed", // insufficient funds
      // ... more mappings
    };
    return statusMap[code] || "failed";
  }
}
```

### Complexity Notes
- ⚠️ ISO 8583 is more complex than REST
- ⚠️ Requires binary message parsing
- ⚠️ Encryption/decryption with IPEK
- ⚠️ Strict field ordering sensitive
- ✅ Well-documented standard (public spec)
- ✅ Libraries available (node-iso-8583, etc.)

---

## Future Implementation: Payze

### Status: 🔄 STUB - Ready for Implementation

**File:** `lib/payments/providers/PayzeProvider.ts`

### Georgian Payment Gateway Context
- **Payze** = Georgian payment gateway startup
- **Modern REST API** (developer-friendly)
- **Simplified integration** vs traditional banks
- **Subscription support**
- **Real-time settlement**
- **Merchant portal**: https://merchant.payze.io/

### Required Credentials

```typescript
interface PayzeConfig {
  merchantId: string;        // From Payze dashboard
  apiKey: string;            // Secret API key
  publicKey: string;         // Public key for client-side
  callbackUrl: string;       // Webhook URL
  returnUrl: string;         // Success redirect URL
}
```

### Integration Specification

#### Payment Intent Creation

```bash
POST https://api.payze.io/v1/payments/intents
Authorization: Bearer API_KEY
Content-Type: application/json

{
  "amount": 5900,
  "currency": "GEL",
  "order_id": "AG-000001",
  "description": "Invoice payment",
  "merchant_data": {
    "customer_name": "John Doe",
    "customer_email": "john@example.com",
    "customer_phone": "+995XXXXXXXXX"
  },
  "callback_url": "https://avatar-g.com/webhooks/payze",
  "success_url": "https://avatar-g.com/payment-success",
  "failure_url": "https://avatar-g.com/payment-failed"
}
```

#### Response

```json
{
  "id": "pi_payze_123456",
  "status": "pending",
  "amount": 5900,
  "currency": "GEL",
  "payment_url": "https://checkout.payze.io/pi_payze_123456",
  "client_token": "eyJhbGciOi...",
  "created_at": "2024-02-14T10:00:00Z"
}
```

#### Webhook Event

```json
{
  "event_type": "payment.succeeded",
  "payment_id": "pi_payze_123456",
  "amount": 5900,
  "currency": "GEL",
  "order_id": "AG-000001",
  "status": "succeeded",
  "timestamp": "2024-02-14T10:05:00Z",
  "signature": "SHA256-HMAC"
}
```

### Implementation Checklist
- [ ] Register merchant account with Payze
- [ ] Download API key and public key
- [ ] Read REST API documentation
- [ ] Implement payment intent creation
- [ ] Implement webhook signature verification
- [ ] Build checkout form (with Payze JavaScript SDK)
- [ ] Test on Payze sandbox
- [ ] Implement error handling/retries
- [ ] Add logging/monitoring
- [ ] Load test
- [ ] Go live on production

### Code Skeleton
```typescript
export class PayzeProvider implements PaymentProvider {
  private apiKey: string;
  private merchantId: string;

  async createPaymentIntent(
    amountCents: number,
    currency: 'GEL' | 'USD',
    metadata?: Record<string, string>
  ): Promise<PaymentIntent> {
    const response = await fetch('https://api.payze.io/v1/payments/intents', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        amount: amountCents,
        currency,
        order_id: metadata?.orderId,
        description: metadata?.description,
        callback_url: process.env.PAYZE_CALLBACK_URL
      })
    });

    const data = await response.json();
    
    return {
      id: data.id,
      status: this.mapPayzeStatus(data.status),
      amountCents,
      currency,
      clientSecret: data.client_token,
      paymentUrl: data.payment_url,
      createdAt: new Date(data.created_at)
    };
  }

  verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
    const computed = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
    return computed === signature;
  }

  private mapPayzeStatus(status: string): PaymentStatus {
    const map: Record<string, PaymentStatus> = {
      'pending': 'pending',
      'processing': 'processing',
      'succeeded': 'succeeded',
      'failed': 'failed'
    };
    return map[status] || 'failed';
  }
}
```

### Advantages
- ✅ REST API (JSON) - modern, simple
- ✅ Good documentation
- ✅ Sandbox for testing
- ✅ Passive income for Payze (recurring)
- ✅ Lower barrier than TBC/BoG

---

## Migration Strategy: Stripe → Georgian Banks

### Phase 1: Architecture (Current) ✅
- ✅ PaymentProvider interface defined
- ✅ Stripe implementation complete
- ✅ Provider selection UI built
- ✅ Database schema prepared

### Phase 2: Stub Implementation (Next)
- [ ] TbcProvider stub complete
- [ ] BogProvider stub complete
- [ ] PayzeProvider stub complete
- [ ] All methods throw `NotImplementedError`

### Phase 3: Individual Implementation (Future)
Choose implementation order based on:
1. **Ease of integration**: Payze (REST) < TBC (XML) < BoG (ISO 8583)
2. **Market opportunity**: TBC/BoG (70%+ market share) vs Payze (emerging)
3. **Resource availability**: ~4-6 weeks per bank

### Recommended Rollout: Payze → TBC → BoG

#### Timeline (Estimated)
```
Month 1-2: Payze implementation & testing
Month 3-4: TBC implementation & testing
Month 5-6: BoG implementation & testing
Month 7: Gradual user migration
Month 8-9: Full rollout
Month 10: Stripe deprecation (optional)
```

### Feature Parity Requirements

Before switching from Stripe → Georgian bank:
- [ ] Subscription support (recurring billing)
- [ ] Refund handling
- [ ] Dispute resolution
- [ ] Settlement reporting
- [ ] Compliance (PCI, regulatory)
- [ ] Support channel (merchant help desk)
- [ ] SLA guarantees (uptime, tx speed)

---

## Database Configuration

### Payment Provider Setup

```sql
-- Default: Stripe
INSERT INTO payment_provider_configs (
  user_id,
  active_provider,
  stripe_enabled
) VALUES (
  '123e4567-e89b-12d3-a456-426614174000',
  'stripe',
  true
);

-- Future: User switches to TBC
UPDATE payment_provider_configs
SET active_provider = 'tbc'
WHERE user_id = '123e4567-e89b-12d3-a456-426614174000';
```

---

## Testing Strategy

### Unit Tests (Per Provider)
```typescript
describe('PaymentProvider', () => {
  describe('StripeProvider', () => {
    it('should create payment intent', async () => {...});
    it('should verify webhook signature', () => {...});
    it('should refund payment', async () => {...});
  });

  describe('TbcProvider', () => {
    it('should build XML request', () => {...});
    it('should parse XML response', () => {...});
    it('should handle timeout', async () => {...});
  });
  // ... more providers
});
```

### Integration Tests
```typescript
// Test Stripe sandbox
const stripe = new StripeProvider(STRIPE_API_KEY);
const intent = await stripe.createPaymentIntent(10000, 'USD');
// Verify in Stripe dashboard
```

### Sandbox Testing Checklist
```
[ ] TBC sandbox merchant account created
[ ] TBC test API keys configured
[ ] Payze sandbox merchant account created
[ ] BoG sandbox access requested
[ ] Test transaction: 1 GEL
[ ] Test transaction: 100 GEL
[ ] Test refund
[ ] Test webhook callback
[ ] Test error scenarios (declined card, etc.)
```

---

## Compliance & Security

### PCI DSS Requirements
- ✅ No card data stored locally (Stripe/providers handle)
- ✅ HTTPS/TLS for all communications
- ✅ Webhook signature verification
- ✅ Audit logging for transactions
- ⚠️ Incident response plan needed

### Regulatory Compliance (Georgia)
- ☐ National Bank of Georgia notification
- ☐ Money transfer license (if applicable)
- ☐ Tax reporting (quarterly/annual)
- ☐ Customer KYC requirements (to be defined)

### Security Best Practices
```
1. API keys stored in environment variables
2. Webhook signatures verified on every callback
3. Rate limiting on payment endpoints
4. Logging of failed transactions
5. Monitoring for fraud patterns
6. Incident response playbook
```

---

## File Structure

```
lib/payments/
├── PaymentProvider.ts          (Interface)
├── providers/
│   ├── StripeProvider.ts       (✅ Active)
│   ├── TbcProvider.ts          (🔄 Stub)
│   ├── BogProvider.ts          (🔄 Stub)
│   └── PayzeProvider.ts        (🔄 Stub)
├── config.ts                   (Provider configuration)
├── router.ts                   (Provider selector)
└── utils.ts                    (Common utilities)

app/api/payments/
├── create-intent/route.ts      (POST payment intent)
├── [provider]/webhook/route.ts (Webhook handlers)
└── refund/route.ts            (Refund processing)
```

---

## Monitoring & Observability

### Metrics to Track
```
- Transaction success rate (target: >99%)
- Average response time
- Webhook delivery success
- Error rate by type
- Geographic distribution
- Currency distribution (GEL vs USD)
```

### Logging
```
Log Level | Event
----------|------
INFO      | Payment created, succeeded, failed
WARNING   | Declined transaction, retry attempt
ERROR     | API connection failure, webhook error
DEBUG     | Full request/response body (masked)
```

---

## Roadmap Summary

| Status | Provider | Target Month | Effort |
|--------|----------|------|--------|
| ✅ Active | Stripe | N/A | N/A |
| 🔄 Stub | Payze | M2 | 4 weeks |
| 🔄 Stub | TBC | M4 | 6 weeks |
| 🔄 Stub | BoG | M6 | 6 weeks |
| 📋 Planned | Others | TBD | TBD |

---

## Resources & References

### TBC Bank
- Website: https://www.tbcbank.ge/
- Merchant Portal: https://ecom.tbcbank.ge/
- Documentation: Request from merchant support

### Bank of Georgia
- Website: https://www.bog.ge/
- Merchant Portal: https://ecom.bog.ge/
- Documentation: Request from merchant support

### Payze
- Website: https://payze.io/
- Merchant Portal: https://merchant.payze.io/
- API Docs: https://docs.payze.io/

### External Resources
- ISO 8583 Standard: https://en.wikipedia.org/wiki/ISO_8583
- OpenTelemetry: https://opentelemetry.io/ (observability)
- PCI DSS Compliance: https://www.pcisecuritystandards.org/

---

**Phase 9 Bank Readiness**: ✅ ARCHITECTURE COMPLETE  
**Stripe Production**: ✅ ACTIVE  
**Georgian Bank Stubs**: ✅ READY FOR IMPLEMENTATION  
**First Implementation Target**: Payze (Month 2)
