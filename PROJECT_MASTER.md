# ╔══════════════════════════════════════════════════════════════════════════╗
# ║ MYAVATAR.GE — MASTER PROJECT FILE ║
# ║ Autonomous Multi-Part Engineering Execution Manifesto ║
# ║ Target: https://www.myavatar.ge ║
# ║ GCP Project: gen-lang-client-0671348730 ║
# ║ Version: 2026-10-05 FINAL ║
# ╚══════════════════════════════════════════════════════════════════════════╝
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## EXECUTIVE SUMMARY — WHAT THIS FILE IS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ეს ფაილი არის MyAvatar.ge v32-ის სრული, თვითკმარი, ავტონომიური
საინჟინრო სპეციფიკაცია. ის არის:
- **Single source of truth** — agent-ის მთავარი ინსტრუქცია
- **State tracker** — სად ვართ პროცესში (იხ. STATE TRACKER ქვემოთ)
- **Autonomous execution protocol** — როგორ გავაგრძელოთ თვითონ
- **Handoff chain** — ყოველი Part-ის Report ხდება შემდეგი Part-ის input
- **Verification loop** — post-build autonomous QA + refinement
**AGENT-ის ვალდებულება:**
1. წაიკითხე ეს ფაილი სრულად სესიის დასაწყისში
2. შეამოწმე STATE TRACKER — სად ვართ
3. გააგრძელე იქიდან, სადაც წინა სესიამ შეწყვიტა
4. ყოველი Part-ის ბოლოს განაახლე STATE TRACKER
5. თუ owner-ის intervention საჭიროა — გაჩერდი და მკაფიოდ თქვი რა
6. არასოდეს გააგრძელო silent-ად, თუ Phase 0 (owner setup) არ დასრულებულა
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## STATE TRACKER — CURRENT PROGRESS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
**⚠️ AGENT: განაახლე ეს სექცია ყოველი Part-ის დასრულებისას.**
```
CURRENT PHASE: Part 1 (Audit + Foundation) — Master Task §60 steps 1–25 done, step 26 STOP (no promotion)
CURRENT STATUS: Certification written: NOT production ready (docs/handoffs/final-launch-certification.md, §57 block all NO / NOT PROVEN)
LAST SESSION: 2026-10-08 (Claude, branch claude/launch-certification-wmvitt)
LAST COMMIT: see `git log` on that branch (code verified at 70a5fe88; main = 572d5fac); draft PR #42, CI green
NEXT ACTION: owner actions in final-launch-certification.md §Y (OTP fix deploy, Resend domain, Veo smoke retry,
          VIDEO_DIRECTOR_RUNS=admin on Preview only, Stripe Live refund/dispute events, BOG credentials / merchant
          activation (every Production BOG checkout failed at start), 20261008c right after the deploy,
          pricing table, browser infra, provider migration plan); then Part 2
MASTER TASK §60: steps 1–25 done (2026-10-08). 10 ServiceCatalog · 11 menus read it · 12 Agent G catalog routing ·
          13 /hub and /workspace redirect, fake stats deleted · 15 Live call carries the text chat; ask_agent_g hands
          research to Agent G · 16 SSRF guard on every caller-chosen fetch; library re-sign, upload MIME/size, RLS migration
          (applied 2026-10-08) · 17 V1–V6 director domain layer, since 2026-10-08 wired into the studio's storyboard Approve behind
          VIDEO_DIRECTOR_RUNS (unset = off; table migration 20261008b applied 2026-10-08) · 18 Stripe refund/dispute reversal, ledger fail-closed
          in production, ledger-backed history · 20 a11y focus traps, ka/en/ru labels, pinch-zoom restored · 21 sitemap
          from the catalog. Final retest on 70a5fe88: tsc 0; lint 0 errors; jest 643 suites / 10,294 passed / 3 skipped;
          build OK; Playwright 239 passed, 10 skipped, 2 load failures that pass alone (4/4). All BUILT_NOT_PROVEN in
          production (nothing deployed); see the certification for every label.
          After the owner's "continue" (2026-10-08 14:10 UTC): R7 silent fallbacks removed for image (no Grok / FLUX),
          text (llmText and /api/pipeline Gemini only), music (Auto = Lyria alone; no MusicGen bed) and voice (no Azure /
          Google behind ElevenLabs), commits 8a2d1b0f and 32abf9ad. Forbidden providers that are still the primary engine
          are listed in the certification §L (Part 2).
          Owner's "you do Supabase and Stripe" (2026-10-08 15:55 UTC): Production Supabase zwksnayknzggdcenqqxy got
          20261008b (director_runs, 16:01Z) and 20261008a (RLS, 16:06Z; a no-op there, none of its 9 tables exists).
          The uploads cap moved to 20261008c, applied only after the deploy (main still writes zips and big videos to
          uploads). Advisor after: 0 errors, 22 warnings, 23 info. Stripe: the connector reaches only the test sandbox;
          the myavatar.ge endpoint is in Live mode, so the owner adds the two events. Schema drift found: the code calls
          124 table names that do not exist in Production (certification §O).
PHASE CHECKLIST:
◐ Part 0: Phase 0 (GCP) — CONFIGURED (read-back proven), owner-approved apply 2026-10-08 11:00 UTC.
          GCP gen-lang-client-0671348730 (467145118875): pool vercel / provider vercel-oidc (team id + project id +
          preview only), SA myavatar-veo (no keys), custom roles myavatarVeoInvoker + myavatarUrlSigner,
          bucket gs://myavatar-veo-outputs (private, 30-day delete). Vercel: OIDC team mode, 8/8 GCP vars in Preview only;
          Preview /api/video/engine → transport vertex. AUTH VERIFIED 2026-10-08 14:21:20 UTC with the Preview build identity
          (build log of e222e38: "[gcp-auth-check] env=preview … ok=true mode:wif token:ok bucket:ok sign:ok"; STS,
          impersonation, bucket list, signBlob; free). Paid test approved by owner 11:47 UTC: T2 PROVEN
          11:49–11:52 (gemini-3.8-flash, gemini-3.1-flash-image, lyria-3-clip-preview on Vertex, owner account, ≈ $0.11; Cloud
          Monitoring: aiplatform GenerateContent 200×3/400×1, generativelanguage 0);
          T1 Veo: owner pressed /ka/admin/veo-smoke 14:45:29 UTC; Vertex accepted the submit via WIF (log "[veo] submit
          transport=vertex … → ok", aiplatform PredictLongRunning 200 from SA myavatar-veo), then the operation FAILED
          "Veo 3 prompt enhancement cannot be disabled" (op 71e35314-…): lib/veo/payload.ts sent enhancePrompt:false, so every
          Vertex Veo render would fail. Fix 75eef69 (PR #43), cherry-picked to the launch-certification branch. Veo is NOT
          INFERENCE VERIFIED until the retry produces the clip; the failed op is expected unbilled (Billing confirms).
          Credit coverage checked ~24 h later in Billing. Production still sends every Google call through GEMINI_API_KEY.
          No further paid generation without new owner consent (owner 11:56 UTC); Production unchanged.
          Billing: single account 01AE3E-0F0B75-C73B11, linked only to this project (PROVEN); $300 credit to 2026-12-31
          and AI Studio $13.21 auto-reload OFF (owner-confirmed). 3 budgets (PROVEN): $10/month test, $300/year credit
          guard (both gross, credits excluded), $1/month out-of-pocket (after credits). Budgets alert, they do not cap.
          Report docs/handoffs/2026-10-08-gcp-part0-report.md §9–10, test plan docs/handoffs/2026-10-08-gcp-part0-test-plan.md,
          script scripts/gcp/part0-wif.sh (branch claude/gcp-part0-wif-fmtfxp, PR #43).
◐ Part 1: Audit + Foundation — restarted 2026-10-08; §60 certification done (final-launch-certification.md), not launch ready.
◐ Part 2: Vertex Migration — WIP ONLY on unmerged origin/codex/vertex-ai-migration (503829dc, 2026-10-06),
          self-reported 25 failing suites, not deployable. Cannot complete before Part 0 (STOP-1).
□ Part 3: Video Pipeline Rebuild + Browser + Security + Tests
□ Part 4: Production Polish + Final Report
□ Part 5: Post-Build Browser Verification + One-Window Refinement
BLOCKERS:
· AUTH-1 (launch blocker, Production auth FAILED): email OTP sign-in, sign-up and password reset fail on Production and
  Preview since at least 2026-10-03 (Vercel log "no email_otp in generateLink response"). Suspected cause
  lib/auth/otpEmail.ts:50 accepts exactly 6 digits while Supabase returns a longer code. Fix owned by the GCP Part 0
  thread (PR #43, commit 87122ff); since 13:55 UTC also on the cert branch (0421377a), so launch-certification Previews
  carry it. Stays FAILED for Production until that fix is deployed with the owner's approval.
· AUTH-2 (launch blocker, found 2026-10-08 14:04 UTC): with the AUTH-1 fix the code is generated and accepted (Supabase
  /admin/generate_link 200, 13:57:06), then Resend refuses the mail: "resend 403 The myavatar.ge domain is not verified"
  (Vercel log 13:57:04, cert-branch Preview e1dfffc2). MAIL_FROM is unset (sender info@myavatar.ge); one RESEND_API_KEY
  serves Production and Preview. Owner action: verify myavatar.ge at resend.com/domains (DNS TXT/MX, then Verify).
  Email sign-in, sign-up, password reset and /api/mail/send stay FAILED everywhere until then.
· STOP-1: Part 0 T1 — owner signs in (admin account) on https://avatar-g-frontend-v3-git-22ebb4-kintsurashviligaga-ops-projects.vercel.app
  with a password, or with Google after adding exactly that alias + "/**" to Supabase Redirect URLs (no wildcard; email
  code cannot work until Resend is fixed), then presses the button on /ka/admin/veo-smoke once more, on the Preview build
  that carries 75eef69 (≈ $0.40, approved 11:47; the first press failed on enhancePrompt:false and produced no clip).
  AUTH itself is already verified (build log). Production env not yet.
  scripts/gcp/setup-veo-vertex.sh AUTH=wif is superseded (it trusted the whole pool).
· Part 1–2 findings from the Part 0 audit (report §10.3–10.4, no change made):
  - Only Veo can run on Vertex, and only in Preview (VEO_TRANSPORT=vertex pinned). Every other Google call (chat,
    image, music, TTS, STT, Live, embeddings, search, research) uses the Gemini Developer API key. Production has
    GEMINI_API_KEY and no GCP_*/VEO_TRANSPORT, so all its Google spend, Veo included, hits the AI Studio balance.
  - Silent fallbacks / forbidden providers still reachable: veoTransport auto → Gemini API; Claude with no gate
    (providerRouter, agentg/personality, /api/pipeline); image NanoBanana → Grok → FLUX; music Lyria → Udio →
    ElevenLabs → MusicGen; avatar HeyGen / SadTalker / LiveAvatar; OpenAI / Azure voice paths.
  - Imagen 4 is not available on Vertex for this project (404): Part 1 image should target gemini-3.1-flash-image.
    Image generation quota is 2 requests/min per model (increase request needed before launch).
  - Preview and Production share one Supabase, so any Preview studio test writes to the production DB.
  - API keys "API key 2" (aiplatform) and "Gemini API Key" (generativelanguage); roles/editor on the default compute SA.
· Admin Panel audit 2026-10-08: no newer admin panel on any branch. Prod /ka/admin = main code. Pipeline card
  (lib/pipeline/statusAgent.ts) is env-presence only and stale ('Udio primary' contradicts code, where Lyria is primary).
  Replicate/Udio keys are set in Production. Admin auth uses 3 inconsistent guards; run-migration and 2 other routes are
  header-key only. Fixes are planned after Part 0 on claude/admin-panel-audit-co2mng, stacked on launch-certification.
  Report /mnt/project-files/reports/2026-10-08-admin-panel-audit.md.
· Master Task §4 Deep Research: done by Claude on the owner's instruction (2026-10-08) → docs/handoffs/service-taxonomy.md.
· Vercel connector has no access to team kintsurashviligaga-ops-projects (403) — deploy state readable only via public URL.
HANDOFF CHAIN:
· Part 0 Report: docs/handoffs/2026-10-08-gcp-part0-report.md (branch claude/gcp-part0-wif-fmtfxp, PR #43)
· Part 0 Test plan: docs/handoffs/2026-10-08-gcp-part0-test-plan.md
· Service inventory: docs/handoffs/service-inventory.md · taxonomy + migration matrix: docs/handoffs/service-taxonomy.md
· Part 1 Report: pending (docs/handoffs/part-1-report.md)
· Part 2 Report: pending
· Part 3 Report: pending
· Part 4 Report: pending
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## AUTONOMOUS EXECUTION PROTOCOL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Agent მუშაობს **ავტონომიურად**, თანმიმდევრულად, ხელშეწყობის გარეშე,
შემდეგი წესებით:
### AE1. SESSION STARTUP (ყოველი ახალი სესია)
```
1. წაიკითხე ეს ფაილი სრულად
2. გამოიძახე: git status, git log --oneline -10
3. გამოიძახე: cat package.json | grep scripts (verify scripts)
4. გამოიძახე: npx tsc --noEmit (verify baseline)
5. გამოიძახე: npm test -- --listTests 2>&1 | tail -5 (verify jest)
6. შეამოწმე STATE TRACKER
7. განსაზღვრე NEXT ACTION
8. გააგრძელე
```
### AE2. PHASE TRANSITIONS
- **Part N → Part N+1**: მხოლოდ მაშინ, როცა Part N-ის Report დასრულებულია
- Report უნდა შეიცავდეს handoff section-ს Part N+1-ისთვის
- თუ Report არასრულია — არ გააგრძელო, დაასრულე Part N
- STATE TRACKER-ში მონიშნე Part N როგორც "complete" და Part N+1 როგორც "in progress"
### AE3. HANDOFF CHAIN
- ყოველი Part-ის Report ინახება `docs/handoffs/part-N-report.md`-ში
- შემდეგი Part იწყება წინა Report-ის წაკითხვით
- Report არის immutable — არასოდეს შეიცვალოს უკან
### AE4. STOP CONDITIONS (გაჩერდი და ჰკითხე owner-ს)
```
STOP-1: Phase 0 (GCP Console) არ დასრულებულა
→ Part 2 ვერ დაიწყება
→ დაწერე: "OWNER ACTION REQUIRED" + ზუსტი steps
STOP-2: jest baseline დარღვეულია (9784 passed ↓)
→ არ გააგრძელო, გამოიკვლიე რატომ
→ თუ შენი ცვლილების ბრალია — გამოასწორე
→ თუ არა — დააფიქსირე Report-ში
STOP-3: Silent fallback დაფიქსირდა (R7 დარღვევა)
→ შეწყვიტე, გამოასწორე, გადაამოწმე
STOP-4: Forbidden model in UI (R9 დარღვევა)
→ შეწყვიტე, წაშალე, გადაამოწმე
STOP-5: Production deploy საჭიროა (R3)
→ main-ზე push = owner approval
→ დაწერე: "OWNER APPROVAL REQUIRED FOR PROD DEPLOY"
STOP-6: Supabase migration prod-ზე (R11)
→ owner approval only
→ დაწერე: "OWNER APPROVAL REQUIRED FOR MIGRATION"
STOP-7: Secret-ების შეყვანა საჭიროა (R4)
→ owner only
→ დაწერე: "OWNER ACTION: add env var XXX in Vercel"
```
### AE5. WORKING DIRECTORY
- Repository: `github.com/kintsurashviligaga-ops/avatar-g-frontend-v3`
- Working branch: `main` for merges, feature branches for work
- Never force push to main
- Merge = `--no-ff` only after green tsc + jest
### AE6. SELF-CRITIQUE LOOP
ყოველი task-ის შემდეგ:
```
PLAN → INSPECT → IMPLEMENT → TEST → REVIEW → REPAIR → TEST → VERIFY
```
- Bounded repair loop (max 3 iterations)
- Infinite loop = forbidden
- თუ 3 iteration-ის შემდეგ ვერ გამოსწორდა — STOP + report
### AE7. VERIFICATION LAYERS
- **Unit**: jest, თითოეული ახალი ფუნქცია
- **Integration**: service-to-service, mock external APIs
- **E2E**: Playwright with PLAYWRIGHT_DEV_PORT
- **Type**: `npx tsc --noEmit` must be clean
- **Lint**: ESLint on changed files
- **Build**: `npm run build` must pass
- **Baseline**: jest 9784 passed must stay
### AE8. COMMIT DISCIPLINE
```
· Conventional commits: feat:, fix:, chore:, docs:
· One logical change per commit
· Never commit secrets
· Never commit .env*
· Never commit node_modules, .next
· Push only after green tsc + jest
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## SECTION 0 — CONTINUATION CONTEXT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
### STATUS AS OF 2026-10-03
ეს არის წინა სესიის snapshot. არ არის source of truth — repository არის.
გამოიყენე როგორც continuation context.
### PRIMARY GOAL
Google-ის AI ხარჯის გადატანა Vertex AI-ზე ($300 credit coverage).
- GCP Project ID: `gen-lang-client-0671348730`
- GCP Region (Veo): `us-central1`
### CURRENT STATE
**Google AI calls (დღეს):** Gemini Developer API
- API key: AI Studio (`GEMINI_API_KEY`)
- Host: `generativelanguage.googleapis.com`
- Billing: AI Studio prepay — **NOT covered by $300**
**მიზანი:** იგივე სამუშაო Vertex AI-ზე
- Billing: Cloud Billing — **covered by $300**
**Veo (video) — CODE READY:**
- `lib/veo/` Vertex transport already exists
- `lib/veo/vertexClient.ts`, `vertexAuth.ts`, `gcs.ts`, `deliver.ts`,
`engine.ts`, `geminiTransport.ts`
**დანარჩენი (chat, TTS, Live, research, memory, vision):**
- ჯერ API key-ზე მუშაობს
- საჭიროა კოდის ცვლილება
### REPOSITORY
- Repo: `github.com/kintsurashviligaga-ops/avatar-g-frontend-v3`
- Stack: Next.js 14.2.35, Tailwind 3.4, Node 24.x
- Main: `572d5fac`
- Merged (prev): `claude/beautiful-moser-50e6af`
- Unmerged: `claude/clever-albattani-95da87` (50 dead files)
### SUPABASE
- Production: `zwksnayknzggdcenqqxy`
- Alternative: `lejrrdeffeswrdzjqthm` (not used)
- 9 tracked migrations on prod
- public schema: 51 tables, RLS enabled
- Billing SSoT: `profiles.credits_balance` + `deduct_credits` / `refund_credits`
### VERCEL
- Project: `avatar-g-frontend-v3`
- Team: `kintsurashviligaga-ops-projects`
- Production: `4g2qs479j` (Ready, 2026-10-03)
- Aliases: `myavatar.ge`, `www.myavatar.ge`
- Prod env: `GEMINI_API_KEY`, `GEMINI_VEO_ENABLED`,
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ACCESS_TOKEN`
### VERTEX — EXISTING CODE
**Auth modes (lib/veo/vertexAuth.ts):**
1. WIF (recommended, keyless): Vercel OIDC → GCP STS → SA impersonation
2. SA JSON key: `GCP_SERVICE_ACCOUNT_KEY`
**Env vars (names only):**
- `GCP_PROJECT_ID`, `GCP_VEO_BUCKET`, `GCP_VEO_LOCATION` (default us-central1)
- WIF: `GCP_PROJECT_NUMBER`, `GCP_SERVICE_ACCOUNT_EMAIL`,
`GCP_WORKLOAD_IDENTITY_POOL_ID`,
`GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID`
- Or: `GCP_SERVICE_ACCOUNT_KEY`
- Optional: `VEO_TRANSPORT`, `VEO_VERTEX_PERSON_GENERATION`
**Dependencies installed:**
- `google-auth-library ^9.15.1`
- `@google-cloud/storage ^7.22.0`
- `@vercel/oidc`
- `@ai-sdk/google ^3.0.70`
- NOT installed: `@ai-sdk/google-vertex`
### VERTEX — NOT WORKING YET
**15 production files call AI Studio directly:**
- `lib/ai/*` (4), `lib/gemini`, `lib/voice/geminiLive.ts`, `lib/voice-v2v`
- `lib/veo/geminiTransport.ts`, `lib/research`, `lib/memory`, `lib/system`,
`lib/security`
- `app/api/voice/live`, `app/api/tts/gemini`, `app/api/health/services`
**8 files use `@ai-sdk/google`:**
- Product chat (model registry: `lib/ai/google/models.ts`)
**Live API (WebSocket):**
- `lib/voice/geminiLive.ts` — Vertex requires different endpoint + auth
- Riskiest part
**Models in code:** `gemini-3.8-flash`, `gemini-3.6-flash`,
`gemini-3.1-pro-preview`, `gemini-3.8-live`,
`gemini-2.5-flash-native-audio-latest`
- Each must be verified in Vertex Model Garden
- ⚠️ Gemini 1.5 retired — DO NOT use
### VERTEX PHASES
**Phase 0 (OWNER ONLY, GCP Console):**
1. Billing: $300 free trial attached + budget alerts ($50/$150/$250)
2. Enable APIs: Vertex AI, Cloud Storage, IAM Credentials, STS
3. Create GCS bucket in us-central1 with lifecycle
4. Create service account with Vertex AI + bucket roles
5. WIF setup OR SA JSON key
**Phase 1 (env vars only, NO code change):**
1. Vercel → Production env: GCP_* vars + VEO_TRANSPORT=vertex
2. REDEPLOY REQUIRED
3. Test 8s clip → verify Billing
**Phase 2 (code — chat, TTS, image):**
1. Transport switch: `GEMINI_TRANSPORT=vertex`
2. Product chat: `@ai-sdk/google-vertex`
3. REST modules: generativelanguage → aiplatform
4. Service-by-service with jest tests
5. NO silent fallback (R7)
**Phase 3 (WebSocket Live):**
- Last, separate testing
### KNOWN RISKS
- Trial credit = 90 days
- Quota may be low on trial
- NOT confirmed AI Studio spend deducts from $300
- Veo on Vertex may need allowlisting for person generation
- Model availability may differ Vertex vs AI Studio
### TEST BASELINE (2026-10-03)
- `npx tsc --noEmit`: clean
- Jest: 613 suites, 9784 passed, 3 skipped, 0 failed
- Playwright: `tests/service-pages.spec.ts` 10/10
- ESLint (changed): clean
### UI STANDARDS
- Accent: `#338FE8` (black text on it)
- True black, hairline borders
- No gradient / glow / emoji
- 16px inputs, 44px targets
- ka/en/ru (Georgian first)
- `docs/DESIGN.md` §13
- Routing SSoT: `lib/studio/tools.ts`
- Deep link: `/{lang}/dashboard?tool=<id>`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## SECTION A — PROVIDER BOUNDARY (NON-NEGOTIABLE)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
### PERMITTED PROVIDERS
**1. Google (Vertex AI + AI Studio):**
- Text / Web / Code / Reasoning: Gemini (Vertex preferred)
- Image: Imagen
- Video: Veo (EXCLUSIVE — Section B)
- Music: Lyria
- TTS / Transcribe / Dialog: Gemini TTS/Audio (Vertex preferred)
- Computer Use: Gemini Computer Use
**2. ElevenLabs:**
- Voice synthesis (TTS)
- Avatar lipsync
**3. Sandbox:**
- Code / Terminal execution (isolated)
### REMOVE / DEPRECATE (STRICT)
- Udio (music)
- HeyGen (avatar + video)
- Replicate (multi-purpose)
- Runway / Pika / Luma / Kling / Sora (video)
- OpenAI / Anthropic (chat)
- ნებისმიერი სხვა 3rd-party API
### BILLING ISOLATION
| Service | Billing | $300 Covered |
|---------|---------|--------------|
| Vertex AI (Gemini, Imagen, Veo, Lyria) | Cloud Billing | ✅ YES |
| Gemini Developer API (fallback) | AI Studio | ❌ NO |
| ElevenLabs | Separate | ❌ NO |
| Sandbox | Separate | ❌ NO |
| Vercel | Infrastructure | ❌ NO |
| Supabase | Infrastructure | ❌ NO |
### ENV VARS FINAL (SERVER-SIDE ONLY)
```
Required
GEMINI_API_KEY (fallback transport only)
ELEVENLABS_API_KEY (voice + lipsync)
SANDBOX_API_KEY (code/terminal)
GCP_PROJECT_ID (Vertex)
GCP_VEO_BUCKET (Vertex)
GCP_VEO_LOCATION (Vertex, default us-central1)
WIF (preferred)
GCP_PROJECT_NUMBER
GCP_SERVICE_ACCOUNT_EMAIL
GCP_WORKLOAD_IDENTITY_POOL_ID
GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID
OR SA JSON
GCP_SERVICE_ACCOUNT_KEY
Transport control
VEO_TRANSPORT (vertex | gemini, fixed mode)
GEMINI_TRANSPORT (vertex | gemini_api, fixed mode)
Optional
VEO_VERTEX_PERSON_GENERATION
Existing (Supabase)
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_ACCESS_TOKEN
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## SECTION B — VIDEO PIPELINE V1-V6 (UNBREAKABLE)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
### V1. GOOGLE ENGINE ONLY
- ვიდეოს გენერაცია მხოლოდ Google Veo-ს მეშვეობით
- არავითარი fallback, legacy provider, wrapper
- ერთადერთი დასაშვები `VideoGenProvider` implementation:
`GoogleVeoProvider` (providerName literal: `"google_veo"`)
- იკრძალება: Runway, Pika, Luma, Kling, Sora, HeyGen, Replicate
**არქიტექტურა:**
```
Agent G → Orchestrator → Video Capability → VideoDirector
→ VideoGenProvider (GoogleVeoProvider)
→ lib/veo/engine.ts (existing Vertex transport)
→ Google Veo API
```
### V2. STRICT STORYBOARD EXECUTION
- Shot List = director's order
- სისტემა = "Director's Executor", არა "Director"
- LLM მხოლოდ draft-ს ქმნის (`planStoryboard`)
- User approval-ის შემდეგ storyboard იკეტება (`freeze`)
- LLM ვერ ცვლის ვერაფერს freeze-ის შემდეგ
**Shot execution:**
1. მკაცრად `order`-ის მიხედვით
2. მისი `prompt`-ით
3. მისი `referenceImage`-ით
4. მისი `seed`-ით
5. მისი `duration/aspect/quality`-ით
**Error case:**
- სისტემა ჩერდება (არა silent skip)
- User-ს აცნობებს ზუსტი მიზეზით
- User ირჩევს: retry / edit / cancel
### V3. DIRECT PROMPT INTEGRATION
- `Shot.prompt` → Veo API = **byte-for-byte passthrough**
- იკრძალება: improve, rephrase, translate, expand, truncate, decorate
- LLM-ს არ აქვს უფლება შეცვალოს prompt freeze-ის შემდეგ
- Unit test: `prompt in === prompt out`
> Implementation note (2026-10-08, PROVEN by GCP Part 0 T1): Veo 3.x always rewrites the prompt inside Google and fails the
> operation on an explicit `enhancePrompt: false`. V3 is therefore enforced up to the wire: the director sends `Shot.prompt`
> byte-for-byte and never asks for enhancement (lib/veo/payload.ts, lib/video/director/googleVeoProvider.ts); what Google's
> model does with it afterwards is outside this system. The studio no longer offers a "let Google rewrite" switch.
### V4. CONSISTENCY GUARANTEE
Shot List-ის განმავლობაში შენარჩუნებული:
- ერთი character reference image
- ერთი seed (თუ მითითებული)
- ერთი style
- თანმიმდევრული visual continuity
- Locked aspect ratio
### V5. ERROR HANDLING PER SHOT
`ShotError.reason`:
- `prompt_safety`
- `invalid_dimension`
- `invalid_duration`
- `rate_limit`
- `reference_image_issue`
- `seed_conflict`
- `veo_internal`
- `unknown`
Execution halts on error. TaskState → `waiting_for_shot_decision`.
NO silent skip, NO auto-fix.
### V6. NO SILENT DEVIATION
- არცერთი shot არ გამოტოვდება
- არცერთი არ დაემატება
- არცერთი prompt არ შეიცვლება freeze-ის შემდეგ
- არცერთი scene/character არ შეიცვლება
- არ არსებობს "adaptive behavior"
**ეს არის არქიტექტურული კანონი, არა preference.**
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## SECTION C — REPO RULES (R1-R12)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```
R1. main: NEVER --force
R2. Merge = --no-ff, only after green tsc + full jest
Baseline: 613 suites, 9784 passed
R3. Push to main = production deploy → OWNER'S EXPLICIT APPROVAL
R4. Secrets: OWNER ONLY
- Logs/code: variable names only (never values)
- No secrets in commits, browser bundle, React state, logs
- No NEXT_PUBLIC_ prefix for secret keys
R5. Price on button = route's actual deduction
- SSoT: lib/credits/quote.ts
- PRICING_CONFIG = UI display only; quote.ts wins
- Fake numbers in UI = FORBIDDEN
R6. UI: docs/DESIGN.md
- Accent #338FE8 (black text on it)
- True black, hairline borders
- No gradient / glow / emoji
- 16px inputs, 44px targets
- ka / en / ru (Georgian first)
R7. NO SILENT FALLBACK (owner's absolute rule)
- Not-configured = explicit error
- Fixed transport not ready → explicit not_configured
with missing vars list
- Applies to Vertex, provider selection, model selection
R8. Vertex migration:
- Auto mode: Vertex if fully configured, else Gemini API
- Fixed mode (VEO_TRANSPORT / GEMINI_TRANSPORT): if not ready
→ NotConfiguredError + missing vars
- NO silent fallback
- Vertex events visible in UI (developer mode)
R9. Model Selectors: ALLOWLIST ONLY (Section D)
- Only Google AI Studio official models
- ModelCatalog = SSoT
- Hardcoded / 3rd-party / retired in UI = FORBIDDEN
- Runtime verification against AI Studio / Vertex
- No silent substitution of user's saved preference
R10. Playwright: PLAYWRIGHT_DEV_PORT=<port>
- PLAYWRIGHT_BASE_URL alone → false 500 errors
R11. Supabase prod migrations: OWNER'S APPROVAL ONLY
- 9 tracked on prod (Section 0)
R12. No new 3rd-party AI provider — ever
- Any new provider must be approved by owner and added to
Section A first
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## SECTION D — MODEL SELECTOR ALLOWLIST
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
### D0. PRINCIPLE
UI-ში (Model Selectors / Params Sheet Dropdowns) აკრძალულია ნებისმიერი
მოდელი, გარდა Google AI Studio-ს მიმდინარე ოფიციალური მოდელებისა.
### D1. ALLOWLIST
**1. Text / Code / Reasoning / Agent:**
```
Gemini 3.8 Live Extended Thinking
Gemini 3.8 Live
Gemini 3.8 Flash
Gemini 3.7 Flash
Gemini 3.6 Flash
Gemini 3.5 Flash / Flash Lite
Gemini 3.1 Pro / Flash / Flash Lite
Gemini 3 Flash / Flash Live
Gemini 2.5 Pro / Flash / Flash Lite
Gemini 2 Flash / Flash Lite
Gemma 4 31B / Gemma 4 26B
Deep Research Pro Preview
Computer Use Preview
Antigravity
Gemini Omni Flash / Omni 1.1 Flash
```
**2. Image:**
```
Imagen 4 Ultra Generate
Imagen 4 Generate
Imagen 4 Fast Generate
Nano Banana Pro (Gemini 3 Pro Image)
Nano Banana 2 (Gemini 3.1 Flash Image)
Nano Banana 2 Lite (Gemini 3.1 Flash Lite Image)
Nano Banana (Gemini 2.5 Flash Preview Image)
```
**3. Video:**
```
Veo 3 Generate
Veo 3 Fast Generate
Veo 3 Lite Generate
```
**4. Music:**
```
Lyria 3 Pro
Lyria 3 Clip
Lyria Realtime
```
**5. Audio / TTS / Transcription:**
```
Gemini 3.8 Flash TTS / Flash Lite TTS
Gemini 3.5 Transcribe Live / Transcribe / Live Translate
Gemini 3.1 Flash TTS
Gemini 2.5 Pro TTS / Flash TTS
Gemini 2.5 Flash Native Audio Dialog
```
**6. Specialty:**
```
Gemini Robotics ER 2 Preview / ER 1.6 Preview / ER 1.5 Preview
Gemini Embedding 1 / Gemini Embedding 2
```
### D2. RUNTIME VERIFICATION
სია ALLOWLIST — არა hard-coded SSoT.
- თითოეული მოდელი UI-ში გამოჩენამდე დადასტურდეს AI Studio/Vertex
runtime-ზე — ამ პროექტისა და რეგიონისთვის
- სიაშია, runtime-ზე არა → silent exclusion + log
- runtime-ზეა, სიაში არა → review queue, NOT auto-add
- Model ID აიღე runtime/docs availability-ის მიხედვით
### D3. FORBIDDEN
- OpenAI (GPT-*, o1, o3)
- Anthropic (Claude *)
- Midjourney / Stable Diffusion / Flux / DALL·E / SDXL
- Cohere / Mistral / Llama / xAI / DeepSeek / Grok
- Retired Google (Gemini 1.5, Gemini 1.0)
- Hardcoded strings not on runtime
- "custom" / "beta" labels not in AI Studio
### D4. ARCHITECTURE
```typescript
type ModelCapability =
| "text" | "code" | "reasoning" | "agent" | "live"
| "image" | "video" | "music"
| "tts" | "transcribe" | "translate" | "dialog"
| "robotics" | "embedding"
| "computer_use"
type ModelCatalogEntry = {
id: string // e.g. "gemini-3.8-flash"
label: string // UI display
provider: "google" // ONLY Google
family: "gemini" | "gemma" | "imagen" | "veo" | "lyria"
| "nano_banana" | "robotics" | "embedding" | "specialty"
capabilities: ModelCapability[]
focusModes: AgentCapability[]
transport: "vertex" | "gemini_api" | "either"
enabled: boolean
verifiedAt?: string
notes?: string
}
type ModelCatalog = {
entries: ModelCatalogEntry[]
updatedAt: string
version: string
}
```
D5. VALIDATION
Build-time:
· Schema validation (jest test)
· entry.provider === "google"
· No duplicate ids
· Every capability has ≥1 enabled entry
Runtime:
· UI receives only enabled entries
· Not verified → excluded
· No silent fallback to "default" model not in catalog
· User's saved preference missing → explicit message
D6. UI REQUIREMENT
· Params Sheet dropdowns feed from ModelCatalog
· Group by family
· Filter by Focus Mode capability
· Friendly label (not raw id)
· Preview models labeled "Preview"
· No emojis / gradients (DESIGN.md)
D7. VERIFICATION
Grep patterns (case-insensitive):
```
"gpt-", "openai", "claude", "anthropic"
"midjourney", "stable diffusion", "flux", "dall-e", "sdxl"
"cohere", "mistral", "llama", "deepseek", "grok", "xai"
"gemini-1.5", "gemini-1.0"
hardcoded model id not in ModelCatalog
```
D8. RELATIONSHIP WITH VERTEX
```
transport: "vertex" → only via Vertex (no fallback — R7/R8)
transport: "gemini_api" → only via API key (rare)
transport: "either" → preferred Vertex, fallback ONLY if
user explicitly enabled opt-in
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION E — ONE-WINDOW (SINGLE-PANE) ARCHITECTURE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
E0. PRINCIPLE
MyAvatar.ge v32 = One-Window (Single-Pane) architecture.
User never leaves the central interface. Everything happens in one window:
· Conversational context
· 9 Focus Modes (web, video, image, music, voice, avatar, text, code, canvas)
· Multi-agent live pipeline visualization
· Secure sandboxed terminal execution
· Browser actions
· Media generation (Image/Video/Music/Voice/Avatar)
· Settings (Params Sheet)
· Model selectors
· Loading/progress indicators
· Approval dialogs (for high-risk actions)
მკაცრად იკრძალება:
· Popup windows / modal overlays that break context
· Navigation away from central interface
· Multi-tab workflows
· Separate "terminal" app (Terminal is a capability, not a product)
· Full-page reloads for mode switches
ნებადართულია:
· Focus Mode switching within the central interface
· Expandable/collapsible panels (Canvas)
· Inline Params Sheet
· Inline Agent G Live pipeline
· Inline Unified Generation Card
· Inline terminal output (within Canvas)
E1. UI PRIMITIVES
Central Interface Structure:
```
┌────────────────────────────────────────────────────────────────┐
│ Header: [Logo] [Focus Modes] [Model Selector] [Balance] [User] │
├────────────────────────────────────────────────────────────────┤
│ │
│ Agent G Live (streaming events, pipeline visualization) │
│ ┌──────────────────────────────────────────────────────┐ │
│ │ ✓ Repository inspected │ │
│ │ ✓ Code Agent selected │ │
│ │ ● Reading Header.tsx │ │
│ │ ● Running typecheck │ │
│ │ ✓ Task completed │ │
│ └──────────────────────────────────────────────────────┘ │
│ │
│ Unified Generation Card (single + multi-shot) │
│ ┌──────────────────────────────────────────────────────┐ │
│ │ ✓ Shot 1 — done │ │
│ │ ✓ Shot 2 — done │ │
│ │ ● Shot 3 — generating (45%) │ │
│ │ Shot 4 — queued │ │
│ │ Shot 5 — queued │ │
│ │ [Cancel] │ │
│ └──────────────────────────────────────────────────────┘ │
│ │
│ Conversation / Input Area │
│ ┌──────────────────────────────────────────────────────┐ │
│ │ [User message] │ │
│ │ [Agent G response] │ │
│ │ ┌────────────────────────────────────────────┐ │ │
│ │ │ Params Sheet (inline, collapsible) │ │ │
│ │ │ Model: [Veo 3 Fast ▼] │ │ │
│ │ │ Aspect: [16:9 ▼] │ │ │
│ │ │ Duration: [5s ▼] │ │ │
│ │ │ [✨ Generate (5 shots, ~$1.50)] │ │ │
│ │ └────────────────────────────────────────────┘ │ │
│ │ [] [] [Send] │ │
│ └──────────────────────────────────────────────────────┘ │
│ │
└────────────────────────────────────────────────────────────────┘
```
E2. FOCUS MODES
9 Focus Modes — ყოველი mode არის view within central interface:
1. web — web search, research
2. video — Storyboard-driven video generation
3. image — Image generation
4. music — Music generation
5. voice — Voice synthesis, TTS
6. avatar — Avatar + lipsync
7. text — Text generation, chat
8. code — Coding capability, terminal
9. canvas — Canvas, editing, outputs
Focus Mode switching = instant, no page reload, context preserved.
E3. AGENT G LIVE
Real-time event stream, always visible in central interface:
· Status events
· Tool calls
· File changes
· Command output
· Media progress
· Video shot progress
· Approval requests
· Errors
· Completion
E4. PARAMS SHEET
Inline, collapsible, per-Focus-Mode:
· Model Selector (from ModelCatalog)
· Mode-specific params (aspect, duration, quality, ...)
· Generate button with dynamic price
· Credits balance indicator (if insufficient → Top up CTA)
E5. UNIFIED GENERATION CARD
Single component for all generation types:
· Mode 1 (single): Image, Music, Voice, Avatar
· Uses media_event
· Standard progress bar
· Mode 2 (multi-shot): Video
· Uses video_shot_event
· Shot-by-shot mini-status
· Cancel cancels entire storyboard
E6. VOICE / TERMINAL / CHAT — SAME CONTEXT
· Same session context
· Same conversation history
· Same task state
· Voice Mode → coding task → same context
· Live Chat → coding task → same context
· Terminal output → inline within central interface
E7. BROWSER AUTOMATION
Browser actions happen within central interface:
· Browser session state visible
· Browser events in Agent G Live
· Screenshots/snapshots inline (developer mode: raw protocol)
· Approval dialogs inline
E8. APPROVAL DIALOGS
For high-risk actions (permission requests):
· Inline within central interface
· Show intended action
· Show risk level
· User: Approve / Cancel
· No popup windows
E9. VERIFICATION CHECKLIST
Post-build, verify:
□ User never leaves central interface
□ No popup/modal that breaks context
□ Focus Mode switch = instant, in-place
□ Agent G Live always visible
□ Params Sheet inline
□ Unified Generation Card for all media
□ Voice/Terminal/Chat same context
□ Approval dialogs inline
□ Browser actions inline
□ No page reloads for mode switches
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PART 0 — PHASE 0 (OWNER ACTION REQUIRED)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ეს არის OWNER-only. Agent ვერ ასრულებს.
Checklist (GCP Console)
```
[ ] 1. Billing: $300 free trial attached to gen-lang-client-0671348730
[ ] 2. Budget alerts configured: $50 / $150 / $250
[ ] 3. Enable APIs:
- Vertex AI (aiplatform.googleapis.com)
- Cloud Storage
- IAM Credentials
- Security Token Service (STS)
[ ] 4. Create GCS bucket in us-central1 with lifecycle rule
[ ] 5. Create service account with Vertex AI + bucket roles
(docs/VEO_ENGINE.md §4-§5)
[ ] 6. WIF setup (Vercel OIDC → GCP STS → SA impersonation)
OR SA JSON key issued
```
Verification
Agent-ი Part 2-ის დასაწყისში ამოწმებს:
· environment-ში არსებობს თუ არა GCP_* ცვლადები
· თუ არა → STOP-1, დაწერე: "OWNER ACTION REQUIRED"
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PART 1 — AUDIT + FOUNDATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MISSION
(ა) სრული repository audit
(ბ) Foundation contracts
(გ) Provider Boundary Interfaces
(დ) Vertex Transport contract
(ე) Video Pipeline contracts (V1-V6)
(ვ) ModelCatalog contract (Section D)
(ზ) PRICING_CONFIG contract
(თ) Tool Registry + Capability Routing skeleton
(ი) Handoff report Part 2-ისთვის
AUDIT SCOPE
Application:
· framework, version, runtime, package manager
· project structure, frontend entries, backend routes
· ყველა API route app/api/-ში
Agent architecture:
· Agent G, agents, orchestrator, self-critique, routing
· session state, context management
· lib/services/workspaceForms.ts
· lib/studio/tools.ts
· lib/credits/quote.ts
Vertex migration scope (table):
File API Host Auth Switch?
... ... ... ... YES/NO
Model Selector audit (Section D):
Location Component Hardcoded? Config-fed? Focus Mode
Grep patterns: gpt-, openai, claude, anthropic, midjourney,
stable diffusion, flux, dall-e, sdxl, cohere, mistral,
llama, deepseek, grok, xai, gemini-1.5, gemini-1.0
Tools:
· tool registry, schemas, execution layer, permissions, error handling
UI:
· chat, live chat, voice mode
· 9 Focus Modes
· Params Sheet (with Model Selectors)
· Canvas
· terminal-related UI (if any)
· loading UI inventory (Part 4 prep)
· pricing UI (Part 4 prep)
· STT/microphone implementation (Part 4 prep)
· VIDEO PIPELINE WIRING:
· video generation UI
· video orchestrator / agent
· prompt flow → Veo API
· Shot List / Storyboard concept (exists?)
· reference image / seed handling
· aspect / duration / quality handling
· character consistency
Infrastructure:
· Vercel config
· external APIs
· env vars (names only)
· auth, database, logs, storage, deployment
· Supabase state
Testing:
· package.json scripts (real names)
· jest config, playwright config
· PLAYWRIGHT_DEV_PORT
One-Window (Section E):
· Audit current UI for One-Window compliance
· Identify any popups/modals that break context
· Identify any page reloads for mode switches
· Document violations
VERTEX TRANSPORT AUDIT
შეისწავლე lib/veo/:
· vertexAuth.ts — WIF + SA key modes
· vertexClient.ts — endpoint, model path, auth flow
· engine.ts — veoTransport() selection logic
· geminiTransport.ts — fallback
· gcs.ts, deliver.ts — storage + delivery
დაადგინე:
1. vertexAuth.ts generalization → Gemini REST + Live API
2. veoTransport() pattern generalization
3. Live API (WebSocket) Vertex auth requirements
4. Not-configured error flow propagation
API PROVIDER INVENTORY
Provider Location Capability Status
Udio (verify) music TO REMOVE if exists
HeyGen (verify) avatar/video TO REMOVE if exists
Replicate (verify) image/video TO REMOVE if exists
Runway/Pika/Luma/Kling/Sora (verify) video TO REMOVE if exists
OpenAI/Anthropic (verify) chat TO REMOVE if exists
Gemini (AI Studio) see audit text/code MIGRATE → Vertex
Gemini (Vertex) lib/veo/ video KEEP + extend
Imagen (verify) image KEEP / migrate
Veo lib/veo/ video KEEP (ONLY)
Lyria (verify) music KEEP / add
ElevenLabs (verify) voice KEEP
Video providers — exhaustive:
file path, SDK package, env var, call sites, Focus Modes.
Note: /api/replicate/photo per hand-off doesn't exist — verify.
ENV VAR INVENTORY
Env Var Where Status
GEMINI_API_KEY all Google AI KEEP (fallback)
GEMINI_VEO_ENABLED video KEEP
GCP_PROJECT_ID not set ADD (Phase 1)
GCP_VEO_BUCKET not set ADD
GCP_VEO_LOCATION not set ADD
GCP_PROJECT_NUMBER not set ADD (WIF)
GCP_SERVICE_ACCOUNT_EMAIL not set ADD (WIF)
GCP_WORKLOAD_IDENTITY_POOL_ID not set ADD (WIF)
GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID not set ADD (WIF)
GCP_SERVICE_ACCOUNT_KEY not set ADD (alt)
VEO_TRANSPORT not set ADD
GEMINI_TRANSPORT not set ADD (Phase 2)
VEO_VERTEX_PERSON_GENERATION not set ADD (opt)
NEXT_PUBLIC_SUPABASE_URL supabase KEEP
NEXT_PUBLIC_SUPABASE_ANON_KEY supabase KEEP
SUPABASE_SERVICE_ROLE_KEY supabase KEEP
SUPABASE_ACCESS_TOKEN supabase KEEP
ELEVENLABS_API_KEY voice KEEP (verify)
SANDBOX_API_KEY sandbox ADD (Part 2)
Verify:
· legacy provider env vars
· client bundle secret exposure
· NEXT_PUBLIC_ prefix misuse
AUDIT REPORT FORMAT
```
CURRENT STATE
-------------
Working:
Partially implemented:
Missing:
Broken:
Files to modify:
Files to add:
Risks:
VERTEX SCOPE:
- Files calling AI Studio directly: <count>
- Files using lib/veo/ Vertex transport: <count>
- Files needing migration: <list>
MODEL SELECTOR SCOPE:
- Selector components found: <count>
- Files with hardcoded models: <list>
- Forbidden models found: <list or "none">
- Retired models found: <list or "none">
ONE-WINDOW COMPLIANCE:
- Violations found: <list or "none">
API PROVIDERS:
- To keep / To remove / To add
ENV VARS:
- To keep / To remove / To add
VIDEO PIPELINE CURRENT STATE:
- Orchestrator / Agent / Prompt flow
- Reference image / seed
- Shot List concept
- Consistency
```
FOUNDATION TYPED CONTRACTS
6.1. AgentEvent
```typescript
type AgentEvent =
| { type: "status"; message: string }
| { type: "tool_call"; tool: string; input: unknown }
| { type: "tool_result"; tool: string; output: unknown }
| { type: "command_output"; stream: "stdout"|"stderr"; data: string }
| { type: "file_changed"; path: string }
| { type: "browser_event"; action: string; target?: string }
| { type: "media_event";
capability: "image"|"video"|"music"|"voice"|"avatar";
provider: "google"|"elevenlabs";
status: "queued"|"generating"|"finalizing"|"done"|"failed";
progress?: number }
| { type: "voice_event";
stage: "listening"|"transcribing"|"final";
provider: "browser"|"google";
text?: string }
| { type: "video_shot_event";
storyboardId: string; shotId: string;
shotIndex: number; totalShots: number;
stage: "queued"|"generating"|"finalizing"|"done"|"failed";
progress: number; error?: ShotError }
| { type: "vertex_transport_event";
service: string;
transport: "vertex"|"gemini_api";
status: "selected"|"not_configured"|"failed" }
| { type: "model_selected_event";
focusMode: AgentCapability;
modelId: string;
catalogVersion: string }
| { type: "approval_required"; action: string; risk: string }
| { type: "error"; message: string }
| { type: "completed" }
```
6.2. AgentCapability
```typescript
type AgentCapability =
| "code" | "terminal" | "browser" | "search" | "files"
| "media" | "voice" | "avatar" | "stt"
| "video_storyboard"
```
6.3. AgentToolDefinition
```typescript
type AgentToolDefinition = {
name: string
capability: AgentCapability
provider: "google"|"elevenlabs"|"sandbox"|"browser"|"internal"
inputSchema: unknown
riskLevel: "low"|"medium"|"high"
requiresApproval: boolean
}
```
6.4. ApprovalRequest — generic
6.5. TaskState
```typescript
type TaskState =
| "queued"|"planning"|"running"|"waiting_for_approval"
| "paused"|"repairing"|"verifying"
| "completed"|"failed"|"cancelled"
| "waiting_for_shot_decision"
```
7. ModelCatalog — Section D
8. GeminiTransport contract
```typescript
type GeminiTransportKind = "vertex" | "gemini_api"
interface GeminiTransport {
readonly kind: GeminiTransportKind
generateContent(input): Promise<Output>
streamGenerateContent(input): AsyncIterable<Chunk>
synthesizeSpeech?(input): Promise<Output>
generateImage?(input): Promise<Output>
openLiveSession?(input): Promise<LiveSession>
checkConfiguration(): { ok: boolean; missing: string[] }
}
interface GeminiTransportSelector {
select(): GeminiTransport
selectFixed(kind): GeminiTransport // throws NotConfiguredError
}
class NotConfiguredError extends Error {
code = "not_configured"
missingVars: string[]
transportKind: GeminiTransportKind
}
type VertexTransportConfig = {
projectId, projectNumber, location,
serviceAccountEmail, workloadIdentityPoolId,
workloadIdentityPoolProviderId,
serviceAccountKey?
}
```
9. Video Pipeline contracts (V1-V6)
```typescript
type Shot = {
id: string; order: number; description: string;
prompt: string; // byte-for-byte (V3)
negativePrompt?: string;
referenceImage?: string; seed?: number;
durationSeconds: number; aspectRatio: string; quality: string;
cameraMotion?: string; notes?: string;
}
type ConsistencyLock = {
seed?: number; characterReference?: string;
styleReference?: string; aspectRatio: string;
enforceAcrossShots: boolean; // must be true
}
type Storyboard = {
id: string; title: string;
totalDurationSeconds: number;
shots: Shot[]; consistencyLock: ConsistencyLock;
createdAt: string;
createdBy: "user"|"agent_planner"|"imported";
approvedByUser: boolean;
}
type FrozenStoryboard = Storyboard & {
readonly __frozen: true; readonly frozenAt: string;
}
type ShotError = {
shotId: string;
reason: "prompt_safety"|"invalid_dimension"|"invalid_duration"
| "rate_limit"|"reference_image_issue"|"seed_conflict"
| "veo_internal"|"unknown";
message: string; retryable: boolean;
veoRawResponse?: string;
}
type ShotProgressEvent = {
storyboardId: string; shotId: string;
shotIndex: number; totalShots: number;
stage: "queued"|"generating"|"finalizing"|"done"|"failed";
progress: number; error?: ShotError;
}
interface VideoDirector {
planStoryboard(input): Promise<Storyboard>
freeze(storyboard): FrozenStoryboard
executeStoryboard(
storyboard, onProgress, cancellation
): Promise<VideoPipelineOutput>
}
interface VideoGenProvider {
readonly providerName: "google_veo" // literal
generateShot(input, cancellation?): Promise<ShotGenerationResult>
}
type ShotGenerationResult =
| { ok: true; clipUrl: string; metadata: ShotMetadata }
| { ok: false; error: ShotError }
type VideoPipelineInput = {
storyboard: FrozenStoryboard;
params: VideoParams;
cancellation?: CancellationToken;
}
type VideoPipelineOutput = {
storyboardId: string;
clips: Clip[];
finalVideoUrl?: string;
errors: ShotError[];
completedAt: string;
}
```
10. Provider Boundary Interfaces
```typescript
interface CodingModelProvider {
generate(input): Promise<Output>
stream(input): AsyncIterable<Chunk>
}
interface MediaProvider {
generateImage(input): Promise<Output>
generateMusic(input): Promise<Output>
}
interface VoiceProvider {
synthesize(input): Promise<Output>
lipsync(input): Promise<Output>
}
interface SpeechToTextProvider {
startSession(opts): STTSession
}
interface BrowserProvider {
createSession(...); navigate(...); snapshot(...);
click(...); type(...); select(...); press(...);
screenshot(...); close(...)
}
```
11. PRICING_CONFIG
```typescript
type PricingUnit =
| "per_request"|"per_second"|"per_image"
| "per_character"|"per_10_seconds"|"per_shot"|"free"
type PricingEntry = {
capability: AgentCapability
provider: "google"|"elevenlabs"|"sandbox"
unit: PricingUnit
priceUSD: number
enabled: boolean
notes?: string
}
type PricingConfig = {
entries: PricingEntry[]
currency: "USD"
updatedAt: string
}
```
12. Tool Registry + Routing skeleton
DELIVERABLES
1. Current State report
2. Vertex Migration Scope
3. Model Selector Scope
4. API Provider Inventory
5. Video Provider Inventory
6. Env Variable Inventory
7. Vertex Transport Audit
8. Previous Claude Work summary
9. Video Pipeline Current State
10. One-Window Compliance Audit
11. Files added (contracts + interfaces + skeleton)
12. Files modified (minimal)
13. Handoff report: docs/handoffs/part-1-report.md
REPORT FORMAT
```
1. Current State (audit)
2. Vertex Migration Scope
3. Model Selector Scope
4. Vertex Transport Audit
5. One-Window Compliance Audit
6. API Provider Inventory
7. Video Provider Inventory
8. Env Variable Inventory
9. Previous Claude Work
10. Video Pipeline Current State
11. Completed in Part 1
12. Files Added (exact paths)
13. Files Modified (exact paths)
14. Foundation Contracts
15. Build/Typecheck/Lint/Jest Status
16. Handoff to Part 2
17. Known Limitations
```
არ ჩაწერო PASS თუ არ გაგიშვია.
FINAL COMMAND
```
1. Read STATE TRACKER — confirm current phase = Part 1
2. Read Section 0, A, B, C, D, E
3. Run audit
4. Compile inventories
5. Create foundation contracts
6. Run typecheck/lint/jest (verify baseline)
7. Write docs/handoffs/part-1-report.md
8. Update STATE TRACKER:
- Part 1: complete
- Part 2: in progress
- NEXT ACTION: Part 2 — Vertex Migration
9. Automatically proceed to Part 2 (unless blocker)
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PART 2 — VERTEX MIGRATION + PROVIDER CLEANUP + MODEL CATALOG
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MISSION
(ა) Vertex AI migration (Phase 1: Veo env; Phase 2: chat/TTS/image;
Phase 3: Live WS)
(ბ) Strict provider cleanup
(გ) Video pipeline legacy removal + stubs
(დ) ModelCatalog implementation + UI wiring
(ე) Env vars + dependencies cleanup
PHASE 0 VERIFICATION (CRITICAL — STOP-1)
At Part 2 start, verify owner completed Phase 0:
· $300 credit attached
· APIs enabled
· GCS bucket created
· Service account with roles
· WIF configured OR SA JSON key
თუ Phase 0 არ დასრულებულა:
```
STOP. Do not proceed.
Write: "OWNER ACTION REQUIRED — Part 0 not complete"
List exact missing steps
Wait for owner
```
OBJECTIVE A1 — PHASE 1: VEO VERTEX (ENV ONLY)
Code ready in lib/veo/.
Owner must:
1. Vercel → Production env: GCP_* vars + VEO_TRANSPORT=vertex
2. REDEPLOY
Agent verifies:
· VEO_TRANSPORT=vertex wired
· veoTransport() returns correctly
· not_configured error flow works
· Provides env var list (names only) to owner
Test:
· 8-second test clip
· Verify Billing: credit deducted
· Verify logs: Vertex transport used
OBJECTIVE A2 — PHASE 2: CHAT/TTS/IMAGE TO VERTEX
15 production files + 8 @ai-sdk/google files.
Strategy:
1. Generalize lib/veo/vertexAuth.ts → lib/vertex/auth.ts
2. Generalize veoTransport() pattern → lib/gemini/transport.ts
· GEMINI_TRANSPORT=vertex|gemini_api
3. Install @ai-sdk/google-vertex
4. Migrate product chat (lib/ai/google/models.ts)
5. Migrate REST modules service-by-service:
· lib/ai/* (4)
· lib/gemini
· lib/research, lib/memory, lib/system, lib/security
· app/api/tts/gemini, app/api/health/services
· Pattern:
```
generativelanguage.googleapis.com/v1beta/models/{m}:generateContent?key=X
→
https://{location}-aiplatform.googleapis.com/v1/projects/{project}/locations/{location}/publishers/google/models/{m}:generateContent
```
6. Each service has jest test
7. NO silent fallback (R7)
Model IDs verification:
· Each model ID must be verified in Vertex Model Garden
· For this project and region
· Preview models may be global-only
OBJECTIVE A3 — PHASE 3: LIVE VOICE WEBSOCKET
Files:
· lib/voice/geminiLive.ts
· lib/voice-v2v
· app/api/voice/live
Vertex Live API:
· Different endpoint
· Different auth (Bearer, not key)
· Different session model
Steps:
1. Study Vertex Live API contract
2. Add Live transport to GeminiTransport
3. Implement VertexLiveSession
4. Short session test (5-10 sec)
5. Verify cancellation, error handling
6. NOT silent fallback (R7)
თუ ვერ სრულდება Part 2-ში:
· Write exact failure reason
· Mark as explicit "Phase 3 — not complete"
· Proceed with Part 3 (Part 3 not Vertex-centric)
OBJECTIVE B1 — PROVIDER CLEANUP
Remove:
· Udio, HeyGen, Replicate (API client, routes, Focus Mode,
Params Sheet, env vars, deps)
· Runway / Pika / Luma / Kling / Sora (same)
· ყველა სხვა 3rd-party
Migrate — Google Media Provider:
· generateImage → Google Imagen (Vertex preferred)
· generateMusic → Google Lyria (Vertex preferred)
· generateVideo → deprecated (use VideoDirector + VideoGenProvider)
Migrate — ElevenLabs Voice Provider:
· synthesize (TTS), lipsync
Focus Mode migration:
· web / text / code → Gemini (Vertex preferred)
· image → Imagen (Vertex preferred)
· video → deprecated; Part 3 rebuild; placeholder
· music → Lyria (Vertex preferred)
· voice → ElevenLabs
· avatar → ElevenLabs
· canvas → dependent
Video Focus Mode placeholder:
```
"[VIDEO] ახალი Storyboard-driven pipeline მზადდება.
Part 3-ში დასრულდება. ამჟამად video generation დროებით გამორთულია."
```
Agent migration:
· 6 agents → provider field = "google"|"elevenlabs"|"sandbox"|"browser"|"internal"
OBJECTIVE B2 — VIDEO PIPELINE LEGACY + STUBS
1. If legacy video code exists → remove
2. GoogleVeoProvider stub (thin wrapper over lib/veo/engine.ts,
OR throws "Part 3")
3. VideoDirector stub (throws "Part 3")
4. Storyboard UI placeholder in /video
5. Grep audit: no legacy video provider names
OBJECTIVE B3 — ENV + DEPENDENCY CLEANUP
Env vars — Remove:
· UDIO_API_KEY, HEYGEN_API_KEY, REPLICATE_API_KEY
· RUNWAY_API_KEY, PIKA_API_KEY, LUMAAI_API_KEY, KLING_API_KEY
· All legacy keys
Env vars — Keep/Add:
· GEMINI_API_KEY, ELEVENLABS_API_KEY, SANDBOX_API_KEY
· GCP_PROJECT_ID, GCP_VEO_BUCKET, GCP_VEO_LOCATION
· WIF four vars OR GCP_SERVICE_ACCOUNT_KEY
· VEO_TRANSPORT, GEMINI_TRANSPORT
· VEO_VERTEX_PERSON_GENERATION (optional)
Dependencies — Remove:
· udio / heygen / replicate SDK
· runway / pika / luma / kling SDK
Dependencies — Add:
· @ai-sdk/google-vertex
Run: install / typecheck — confirm no regressions.
OBJECTIVE C — FOUNDATION WIRING
· C1. Vertex transport in orchestrator (with events)
· C2. VideoDirector + GoogleVeoProvider stubs wired
· C3. Storyboard UI placeholder
OBJECTIVE D — MODEL CATALOG IMPLEMENTATION
D1. ModelCatalog:
· lib/models/catalog.ts (or repo convention)
· Entries per Section D1
· Each: id, label, provider="google", family, capabilities,
focusModes, transport, enabled
D2. Runtime verification:
· lib/models/verify.ts
· Fetch AI Studio / Vertex current model list
· Compare with ModelCatalog
· Not available → enabled=false + log
· Available not in catalog → review queue, NOT auto-add
· Cache (short TTL)
D3. Remove hardcoded model strings:
· Per Part 1 audit
· All hardcoded model IDs → ModelCatalog reference
D4. Wire UI Model Selectors:
· Params Sheet dropdowns → ModelCatalog
· Group by family
· Filter by Focus Mode
· Friendly label
· Preview models labeled
· No emojis/gradients
· User's saved preference: if missing → explicit message
D5. Remove forbidden / retired:
· OpenAI / Anthropic / Midjourney / SD / Flux / DALL·E /
Cohere / Mistral / Llama / xAI / DeepSeek / Grok
· Gemini 1.5 / 1.0 (retired)
· Hardcoded strings not in ModelCatalog
D6. Tests:
· ModelCatalog validation (jest)
· Grep test: no forbidden names
· UI test: dropdowns feed from catalog
· Runtime verification test (mock AI Studio)
BILLING ISOLATION
```
Vertex AI (Gemini, Imagen, Veo, Lyria) → $300 credit covered
Gemini Developer API (fallback only) → separate, NOT covered
ElevenLabs → separate
Sandbox → separate
Vercel, Supabase → infrastructure
```
API ROUTE
/api/gemini-terminal:
```
POST → Auth → Validate → Session → Orchestrator →
Coding Agent → Gemini (Vertex preferred) → Tools → Sandbox → Stream
```
STREAMING EVENT CONTRACT
Use Part 1's AgentEvent. All events go through.
TERMINAL UI (/terminal)
· dark surface, monospace
· streaming statuses, tool calls, file changes
· command output, errors, completion
· auto-scroll, Stop, mobile support
· Shows vertex_transport_event as status line:
```
"● Using Vertex AI transport"
"● Using Gemini Developer API (fallback)"
```
LIVE CHAT + VOICE + TERMINAL = SAME CONTEXT
· Conversation context preserved
· Voice Mode → coding task → same context
SELF-CRITIQUE
```
PLAN → INSPECT → IMPLEMENT → TEST → REVIEW → REPAIR → TEST → VERIFY
```
CONTEXT / CANCELLATION / IDEMPOTENCY / COST / PERFORMANCE
[Full details as previous]
PRESERVE EXISTING FUNCTIONALITY
· Chat, Live Chat, Voice Mode
· Agent G, agents, orchestrator
· streaming, Canvas
· /web /image /music /avatar /voice
· Focus Modes, @mention, auth
· media generation (Vertex + ElevenLabs)
· Library, deployment
· 9 tracked Supabase migrations, RLS
· myavatar.ge aliases
· Baseline: 613 suites, 9784 passed
/video — placeholder (Part 3 completes).
BUILD VERIFICATION
```
install, typecheck, lint, jest (9784 baseline), build
```
NO FAKE SUCCESS
If any of:
· Vertex transport broken
· Phase 1 verification failed
· Phase 2 partial
· Phase 3 partial (OK if explicit)
· Silent fallback anywhere (R7 violation)
· Legacy provider trace
· Forbidden model in UI (R9 violation)
· Hardcoded models outside ModelCatalog
· Jest baseline broken
→ Do not say "Done". Write exactly what failed.
DELIVERABLES
A. Vertex migration:
1. Phase 1: Veo Vertex verified
2. Phase 2: chat/TTS/image migrated
3. Phase 3: Live voice — status
4. lib/vertex/auth.ts (generalized)
5. lib/gemini/transport.ts (generalized)
6. @ai-sdk/google-vertex installed
B. Provider cleanup:
7. All legacy removed
8. GoogleMediaProvider (Imagen / Lyria)
9. ElevenLabsVoiceProvider
10. Focus Mode migration
11. Agent migration
12. Env var cleanup
13. Dependency cleanup
C. Foundation wiring:
14. Vertex transport in orchestrator
15. GoogleVeoProvider stub
16. VideoDirector stub
17. Storyboard UI placeholder
D. Model Catalog:
18. ModelCatalog implementation
19. Runtime verification
20. Hardcoded removal
21. UI wiring
22. Forbidden / retired removed
Handoff:
· docs/handoffs/part-2-report.md
REPORT FORMAT
```
1. Part 1 Reconciliation
2. Phase 0 Verification
3. Vertex Phase 1 (Veo)
4. Vertex Phase 2 (chat/TTS/image)
5. Vertex Phase 3 (Live) — status
6. Provider Cleanup
7. Video Legacy Removal + Stubs
8. Model Catalog Implementation
9. Foundation Wiring
10. Files Added / Modified / Deleted
11. Dependencies Removed / Added
12. Vertex Transport Architecture
13. ModelCatalog Architecture + Runtime Verification
14. Env Variables (final list)
15. Grep Audit (providers + models)
16. Build/Typecheck/Lint/Jest Status
17. Handoff to Part 3
18. Known Limitations
```
FINAL COMMAND
```
1. Read STATE TRACKER — confirm current phase = Part 2
2. Read Section 0, A, B, C, D, E
3. Read docs/handoffs/part-1-report.md
4. Verify Phase 0 (STOP-1 if not complete)
5. Execute Phase 1 (Veo verification)
6. Execute Phase 2 (chat/TTS/image migration)
7. Attempt Phase 3 (Live) — or document
8. Provider cleanup + video legacy removal + stubs
9. ModelCatalog implementation + runtime verification + UI wiring
10. typecheck / lint / jest / build
11. Grep audit (providers + models)
12. Write docs/handoffs/part-2-report.md
13. Update STATE TRACKER:
- Part 2: complete
- Part 3: in progress
- NEXT ACTION: Part 3 — Video Pipeline Rebuild
14. Automatically proceed to Part 3 (unless blocker)
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PART 3 — VIDEO PIPELINE REBUILD + BROWSER + SECURITY + TESTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MISSION
(ა) VIDEO PIPELINE REBUILD (V1-V6) — PRIORITY 1
(ბ) Browser readiness
(გ) Provider boundary verification
(დ) Model Catalog verification
(ე) Full security review
(ვ) Full test suite
(ზ) Verification Report
OBJECTIVE A — VIDEO PIPELINE REBUILD (V1-V6)
V1: Google Engine Only
· GoogleVeoProvider — full implementation:
· providerName: "google_veo" (literal)
· generateShot() — Veo API call
· Prompt → byte-for-byte (V3)
· Reference image → Veo field
· Seed → Veo seed
· Duration/aspect/quality
· Error → ShotError (V5)
· Cancellation
· Thin wrapper over lib/veo/engine.ts
· No other VideoGenProvider implementations
V2: Strict Storyboard Execution
· VideoDirector — full implementation:
· planStoryboard(): LLM (Gemini via Vertex) builds draft
· freeze(): immutable, frozenAt recorded
· executeStoryboard(): sequential, no skip/add/reorder
· Validation before freeze
· Storyboard UI in /video:
· Step 1: user input
· Step 2: planStoryboard() → draft shown
· Step 3: user reviews/edits manually
· Step 4: "Approve & Generate" → freeze → execute
· Step 5: live progress
· Step 6: result
· UI label: "Shot List is locked after approval. AI will not
modify your scenes, characters, or prompts."
V3: Direct Prompt Integration
· Shot.prompt → Veo API byte-for-byte
· Forbidden: improve, rephrase, translate, expand, truncate, decorate
· Enforcement: immutable after freeze
· Unit test: prompt in === prompt out
V4: Consistency Guarantee
· Seed: ConsistencyLock.seed → global; Shot.seed overrides
· Reference: ConsistencyLock.characterReference → global;
Shot.referenceImage overrides
· Style consistency via planStoryboard
V5: Error Handling Per Shot
· ShotError mapping (8 reasons)
· Execution halt on error
· TaskState → waiting_for_shot_decision
· User: retry / edit / cancel
· NO skip, NO auto-fix
V6: No Silent Deviation
· Guarantees enforced by code + tests
· Test: 3-shot storyboard, seed, reference → verify V6
OBJECTIVE B — BROWSER AUTOMATION
BrowserProvider implementation (minimum viable).
Session model:
· user-scoped, task-scoped or persistent
· isolated, auditable, cancellable, expirable
· cookies/localStorage/login stored securely
· credentials not plaintext
Domain policy: allowed / blocked / approval-required
Prompt injection defense:
· webpage = untrusted
· tool instructions = trusted only from system/tool layer
· secret isolation, domain policy, action policy, approval,
browser isolation, injection detection
Browser safety:
· high-risk: purchases, payment, transfers, account deletion,
password changes, publishing, messages, legal, security settings,
permissions, destructive actions
· flow: Plan → Show → User approval → Execute → Verify
Browser events → Agent G Live:
· Use AgentEvent: "browser_event"
Gemini Computer Use:
· Google ecosystem (Section A)
· Architecture: Agent G → Computer Use Model → Browser Adapter →
Sandboxed Browser → Page
· NO second AI brain
Playwright / MCP:
· accessibility snapshot preferred
· existing browser sessions support
· native adapter or MCP
OBJECTIVE C — PROVIDER BOUNDARY VERIFICATION
C1. GREP AUDIT
· "udio", "heygen", "replicate"
· "runway", "pika", "luma", "kling", "sora"
· "openai", "anthropic", "stability"
· All 3rd-party from Part 1 inventory
· Each match: removed or documented exception
· Video providers — strictest. Any non-Google video provider trace = FAIL
C2. VIDEO PROVIDER ALLOWLIST
Runtime assertion: video outbound → only:
· googleapis.com / generativelanguage.googleapis.com / aiplatform
· Veo endpoints
Other domain → error (not silent)
C3. VideoGenProvider COUNT
Exactly 1: GoogleVeoProvider
C4. VIDEO PIPELINE ARCHITECTURE
All wired: VideoDirector, Storyboard, Shot,
ShotProgressEvent → AgentEvent, ShotError
C5. ENV VAR VERIFICATION
Only final list remains
C6. DEPENDENCY VERIFICATION
No legacy SDK packages
C7. UI VERIFICATION
No legacy provider names in UI
C8. VERTEX TRANSPORT VERIFICATION
· All migrated services use lib/vertex/auth.ts OR
lib/veo/vertexAuth.ts
· No silent fallback
· not_configured errors explicit
C9. MODEL CATALOG VERIFICATION
· ModelCatalog validation
· Grep audit: no forbidden models
· UI verification: dropdowns feed from catalog
· Runtime verification
ყველა verification უნდა გაიაროს. თორემ Part 3 არ ითვლება.
OBJECTIVE D — FULL SECURITY REVIEW
Code execution: sandbox isolation, traversal protection,
command policy, secret isolation
Browser: session isolation, prompt injection, domain policy,
approval, credential protection
Agent: tool authorization, bounded loops, cancellation, idempotency
Provider boundary: §C verification, runtime allowlist,
outbound domain check
Media/voice providers: API key server-side, request/response
sanitization, Params Sheet injection, cost/quota limits
Vertex: bearer/WIF token not logged; not_configured errors do
not leak secrets; no silent fallback (R7)
Video pipeline: prompt immutability, seed/reference consistency,
shot order preservation, no silent deviation
Model Catalog: no forbidden models in UI/code; runtime verification;
no silent substitution
OBJECTIVE E — FULL TEST SUITE
Unit:
· path/file/command validation, approval, model config, event schema
· browser action validation
· provider boundary validation
· media/voice input validation
· pricing config validation
· Video V1-V6 tests
· Vertex transport tests
· Model Catalog tests
Integration:
· Gemini (Vertex), tool calling, streaming, sandbox, API,
session, approval
· GoogleMediaProvider (Imagen / Lyria)
· ElevenLabsVoiceProvider
· browser (if wired)
· provider boundary runtime assertion
· video pipeline end-to-end (mock Veo)
E2E:
· Test 1-21 as detailed in prior specs
Baseline: jest 9784 passed preserved
BROWSER ARCHITECTURE TEST
[Per prior spec]
BILLING ISOLATION VERIFICATION
[Per prior spec]
BUILD
```
install, typecheck, lint, jest (9784 baseline), build
```
NO FAKE SUCCESS
If V1-V6 fail → no "Done"
If jest baseline broken → no "Done"
If provider boundary fails → no "Done"
If forbidden model in UI → no "Done"
VERIFICATION REPORT FORMAT
```
1. Current State
2. Part 1 + 2 Reconciliation
3. Completed in Part 3
4. Files Changed / Added / Deleted
5. Video Pipeline Rebuild (V1-V6 status each)
6. Browser Readiness
7. Provider Boundary Verification
8. Model Catalog Verification
9. Security Review
10. Testing Results:
Typecheck, Lint, Jest baseline, Unit, Integration, E2E, Build,
Security, Provider boundary, V1-V6, Vertex transport,
Model Catalog — each PASS/FAIL
11. Environment Variables (final)
12. Billing Isolation
13. Handoff to Part 4
14. Known Limitations
```
HANDOFF TO PART 4
Include:
· Video pipeline state (V1-V6 wired + tested)
· Storyboard UI in /video
· Voice STT implementation current state
· Loading UI inventory
· PRICING_CONFIG state
· Params Sheet state
· Generate button state
· ModelCatalog state
· Vertex migration status (Phase 3)
· One-Window compliance state
· Known risks for Part 4
FINAL COMMAND
```
1. Read STATE TRACKER — confirm current phase = Part 3
2. Read Section 0, A, B, C, D, E
3. Read docs/handoffs/part-2-report.md
4. Video Pipeline Rebuild (V1-V6) — FIRST PRIORITY
5. Browser architecture (extend)
6. BrowserProvider implementation
7. Browser session / domain / safety
8. Browser events in Agent G Live
9. Provider Boundary Verification — blocker
10. Model Catalog Verification — blocker
11. Security review
12. Full tests
13. typecheck / lint / jest / build
14. Verify baseline preserved (9784)
15. Write docs/handoffs/part-3-report.md
16. Update STATE TRACKER:
- Part 3: complete
- Part 4: in progress
- NEXT ACTION: Part 4 — Production Polish
17. Automatically proceed to Part 4 (unless blocker)
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PART 4 — PRODUCTION POLISH + FINAL REPORT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MISSION
(ა) Voice STT fix
(ბ) Unified Loading UX (single + multi-shot)
(გ) Dynamic Pricing UI (per-model)
(დ) Full E2E production tests
(ე) Final Production Report
OBJECTIVE A — VOICE STT FIX
Problem: latency + truncation.
1. Use SpeechToTextProvider interface (Part 1)
2. If Web Speech API:
· continuous = true
· interimResults = true
· error handling ("no-speech", "network", "aborted")
· auto-restart until user stops
· guards: no infinite restart loop
· onend → onerror → auto-restart loop
3. If server-side (Google Cloud STT):
· chunking 100-250ms
· timeout logic
· latency < 500ms
· reconnection
· error recovery
4. Visual feedback:
· pulsing animation on mic button
· waveform / level meter
· "listening" state
· interim transcript live
5. AgentEvent voice_event:
· stage: "listening" | "transcribing" | "final"
· provider: "browser" | "google"
· text: partial/final
6. Test: 30+ sec with pauses
Consideration: Google Cloud STT is on Vertex/Cloud — billing
covered by $300. Web Speech API is browser-native (free).
Prefer Google Cloud STT IF $300 coverage matters.
OBJECTIVE B — UNIFIED LOADING UX
1. UnifiedGenerationCard component
2. Remove old, duplicated loading screens
3. Features:
· Shimmer / Skeleton
· Live stages
· Cancel / Stop
· Progress bar from AgentEvent
· Error state
· Success state
4. Premium design per DESIGN.md
Two modes:
Mode 1 (single-generation: image/music/voice/avatar):
· Uses media_event
· Standard progress bar
Mode 2 (multi-shot: video V1-V6):
· Uses video_shot_event
· Shows: Total shots, Current shot, Stage, Progress
· Cancel → cancels entire storyboard
· Mini-status:
```
✓ Shot 1 — done
✓ Shot 2 — done
● Shot 3 — generating (45%)
Shot 4 — queued
Shot 5 — queued
```
5. Test: 4 media types → same card
OBJECTIVE C — DYNAMIC PRICING UI
Critical (R5): Price on button = route's actual deduction.
SSoT: lib/credits/quote.ts. Fake numbers = FORBIDDEN.
1. Integration with lib/credits/quote.ts:
· PRICING_CONFIG = UI display
· Verify against lib/credits/quote.ts
· If discrepancy → quote.ts wins
2. PricingCalculator:
· calculatePrice(capability, params) → { amount, currency, breakdown }
· Video: Storyboard → total = Σ(shot.durationSeconds × rate)
or shots × per_shot_rate
· Per-model pricing: Veo 3 Fast vs Veo 3 standard vs Veo 3 Lite;
Imagen 4 Ultra vs Imagen 4 vs Imagen 4 Fast; Lyria 3 Pro vs Clip
· Price updates when model changes in ModelSelector
3. Generate button dynamic price:
```
[ ✨ Generate Video (5 shots, Veo 3 Fast, ~$1.50) ]
[ ✨ Generate Image (Imagen 4 Fast, ~$0.02) ]
[ ✨ Generate Music (Lyria 3 Clip, ~$0.15) ]
[ ✨ Generate Voice (Gemini 3.8 Flash TTS, ~$0.05) ]
```
4. Credits balance (if exists):
· Header / Profile visualization
· Sufficient → enabled
· Insufficient → disabled + "Top up"
5. Test:
· Change duration, model, shots, text length, count
· Verify against lib/credits/quote.ts
TESTING
· Voice STT Test
· Video Pipeline + Loading Integration
· Unified Loading UX
· Pricing (incl. model change)
· Regression (full)
BUILD
```
install, typecheck, lint, jest (9784 baseline), build
```
NO FAKE SUCCESS
If any of A, B, C not fully done → no "Done"
If pricing ≠ route deduction → no "Done"
If forbidden model in UI → no "Done"
FINAL PRODUCTION REPORT FORMAT
```
1. Current State
2. Part 1 + 2 + 3 Reconciliation
3. Completed in Part 4
4. Voice STT Fix
5. Unified Loading UX
6. Dynamic Pricing Logic
7. Files Changed / Added / Deleted
8. Final Architecture
9. Vertex AI (Phase 1/2/3 + transport + billing)
10. Google Media
11. Video Pipeline (V1-V6)
12. ElevenLabs
13. Terminal / Sandbox / Browser Readiness
14. Provider Boundary Verification
15. Model Catalog (final)
16. Security Review
17. Testing Results (each PASS/FAIL)
18. Environment Variables (final)
19. Google Cloud / Billing
20. Manual steps
21. Known Limitations
```
FINAL COMMAND
```
1. Read STATE TRACKER — confirm current phase = Part 4
2. Read Section 0, A, B, C, D, E
3. Read docs/handoffs/part-3-report.md
4. Voice STT fix
5. Unified Loading UX (single + multi-shot)
6. Dynamic Pricing UI (per-model, verified against quote.ts)
7. Video + Loading integration test
8. Regression tests
9. typecheck / lint / jest / build
10. Verify jest baseline preserved (9784)
11. Final Provider Boundary re-verification
12. Final Model Catalog re-verification
13. Write docs/handoffs/part-4-report.md
14. Update STATE TRACKER:
- Part 4: complete
- Part 5: in progress
- NEXT ACTION: Part 5 — Post-Build Browser Verification
15. Automatically proceed to Part 5
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PART 5 — POST-BUILD BROWSER VERIFICATION & ONE-WINDOW REFINEMENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MISSION
Core build (Parts 1-4) დასრულების შემდეგ, agent გადადის ავტონომიურ
verification + refinement loop-ში. მიზანია production-ready,
One-Window compliant, visually polished MyAvatar.ge.
OBJECTIVE A — LIVE SITE VERIFICATION
A1. Deploy verification:
· Check deployment status: vercel ls (or equivalent)
· Confirm production URL: https://www.myavatar.ge
· Confirm aliases: myavatar.ge, www.myavatar.ge
A2. Browser automation (accessibility snapshot + screenshot):
· Navigate to https://www.myavatar.ge
· Snapshot: page structure, accessibility tree
· Screenshot: visual capture
· Verify: page loads without errors
· Verify: no console errors
· Verify: no 404s
A3. Core flows — automated verification:
· Login flow
· Chat flow (send message → receive response)
· Focus Mode switching (all 9 modes)
· Params Sheet interaction
· Model Selector (from ModelCatalog)
· Generate button (image, video, music, voice)
· Cancel button
· Voice input (STT)
· Agent G Live stream visibility
· Unified Generation Card (single + multi-shot)
OBJECTIVE B — ONE-WINDOW COMPLIANCE AUDIT
For each verified flow, check:
```
[ ] User never leaves central interface
[ ] No popup/modal breaking context
[ ] Focus Mode switch = instant, in-place
[ ] Agent G Live always visible
[ ] Params Sheet inline
[ ] Unified Generation Card for all media
[ ] Voice/Terminal/Chat same context
[ ] Approval dialogs inline
[ ] Browser actions inline
[ ] No page reloads for mode switches
```
Report any violations with:
· Screenshot evidence
· Steps to reproduce
· Proposed fix
OBJECTIVE C — VISUAL QA
C1. Design compliance (DESIGN.md):
· Accent #338FE8 (black text on it) ✓
· True black background ✓
· Hairline borders ✓
· No gradient / glow / emoji ✓
· 16px inputs, 44px targets ✓
· ka/en/ru (Georgian first) ✓
C2. Responsive check:
· Desktop (1440×900)
· Tablet (768×1024)
· Mobile (390×844)
C3. Accessibility check:
· Keyboard navigation
· Screen reader (aria labels)
· Color contrast
· Focus indicators
OBJECTIVE D — FUNCTIONAL REGRESSION
D1. Provider boundary:
· Network tab: verify all outbound AI requests go to:
· Google (Vertex/aiplatform/generativelanguage)
· ElevenLabs
· Sandbox
· No legacy providers
D2. Video pipeline:
· Test Storyboard UI:
· Step 1: user brief
· Step 2: planStoryboard → draft
· Step 3: manual edit
· Step 4: Approve & Generate
· Step 5: shot-by-shot progress
· Step 6: results
· Verify V1-V6 invariants in live
D3. Vertex transport:
· Verify UI status line: "Using Vertex AI transport"
· If fallback → verify it's opt-in only
D4. Model Catalog:
· Open Model Selectors in all Focus Modes
· Verify dropdowns feed from ModelCatalog
· Verify no forbidden models
D5. Pricing:
· Change params (duration, model, shots)
· Verify price updates instantly
· Verify price matches actual deduction
OBJECTIVE E — ITERATIVE POLISH
For each violation found:
1. Document:
· What's wrong
· Evidence (screenshot)
· Impact (user-facing? cosmetic? functional?)
· Proposed fix
2. Prioritize:
· P0: Functional breakage (broken flow)
· P1: UX violation (One-Window break)
· P2: Visual polish
· P3: Edge cases
3. Fix:
· Follow DESIGN.md
· Follow Section A-E invariants
· Tests after fix
· Re-verify
4. Loop until stable:
· Max 3 iterations per violation
· If can't fix → report + escalate
OBJECTIVE F — PRODUCTION READINESS CHECKLIST
```
[ ] Live site loads without errors
[ ] All 9 Focus Modes functional
[ ] Agent G Live visible in all modes
[ ] Params Sheet inline
[ ] Model Selectors from ModelCatalog
[ ] No forbidden models in UI
[ ] Generate button dynamic price
[ ] Price matches route deduction
[ ] Voice STT works (no truncation, low latency)
[ ] Video Storyboard UI works (V1-V6)
[ ] Unified Generation Card (single + multi-shot)
[ ] Provider boundary verified (network tab)
[ ] Vertex transport active (status line)
[ ] One-Window compliance (no context break)
[ ] DESIGN.md compliance
[ ] Responsive (desktop/tablet/mobile)
[ ] Accessibility
[ ] No console errors
[ ] No 404s
[ ] No silent fallbacks (R7)
[ ] No legacy providers
[ ] Jest baseline 9784
[ ] TypeScript clean
[ ] ESLint clean
[ ] Build passes
```
DELIVERABLES
1. Live site verification report
2. One-Window compliance audit
3. Visual QA report
4. Functional regression report
5. Iterative polish log
6. Production readiness checklist (all green)
7. docs/handoffs/part-5-report.md
REPORT FORMAT
```
1. Live Site Verification
- Deployment status
- Load time
- Console errors
- 404s
2. One-Window Compliance
- Violations found
- Fixes applied
- Re-verification
3. Visual QA
- DESIGN.md compliance
- Responsive
- Accessibility
4. Functional Regression
- Provider boundary
- Video pipeline V1-V6
- Vertex transport
- Model Catalog
- Pricing
5. Iterative Polish Log
- P0/P1/P2/P3 items
- Fixes + re-verification
6. Production Readiness Checklist
7. Known Limitations
8. Final Verdict
- Production-ready? YES/NO
- One-Window compliant? YES/NO
- All invariants preserved? YES/NO
```
FINAL COMMAND
```
1. Read STATE TRACKER — confirm current phase = Part 5
2. Read Section 0, A, B, C, D, E
3. Read docs/handoffs/part-1..4-report.md
4. Verify deployment status
5. Browser automation: navigate, snapshot, screenshot
6. One-Window compliance audit
7. Visual QA
8. Functional regression
9. Iterative polish (fix violations, re-verify)
10. Production readiness checklist
11. Write docs/handoffs/part-5-report.md
12. Update STATE TRACKER:
- Part 5: complete
- FINAL STATE: production-ready
- NEXT ACTION: (awaiting owner review)
13. STOP. Report to owner. Do not proceed further without
explicit owner instruction.
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EXECUTION LOG (AGENT APPENDS HERE)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ AGENT: დაამატე entry ყოველი სესიის ბოლოს.
SESSION LOG FORMAT
```
### Session: [YYYY-MM-DD HH:MM]
Phase: [Part 0-5]
Status: [completed / blocked / partial]
Duration: [approx]
Work done:
- ...
Files changed:
- ...
Tests:
- typecheck: PASS/FAIL
- lint: PASS/FAIL
- jest: PASS/FAIL (baseline 9784)
- build: PASS/FAIL
Blockers:
- ...
Next session:
- ...
```
LOG
```
(empty — agent fills)
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FINAL GOAL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Agent G, რომელიც MyAvatar.ge-ის One-Window (Single-Pane)
conversational AI operating layer-ია:
Capabilities:
· Coding / Terminal / Secure sandbox execution
· Verification / Browser automation
· Storyboard-driven video (Google Veo ONLY, V1-V6)
· Production-grade media (Imagen / Lyria / ElevenLabs)
· Voice TTS + STT + Lipsync
· Research / Memory / System / Security
Transports:
· Vertex AI (preferred, $300 credit covered)
· Gemini Developer API (fallback, opt-in only, NOT covered)
· ElevenLabs (separate billing)
· Sandbox (separate billing)
UI — One-Window (Section E):
· User never leaves central interface
· All actions inline
· Strict Model Selector allowlist (Google AI Studio only)
· ModelCatalog = SSoT
· Dynamic pricing per selected model
· Unified Generation Card (single + multi-shot)
· Voice STT with auto-restart, no truncation
Invariants (unbreakable):
· V1-V6 (video pipeline)
· R1-R12 (repo rules)
· Section A (provider boundary)
· Section D (model allowlist)
· Section E (one-window)
Autonomy:
· Bounded, auditable, cancellable
· Approval-aware for high-risk actions
· No silent deviation, ever
Target: https://www.myavatar.ge — production-ready,
autonomous, one-window, invariants-preserved.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
END OF FILE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
This is the single source of truth for MyAvatar.ge v32.
Read at session start. Update at session end.
Autonomous execution. Invariants unbreakable.
