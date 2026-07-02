# UNUSED_REPORT.md — STEP 1.1 unreferenced-code scan
_Report only. **No files moved** — see decision below. Tools run via `npx` (ephemeral, no lockfile churn)._

## Summary
- **ts-prune** (unused *exports*): 2351 lines — ~1253 match Next.js framework-required patterns (page/layout/route/middleware/config/register/metadata exports) = **false positives**. ts-prune reports exports, not files, and is NOT a safe file-deletion signal for an App-Router app.
- **depcheck**: 15 unused deps, 11 unused devDeps, 1 missing. (Reversible package.json signal — safest.)
- **knip** (unused *files*): returned nothing without a project-specific config. Next.js App Router entries (app/**/{page,layout,route}, middleware, instrumentation, sitemap/robots/manifest, dynamic `import()`, string-referenced modules, supabase/functions, next-intl messages) must be declared or knip flags framework files. Needs a tuned `knip.json` before its file list can be trusted.

## depcheck — unused dependencies (verify before removing; some are runtime/peer/used-by-config)
```
@ai-sdk/react
@aws-sdk/lib-storage
@radix-ui/react-dialog
@radix-ui/react-dropdown-menu
@radix-ui/react-progress
@radix-ui/react-slider
@radix-ui/react-slot
@radix-ui/react-tabs
@swc/helpers
axios
gsap
pdf-parse
rate-limit-redis
redis
styled-jsx
```
### unused devDependencies
```
@testing-library/dom
@testing-library/jest-dom
@testing-library/react
@types/jest
@types/three
autoprefixer
jest-environment-jsdom
pdf-lib
postcss
rimraf
undici
```
### missing (imported but not in package.json)
```
ws: /Users/giorgikintsurashvili/avatar-g-frontend-v3/docs/voice-v2v/node-ws-handler.mjs
```

## ts-prune — non-framework unused exports (sample, first 40; MANUAL review only, do NOT auto-delete)
```
app/icon.tsx:3 - runtime
app/icon.tsx:8 - contentType
components/GlobalNavbar.tsx:40 - GlobalNavbar
hooks/useAffiliateStatus.ts:18 - useAffiliateStatus
hooks/useCredits.ts:7 - useCredits
hooks/useFileUpload.ts:16 - useFileUpload
hooks/useJobStatus.ts:15 - useJobStatus
hooks/useStripeConnect.ts:55 - useStripeConnect
hooks/useStripeConnect.ts:174 - isAccountEnabled
hooks/useStripeConnect.ts:185 - getAccountStatusText
hooks/useStripeConnect.ts:212 - getAccountStatusColor
hooks/useSubscription.ts:27 - useSubscription
hooks/useSubscription.ts:138 - isSubscriptionActive
hooks/useSubscription.ts:148 - hasSubscriptionPlan
hooks/useSubscription.ts:158 - formatPeriodEnd
hooks/useVoiceInput.ts:183 - useVoiceInput
i18n/routing.ts:9 - AppLocale
lib/a11y.ts:2 - trapFocus
lib/a11y.ts:30 - announce
lib/a11y.ts:46 - skipToContentStyles
lib/a11y.ts:63 - skipToContentFocusStyles
lib/animations.ts:3 - fadeInUp
lib/animations.ts:9 - fadeInScale
lib/animations.ts:15 - staggerContainer
lib/animations.ts:20 - staggerItem
lib/animations.ts:25 - heroLogo
lib/animations.ts:30 - heroHeadline
lib/animations.ts:35 - heroSub
lib/animations.ts:40 - heroCta
lib/animations.ts:45 - cardHover
lib/logger.ts:60 - createTraceLogger
lib/openai.ts:51 - __setOpenAIClientFactoryForTests
lib/openai.ts:56 - __resetOpenAIClientFactoryForTests
lib/openai.ts:82 - getOpenAIReply
lib/registry.ts:163 - resolveServiceColor
lib/registry.ts:149 - Service
lib/replicateClient.ts:26 - runReplicatePrediction
lib/replicateClient.ts:10 - getReplicateClient
lib/replicateClient.ts:10 - pollPrediction
lib/replicateClient.ts:11 - PredictionResult
... (1098 non-framework export lines total)
```

## ⛔ Quarantine decision — DEFERRED (rule 4 + rule 2)
No `git mv` performed. Rationale:
1. The union is dominated by **framework false positives**; ts-prune is export-level (not file-level) and knip has no trustworthy file list without a tuned config.
2. Rule 4 forbids pushing changes that can't be reliably kept green; moving files on this 363-route App-Router app from this signal would break the build in a long trial-and-error cycle.
3. Rule 2: deletion/quarantine is ultimately a human decision. This report is the input to that decision.
**Safe next actions (for human/next sub-step):** (a) remove the depcheck **unused devDependencies** first (reversible, low-risk) with a green gate; (b) add a tuned `knip.json` (declare App-Router + dynamic-import + supabase/functions entries), re-run, then quarantine only knip's high-confidence unused *files* into `/_graveyard/<date>/` with a green `npm run build` after each batch and restore-on-break.
