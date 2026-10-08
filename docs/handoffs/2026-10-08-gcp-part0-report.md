# GCP Part 0 — Vertex AI WIF: ანგარიში (2026-10-08)

სტატუსი: **GCP და Vercel — CONFIGURED (read-back-ით დადასტურებული). AUTH და INFERENCE ჯერ არ არის.**
owner-მა plan დაამტკიცა 2026-10-08 11:00 UTC-ზე; apply გაეშვა owner-ის Mac-ზე `myavatar.ge@gmail.com`-ით (§9).

| ფენა | სტატუსი |
|---|---|
| CONFIGURED (GCP: APIs, pool/provider, SA, IAM, bucket) | **CONFIGURED** — read-back audit (§9.2) |
| CONFIGURED (Vercel: OIDC Team mode, env vars) | **CONFIGURED** — OIDC `team`, Preview-ში 8/8 ცვლადი, `GCP_SERVICE_ACCOUNT_KEY` არ არის (§9.3) |
| AUTH VERIFIED (STS exchange + impersonation) | **NOT RUN** — შემოწმება ჩაშენდა `/api/admin/provider-probe`-ში (§9.4); Preview-ზე admin-ის გახსნას ელოდება |
| INFERENCE VERIFIED (Veo-ს რეალური გამოძახება) | **NOT RUN** (ფასიანია — ცალკე თანხმობა სჭირდება) |
| კოდის token flow ოფიციალურ დოკუმენტაციასთან | **REVIEWED — შესაბამისობაშია** (§3) |
| Least-privilege WIF კონფიგურაცია | **APPLIED** — `scripts/gcp/part0-wif.sh` |

## 0. ანგარიში
GCP-ზე ყოველი წაკითხვა და ცვლილება მხოლოდ `myavatar.ge@gmail.com`-ით (owner-ის მითითება, 2026-10-08).
`part0-wif.sh` ჩერდება (exit 3) ნებისმიერ რეჟიმში, თუ gcloud-ის აქტიური ანგარიში სხვაა. ამ ანგარიშის წვდომა
პროექტზე **PROVEN**: audit-ის ანგარიშის შემოწმება გავიდა და `projects describe` წარმატებით შესრულდა.

## 1. რა შევამოწმე და რით

**Audit 1:** owner-მა read-only ბლოკი (ცვლილების გარეშე, prompt-ები გამორთული) გაუშვა Cloud Shell-ში
`myavatar.ge@gmail.com`-ით და output-ის ფოტო დააბრუნა.
**Audit 2:** `MODE=audit scripts/gcp/part0-wif.sh` (commit fb02b0d, sha256 შემოწმებული) Claude-მა გაუშვა owner-ის Mac-ზე,
gcloud 587.0.0 ცალკე config-ით (`~/.config/gcloud-myavatar`), `myavatar.ge@gmail.com`-ით (owner-ის Allow). ორივე
audit ერთსა და იმავეს აჩვენებს; Audit 2 დამატებით ამოწმებს წაშლილ pool-ებს, SA key-ებს და API key-ების metadata-ს.
**Vercel:** owner-ის Mac-ზე `vercel` CLI (`kintsurashviligaga-ops`), მხოლოდ GET მოთხოვნები.

| რა | შედეგი | სტატუსი |
|---|---|---|
| gcloud-ის აქტიური ანგარიში | `myavatar.ge@gmail.com` | PROVEN |
| პროექტი | `gen-lang-client-0671348730`, number **`467145118875`**, name "Default Gemini Project", `ACTIVE` | PROVEN |
| billing | მიბმულია, `billingEnabled: True`; ანგარიში "My Billing Account" (`01AE3E-…-C73B11`), `open: True` | PROVEN |
| budget / alert | `billingbudgets.googleapis.com` პროექტზე ჩართული არ არის (`SERVICE_DISABLED`), ამიტომ gcloud-მა ვერ წაიკითხა | **UNVERIFIED** — Console → Billing → Budgets & alerts |
| trial credit-ის ნაშთი და ვადა | gcloud-ით არ ჩანს | **UNVERIFIED** — Console → Billing → Overview / Credits |
| API-ები | ჩართულია: `aiplatform`, `iam`, `iamcredentials`, `sts`. **არ ჩანს:** `serviceusage`, `storage` | PROVEN (§5) |
| WIF pool / provider | არცერთი, წაშლილიც არა (`--show-deleted`) | PROVEN |
| service account-ები | `vertex-express@…`, `467145118875-compute@developer…`, `ais-gemini-key-e53c…@467145118875.iam…` | PROVEN |
| `myavatar-veo@…` SA | `NOT_FOUND` | PROVEN |
| user-managed SA key-ები | არცერთ SA-ზე არ არის | PROVEN |
| API key-ები (metadata) | `API key 2` (2026-10-03, შეზღუდულია `aiplatform`-ზე — Vertex express mode); `Gemini API Key` (2026-10-01, `generativelanguage` — AI Studio) | PROVEN |
| SA-ების project role-ები | `aiplatform.expressUser` → `vertex-express`; `roles/editor` → default compute SA; დანარჩენი Google-ის service agent-ებია (compute, instanceGroupManager, notebooks) | PROVEN |
| Vertex AI Service Agent | project IAM-ში არ ჩანს (`service-467145118875@gcp-sa-aiplatform…`) | plan-ის ნაბიჯი 5 ქმნის |
| custom role-ები | არცერთი | PROVEN |
| bucket-ები | არცერთი; სახელი `myavatar-veo-outputs` თავისუფალია (GCS JSON API, ანონიმური → `404 notFound`) | PROVEN |
| Vercel team | `GET /v2/teams/team_YGQH…` → slug **`kintsurashviligaga-ops-projects`** | PROVEN |
| Vercel project OIDC | `GET /v9/projects/prj_k4LQ…` → `oidcTokenConfig: {enabled: true, issuerMode: "team"}` | PROVEN |
| Vercel issuer discovery | `https://oidc.vercel.com/kintsurashviligaga-ops-projects/.well-known/openid-configuration` → `issuer` ემთხვევა, RS256 | PROVEN (შენიშვნა: არარსებულ slug-ზეც 200-ს აბრუნებს, ამიტომ slug-ს თავად ის არ ადასტურებს) |
| Vercel Preview env | იხ. §6 | PROVEN |

### 1.1 უსაფრთხოების დაკვირვებები (ცვლილება არ გაკეთებულა)
1. **`roles/editor` default compute SA-ზე** (`467145118875-compute@developer…`) — Google-ის ნაგულისხმევი, ფართო
   უფლება. ჩვენი ნაკადი მას არ იყენებს. მოხსნა ცალკე გადაწყვეტილებაა (შეიძლება Compute/Notebooks-ს სჭირდებოდეს).
2. **`vertex-express` (`roles/aiplatform.expressUser`) და `ais-gemini-key-…`** — Vertex express mode-ისა და AI Studio-ს
   API key-ების SA-ები. ესე იგი პროექტზე API key-ზე დაფუძნებული გზები შეიძლება არსებობდეს, რაც WIF-only მიზანს და
   „AI Studio-ზე fallback არა" წესს ეწინააღმდეგება. ახლა არაფერს ვცვლი: production შეიძლება მათ ჯერ კიდევ იყენებდეს
   (Part 2). Audit 2-მა დაადასტურა: პროექტზე ორი API key არსებობს (`API key 2` → aiplatform, `Gemini API Key` →
   generativelanguage), Vercel-ში `GEMINI_API_KEY` production-სა და development-ში არის. ეს AI Studio-ს გზაა;
   მისი გათიშვა Vertex-ის INFERENCE VERIFIED-ის და Part 2-ის შემდეგ, owner-ის გადაწყვეტილებით.
3. **budget alert არ ჩანს.** INFERENCE ტესტამდე რეკომენდებულია budget alert (თავად budget არაფერს იხდის; owner-ის თანხმობით).

Repo-ს მდგომარეობა (branch `claude/launch-certification-wmvitt` @ d563e82, საიდანაც ეს branch არის):
`lib/veo/vertexAuth.ts` (WIF + key რეჟიმები), `lib/veo/gcs.ts`, `lib/veo/vertexClient.ts`, `scripts/gcp/setup-veo-vertex.sh`.

## 2. Vercel OIDC — ზუსტი პარამეტრები (ოფიციალური დოკუმენტაციიდან)

წყარო: vercel.com/docs/oidc/reference (last_updated 2026-09-17), vercel.com/docs/oidc/gcp (2026-09-01).

| პარამეტრი | Team issuer mode (არჩეული) |
|---|---|
| `iss` | `https://oidc.vercel.com/kintsurashviligaga-ops-projects` |
| JWT `aud` (default) | `https://vercel.com/kintsurashviligaga-ops-projects` |
| `sub` | `owner:kintsurashviligaga-ops-projects:project:avatar-g-frontend-v3:environment:{development\|preview\|production}` |
| `owner_id` | `team_YGQHjuCUs0f7tKoLtrCgSIFG` |
| `project_id` | `prj_k4LQeBUGIAfsXC3ijPTXplTWM5eH` |
| `environment` | `preview` (ამ ეტაპზე ერთადერთი დაშვებული) |
| სიცოცხლის ვადა | function token: preview/production 2 სთ |
| discovery | `https://oidc.vercel.com/kintsurashviligaga-ops-projects/.well-known/openid-configuration` |

Global mode-ში `iss` = `https://oidc.vercel.com`; ის **არ** გამოიყენება.
Trust პირობები ID-ებზეა (`owner_id`, `project_id`), არა სახელებზე: team/project-ის გადარქმევა ვერ გააფართოებს მას.
`sub` შეიცავს სახელებს; ამიტომ გადარქმევის შემთხვევაში impersonation binding (§4.3) უნდა განახლდეს.

## 3. Token flow: JWT `aud` ≠ STS `audience`

ორი სხვადასხვა მნიშვნელობაა და კოდი მათ სწორად მიჯნავს:

1. **Vercel OIDC JWT-ის `aud`** = `https://vercel.com/kintsurashviligaga-ops-projects`. GCP provider-ის
   `allowedAudiences` სწორედ ეს უნდა იყოს (Vercel დოკის „Allowed audiences" ვარიანტი).
2. **STS-ის `audience` პარამეტრი** = provider-ის resource name:
   `//iam.googleapis.com/projects/467145118875/locations/global/workloadIdentityPools/vercel/providers/vercel-oidc`.
   ეს `ExternalAccountClient`-ის `audience` ველია (`lib/veo/vertexAuth.ts` → `buildClients`).

ნაკადი: function → `getVercelOidcToken()` (request-ის `x-vercel-oidc-token`) → `POST sts.googleapis.com/v1/token`
(token-exchange, subject_token_type `jwt`) → federated token → `iamcredentials …/serviceAccounts/{SA}:generateAccessToken`
→ cloud-platform scope-ის access token → Vertex `…:predictLongRunning` / `…:fetchPredictOperation` და GCS.

**დადასტურებული განსხვავება ოფიციალურ მაგალითთან (კოდი სწორია, მაგალითი — არა ჩვენი ვერსიებისთვის):**
Vercel-ის დოკის მაგალითი წერს `getSubjectToken: getVercelOidcToken`. `google-auth-library@9.15.1` supplier-ს
გადასცემს `{ audience, subjectTokenType, transporter }`-ს (`build/src/auth/baseexternalclient.js:148`), ხოლო
`@vercel/oidc@3.8.10` `audience` ოფციას აღიქვამს როგორც „გაცვალე token ამ aud-ზე"
(`dist/get-vercel-oidc-token-with-refresh.js:65`). შედეგად JWT-ის `aud` გახდებოდა `//iam.googleapis.com/…` და
„Allowed audiences" provider უარყოფდა. ჩვენი კოდი `getVercelOidcToken()`-ს **არგუმენტების გარეშე** იძახებს
(`vertexAuth.ts` → `vercelSubjectToken`) — სწორი ქცევა. ეს შემოწმებულია პაკეტების წყარო-კოდით, არა runtime-ით.

უსაფრთხოება: STS/IAM შეცდომები `redactSecrets()`-ით იწმინდება (JWT, `ya29.` token, signed URL query, PEM). ამ
ანგარიშში არცერთი token არ არის.

## 4. Least-privilege WIF კონფიგურაცია

ყველაფერი `scripts/gcp/part0-wif.sh`-შია (`MODE=audit|plan|apply`). Service-account key **არ** იქმნება.

### 4.1 Provider (`vercel` / `vercel-oidc`)
- issuer: `https://oidc.vercel.com/kintsurashviligaga-ops-projects`; allowed audience: `https://vercel.com/kintsurashviligaga-ops-projects`
- attribute mapping: `google.subject=assertion.sub`, `attribute.owner_id`, `attribute.project_id`, `attribute.environment`
- **attribute condition** (ახალი): `assertion.owner_id == 'team_YGQHjuCUs0f7tKoLtrCgSIFG' && assertion.project_id == 'prj_k4LQeBUGIAfsXC3ijPTXplTWM5eH' && assertion.environment in ['preview']`
  — team-ის სხვა project-ის ან production/development-ის token-ს STS ვერ გაცვლის.

### 4.2 Service account `myavatar-veo@gen-lang-client-0671348730.iam.gserviceaccount.com`
| ვის | რა | სად | რატომ |
|---|---|---|---|
| SA | custom `myavatarVeoInvoker` = `aiplatform.endpoints.predict` | project | `predictLongRunning` + `fetchPredictOperation` publisher model-ზე |
| SA | custom `myavatarUrlSigner` = `iam.serviceAccounts.signBlob` | თავად SA-ზე | V4 signed URL WIF-ით IAM signBlob-ით იხელმოწერება |
| SA | `roles/storage.objectCreator` + `roles/storage.objectViewer` | bucket | input-ის ატვირთვა (`ifGenerationMatch: 0` — overwrite არასდროს, ამიტომ delete არ სჭირდება) და signed URL-ის მფლობელს `objects.get` |
| Vertex AI Service Agent `service-467145118875@gcp-sa-aiplatform…` | `objectCreator` + `objectViewer` | bucket | gs:// input-ის წაკითხვა, `sample_N.mp4`-ის ჩაწერა |

### 4.3 Impersonation — მხოლოდ კონკრეტული federated principal
`roles/iam.workloadIdentityUser` SA-ზე, member:
`principal://iam.googleapis.com/projects/467145118875/locations/global/workloadIdentityPools/vercel/subject/owner:kintsurashviligaga-ops-projects:project:avatar-g-frontend-v3:environment:preview`

### 4.4 before → after (setup-veo-vertex.sh AUTH=wif → part0-wif.sh)
| | before | after |
|---|---|---|
| ვის შეუძლია SA-ს impersonation | `principalSet://…/workloadIdentityPools/vercel/*` (მთელი pool) | ერთი `subject` per დაშვებული environment |
| provider condition | არ იყო — team-ის ნებისმიერი project/environment | team id + project id + `preview` |
| Vertex | `roles/aiplatform.user` (ფართო) | `aiplatform.endpoints.predict` |
| signing | `roles/iam.serviceAccountTokenCreator` თავის თავზე (token-ის mint-იც შეეძლო) | მხოლოდ `signBlob` |
| bucket | `roles/storage.objectAdmin` (delete, ACL) | `objectCreator` + `objectViewer` |
| APIs | 4 | 6 (+ `iam`, `serviceusage`) |
| env vars | „Production"-ში | მხოლოდ Preview |
`apply` ძველ ფართო binding-ებს შლის, თუ ისინი არსებობს. `setup-veo-vertex.sh AUTH=wif` ახლა ახალ სკრიპტზე მიუთითებს და ჩერდება.

რისკი, რომელიც მხოლოდ ტესტით დადასტურდება: `aiplatform.endpoints.predict` საკმარისობა Veo publisher model-ისთვის
და Service Agent-ისთვის objectCreator-ის საკმარისობა (Veo არსებულ ობიექტს არ უნდა გადააწეროს). თუ INFERENCE ტესტი
`PERMISSION_DENIED`-ს დააბრუნებს კონკრეტული permission-ის სახელით, ემატება მხოლოდ ის.

## 5. API-ები
| API | სტატუსი (audit) | სჭირდება |
|---|---|---|
| aiplatform.googleapis.com | ჩართულია | Veo |
| iam.googleapis.com | ჩართულია | pool/provider, custom roles |
| iamcredentials.googleapis.com | ჩართულია | generateAccessToken, signBlob |
| sts.googleapis.com | ჩართულია | token exchange |
| serviceusage.googleapis.com | **არ არის ჩართული** | API მართვა |
| storage.googleapis.com | **არ არის ჩართული** | bucket |

ჩართვის ფარგლები: API-ის ჩართვა უფასოა; ხარჯი იწყება მხოლოდ გამოყენებისას (Veo წამზე, GCS შენახვა). bucket-ის
შექმნა ცარიელ bucket-ს ქმნის 30-დღიანი წაშლის წესით — თითქმის ნულოვანი ხარჯი, მაგრამ მაინც apply-ის ნაწილია
და owner-ის თანხმობით ეშვება.

## 6. Vercel environment variables (მხოლოდ **Preview**)
| სახელი | მნიშვნელობა | სტატუსი |
|---|---|---|
| `GCP_PROJECT_ID` | `gen-lang-client-0671348730` | **Preview-ში არის** (PROVEN) |
| `GCP_PROJECT_NUMBER` | `467145118875` (PROVEN audit-ით) | **აკლია** — plan V |
| `GCP_SERVICE_ACCOUNT_EMAIL` | `myavatar-veo@gen-lang-client-0671348730.iam.gserviceaccount.com` | **Preview-ში არის**; SA თავად apply-ით იქმნება |
| `GCP_WORKLOAD_IDENTITY_POOL_ID` | `vercel` | **Preview-ში არის**; pool apply-ით იქმნება |
| `GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID` | `vercel-oidc` | **Preview-ში არის**; provider apply-ით იქმნება |
| `GCP_VEO_BUCKET` | `gs://myavatar-veo-outputs` (სახელი თავისუფალია) | **აკლია** — plan V |
| `GCP_VEO_LOCATION` | `us-central1` | **Preview-ში არის** (PROVEN) |
| `VEO_TRANSPORT` | `vertex` | **აკლია** — plan V |
`GCP_SERVICE_ACCOUNT_KEY` — **არ** ისმება. `GEMINI_TRANSPORT` და Gemini-ს Vertex ცვლადები — ჯერ არა (Part 2).
Vercel → Settings → Security → OIDC Federation: Enabled, Issuer Mode **Team** — PROVEN (API). არსებული 5 ცვლადი Preview-ში
დღეს 09:37 UTC-ზე ჩაიწერა (`plain`, git branch-ის გარეშე).

## 7. ტესტები
- `bash -n scripts/gcp/part0-wif.sh`, `bash -n scripts/gcp/setup-veo-vertex.sh` — OK.
- `MODE=plan` fake `gcloud`-ით: ბრძანებები, condition და principal-ები სწორად იბეჭდება (§4).
- TypeScript/Jest: TS კოდი არ შეცვლილა; baseline-ს launch-certification თრედი ფლობს.
- AUTH/INFERENCE: არ გაშვებულა.

## 8. ბლოკერები და შემდეგი ნაბიჯი
1. ✓ **read-only audit** — ჩატარდა (§1).
2. ✓ **gcloud owner-ის Mac-ზე** (owner-ის თანხმობა 10:44): Google-ის არქივი `~/.myavatar-gcloud`-ში (sha256 =
   Homebrew cask-ის ჩანაწერი), config `~/.config/gcloud-myavatar`, მხოლოდ `myavatar.ge@gmail.com`. Audit 2 და `MODE=plan` გაეშვა.
3. **owner (თანხმობა):** plan — `reports/2026-10-08-gcp-part0-plan.md` (2 API, bucket, SA, 2 custom role, grant-ები,
   pool/provider, ერთი impersonation binding, Preview-ში 3 ცვლადი). მხოლოდ ამის შემდეგ `MODE=apply` და read-back audit.
4. ✓ **Vercel OIDC Team mode** — უკვე ჩართულია.
5. **Claude:** AUTH VERIFIED — Preview deployment-ზე `/api/video/engine`-ის `transport` + token exchange
   (inference-ის გარეშე). INFERENCE VERIFIED — ერთი მოკლე Veo კლიპი მხოლოდ owner-ის ცალკე თანხმობით (ფასიანია).
6. **owner (Console):** trial credit-ის ნაშთი/ვადა და budget-ები (Billing → Overview / Budgets & alerts).
7. Production environment-ის დამატება (`VERCEL_ENVIRONMENTS=preview,production`) — მხოლოდ ზემოთქმულის შემდეგ და ცალკე თანხმობით.

## 9. Apply (2026-10-08, owner-ის თანხმობა 11:00 UTC)

### 9.1 გაშვება
`MODE=apply scripts/gcp/part0-wif.sh` owner-ის Mac-ზე, gcloud 587.0.0 + beta, `myavatar.ge@gmail.com`. ყოველ გაშვებაზე
სკრიპტი ჩამოიტვირთა კონკრეტული commit-იდან და sha256 შემოწმდა. სამი გაშვება დასჭირდა:
1. გაჩერდა ნაბიჯ 5-ზე: `service-accounts add-iam-policy-binding`-ს Cloud Shell-ის გარეთ `--project` სჭირდება → 33bdbce.
2. გაჩერდა Vertex AI Service Agent-ის bucket grant-ზე: ახლად შექმნილი agent IAM-ს ჯერ არ ჩანდა → retry, 2f9e101.
3. `EXIT=0`. apply idempotent-ია, ამიტომ განმეორებამ არსებული არაფერი შეცვალა.

### 9.2 Read-back (`MODE=audit`, apply-ის შემდეგ)
| რა | შედეგი |
|---|---|
| API-ები | 6/6 ჩართულია |
| pool `vercel` | `ACTIVE` |
| provider `vercel-oidc` | `ACTIVE`; issuer `https://oidc.vercel.com/kintsurashviligaga-ops-projects`; audience `https://vercel.com/kintsurashviligaga-ops-projects`; condition = team id + project id + `['preview']`; mapping `google.subject=assertion.sub` + 3 attribute |
| SA `myavatar-veo@…` | არსებობს, user-managed key **არ აქვს** |
| ვის შეუძლია SA-ს გამოყენება | `workloadIdentityUser` → მხოლოდ `…/subject/owner:kintsurashviligaga-ops-projects:project:avatar-g-frontend-v3:environment:preview`; `myavatarUrlSigner` → მხოლოდ თავად SA |
| project role | `myavatarVeoInvoker` → SA (Owner/Editor/aiplatform.user არა) |
| custom role-ები | `myavatarVeoInvoker` (`aiplatform.endpoints.predict`), `myavatarUrlSigner` (`iam.serviceAccounts.signBlob`) |
| bucket `gs://myavatar-veo-outputs` | US-CENTRAL1, uniform access, public access prevention `enforced`, Delete age 30 |
| bucket IAM | `objectCreator` + `objectViewer` → SA და `service-467145118875@gcp-sa-aiplatform…`; დანარჩენი — GCS-ის ნაგულისხმევი legacy binding-ები project owner/editor/viewer-ზე |

შენიშვნა: `roles/editor` default compute SA-ზე (§1.1) `projectEditor` legacy binding-ით ამ bucket-ზეც ვრცელდება.
მოხსნა plan-ში არ იყო; რეკომენდაციაა ცალკე გადაწყვეტილებით.

### 9.3 Vercel Preview (`vercel api`, GET read-back)
`GCP_PROJECT_ID`, `GCP_PROJECT_NUMBER=467145118875`, `GCP_SERVICE_ACCOUNT_EMAIL`, `GCP_WORKLOAD_IDENTITY_POOL_ID=vercel`,
`GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID=vercel-oidc`, `GCP_VEO_BUCKET=gs://myavatar-veo-outputs`, `GCP_VEO_LOCATION=us-central1`,
`VEO_TRANSPORT=vertex` — ყველა `plain`, მხოლოდ `preview`. ბოლო სამი დაემატა owner-ის თანხმობით. Production არ შეცვლილა.

### 9.4 AUTH შემოწმება
`/api/admin/provider-probe` (admin-only) Veo-ს ხაზზე, როცა Vertex კონფიგურირებულია, `lib/veo/authCheck.ts`-ით ამოწმებს:
`token` (Vercel OIDC → STS → SA impersonation), `bucket` (ერთი ობიექტის სია) და `sign` (IAM signBlob). Veo არ
იძახება, არაფერი ფასიანი; პასუხში მხოლოდ ნაბიჯების სახელები და redacted შეცდომებია. Unit test: 6 შემთხვევა,
token-ის არგამოჩენის ჩათვლით. AUTH VERIFIED = Preview deployment-ზე `auth:mode:wif token:ok bucket:ok sign:ok`.
