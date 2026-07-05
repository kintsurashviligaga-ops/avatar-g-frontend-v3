# Bank of Georgia (BOG / iPay) — native GEL payment gateway

Native card + Apple Pay checkout settled **strictly in GEL**, bypassing Stripe for local billing.
Decoupled `initiate → hosted pay → signed callback → idempotent credit` flow.

## Components
| File | Role |
|---|---|
| `lib/billing/bogClient.ts` | OAuth2 client-credentials token · order creation (currency forced GEL) · **RSA-SHA256 callback signature verify** · IP allowlist · status parse · `bogCreditRef` |
| `app/api/checkout/bog/initiate/route.ts` | Authed. Validates `amountGel` ∈ `REFILL_TIERS_GEL`, records a **pending `bog_orders` mapping**, mints the BOG order, returns the hosted `redirectUrl` |
| `app/api/billing/bog/webhook/route.ts` | Authenticates the callback, on `APPROVED` resolves the mapping → credits via `creditWalletGel(user, amount, bog:<orderId>)` |
| `supabase/migrations/20260705_bog_orders.sql` | Additive `shop_order_id → user_id + amount` mapping table (RLS owner-select, service-write only) |
| `lib/billing/bogClient.test.ts` | 17 tests incl. a **real RSA keypair** signing/verify accept·tamper·wrong-key proof |

## Environment variables
| Var | Required | Purpose |
|---|---|---|
| `BOG_CLIENT_ID` / `BOG_SECRET_KEY` | ✅ | Merchant credentials → OAuth2 Basic auth. Absent → routes return `503` (never half-charge). |
| `BOG_OAUTH_URL` | default | `https://ipay.ge/opay/api/v1/oauth2/token` (override for the `api.bog.ge` generation) |
| `BOG_ORDER_URL` | default | `https://ipay.ge/sso/api/v1/ecommerce/orders` |
| `BOG_CALLBACK_PUBLIC_KEY` | ✅ for signature | BOG's PEM RSA public key (`\n`-escaped ok). Primary callback guard. |
| `BOG_CALLBACK_SIGNATURE_HEADER` | default | `Callback-Signature` |
| `BOG_CALLBACK_IP_ALLOWLIST` | optional | Comma-list; defense-in-depth (or sole guard if no public key — logs a warning) |

## Security model (signature-required)
1. **RSA-SHA256 signature** over the raw callback body, verified against BOG's public key (asymmetric —
   unforgeable without BOG's private key) is **REQUIRED to process any callback**. No public key → `401`,
   credits nothing.
2. **Source-IP allowlist** — *supplementary* AND-gate only. We never authenticate on IP alone: the source
   IP comes from a client-supplied `X-Forwarded-For` header and is spoofable on proxied hosting (the
   platform appends the real IP rather than overwriting the leftmost hop). A spoofed IP can therefore only
   wrongly *reject* a signature-verified callback, never credit. *(Hardened after the adversarial review
   flagged IP-only mode as a wallet-credit-fraud vector.)*

## Idempotency (zero double-credit)
`creditWalletGel(user, amount, 'bog:<shop_order_id>')` → `credit_wallet_gel` RPC. `wallet_topups.ref` is a
**PRIMARY KEY** with `ON CONFLICT (ref) DO NOTHING` — a re-delivered callback is a guaranteed no-op.
The ref is keyed on **our own immutable `shop_order_id`** (a server-minted UUID), NOT the callback-supplied
`order_id` — so every retry/re-delivery of the same payment yields the *same* ref regardless of which
envelope fields BOG populates (the review caught a double-credit window when these diverged). This is a
**CREDIT** ref, deliberately distinct from the `remix:*` **DEBIT** refs (`deduct_credits`). The credited
amount is the **server-side recorded tier** (`bog_orders.amount_gel`); if the callback reports an
amount/currency it must match, else the credit is refused and the order is flagged `amount_mismatch`.

> **Tiers stay whole GEL.** `credit_wallet_gel` reconciles at 1 credit ≈ 1 ₾; `REFILL_TIERS_GEL` are all
> integers. Keep top-up tiers whole-GEL (or move the ledger to fractional `balance_gel`) to avoid rounding.

## ⚠️ Verify before live traffic
BOG has shipped more than one API generation (legacy `ipay.ge/opay` vs newer `api.bog.ge/payments`);
the exact order URL, response envelope, and signature header differ. Every URL + the public key are
**env-configurable and never hardcoded as fact**; the client parses order-id/redirect/status
**defensively across known shapes**. Confirm all endpoints + the signature scheme against your current
BOG merchant dashboard, then set the env vars. Nothing here transacts until `BOG_CLIENT_ID/SECRET_KEY`
(+ a public key or IP allowlist) are configured **and** `20260705_bog_orders.sql` is applied.

## Run boundary (honest)
The **mechanism** is proven end-to-end by the jest suite (mock `fetch` + real RSA keypair). A **real
GEL transaction** additionally needs: (a) live BOG merchant credentials + a registered callback URL;
(b) the migration applied; (c) the account able to settle GEL. Those are outside the code — the code
is inert and fail-closed until they exist.
