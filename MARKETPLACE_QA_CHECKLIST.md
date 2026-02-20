# Marketplace QA Checklist

Date: 2026-02-20  
Branch: `main`  
Commit: `450241b`

## 1) Pre-flight
- [ ] `npm run typecheck` exits with code `0`
- [ ] `npm run build` exits with code `0`
- [ ] Supabase migration `supabase/migrations/20260220_marketplace.sql` is applied

## 2) Route smoke tests (EN + KA)
- [ ] `/en/services/marketplace`
- [ ] `/en/services/marketplace/browse`
- [ ] `/en/services/marketplace/listings/new`
- [ ] `/en/services/marketplace/my`
- [ ] `/en/services/marketplace/orders`
- [ ] `/en/services/marketplace/inbox`
- [ ] `/ka/services/marketplace` and subroutes above

Expected:
- No runtime crash
- Dark glass UI renders correctly
- Locale proxies resolve to same experience as non-locale routes

## 3) Guest mode behavior
- [ ] Browse page loads listings without login
- [ ] Guest can open listing detail page
- [ ] Favorite toggle does not break UI when not authenticated
- [ ] Listing wizard stores draft in localStorage (`marketplace_listing_draft_v1`)
- [ ] Guest publish attempt shows login-required message

## 4) Authenticated seller flow
- [ ] Create listing draft from `/services/marketplace/listings/new`
- [ ] Publish listing from step 7
- [ ] Listing appears in `/services/marketplace/my`
- [ ] Open listing detail and verify title/category/price/tags
- [ ] Confirm diagnostics panel toggles and displays fields

## 5) Buyer + inquiry/inbox flow
- [ ] Open published listing as another authenticated account
- [ ] Send inquiry from listing detail
- [ ] Redirect lands on `/services/marketplace/inbox?inquiry=...`
- [ ] Thread appears in inbox left panel
- [ ] Send reply and verify message list refreshes

## 6) Orders flow
- [ ] `/services/marketplace/orders` loads for authenticated user
- [ ] Existing orders list renders without errors
- [ ] Guest sees login-required state

## 7) API checks
Use `GET /api/marketplace/health` and confirm `{ ok: true }` in response envelope.

Core endpoints:
- [ ] `GET /api/marketplace/listings`
- [ ] `POST /api/marketplace/listings`
- [ ] `GET /api/marketplace/listings/:id`
- [ ] `PATCH /api/marketplace/listings/:id`
- [ ] `DELETE /api/marketplace/listings/:id`
- [ ] `GET /api/marketplace/search?q=...`
- [ ] `GET/POST /api/marketplace/favorites`
- [ ] `GET/POST /api/marketplace/inquiries`
- [ ] `GET/POST /api/marketplace/inquiries/:id/messages`
- [ ] `POST /api/marketplace/metrics`
- [ ] `GET /api/marketplace/orders`

Expected:
- Error responses use project API error envelope
- Auth-required endpoints return `401` for guest
- Ownership/participant restrictions enforced

## 8) Workspace and deep-link integration
- [ ] Workspace shows Marketplace context banner when opened with `?from=marketplace`
- [ ] Workspace Marketplace panel renders favorites/inquiries/my listings (top 5)
- [ ] Business Agent integration includes Marketplace link with prefilled query/tags
- [ ] Social Media integration includes Marketplace link with prefilled query/tags
- [ ] Voice Lab integration includes Marketplace link with prefilled query/tags
- [ ] Marketplace listing detail has links to BA / SMM / Voice Lab

## 9) Known environment caveat (Windows + OneDrive)
If build cleanup intermittently fails on `.next` file locks:
- Close file explorers/editors indexing `.next`
- Retry `npm run build`
- If needed, run build from non-synced local path (outside OneDrive)

## 10) Local validation commands
```bash
npm run typecheck
npm run build
npm run dev
```
