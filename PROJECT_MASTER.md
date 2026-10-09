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
CURRENT PHASE: Part 2 (Vertex Migration + Provider Cleanup) — Part 1 complete 2026-10-08 (docs/handoffs/part-1-report.md);
          Master Task §60 steps 1–25 done; step 26 held until the owner approved the deploy (2026-10-09 03:19:58Z)
CURRENT STATUS: Certification: NOT production ready (docs/handoffs/final-launch-certification.md, §57 block all NO / NOT PROVEN).
          DEPLOYED 2026-10-09: PR #42 merged into main as 9f1bff68 (03:28Z); Production serves 9f1bff6 (~03:36Z);
          public checks passed (certification §A); 20261008c (uploads 50 MB, media only) applied 03:38Z and verified.
          PR #46 (voice id check, avatars list by session) merged as 185b84d9 on the owner's "Deploy" (05:08:54Z);
          Production serves 185b84d (~05:15Z), public checks passed. PR #47 (avatars on user_id, editing jobs scoped to
          the caller) merged as 66d7163f on the owner's "Deploy" (05:38:07Z); Production serves 66d7163 (~05:44Z), public
          checks passed. 20261009a (function hardening) applied ~05:39Z on the owner's "გაუშვი"; advisor warnings 22 -> 2.
          PR #48 (/api/ai on Gemini, voice token for signed-in users, Upstash fast-fail, PR #43's Part 0 tooling, admin
          engine reports) merged as 7126682e on the owner's "Deploy + renders" (07:08:11Z); Production serves 7126682
          (~07:13Z), public checks passed; 20261009b (renders private) applied 07:14Z and read back. PR #49 (orbit agent
          404 and no Pollinations cover under Google-only, provider ratchet, ka/en/ru fixes) merged as 29e7d67b on the
          owner's "Deploy" (08:02:01Z); Production serves 29e7d67 (~08:07Z), public checks passed.
          2026-10-09 ~06:30Z engineering report + launch blocker matrix (owner, dependency, evidence, Definition of
          Done, fix order): docs/handoffs/2026-10-09-engineering-report.md. Verdict unchanged: NOT production ready.
LAST SESSION: 2026-10-09 (Claude, branch claude/launch-certification-wmvitt)
LAST COMMIT: see `git log` on that branch (main = 29e7d67b = Production since ~08:07Z, PR #49 merged 2026-10-09 08:02Z
          on the owner's "Deploy": ba74fa21 /api/orbit/agent 404 and music cover art off Pollinations under Google-only,
          provider-boundary ratchet test; 7c8dd9b3 ka/en/ru fixes + missing-key test; certification records);
          PRs #42, #45, #46, #47, #48 and #49 merged
NEXT ACTION: the fix order in docs/handoffs/2026-10-09-engineering-report.md §6. Agent G autonomous media & file
          execution (owner, 2026-10-09 09:32Z, critical), Section F: slice 1 (clips + music → MP4 in the chat) is
          BUILT_NOT_PROVEN on PR #50, behind AGENT_G_MEDIA_EXEC (off in Production); AG-8 needs a Preview run by an
          admin. Execution foundation (owner, 11:15Z; Section F-EF): durable lease queue, real cancel, refund outbox,
          typed tool allowlist and sandbox contract built on PR #50; phase-2 decisions (migration, sandbox host,
          worker host) in docs/handoffs/2026-10-09-agent-g-execution-foundation.md §5. URL-to-Audio (owner, 12:34Z;
          Section F-AU): link or upload → MP3 in the chat, text + Live Voice, platforms refused with an upload offer,
          BUILT_NOT_PROVEN on PR #50 (local real-internet + real-ffmpeg E2E passed); AU-8 = the same admin Preview run as
          AG-8. One Task API (EF-7, /api/tasks) BUILT_NOT_PROVEN on PR #50: the chat's job cards follow and stop
          jobs only through it. Loading cards (owner, 14:30Z): the owner's clip loops on the chat's loading tile and
          the progress card (components/studio/ui/LoadingLoop.tsx; poster only under reduced motion / Save-Data), PR #50.
          Supabase Auth review (2026-10-09, draft PR #51, not merged into this branch: draft PRs are never merged
          automatically) in BLOCKERS below. Owner actions in
          final-launch-certification.md §Y (Stripe Live refund/dispute events,
          BOG credentials / merchant activation (every Production BOG checkout failed at start),
          pricing table, browser infra, provider migration plan). Engineering: Part 2 in the order of part-1-report §16
          (Claude R7 slice ✓ → A2 transport ✓ → wrappers ✓ (embed, TTS, STT, orchestrator key pool; research pinned to
          the API key) → ModelCatalog data ✓ (lib/models, runtime check, admin report) → pickers on the catalog and
          PR #44's provider removals after action 9); Veo T1 passed 15:49Z, so A1 (Veo Production env) now waits only on
          the owner (a Production change); Gemini on Vertex AUTH + INFERENCE VERIFIED on Preview 18:28Z, so switching
          Production's GEMINI_TRANSPORT is the owner's call too. §50 service analytics events built (e144b27b).
MASTER TASK §60: steps 1–25 done (2026-10-08). 10 ServiceCatalog · 11 menus read it · 12 Agent G catalog routing ·
          13 /hub and /workspace redirect, fake stats deleted · 15 Live call carries the text chat; ask_agent_g hands
          research to Agent G · 16 SSRF guard on every caller-chosen fetch; library re-sign, upload MIME/size, RLS migration
          (applied 2026-10-08) · 17 V1–V6 director domain layer, since 2026-10-08 wired into the studio's storyboard Approve behind
          VIDEO_DIRECTOR_RUNS (unset = off; table migration 20261008b applied 2026-10-08) · 18 Stripe refund/dispute reversal, ledger fail-closed
          in production, ledger-backed history · 20 a11y focus traps, ka/en/ru labels, pinch-zoom restored · 21 sitemap
          from the catalog. Final retest on 70a5fe88: tsc 0; lint 0 errors; jest 643 suites / 10,294 passed / 3 skipped;
          build OK; Playwright 239 passed, 10 skipped, 2 load failures that pass alone (4/4). Deployed 2026-10-09; most
          of it is still BUILT_NOT_PROVEN live; see the certification for every label.
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
✓ Part 0: Phase 0 (GCP) — INFERENCE VERIFIED (Veo) 2026-10-08 15:49 UTC; CONFIGURED (read-back proven), owner-approved apply 2026-10-08 11:00 UTC.
          GCP gen-lang-client-0671348730 (467145118875): pool vercel / provider vercel-oidc (team id + project id +
          preview only), SA myavatar-veo (no keys), custom roles myavatarVeoInvoker + myavatarUrlSigner,
          bucket gs://myavatar-veo-outputs (private, 30-day delete). Vercel: OIDC team mode, 8/8 GCP vars in Preview only;
          Preview /api/video/engine → transport vertex. AUTH VERIFIED 2026-10-08 14:21:20 UTC with the Preview build identity
          (build log of e222e38: "[gcp-auth-check] env=preview … ok=true mode:wif token:ok bucket:ok sign:ok"; STS,
          impersonation, bucket list, signBlob; free). Paid test approved by owner 11:47 UTC: T2 PROVEN
          11:49–11:52 (gemini-3.8-flash, gemini-3.1-flash-image, lyria-3-clip-preview on Vertex, owner account, ≈ $0.11; Cloud
          Monitoring: aiplatform GenerateContent 200×3/400×1, generativelanguage 0);
          T1 Veo INFERENCE VERIFIED 15:49 UTC on the PR #43 Preview (deployment 75eef69): operation fbe5ed00 done, no RAI
          filter, gs://myavatar-veo-outputs/veo/admin-veo-smoke-1791474503054/…/sample_0.mp4 (4.01 s h264 1280x720 + AAC,
          638,497 B), PredictLongRunning 200 as the myavatar-veo SA (WIF, no key), ≈ $0.40. Presses at 14:45 and 14:52
          failed on our enhancePrompt=false payload (no video); fixed in 75eef69. Gemini on Vertex from the Preview runtime:
          AUTH VERIFIED 18:13, INFERENCE VERIFIED 18:28 (Master Task thread). Spend ≈ $0.51 in all (inferred);
          credit coverage (owner item 7) BLOCKED_OWNER until the Billing → Reports/Credits photo, from ~2026-10-09 16:00 UTC.
          Billing: single account 01AE3E-0F0B75-C73B11, linked only to this project (PROVEN); $300 credit to 2026-12-31
          and AI Studio $13.21 auto-reload OFF (owner-confirmed). 3 budgets (PROVEN): $10/month test, $300/year credit
          guard (both gross, credits excluded), $1/month out-of-pocket (after credits). Budgets alert, they do not cap.
          Report docs/handoffs/2026-10-08-gcp-part0-report.md §9–10, test plan docs/handoffs/2026-10-08-gcp-part0-test-plan.md,
          script scripts/gcp/part0-wif.sh (branch claude/gcp-part0-wif-fmtfxp, PR #43; ported with the rest of PR #43's
          missing code to the cert branch 2026-10-09, 0d239f26).
✓ Part 1: Audit + Foundation — complete 2026-10-08: audit, foundation contracts (lib/contracts), report
          docs/handoffs/part-1-report.md; §60 certification done (final-launch-certification.md), not launch ready.
◐ Part 2: Vertex Migration — in progress on claude/launch-certification-wmvitt (2026-10-08). Earlier WIP on unmerged
          origin/codex/vertex-ai-migration (503829dc) + PR #44 (green): not merged whole (owner, below); what of it is
          still needed is listed in docs/handoffs/2026-10-09-engineering-report.md §3.2 (audit 2026-10-09,
          docs/handoffs/2026-10-09-pr44-audit.md); its #2, #4 and #5 are ported (76e8c525), #1 (Google image engine)
          waits on the owner's reseller decision (action 9).
          Part 0 T1 passed 15:49Z (STOP-1 cleared); A1 (Veo Production env) is a Production change, so it waits on the owner.
          Step 1 done: Claude removed from the chat router (specialist-first and fallback) and Agent G's personality
          (Gemini only, explicit failure; certification §L).
          Owner 2026-10-08 17:16 UTC ("not now", action 9): Replicate / Udio / Higgsfield / HeyGen stay; PR #44 is NOT
          merged whole — only its Google transport is ported. The Udio / MusicGen picker rows wait for action 9 too.
          A2 groundwork done: lib/ai/google/transport.ts (contract selector, GEMINI_TRANSPORT=gemini_api|vertex, no
          fallback) + provider.ts; Gemini client, llmText, chat stream, Agent G, storyboard image and Lyria on it,
          then STT, read-aloud TTS, memory embeddings (Vertex :predict) and the orchestrator script / interior Gemini
          legs. Deep Research stays on the API key (Interactions API is Gemini-API only; stated in its client). Live,
          Imagen and the health probes are not on it. AUTH VERIFIED on Preview 2026-10-08T18:13Z (countTokens 200 via
          WIF, GET /api/preview/google-check); INFERENCE VERIFIED 18:28:55Z (one owner-approved gemini-3.8-flash reply
          from the Preview build identity, HTTP 200, 67 tokens; scripts/gcp/preview-inference-check.cjs). Production
          unchanged while unset; switching it is an owner step.
          D (ModelCatalog): lib/models/catalog.ts (28 Google models, verifiedAt only from dated calls, Gemini 2.5 text
          left out), lib/models/verify.ts (free runtime check: models.list / Vertex countTokens; missing → off, unknown →
          review queue), GET /api/admin/model-catalog. Studio pickers still read lib/providers/catalogue (action 9).
          B1 Claude slice 2: the orchestrator script / produce / image / music / interior routes plan with Gemini
          (llmText), no Anthropic SDK left under app/api/orchestrator; Claude only behind AI_GOOGLE_ONLY=0,
          VIDEO_GOOGLE_ONLY=0 or FILM_VISION_QA=1.
□ Part 3: Video Pipeline Rebuild + Browser + Security + Tests
□ Part 4: Production Polish + Final Report
□ Part 5: Post-Build Browser Verification + One-Window Refinement
BLOCKERS:
· AUTH-1 (RESOLVED in Production 2026-10-09; was a launch blocker): email OTP sign-in, sign-up and password reset failed
  on Production and Preview since at least 2026-10-03 (Vercel log "no email_otp in generateLink response"). Suspected cause
  lib/auth/otpEmail.ts:50 accepts exactly 6 digits while Supabase returns a longer code. Fix owned by the GCP Part 0
  thread (PR #43, commit 87122ff); since 13:55 UTC also on the cert branch (0421377a), so launch-certification Previews
  carry it. Deployed to Production 2026-10-09 (9f1bff6, owner-approved); with AUTH-2 resolved, code log-in and reset
  are PROVEN live there (below).
· AUTH-2 (RESOLVED 2026-10-09 14:10Z; was a launch blocker, found 2026-10-08 14:04 UTC): with the AUTH-1 fix the code is generated and accepted (Supabase
  /admin/generate_link 200, 13:57:06), then Resend refuses the mail: "resend 403 The myavatar.ge domain is not verified"
  (Vercel log 13:57:04, cert-branch Preview e1dfffc2). MAIL_FROM is unset (sender info@myavatar.ge); one RESEND_API_KEY
  serves Production and Preview. Owner action: verify myavatar.ge at resend.com/domains (DNS TXT/MX, then Verify).
  Email sign-in, sign-up, password reset and /api/mail/send stay FAILED everywhere until then.
  2026-10-09 (Supabase Auth thread, report docs/handoffs/2026-10-09-supabase-auth-security.md on draft PR #51, copy in
  /mnt/project-files/reports/): root cause PROVEN: myavatar.ge (DNS at Vercel) has no MX, SPF, DKIM or DMARC record
  (vercel dns ls + dig); Resend shows the domain "Not Started". Production RESEND_API_KEY is set (a probe reached Resend).
  Code generation PROVEN (14x /admin/generate_link 200, last 2026-10-08 14:42Z). Fix 2026-10-09: the owner pasted the
  DKIM value; the Supabase Auth thread added four records with vercel dns add, additive only, website records untouched
  (rollback: vercel dns rm rec_560f9c29eee79e60d2305798 resend._domainkey TXT, rec_99755b55743aeb80f54a6442 send MX,
  rec_9628cf1d4c29ed6a04f0f6fe send TXT SPF, rec_fc9703e01c73e8c20e2e52fa _dmarc TXT p=none); propagation PROVEN at
  once (ns1.vercel-dns.com, 1.1.1.1, 8.8.8.8); owner pressed Verify: Resend domain VERIFIED (photo 14:10Z, DKIM/MX/SPF
  each Verified). Live on Production (owner's hands, Vercel + auth logs): email code log-in (KA) PROVEN 14:17Z (send 200,
  Resend accepted, generate_link 200, 8-digit code in the inbox, /verify 200 login 14:17:43Z); password reset (EN)
  PROVEN 14:26Z (myavatar.ge@gmail.com, a non-admin: recovery code → /verify 200 → PUT /user 200 → login with the new
  password 14:26:51Z). Signed-in non-admin refused PROVEN live 14:50Z (myavatar.ge@gmail.com signed in 14:49:59Z, /en/admin showed "Admin access restricted", server log "[admin] access denied" for that address 14:50:00Z). Still open:
  sign-up by code (RU, pending: needs a new address the owner owns). Resend "Auto configure" is not used.
· AUTH-3 (found and fixed 2026-10-09, PR #51 5216aa7, BUILT_NOT_PROVEN until deploy): a sign-in code request for an
  address with no account created an unconfirmed user (GoTrue turns an admin magiclink for an unknown address into a
  sign-up; proven live 12:48Z). Now 'signin' asks public.auth_account_status first and answers 404 no_account. The one
  probe account (example.com, no mail sent) was deleted ~12:55Z after the owner's card tap (1 auth.users + 1 profiles
  row; users back to 22).
· Supabase Auth / security, 2026-10-09 (PR #51 report): Confirm email PROVEN ON (mailer_autoconfirm=false); Google OAuth
  PROVEN working (8 Google identities, /authorize → /callback 302); GitHub provider on with 0 users (owner may turn it
  off); Site URL PROVEN https://myavatar.ge; Redirect URLs PARTIAL (the cert alias git-ef1fad/** is missing, owner adds
  it); leaked-password protection ON since 14:55Z (the owner, Pro plan, no upgrade; Security Advisor re-run 14:56Z:
  0 errors, 1 warning = the accepted vector-in-public; Confirm email still ON, providers email/google/github, Captcha
  off); table RLS PROVEN
  52/52 (anon and a signed-in stranger see 0 rows); 31 SECURITY DEFINER functions, none callable by anon/authenticated,
  all with a fixed search_path; storage PROVEN (public read only on music, renders private); admin: anonymous probes on
  myavatar.ge PROVEN refused (401/403/404, forged cookie 403), admin sign-in + panel PROVEN live 14:12Z (owner's admin
  account, admin API 200 in the logs), signed-in non-admin refused PROVEN live 14:50Z, so admin security PROVEN (the
  APIs share the one isAdmin() rule, unit-tested); 14:45:17Z the owner removed the one panel-granted admin
  (DELETE /api/admin/admins 200): public.admin_emails has 0 rows, the only admins are the 2 built-in addresses, no
  app_metadata role grants admin; email OTP log-in and reset PROVEN live (AUTH-2 above); Supabase Auth VERIFIED
  (PR #51 report 55e1a84; still open: sign-up by code (RU), the optional cert-alias Redirect URL, and AUTH-3 until
  PR #51 reaches main);
  /api/avatar/generate uses auth.getUser() instead of getSession() + guard test lib/security/serverAuthBoundary.test.ts
  (PR #51, BUILT_NOT_PROVEN until deploy). PR #51: jest 718/718 suites, tsc/eslint clean, build 207/207.
· STOP-1: cleared 15:49 UTC (T1 INFERENCE VERIFIED). Production env not yet: GCP_*/VEO_TRANSPORT/GEMINI_TRANSPORT in
  Production is a separate owner decision (env + deploy).
· Part 0 item 7 (BLOCKED_OWNER): owner sends a photo of Billing → Reports (project gen-lang-client-0671348730, group by SKU)
  and Billing → Credits from ~2026-10-09 16:00 UTC; expected Subtotal ≈ $0 and credit ≈ $299.49.
  scripts/gcp/setup-veo-vertex.sh AUTH=wif is superseded (it trusted the whole pool); since 0d239f26 it refuses AUTH=wif.
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
  §55 admin P1: deployed 2026-10-09 (PR #45 via 9f1bff6): one admin guard, run-migration off by default + admin
  session + own key; run-migration 404 PROVEN live, the guard BUILT_NOT_PROVEN live. The Pipeline card was stale in
  Production; fixed (d387508e, real engines: Veo, Gemini frames, NanoBanana reseller, ElevenLabs,
  Lyria) and deployed with PR #48 (7126682, 2026-10-09 ~07:13Z); /api/health/providers and the Lyria miss report fixed
  the same way (505066c4), same deploy. 'Confirm email' PROVEN ON 2026-10-09 (Supabase Auth thread); leaked-password
  protection ON since 14:55Z 2026-10-09 (the owner's toggle).
· renders bucket (P2): FIXED 2026-10-09 07:14Z: 20261009b applied on the owner's "Deploy + renders" (07:08:11Z);
  storage.buckets reads public = false (494 objects), the public object URL answers 400 (certification §A).
· Pricing (§55 blocker): live /pricing tiers (lib/billing/tiers.ts) and the studio's top-up packs (lib/credits/pricing.ts)
  price a credit differently (≈ 4.3–5.6 vs 10 credits per lari); owner picks the canonical table.
· STORAGE-1 (P0, found 2026-10-08 19:40Z, read-only check): Production storage.objects has a SELECT policy for role
  public with USING (true) ("Public read music 1q2q05_0", made in the dashboard, names no bucket), so the public anon
  key can list and download every object in every bucket, the private uploads (2,589 objects) and studio included.
  Gateway logs 2026-09-30 19:00Z → 2026-10-08 19:45Z: 0 storage requests as anon/authenticated besides public-bucket
  reads and signed uploads. Fix supabase/migrations/20261008d_storage_read_scope.sql (narrow to bucket_id = 'music',
  self-verifying, safe before or after the deploy). CLEARED: applied to Production 2026-10-08 21:27:25Z after the
  owner's yes; pg_policies shows (bucket_id = 'music'), and as anon only the 10 music objects are visible.
· Master Task §4 Deep Research: done by Claude on the owner's instruction (2026-10-08) → docs/handoffs/service-taxonomy.md.
· Vercel connector has no access to team kintsurashviligaga-ops-projects (403) — deploy state readable only via public URL.
HANDOFF CHAIN:
· Part 0 Report: docs/handoffs/2026-10-08-gcp-part0-report.md (PR #43; on the cert branch since 0d239f26)
· Engineering report + launch blocker matrix: docs/handoffs/2026-10-09-engineering-report.md (2026-10-09)
· Part 0 Test plan: docs/handoffs/2026-10-08-gcp-part0-test-plan.md
· Service inventory: docs/handoffs/service-inventory.md · taxonomy + migration matrix: docs/handoffs/service-taxonomy.md
· Part 1 Report: docs/handoffs/part-1-report.md (2026-10-08)
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
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION F — AGENT G: AUTONOMOUS MEDIA & FILE EXECUTION (owner, 2026-10-09 09:32Z; CRITICAL, NEXT STAGE)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Owner's order (Master Task thread): the next engineering stage after PR #50 / schema drift; it must not stop the
current work. Agent G is a real autonomous executor, not only a planner or a prompt generator.
F1. EXECUTION TOOLS
· Agent G calls the EXISTING FFmpeg (lib/video/ffmpegExec.ts), media processing, Library and job systems.
· Python or any other code runs ONLY in an isolated sandbox with strict permissions and resource limits.
F2. AUTONOMOUS WORKFLOW
· task → receive files → analyse → plan → Quote / Confirm when it costs → background run → QC → final result.
F3. ONE WINDOW
· The processed video / audio / image / document appears in the same chat: playable preview, Download, saved
  to the Library.
F4. DURABLE BACKGROUND JOBS
· Progress, cancel, retry, recovery, idempotency, cost control, refund on failure (Credit Ledger).
F5. SAFETY
· No free shell commands on the Production server. Only allowed operations, only on the caller's own files,
  isolation, audit log.
F6. E2E
· Upload several clips, ask Agent G to cut them to music; prove the final MP4 is created, plays in the chat and
  downloads.
RULES
· No duplicate pipeline: reuse lib/video/ffmpegExec.ts, the Studio lanes, the Credit Ledger, Workers, the Library.
· First remove the media-execution limitation described in lib/agent/react/bindLiveAgent.ts (no media tool on
  purpose: the old orchestrate_media left permanently pending jobs and reserved no credit; a media tool needs a
  real worker and the ledger reserve / refund saga first).
· One complete end-to-end vertical slice first (F6: clips + music → MP4 in chat), then the other services.
· No Production deploy and no new paid infrastructure without the owner's consent (a code sandbox host is new
  infrastructure: owner decision).
DEFINITION OF DONE (slice 1, "cut my clips to this music")
Labels 2026-10-09: nothing here is PROVEN until AG-8 runs on a Preview. BUILT_NOT_PROVEN = written, unit-tested,
and run locally on the real bundled ffmpeg; not yet run on a Vercel deployment.
◐ AG-1 BUILT_NOT_PROVEN. bindLiveAgent.ts has quote_montage_to_music (the limitation note is replaced): it
       analyses, plans and prices from the files attached to THAT request and renders nothing; the signed quote
       goes to the client (/api/agent/run `mediaQuote`) and the run happens only on the user's confirm through
       /api/agent/media/montage `run`, which calls the existing runMontage (no new pipeline). On only when
       AGENT_G_MEDIA_EXEC is open to the user and the request has files. Tests: bindLiveAgent.test.ts,
       app/api/agent/run/route.test.ts (44 in all), every provider mocked.
◐ AG-2 BUILT_NOT_PROVEN. Every file goes through resolveCallerMedia and must be our storage and the caller's
       own (an outside link is refused). Limits: 12 clips + 1 track, 50 MB per upload (existing sign route),
       30 shots, 120 s master, 1.5–8 s per shot, 330 s of track analysed, 90 s per probe, 600 s per run. ffmpeg
       arguments come from validateMontageRequest and the montage lane's own builders, never from model or user
       text. The quote is HMAC-signed over the exact plan, the user, the price and a 30-minute expiry.
◐ AG-3 BUILT_NOT_PROVEN. The quote spends nothing (tested: no job row, no reserve, no render). The chat shows
       the plan as a card (shots, length, BPM, format, price, unused clips named) and starts nothing before Start.
       Price: free (owner's choice 2026-10-09 09:43Z, "უფასო"; pricing table unchanged); the priced path
       (reserve under ref agent-montage:<job>, refund on failure) is built and tested for a later price.
◐ AG-4 BUILT_NOT_PROVEN (superseded by EF-1…EF-3 below, 2026-10-09 ~13Z). One generation_jobs row per quote
       (the quote's job id is the idempotency key: a second run replays the job, never renders twice). `run` only
       queues; a worker renders under a lease with a 15 s heartbeat; a worker that dies is retried once, then the
       sweep fails the row and pays the refund it owes; Stop kills the running ffmpeg. The chat follows the job
       (GET ?jobId=) for up to 25 minutes. No longer depends on RENDER_DRAINER_ENABLED.
◐ AG-5 BUILT_NOT_PROVEN. The master is probed before delivery: picture and sound, H.264 + AAC, length within
       max(1 s, 3 %) of the plan, and the track actually mixed; a failure is not shown, fails the job and refunds.
◐ AG-6 BUILT_NOT_PROVEN. The master plays in the same chat bubble (player, Download, Share, Save, Edit) and is a
       Library item through its completed generation_jobs row. Browser test tests/agent-g-montage.spec.ts (routes
       mocked) 4/4. In the chat: up to 4 clips + 1 track (the composer's 5-file tray), 20 MB per file; a song over
       the chat's ~4 MB inline cap is admitted for the montage only (it is uploaded, never sent inline). The montage
       turn's files never go back to the chat model with later turns (the browser test fails without that).
◐ AG-7 BUILT_NOT_PROVEN. analytics_events row `audit.agent_g.media` per quote, start, delivery, refusal and
       cancel (user, job, file count, credits, length, outcome), written with the service role; users have no
       policy on the table and /api/analytics/track refuses the `audit.` prefix.
□ AG-8 MISSING. Needs a Preview run: an admin signed in on the cert-branch Preview (the flag defaults to admin
       there), real clips + a track, then the job id, ffprobe of the master and a screenshot recorded.
       Local proof so far (real ffmpeg 7.0.2, network and storage faked): 3 clips (one portrait) + a 120 BPM
       track → plan 119.96 BPM, first beat 0.238 s (true 0.25), 5 shots, 9.5 s; master H.264/AAC 9.53 s
       (lib/agent/media/montageExec.ffmpeg.test.ts).
STATUS: BUILT_NOT_PROVEN (2026-10-09, branch claude/launch-certification-wmvitt / PR #50). Off in Production
       (AGENT_G_MEDIA_EXEC unset = off; admin-only on a Preview). Design: docs/handoffs/2026-10-09-engineering-
       report.md §4.19.
WHAT CHANGES FOR THE USER (once the flag is on for them)
· Clips + one track + words like "cut these to the music" / „დაამონტაჟე მუსიკაზე" / «смонтируй под музыку» no
  longer go to the remix (first clip only, 15 credits, the rest dropped): Agent G uploads every file, reads the
  beat, shows the plan, and edits on Start. One clip + "add music" still goes to the remix (the whole clip under a
  song); a trim stays a trim; a question about the video stays a question. With the flag off nothing changes.
FILES
· lib/services/montage/beatPlan.ts (+ beatAnalysis.ts), lib/video/probeBanner.ts, lib/agent/media/* (access,
  quoteToken, montageAsk, montageExec, montageLive, montageChat, montageClient), app/api/agent/media/montage,
  components/studio/AgentMontageCard.tsx, OmniStudio send() branch, lib/agent/react/bindLiveAgent.ts,
  app/api/agent/run (optional `files`), montagePipeline `shouldContinue`.
NEXT (after AG-8): the same quote → confirm → job → QC → result shape for the other ffmpeg operations (trim,
  captions, aspect, audio mix) — slice 2; a code sandbox needs a host (owner decision, new infrastructure).
F-EF. EXECUTION FOUNDATION (owner, 2026-10-09 11:15Z, Master Task; handoff
  docs/handoffs/2026-10-09-agent-g-execution-foundation.md, with the phase-2 decisions and a migration DRAFT that is
  NOT applied). All on PR #50 behind AGENT_G_MEDIA_EXEC; nothing deployed, migrated or switched on.
◐ EF-1 BUILT_NOT_PROVEN. Durable queue on generation_jobs, no migration: lease state in params._exec, every change a
       compare-and-set on its version (lib/orchestrator/jobLease.ts); `run` answers `queued`, a worker renders
       (lib/agent/media/montageWorker.ts); workers start after the answer, on the owner's status read, and from the
       per-minute sweep (/api/agent/media/sweep, Production only, inert while the flag is off).
◐ EF-2 BUILT_NOT_PROVEN. completed/failed are terminal (lib/orchestrator/jobs.ts guards every write and reports whether
       it landed); a failure that owes a refund records the debt in the same write (outbox), payDebt clears it;
       reconciliation = sweep + status read; drain-renders leaves leased rows alone; /api/orchestrator/jobs refuses
       client writes on a leased row.
◐ EF-3 BUILT_NOT_PROVEN. Lease 90 s, heartbeat 15 s, one retry after a lapsed lease, render/QC failure final at once;
       cancel SIGKILLs the running ffmpeg (AbortSignal through ffmpegExec; real-ffmpeg test checks the PID is gone).
◐ EF-4 PARTIAL. Idempotent insert per quote, billing hold → charge → release, refund bounded by the ledger
       (netDebitedForRef), audit rows. deduct_credits' same-ref race needs migration C (owner).
◐ EF-5 PARTIAL. Typed allowlist lib/agent/tools/registry.ts (effects read/prepare/quote only; a quote names the confirmed
       action the user's press runs); the live agent's 4 tools are typed specs. More Studio operations = slice 2.
□ EF-6 BLOCKED_OWNER. Sandbox contract lib/agent/sandbox/policy.ts (python/node, capped limits, network denied, no
       secrets) and a runner that refuses everything; a real runner needs an isolated paid host (decision B).
◐ EF-7 BUILT_NOT_PROVEN. One Task API (app/api/tasks, lib/tasks): GET ?id= / list and POST cancel, one TaskView
       (queued | running | completed | failed | cancelled, stage, pct, attempt, result, cancellable) for every
       generation_jobs row of the caller: a studio render from its columns, a montage or audio extraction through its
       executor (that read is also the job's recovery, only while the flag is open to the caller). The chat's montage
       and MP3 cards, and Live Voice's Stop, follow and stop jobs only through it. Text turns and voice sessions keep
       no tasks of their own (they start these jobs). Not moved: the job tray (/api/orchestrator/jobs). The older
       /api/tasks/<uuid> routes (agent_g_tasks) now require a session and the owner's id (they read through the
       service role with no owner check before). Handoff §7 step 4.
◐ EF-8 BUILT_NOT_PROVEN. The master plays in the same bubble with Download; Library via the completed row
       (Playwright 4/4, routes mocked).
◐ EF-9 PARTIAL. Crash/retry/cancel/refund/sweep tests and a local real-ffmpeg run through the queue pass; the
       authorized run on a Preview needs an admin session (handoff §7 step 1).
F-AU. URL-TO-AUDIO / MEDIA EXTRACTION (owner, 2026-10-09 12:34Z, Master Task; handoff
  docs/handoffs/2026-10-09-agent-g-url-to-audio.md). A video or audio link (or one upload) + "ამ ვიდეოდან MP3 ამოიღე" →
  plan card → Start → MP3 in the same chat bubble. On PR #50 (f566264e, 780b3426) behind AGENT_G_MEDIA_EXEC; nothing
  deployed, migrated or switched on; free (no model or provider is called, FFmpeg only).
◐ AU-1 BUILT_NOT_PROVEN. Link + rights check: 32 platforms refused by every page and CDN host, streams (HLS/DASH) refused,
       before any request (lib/agent/media/audioSource.ts); the link must open on a public host and serve a video/audio
       file (lib/web/publicFetch). Rights: licensed (Wikimedia Commons API, HTTP Link rel=license), own (the caller's
       upload), else unverified and the card says Start only for the user's own or licensed file.
◐ AU-2 BUILT_NOT_PROVEN. Only direct media files on public hosts; the source rule re-checked on every redirect hop; a
       leased worker (audioWorker.ts) runs ffmpeg-static: MP3 192 kbps CBR, stereo, 44.1 kHz, 200 MB / 60 min caps.
◐ AU-3 BUILT_NOT_PROVEN. Same bubble: player with the file name, "0:05 · 120 KB · MP3 192 kbps", Download, Save to
       Library. MP3 in the private renders bucket (audio/extract-<job>.mp3), 7-day signed link.
◐ AU-4 BUILT_NOT_PROVEN. One generation_jobs row per signed quote (idempotent Start), the F-EF lease queue (90 s lease,
       15 s heartbeat, one retry), Stop kills ffmpeg, status read + per-minute sweep recover orphans, qcMp3 before
       delivery, audit.agent_g.media op audio_extract.
◐ AU-5 BUILT_NOT_PROVEN. Platform / stream / page / unreachable link → refusal naming the platform + "Upload a file"
       (file picker, request pre-typed, "rights: yours" plan). No yt-dlp, no extractor, no workaround of any kind.
◐ AU-6 BUILT_NOT_PROVEN. Text: the chat's own branch and the ReAct tool quote_audio_from_link (plans only, returns
       audioQuote). Live Voice: extract_audio plan / start (only with confirmed "yes") / stop, same card, the plan read
       back as an [App] note. Not tried on a real Gemini Live call.
◐ AU-7 BUILT_NOT_PROVEN. Reuses the montage shape, generation_jobs queue, sweep, quote token, audit stream; the job
       follower moved to lib/agent/media/jobFollow.ts for both. Registry: audio_extract_run. No new provider.
□ AU-8 MISSING. Preview run with an admin session (same as AG-8): job id, the MP3 and a screenshot.
       Local proof 2026-10-09 13:01Z: real internet fetch of MDN shared-assets flower.mp4 (published for reuse) + real
       ffmpeg + the real queue code (storage and DB local) → MP3 5.09 s, 122,941 B, 192 kb/s 44.1 kHz stereo, QC passed;
       YouTube refused before any request. Playwright tests/agent-g-audio.spec.ts 5/5 (routes mocked, real MP3); jest
       725 suites / 11,188 passed; tsc clean; build 207 pages.
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
