# Video Core v1.0 final hardening — Phase 2: Production Veo on Vertex AI

Status 2026-10-15: **PLAN, not applied.** Everything in §1 was read live, read-only, on 2026-10-15 between 09:55Z and
10:10Z. Nothing in GCP or Vercel was changed and no model was called. The change in §3 waits for the owner's separate
word (brief 2026-10-13 17:34Z: "საჭიროებისას რეალური Migration/Environment ცვლილებების დამტკიცება მოთხოვე ცალკე").

## მოკლედ

1. **დღეს Production-ში Veo Gemini Developer API-ზე (AI Studio-ს გასაღებით) რენდერავს** — `GET https://myavatar.ge/api/video/engine` → `"transport":"gemini"`. ეს ზუსტად ის fallback-ია, რომელსაც ბრიფი კრძალავს.
2. Vertex-ის ჯაჭვი (WIF → SA → bucket) Preview-ზე დამტკიცებულია (2026-10-08 და 2026-10-13); Production-ის იდენტობას GCP ჯერ არ ენდობა.
3. ცვლილება მხოლოდ Veo-სთვის: GCP-ში 2 ბრძანება (Production-ის subject) + Production-ში 8 env ცვლადი. `GEMINI_TRANSPORT` არ იცვლება — ტექსტი, სურათი, Lyria იგივე გზით რჩება.
4. ძალაში შედის შემდეგი Production deploy-ით (PR #69). უკან დაბრუნება: Vercel Instant Rollback (კოდი + env ერთად).
5. ფასი (Google, 2026-10-15): Veo 3.1 Fast, ხმით, 720p — $0.10/წმ → 4 წმ = **$0.40**.

## 1. What is true now (VERIFIED FACT unless marked)

| # | Fact | How it was checked |
|---|---|---|
| F1 | Production Veo renders on the **Gemini Developer API**: `{"transport":"gemini","googleOnly":true,"audioToggle":false,…}` | `curl https://myavatar.ge/api/video/engine` from the owner's Mac (the sandbox proxy denies myavatar.ge) |
| F2 | Production has **no** `GCP_*`, `VEO_TRANSPORT` or `GEMINI_TRANSPORT`; it has `GEMINI_API_KEY` and `GEMINI_VEO_ENABLED` (value not read). `VIDEO_GOOGLE_ONLY` is unset (= Google-only ON). Preview has the 7 `GCP_*` vars, `VEO_TRANSPORT` and `GEMINI_TRANSPORT`. | `vercel env ls production` (CLI 53.2 on the owner's Mac, names only) and the Vercel connector (names + targets, values never decrypted) |
| F3 | WIF provider `vercel-oidc` (pool `vercel`): ACTIVE, Team issuer `https://oidc.vercel.com/kintsurashviligaga-ops-projects`, audience `https://vercel.com/kintsurashviligaga-ops-projects`, condition `owner_id == team_YGQHjuCUs0f7tKoLtrCgSIFG && project_id == prj_k4LQeBUGIAfsXC3ijPTXplTWM5eH && environment in ['preview']` | `gcloud iam workload-identity-pools providers describe` (read-only) |
| F4 | `myavatar-veo@…` may be impersonated by exactly one principal: `…/subject/owner:kintsurashviligaga-ops-projects:project:avatar-g-frontend-v3:environment:preview`. It holds the custom `myavatarVeoInvoker` role (`aiplatform.endpoints.predict`) on the project and `myavatarUrlSigner` (`iam.serviceAccounts.signBlob`) on itself. **0 user-managed keys.** | `gcloud iam service-accounts get-iam-policy`, `projects get-iam-policy`, `keys list --managed-by=user` |
| F5 | Bucket `gs://myavatar-veo-outputs`: US-CENTRAL1, uniform access, public access prevention **enforced**, delete after 30 days; `objectCreator` + `objectViewer` for the SA and the Vertex AI service agent only (plus the project's legacy owner/viewer roles). | `gcloud storage buckets describe` / `get-iam-policy` |
| F6 | A `VEO_TRANSPORT=vertex` pin with incomplete config is `null` → `not_configured`, never a Gemini render. | `lib/veo/engine.ts:52-58`, `lib/veo/engine.test.ts` |
| F7 | Every non-Veo Google call follows `GEMINI_TRANSPORT` only (unset → `gemini_api`); adding `GCP_*` to Production does **not** move chat, image, Lyria, STT or embeddings. | `lib/ai/google/transport.ts:47-52`, `lib/ai/google/provider.ts:32-44` |
| F8 | Models on Vertex: `veo-3.1-generate-001`, `veo-3.1-fast-generate-001`, `veo-3.1-lite-generate-001` (catalog allowlist; no `VEO_MODEL_*` override in Production). | `lib/veo/capabilities.ts:87-97`, `lib/models/catalog.ts:141-149` |
| F9 | Price: Veo 3.1 Fast, video + audio, 720p **$0.10 per count**; Veo 3.1 Fast video-only 720p $0.08; Veo 3.1 video + audio 720p/1080p $0.40. The page names the unit "count"; that a count is one second of output is INFERENCE, consistent with the Part 0 measurement (4 s clip ≈ $0.40). | Google Cloud pricing page, fetched 2026-10-15 |
| F10 | Films and Veo clips are open to **every signed-in user** in Production today; only anonymous requests are refused, and admins are never billed. So after the switch every user's Veo clip bills the Google Cloud project (its credits) instead of the AI Studio key. Vertex has no hard spend cap; the project budgets only alert. Since PR #71 (2026-10-15) the app holds its own: `VEO_DAILY_LIMIT_USD` ($10 in Production) refuses a Veo submit before Google is called (`lib/veo/dailyCap.ts`). | `lib/chat/providerRouter.ts:296,377` (`refuseAnonymousGeneration` only), `lib/chat/filmComposite.ts:970-984` |

## 2. What changes and what does not

Changes (Veo only):

* GCP trust: the Production identity of this one Vercel project may impersonate `myavatar-veo`.
* Production env: the same 8 non-secret values Preview has.

Unchanged: `GEMINI_TRANSPORT` (Production stays `gemini_api`), `GEMINI_VEO_ENABLED`, `VIDEO_GOOGLE_ONLY`, every model id,
the prompt compiler, V1–V6, storyboard, references, seed and shot order (no code in this phase touches `lib/veo`), BOG,
prices, Preview, PR #60. No key is created; `GCP_SERVICE_ACCOUNT_KEY` stays unset.

## 3. The change (run by Claude on the owner's Mac after the owner's word)

gcloud always through the wrapper `~/.myavatar-gcloud/gcloud` as `myavatar.ge@gmail.com`.

```bash
G=~/.myavatar-gcloud/gcloud; P=gen-lang-client-0671348730
# G1 — the provider also accepts Production tokens of this team + project (ids, so a rename cannot widen it)
$G iam workload-identity-pools providers update-oidc vercel-oidc --workload-identity-pool=vercel --location=global --project=$P \
  --attribute-condition="assertion.owner_id == 'team_YGQHjuCUs0f7tKoLtrCgSIFG' && assertion.project_id == 'prj_k4LQeBUGIAfsXC3ijPTXplTWM5eH' && assertion.environment in ['preview', 'production']"
# G2 — exactly one more principal may impersonate the SA: this project's Production subject
$G iam service-accounts add-iam-policy-binding myavatar-veo@$P.iam.gserviceaccount.com --project=$P --role=roles/iam.workloadIdentityUser \
  --member="principal://iam.googleapis.com/projects/467145118875/locations/global/workloadIdentityPools/vercel/subject/owner:kintsurashviligaga-ops-projects:project:avatar-g-frontend-v3:environment:production"
```

This is what `MODE=apply VERCEL_ENVIRONMENTS=preview,production scripts/gcp/part0-wif.sh` would do in its steps 6–7,
without re-running steps 1–5 and 8 (already in place, F3–F5).

V1 — Production env, target **Production only**, type plain (none is a secret), via `vercel env add NAME production`:

```
GCP_PROJECT_ID=gen-lang-client-0671348730
GCP_PROJECT_NUMBER=467145118875
GCP_SERVICE_ACCOUNT_EMAIL=myavatar-veo@gen-lang-client-0671348730.iam.gserviceaccount.com
GCP_WORKLOAD_IDENTITY_POOL_ID=vercel
GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID=vercel-oidc
GCP_VEO_BUCKET=gs://myavatar-veo-outputs
GCP_VEO_LOCATION=us-central1
VEO_TRANSPORT=vertex
```

D1 — the env takes effect only at the next Production deployment. The plan is the PR #69 deploy (after migration
20261014a, each on its own word). Nobody presses Redeploy in between.

## 4. Proof after the deploy (free, before any paid clip)

1. Build log (Vercel connector): `[gcp-auth-check] env=production sub=…:environment:production ok=true mode:wif token:ok
   bucket:ok sign:ok`. `scripts/gcp/preview-auth-check.cjs` now also runs on Production builds (token, one bucket list,
   one signBlob; never a model call). Tests: `scripts/gcp/preview-auth-check.test.ts`.
2. `GET https://myavatar.ge/api/video/engine` → `"transport":"vertex","audioToggle":true`.
3. An earlier Gemini operation still polls on the Gemini API (`transportOf`: `models/…` vs `projects/…`).

Only then the one paid Phase 5 clip (≤ $5, one 4 s Veo 3.1 Fast 720p clip with audio ≈ $0.40).

## 5. Rollback (defined before the change)

| Trigger | Action | Effect |
|---|---|---|
| auth check `ok=false`, `transport` not `vertex`, any Veo error spike | **Vercel Instant Rollback** to the deployment before the switch | code and env of that deployment come back together (env is per deployment): Veo on the Gemini API as today. Never a Redeploy of an old commit. |
| GCP side must be closed too | `update-oidc … environment in ['preview']` and `remove-iam-policy-binding` of the Production principal | a Production token can no longer impersonate the SA: a pinned Vertex call fails closed (`token_failed` / `not_configured`), never a Gemini render (F6) |
| after a rollback | `vercel env rm NAME production` for the 8 vars (no redeploy) | Production env back to F2 |

Who: Claude, on the owner's Mac. Data: no row is written or removed; Veo outputs stay in the bucket under its 30-day rule.
