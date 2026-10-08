# GCP Part 0 — Vertex AI WIF: ანგარიში (2026-10-08)

სტატუსი: **GCP და Vercel — CONFIGURED (read-back-ით დადასტურებული). AUTH VERIFIED — Preview build-ის და function-ის იდენტობით (§9.7, §9.8). INFERENCE VERIFIED (Veo) — 15:49 UTC, Vertex-მა WIF-ით 4-წამიანი კლიპი შექმნა (§9.8); ორი ადრეული მცდელობა ჩვენი payload-ის გამო ჩავარდა, შესწორებულია (75eef69).** Gemini Vertex-ით Preview-ის runtime-იდან — INFERENCE VERIFIED 18:28 UTC (Master Task-ის თრედი, §10.4). Billing Alerts — 3 budget (§10). დარჩენილია owner-ის პუნქტი 7: credit-მა ხარჯი დაფარა თუ არა (Billing-ის ფოტო ~24 სთ-ში, §10.5).
owner-მა plan დაამტკიცა 2026-10-08 11:00 UTC-ზე; apply გაეშვა owner-ის Mac-ზე `myavatar.ge@gmail.com`-ით (§9).

| ფენა | სტატუსი |
|---|---|
| CONFIGURED (GCP: APIs, pool/provider, SA, IAM, bucket) | **CONFIGURED** — read-back audit (§9.2) |
| CONFIGURED (Vercel: OIDC Team mode, env vars) | **CONFIGURED** — OIDC `team`, Preview-ში 8/8 ცვლადი, `GCP_SERVICE_ACCOUNT_KEY` არ არის (§9.3) |
| AUTH VERIFIED (STS exchange + impersonation) | **AUTH VERIFIED** (Preview build-ის იდენტობით, 2026-10-08 14:21:20 UTC): `env=preview` `token:ok bucket:ok sign:ok` (§9.7). function-ის runtime-ში (header-იდან token) — 14:45:29 UTC, Vertex-მა `myavatar-veo` SA-ს მოთხოვნა 200-ით მიიღო (§9.8). ელფოსტის კოდით შესვლა ორი მიზეზით არ მუშაობს, Production-შიც: კოდის შემოწმება (§9.5, შესწორებულია) და Resend-ის დომენი (§9.6, owner-ის ქმედება) |
| INFERENCE VERIFIED (Veo-ს რეალური გამოძახება) | **INFERENCE VERIFIED** (15:49 UTC): operation `fbe5ed00-…` done, შეცდომის გარეშე; `gs://myavatar-veo-outputs/…/sample_0.mp4` — 4.01 წმ, 1280×720 h264 + AAC, 638,497 B (§9.8). ორი ადრეული მცდელობა (14:45, 14:52) ჩავარდა `Veo 3 prompt enhancement cannot be disabled`-ით (ჩვენი payload), ვიდეო არ შექმნილა; შესწორება 75eef69 |
| Gemini Vertex-ით Preview-ის runtime-იდან (cert branch, `GEMINI_TRANSPORT=vertex`) | **AUTH VERIFIED** 18:13 UTC, **INFERENCE VERIFIED** 18:28 UTC — `gemini-3.8-flash` 200, WIF, API key-ის გარეშე (Master Task-ის თრედი, §10.4) |
| Vertex inference: Gemini text, Gemini image, Lyria (owner-ის ანგარიშით) | **PROVEN** 11:49–11:52 UTC, ≈ $0.11; Google-ის metrics-ითაც (§10.5) |
| კოდის token flow ოფიციალურ დოკუმენტაციასთან | **REVIEWED — შესაბამისობაშია** (§3) |
| Least-privilege WIF კონფიგურაცია | **APPLIED** — `scripts/gcp/part0-wif.sh` |
| Billing: ანგარიში, Alerts | **PROVEN** — ერთადერთი ანგარიში; 3 budget, read-back (§10.1–10.2) |
| AI მოთხოვნები Vertex-ით? (owner-ის პუნქტი 4) | **Preview: Veo და Gemini — დიახ** (Gemini 18:00 UTC-დან, `GEMINI_TRANSPORT=vertex`). **Production: NO** — ყველაფერი API key-ით; გადართვა owner-ის გადაწყვეტილებაა (§10.4) |
| ჩუმი fallback / აკრძალული provider-ები (პუნქტი 5) | **NOT EXCLUDED** — ჩამონათვალი §10.4-ში; Preview-ის Veo ტესტი მათ არ ეხება |

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
| budget / alert | audit-ის დროს არცერთი (`billingbudgets` API გამორთული იყო) | PROVEN → 3 budget შეიქმნა, §10.2 |
| trial credit-ის ნაშთი და ვადა | gcloud-ით არ ჩანს; owner-ის ეკრანიდან: $300.00 / $300.00, ვადა 2026-12-31 (§10.1) | owner-confirmed |
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
3. **budget alert არ ჩანდა.** owner-ის მითითებით (პუნქტი 8) 3 budget შეიქმნა — §10.2.

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
**შედეგი (15:49 UTC, §9.8): ორივე საკმარისი აღმოჩნდა** — `PredictLongRunning` 200 SA-ის სახელით, ხოლო service agent-მა
`sample_0.mp4` bucket-ში ჩაწერა. დამატებითი permission არ დასჭირდა.

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
- TypeScript/Jest: ამ branch-ის ცვლილებებს (admin veo-smoke, provider-probe, email OTP, build-ის AUTH შემოწმება) თავისი unit test-ები აქვს (§9.4, §9.5, §9.7, §10.5);
  `tsc` და `eslint` სუფთაა. სრული baseline-ს launch-certification თრედი ფლობს.
- AUTH (Veo): build-ის log (§9.7) და function-ის runtime (§9.8). INFERENCE (Veo): VERIFIED 15:49 UTC (§9.8); T2 — §10.5.
- 75eef69: `tsc` 0, `eslint` სუფთა, jest `lib/veo lib/video app/api/admin app/api/video lib/chat components/studio` — 195 suite, 3,845 test.
- cert branch-ის შეერთება: 116ea69, b70a48f (ebec2f7-მდე) და 10f0e2a (eb4d0c1-მდე). `vercel.json`-ში ორივე build-ის შემოწმება
  რჩება: `preview-auth-check.cjs; preview-inference-check.cjs; next build`. Gemini-ის ფასიანი შემოწმების request ფაილი
  cert branch-ზე უკვე წაშლილია (dcd58990), ამიტომ აქ არ გაეშვება. 10f0e2a: `tsc` 0, `eslint` 0 შეცდომა, jest 682 suite /
  10,618 test. `components/voice/live/useGeminiLiveSession.test.tsx` სრული გაშვების 7-დან 2-ჯერ ჩავარდა და ცალკე 3/3-ჯერ გავიდა:
  დატვირთვაზე მგრძნობიარე ტესტია, ამ branch-ს და ამ შეერთებას არ ეხება (Master Task-ს გადაეცა).

## 8. ბლოკერები და შემდეგი ნაბიჯი
1. ✓ **read-only audit** — ჩატარდა (§1).
2. ✓ **gcloud owner-ის Mac-ზე** (owner-ის თანხმობა 10:44): Google-ის არქივი `~/.myavatar-gcloud`-ში (sha256 =
   Homebrew cask-ის ჩანაწერი), config `~/.config/gcloud-myavatar`, მხოლოდ `myavatar.ge@gmail.com`. Audit 2 და `MODE=plan` გაეშვა.
3. **owner (თანხმობა):** plan — `reports/2026-10-08-gcp-part0-plan.md` (2 API, bucket, SA, 2 custom role, grant-ები,
   pool/provider, ერთი impersonation binding, Preview-ში 3 ცვლადი). მხოლოდ ამის შემდეგ `MODE=apply` და read-back audit.
4. ✓ **Vercel OIDC Team mode** — უკვე ჩართულია.
5. ✓ **AUTH VERIFIED** — Preview build-ის (§9.7) და function-ის (§9.8) იდენტობით. ✓ **INFERENCE VERIFIED (Veo)** — 15:49 UTC,
   ერთი მოკლე კლიპი (owner-ის თანხმობა 11:47) owner-ის ღილაკით PR #43-ის Preview-ზე (§9.8). ორი ადრეული მცდელობა ჩვენი
   payload-ის გამო ჩავარდა, შესწორება 75eef69. Master Task-მა PROJECT_MASTER-ში ჩაწერა (dad86a69); ახალი Veo ტესტი არ იგეგმება.
6. ✓ **credit და budget-ები** — owner-ის ეკრანი + 3 budget (§10.1–10.2).
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

პირველი მცდელობა (11:18–11:20 UTC, Vercel request log-ები): owner-მა Preview-ზე `/ka/admin` გახსნა და Google-ით შევიდა,
მაგრამ OAuth callback **Production**-ზე (`myavatar.ge/auth/callback`, 11:19:53) დაბრუნდა — Supabase Auth-ის Redirect URLs-ში
Preview-ის მისამართი არ არის და Site URL-ზე გადავიდა. Preview-ზე სესია არ შეიქმნა, ამიტომ probe-მა 404 დააბრუნა.
გამოსავალი: Preview-ის `/ka/admin`-ზე email + პაროლით შესვლა (redirect არ სჭირდება), ან Supabase → Authentication →
URL Configuration → Redirect URLs-ში `https://avatar-g-frontend-v3-*-kintsurashviligaga-ops-projects.vercel.app/**` (owner-ის ცვლილება).

მეორე მცდელობა (11:50–11:57 UTC, Vercel request log-ები, deployment `goznxr4r7` = 7bc680d): owner Preview-ზე იყო, მაგრამ
შესული არა (`/api/credits/balance` → 401, `/api/admin/*` მოთხოვნა არ ყოფილა); ფოტოზე აქტიური ჩანართი Production-ის
`myavatar.ge/dashboard` იყო.

მესამე–მეხუთე მცდელობა (13:11, 13:44, 13:48 UTC, Vercel log-ის `deploymentId`/`branch`): owner **launch-certification** branch-ის
Preview-ზე იყო (`223zig3as` = 66e2a1d, შემდეგ `emtpgywow`), არა PR #43-ისაზე, ამიტომ probe და veo-smoke იქ არც არსებობს. მიზეზი:
Vercel-ის „ბოლო Preview" ყოველთვის launch-certification branch-ია, რადგან Master Task იქ ხშირად push-ავს. სესიის cookie
domain-ზეა მიბმული, ამიტომ owner-ს ყოველთვის PR #43-ის branch alias-ის სრული ბმული ეგზავნება:
`https://avatar-g-frontend-v3-git-22ebb4-kintsurashviligaga-ops-projects.vercel.app` (PR #43-ის უახლესი Ready build).

Redirect-ის გარეშე გზა (კოდიდან, PROVEN არ არის, სანამ owner არ შევა): სტუდიის შესვლის ფანჯარა (`components/chat/AuthModal.tsx`)
ელფოსტაზე 6-ციფრიან კოდს აგზავნის (`/api/auth/email-otp/send`, Resend) და `verifyOtp()`-ით სესიას **იმავე origin-ზე** ქმნის, ანუ
Supabase-ის Redirect URLs არ სჭირდება. Preview-ში ამისთვის საჭირო ცვლადები არის: `RESEND_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`NEXT_PUBLIC_SUPABASE_*` (`vercel env ls preview`, მხოლოდ სახელები). Preview და Production ერთ Supabase-ს იყენებენ, ამიტომ ეს
owner-ის ჩვეულებრივი ანგარიშის სესიაა; Production არ იცვლება.

Redirect URL-ის შესახებ (რეკომენდაცია, ცვლილება არ გაკეთებულა): wildcard `avatar-g-frontend-v3-*-kintsurashviligaga-ops-projects.vercel.app`
სხვა Vercel ანგარიშსაც შეუძლია დაემთხვეს — პროექტი სახელით `avatar-g-frontend-v3-x-kintsurashviligaga-ops-projects` production-ში
ზუსტად ასეთ `*.vercel.app` მისამართს იღებს (inferred Vercel-ის დასახელების წესიდან). PKCE code-ის გაცვლას ეს ართულებს, მაგრამ
უსაფრთხოა მხოლოდ branch alias-ის ზუსტი მისამართი: `https://avatar-g-frontend-v3-git-22ebb4-kintsurashviligaga-ops-projects.vercel.app/**`.

Probe-ის შედეგი log-შიც (commit f3578b8): Veo-ს ხაზი ერთ `console.warn`-ად იწერება —
`[provider-probe] veo ok=<bool> transport:… · vertex:ready · auth:mode:wif token:… bucket:… sign:…` — ასე AUTH-ს Vercel runtime
log-იდან ვკითხულობთ, owner-ის ფოტოს გარეშე. `console.warn` იმიტომ, რომ `next.config`-ის `removeConsole` build-ში
error/warn-ის გარდა ყველაფერს შლის (`console.info` log-ამდე ვერ აღწევს). Unit test: 4 შემთხვევა (`route.test.ts`).

### 9.5 ელფოსტის კოდით შესვლა არ მუშაობდა — Production-შიც (ნაპოვნია AUTH-ის დროს)
owner-მა Preview-ზე „კოდით შესვლა" სცადა (12:08 UTC) და ეკრანზე „კოდის გაგზავნა ვერ მოხერხდა" მიიღო. Vercel log:
`POST /api/auth/email-otp/send` → 502, `[email-otp/send] no email_otp in generateLink response`. იგივე ხაზი **Production**-ზეც
არის 2026-10-03 07:18 და 07:24 UTC-ზე (PROVEN, Vercel log), ანუ ელფოსტის კოდით შესვლა, რეგისტრაცია და პაროლის აღდგენა
სულ მცირე 10-03-დან კოდს ვერ აგზავნის. პაროლით და Google-ით შესვლას ეს არ ეხება.

მიზეზი (inferred, Supabase-ის პასუხის მნიშვნელობა არ წაგვიკითხავს): `lib/auth/otpEmail.ts` `admin.generateLink`-ის `email_otp`-ს
მხოლოდ **ზუსტად 6 ციფრის** შემთხვევაში იღებდა, Supabase-ში კი ელფოსტის OTP-ის სიგრძე პროექტის პარამეტრია (6–10). სხვა
სიგრძის კოდზე route 502-ს აბრუნებდა და ფოსტა არ იგზავნებოდა.

შესწორება (commit 87122ff, ამ branch-ზე, Preview `dpl_G1jduPBs7jKwUsrj1Cyik6SUCLQ2` Ready):
- კოდი მიიღება 6–10 ციფრით (`isEmailOtpCode`); route აბრუნებს `{ ok: true, length }`;
- თუ კოდი მაინც ვერ წაიკითხა, log-ში იწერება პასუხის ფორმა — key-ების სახელები, ტიპი და სიგრძე, **მნიშვნელობა არასდროს**
  (`describeOtpShape`);
- შესვლის ფანჯარა (`components/chat/AuthModal.tsx`) ველს, ავტომატურ შემოწმებას და ტექსტს (ka/en/ru) ამ სიგრძეზე აწყობს;
  SMS კოდი ისევ 6 ციფრია.
- შემოწმება: `tsc` და `eslint` სუფთა; jest 400/400 (`app/api/auth`, `lib/auth`, `components/chat`, api-lockdown), მათ შორის
  8-ციფრიანი კოდი → 200 და ფოსტა, 5-ციფრიანი → 502 ფოსტის გარეშე და ფორმის log-ით.

Production ამ შესწორებას მხოლოდ main-ში merge-ისა და deploy-ის შემდეგ მიიღებს (owner-ის ცალკე თანხმობა). ეს **launch blocker**-ია
და Master Task-ის თრედს გადაეცა (launch-certification branch-ზე cherry-pick `0421377a`). შესწორება **PROVEN**-ია 13:57 UTC-ზე
launch-certification-ის Preview-ზე: Supabase `generate_link` → 200 და კოდმა შემოწმება გაიარა (Vercel log). ფოსტა მაინც არ წავიდა —
§9.6.

### 9.6 Resend ფოსტას არ აგზავნის: `myavatar.ge` დადასტურებული არ არის (launch blocker, owner-ის ქმედება)
იმავე მოთხოვნაზე (13:57:04 UTC, launch-certification-ის Preview) კოდის შემდეგ Resend-მა გაგზავნა უარყო:
`[email-otp/send] resend 403 … The myavatar.ge domain is not verified` (Vercel log, PROVEN). ეს კოდის შეცდომა არ არის.
- გამგზავნი: `MAIL_FROM` დაყენებული არ არის, ამიტომ route `MyAvatar <info@myavatar.ge>`-ს იყენებს
  (`app/api/auth/email-otp/send/route.ts:23`).
- `RESEND_API_KEY` ერთია Production-ისა და Preview-სთვის (`vercel api /v10/projects/…/env`, მხოლოდ სახელები და target-ები).
  ანუ Production-შიც, 87122ff-ის deploy-ის შემდეგაც, კოდის, რეგისტრაციის და პაროლის აღდგენის წერილი არ წავა, სანამ დომენი
  არ დადასტურდება.
- owner-ის ქმედება: resend.com/domains (ის ანგარიში, რომლის key Vercel-შია) → Add Domain `myavatar.ge` → DNS-ში მოცემული
  TXT/MX ჩანაწერები → Verify.
- Master Task-მა ჩაწერა როგორც AUTH-2 (`PROJECT_MASTER.md`, `final-launch-certification.md` §Y 1a).

AUTH-ისთვის ეს ნიშნავს: Preview-ზე კოდით შესვლა დომენის დადასტურებამდე არ იმუშავებს. PR #43-ის alias-ზე სესიის დარჩენილი
გზები: email + პაროლი, ან Google, თუ owner Supabase → Authentication → URL Configuration → Redirect URLs-ში დაამატებს
ზუსტად `https://avatar-g-frontend-v3-git-22ebb4-kintsurashviligaga-ops-projects.vercel.app/**` (wildcard არა, §9.4). Admin-ია
მხოლოდ allowlist-ის ანგარიში (`lib/auth/adminGuard.ts`), ანუ შესვლა იმავე ანგარიშით, რომლითაც owner production-ის `/ka/admin`-ში შედის.

### 9.7 AUTH შესვლის გარეშე: Preview build-ის log (commit e222e38)
Vercel build-ში OIDC token `VERCEL_OIDC_TOKEN` ცვლადშია (vercel.com/docs/oidc/reference: „from the VERCEL_OIDC_TOKEN environment
variable in builds … or the x-vercel-oidc-token in Vercel functions"; build token 1 სთ). Preview build-ის token-ს იგივე `sub` აქვს
(`…:environment:preview`), რაც Preview function-ისას, ანუ იგივე provider condition და impersonation binding მოქმედებს.

`scripts/gcp/preview-auth-check.cjs` `vercel.json`-ის `buildCommand`-ში `next build`-მდე ეშვება. მხოლოდ Vercel Preview build-ზე,
`VEO_TRANSPORT=vertex`-ით, ის იგივე სამ უფასო ნაბიჯს აკეთებს, რასაც `lib/veo/authCheck.ts`: STS → SA impersonation (`token`),
bucket-ის ერთი ობიექტის სია (`bucket`), signBlob (`sign`). ბეჭდავს ერთ ხაზს
`[gcp-auth-check] env=… sub=… ok=… mode:wif token:… bucket:… sign:…` — token-ის `sub`/`environment` claim-ები და redacted
შეცდომები, token და ხელმოწერა **არასდროს**. Production, ლოკალური და CI build-ები skip-ის ხაზს ბეჭდავს. Build-ს არასდროს აჩერებს
(exit 0, 30 წმ ლიმიტი). Unit test: 9 შემთხვევა (`scripts/gcp/preview-auth-check.test.ts`); ლოკალურად ყალბი token-ით რეალური STS
`invalid_grant`-ით უარყოფს და სკრიპტი exit 0-ით სრულდება.

რას ამტკიცებს: pool, provider condition, impersonation binding, bucket grant და signBlob role Preview-ის იდენტობისთვის. რას
არა: function-ში token-ის header-იდან აღებას — ამას probe (§9.4) ან Veo კლიპი (T1, §9.8) ამტკიცებს.

შედეგი (**PROVEN**, `vercel inspect dpl_4MqG7yVGuceJ13aj8CtgyFvGstTr --logs`, commit e222e38, branch `claude/gcp-part0-wif-fmtfxp`):
```
2026-10-08T14:21:20.407Z  [gcp-auth-check] env=preview sub=owner:kintsurashviligaga-ops-projects:project:avatar-g-frontend-v3:environment:preview ok=true mode:wif token:ok bucket:ok sign:ok
```
ანუ Vercel-ის Preview იდენტობა GCP STS-მა მიიღო, `myavatar-veo` SA-ს impersonation გავიდა, bucket-ზე წვდომა და signBlob მუშაობს.
ფასი: 0 (STS, IAM Credentials, GCS list, signBlob უფასოა; მოდელი არ გამოძახებულა).

### 9.8 T1 — Veo კლიპი Vertex-ით: ორი მცდელობა ჩავარდა (14:45, 14:52), მესამე გავიდა (15:48) — INFERENCE VERIFIED
owner-მა Supabase Redirect URLs-ში PR #43-ის ზუსტი alias დაამატა (~14:44 UTC, wildcard-ის გარეშე) და Google-ით შევიდა
(14:45:07 `/auth/callback` 307 alias-ზე). პაროლით შესვლა ადრე (13:48, 13:57) `invalid_credentials`-ით უარყო Supabase-მა.
ყოველი მცდელობა owner-მა `/ka/admin/veo-smoke`-ზე ღილაკით დაიწყო. Google-ის მხარე სამივეჯერ ერთნაირად ჩანს
(Cloud Monitoring `serviceruntime.googleapis.com/api/request_count`): `aiplatform.googleapis.com`
`PredictionService.PredictLongRunning` **200 ×1** თითო წუთში — 14:45:31, 14:52:31, 15:48:31 — credential
`serviceaccount:112389782429742732379`, ანუ `myavatar-veo@gen-lang-client-0671348730.iam.gserviceaccount.com`. ესე იგი
function-ის runtime-ში OIDC token header-იდან აიღო, STS-მა მიიღო, SA-ს impersonation გავიდა, გასაღების გარეშე.

**მცდელობა 1 (14:45:29 UTC, deployment 116ea69) — FAILED, ვიდეო არ შექმნილა.**
- submit **PROVEN** (Vercel runtime log): `POST /api/admin/veo-smoke` 200,
  `[veo] submit transport=vertex model=veo-3.1-fast-generate-001 aspect=16:9 duration=4s resolution=720p adjustments=0 → ok`.
- operation-ის სახელი მაშინ log-ში არ იწერებოდა, ტელეფონის ბრაუზერმა ფონზე polling შეაჩერა, ხოლო გვერდის გადატვირთვამ
  operation დაკარგა. ამიტომ ამ მცდელობის შედეგი პირდაპირ არ წაკითხულა. bucket ცარიელი დარჩა; იგივე payload-ით იგივე
  შეცდომა იქნებოდა (inferred).

**მცდელობა 1b (14:52:30 UTC, იგივე deployment) — FAILED, ვიდეო არ შექმნილა.** owner-მა გვერდი გადატვირთა და ხელახლა
დააჭირა, სანამ ჩემი გაფრთხილება მივიდოდა. ეკრანი 14:52:59-ზე: `failed: Veo 3 prompt enhancement cannot be disabled.`,
operation `projects/gen-lang-client-0671348730/locations/us-central1/publishers/google/models/veo-3.1-fast-generate-001/operations/71e35314-405b-49b8-a4cf-8fe2dc46ecf9`.

- **მიზეზი — PROVEN** (იგივე შეცდომა): `lib/veo/payload.ts` `buildVertexPayload` ნაგულისხმევად `enhancePrompt: false`-ს
  აგზავნიდა, Veo 3.x კი გამორთვას არ იღებს. ანუ Vertex-ზე ყოველი Veo render (სტუდია, რეჟისორი, ეს ტესტი) ასე ჩავარდებოდა.
  Production-ს დღეს არ ეხება: ის Gemini API-ით მიდის, სადაც ეს ველი არ იგზავნება.
- **შესწორება — commit 75eef69:** ველი იგზავნება მხოლოდ `true`-ზე; რეჟისორის wire-შემოწმება `parameters.enhancePrompt === true`-ს
  კითხულობს; `[veo] submit` log-ში `op=<operation>` იწერება (ასე ოპერაცია Vercel log-იდანაც მოიძებნება); veo-smoke გვერდი
  ოპერაციას reload-ის შემდეგაც ინახავს და 30 წთ-მდე ამოწმებს.
- **V3-ის მნიშვნელობა (Master Task-ს გადაეცა):** Veo 3.x-ზე Google prompt-ს ყოველთვის თავისთან გადაწერს. ჩვენგან prompt
  byte-for-byte გადის, მაგრამ მოდელის შიგნით — არა. სტუდიის „Google-მა გადაწეროს აღწერა" გადამრთველს Vertex-ზე გამორთვა აღარ შეუძლია.

**მცდელობა 2 (15:48:21 UTC, deployment 75eef69) — PASSED: INFERENCE VERIFIED (Veo).**
- submit **PROVEN** (Vercel runtime log): `[veo] submit transport=vertex model=veo-3.1-fast-generate-001 aspect=16:9 duration=4s
  resolution=720p adjustments=0 → ok op=…/operations/fbe5ed00-a3cd-47f2-ab4a-3d7f4bcd45b4`.
- operation **PROVEN** (`fetchPredictOperation`, owner-ის Mac, `myavatar.ge@gmail.com`): `done=true`, შეცდომის გარეშე,
  `raiMediaFilteredCount=0`.
- ობიექტი **PROVEN**: `gs://myavatar-veo-outputs/veo/admin-veo-smoke-1791474503054/0-0b0a94b5/3505283432834505055/sample_0.mp4`,
  ჩაწერილია 15:49:11 UTC, 638,497 B. ჩაწერა Vertex-ის service agent-მა შეძლო, ანუ bucket-ის IAM საკმარისია (§4.4).
- ფაილი **PROVEN** (`ffprobe`): h264 1280×720, 24 fps, AAC ხმა, 4.01 წმ. 2-ე წამის კადრში prompt-ის ფინჯანი, ფანჯარა და
  ორთქლი ჩანს; ხმა mean −41.3 dB, max −19.4 dB (ჩუმი ფონი, არა სიჩუმე). ასლი owner-ის Mac-ზე:
  `~/.myavatar-gcloud/test-out/t1/veo-t1.mp4` (sha256 `13389b57ef7afee7…`).
- Master Task-მა შედეგი PROJECT_MASTER-ში ჩაწერა (dad86a69: Part 0 — INFERENCE VERIFIED (Veo), STOP-1 მოხსნილია).
  ახალი Veo ტესტი არ იგეგმება.

**ფასი:** ერთი კლიპი ≈ $0.40 (Veo 3.1 Fast, 4 წმ ხმით; ფასების ცხრილით, inferred). 1 და 1b-მ ვიდეო არ შექმნა, ამიტომ
მოსალოდნელია $0 (inferred). ორივე Billing → Reports-ით მოწმდება (§10.5, პუნქტი 7).

## 10. owner-ის 8 პუნქტი (2026-10-08 11:08 UTC): billing, მოდელები, კოდი, ტესტი
ყველაფერი read-only-ა, გარდა `billingbudgets` API-ის ჩართვისა და 3 budget-ის შექმნისა (პუნქტი 8, owner-ის მითითება).
ფასიანი არაფერი გაშვებულა. GCP — owner-ის Mac, `myavatar.ge@gmail.com`; Vercel — `vercel api`, მხოლოდ ცვლადების სახელები და target-ები.

### 10.1 Billing ანგარიში (პუნქტი 1)
| რა | შედეგი | სტატუსი |
|---|---|---|
| ანგარიშები, რომლებსაც `myavatar.ge@gmail.com` ხედავს | ერთი: `01AE3E-0F0B75-C73B11` "My Billing Account", `open: True` | PROVEN |
| ამ ანგარიშზე მიბმული პროექტები | მხოლოდ `gen-lang-client-0671348730` | PROVEN |
| $300 Free Credit | $300.00 / $300.00, ვადა 2026-12-31, "Not applicable to Gemini API" (AI Studio-ს Billing ეკრანი) | owner-confirmed |
| AI Studio / Gemini API ბალანსი | $13.21, auto-reload OFF — ცალკე ბალანსია | owner-confirmed |
| credit სწორედ ამ ანგარიშზეა? | პროექტს სხვა ანგარიში არ აქვს და owner-მა credit ამ პროექტის Billing-ში დაინახა | **INFERRED**; ფაქტობრივად მტკიცდება პირველი ტესტის შემდეგ (test plan §6) |
gcloud credit-ის ნაშთს და trial-ის სტატუსს არ აჩვენებს — ეს მხოლოდ Console-შია.

### 10.2 Billing Alerts (პუნქტი 8)
`billingbudgets.googleapis.com` ჩაირთო პროექტზე (უფასოა). შეიქმნა და read-back-ით შემოწმდა:
| budget | თანხა | რას ითვლის | პერიოდი | გაფრთხილება |
|---|---|---|---|---|
| MyAvatar Vertex test - gross usage | $10 | მთლიანი ხარჯი credit-მდე (`EXCLUDE_ALL_CREDITS`) | თვე | 50%, 90%, 100%, პროგნოზი 100% |
| MyAvatar 300 USD credit guard - gross usage | $300 | მთლიანი ხარჯი credit-მდე | წელი | 25%, 50%, 75%, 90%, 100% |
| MyAvatar out-of-pocket cost - after credits | $1 | რასაც credit არ ფარავს (`INCLUDE_ALL_CREDITS`) | თვე | 50%, 100% |
email-ები billing ანგარიშის admin-ებს მიდის (ნაგულისხმევი IAM მიმღებები, `myavatar.ge@gmail.com`).
**Budget Alert ხარჯს არ აჩერებს** — მხოლოდ აფრთხილებს, თანაც დაგვიანებით. ავტომატური გაჩერება შესაძლებელია ორი გზით,
ორივე ცალკე გადაწყვეტილებაა და ახლა არ კეთდება:
- Vertex-ის კვოტის შემცირება (მაგ. Veo 50 → 2 მოთხოვნა/წთ) — ზღუდავს სიჩქარეს, თანხას არა;
- budget → Pub/Sub → Cloud Function, რომელიც პროექტს billing-ს უთიშავს — ნამდვილი გაჩერებაა, მაგრამ ყველა სერვისს
  აჩერებს და რესურსები შეიძლება დაიკარგოს; Production-ისთვის საშიშია.

### 10.3 მოდელები, რეგიონები, კვოტები, ფასები (პუნქტი 3)
წყარო: Vertex Model Garden API (`publishers/google/models`, us-central1 და global), Service Usage consumer quotas
(372 metric), Google-ის „Agent Platform Pricing" გვერდი.
| მოდალობა | მოდელი | სტატუსი | რეგიონი | კვოტა (ამ პროექტზე) | ფასი |
|---|---|---|---|---|---|
| Video | `veo-3.1-generate-001` | GA | us-central1 | 50 მოთხ./წთ | ხმით $0.40/წმ (720p/1080p), 4k $0.60; ხმის გარეშე $0.20 |
| Video | `veo-3.1-fast-generate-001` | GA | us-central1 | 50 მოთხ./წთ | ხმით 720p $0.10/წმ, 1080p $0.12, 4k $0.30; ხმის გარეშე $0.08 / $0.10 / $0.25 |
| Video | `veo-3.1-lite-generate-001` | Preview | us-central1 | 50 მოთხ./წთ | ხმით 720p $0.05/წმ, 1080p $0.08; ხმის გარეშე $0.03 / $0.05 |
| Text | `gemini-3.8-flash` | GA | us-central1, global | ცალკე კვოტა არ აქვს (dynamic shared quota) | $0.75 / $3.75 per 1M token (global, 2026-12-31-მდე); შემდეგ $1.50 / $7.50 |
| Text | `gemini-3.1-pro-preview` | Preview | us-central1, global | dynamic shared quota | $2.00 / $12.00 per 1M token |
| Image | `gemini-3.1-flash-image` | GA | us-central1, global | **2 მოთხ./წთ** | 1K ≈ $0.067, 2K ≈ $0.101, 4K ≈ $0.15 |
| Image | `gemini-3-pro-image` | GA | us-central1, global | **2 მოთხ./წთ** | 1K/2K ≈ $0.134, 4K ≈ $0.24 |
| Image | `imagen-4.0-*` | **არ არის** (404 v1/v1beta1-ზე, სიაშიც არ ჩანს) | — | კვოტის ხაზი არსებობს, მოდელი არა | ფასების გვერდზე $0.02–0.06 |
| Music | `lyria-3-clip-preview` | Preview | global | 100 მოთხ./წთ | $0.04 / 30-წამიანი კლიპი |
| Music | `lyria-002` | GA | us-central1 | 10 მოთხ./წთ | $0.06 / გენერაცია |
| TTS | `gemini-2.5-flash-tts`, `gemini-2.5-pro-tts` | GA | us-central1, global | 10 მოთხ./წთ | — |
დასკვნები: (1) კოდის image გზა `imagen-4.0-generate-001`-ს იყენებს, რომელიც Vertex-ზე ამ პროექტისთვის არ არის —
Part 1-ში image უნდა გადავიდეს `gemini-3.1-flash-image`-ზე. (2) image-ის 2 მოთხ./წთ Production-ისთვის ცოტაა; კვოტის
გაზრდის მოთხოვნა უფასოა (Console → IAM & Admin → Quotas), owner-ის მიერ. (3) კვოტის არსებობა მოდელის არსებობას
არ ნიშნავს (Imagen 4).

### 10.4 AI მოთხოვნები Vertex-ით მიდის? ჩუმი fallback? (პუნქტები 4–5)
კოდის აუდიტი: branch `claude/gcp-part0-wif-fmtfxp`, read-only. Vercel: ცვლადების სახელები და target-ები (მნიშვნელობები არა).
**პასუხი: არა.** Vertex-ზე მხოლოდ Veo-ს შეუძლია წასვლა (`lib/veo/*`). ყველა სხვა Google გამოძახება (chat, image, music,
TTS, STT, Live, embeddings, search grounding, Deep Research, prompt translation) Gemini Developer API-ზე მიდის API
key-ით (`lib/orchestrator/gemini-guard.ts:30-38` + 21 ფაილი). `@ai-sdk/google-vertex` და `@google/genai` დაყენებული არ არის.

| გარემო | ცვლადები (სახელები) | Veo | სხვა Google | რომელი ბალანსი |
|---|---|---|---|---|
| Production | `GEMINI_API_KEY`; `GCP_*` და `VEO_TRANSPORT` არ არის | Gemini API (`veoTransport()` auto → `gemini`, `lib/veo/engine.ts:56-57`) | Developer API | **AI Studio $13.21** |
| Preview | `GCP_*` 7 + `VEO_TRANSPORT=vertex`; Gemini key არ არის | **მხოლოდ Vertex** (pinned) | არ მუშაობს (key არ არის) | $300 credit (Veo) |

ჩუმი fallback-ები (ამ ეტაპზე არცერთი არ შეცვლილა, ჩამონათვალი Part 1/2-ისთვის):
1. `lib/veo/engine.ts:56-57` — `VEO_TRANSPORT` თუ არ არის, Vertex-ის კონფიგის ნებისმიერი ცვლადის დაკარგვისას შემდეგი კლიპი
   ჩუმად Gemini API-ზე წავა. დაცვა: `VEO_TRANSPORT=vertex` (Preview-ში უკვე არის).
2. Claude gate-ის გარეშე: `lib/chat/providerRouter.ts:1543, 1612` (`/api/chat/orchestrate`), `lib/agentg/personality.ts:248`
   (`/api/agent-g/chat`), `app/api/pipeline/route.ts:708, 736, 855`. `ANTHROPIC_API_KEY` Production-შია.
3. Image: `app/api/nanobanana/image/route.ts:319→354→371` — NanoBanana → Grok → FLUX/Replicate; Google image leg არ აქვს.
4. Music: `app/api/ai/music/route.ts:232-241` — Lyria → Udio → ElevenLabs → Replicate MusicGen (ბოლო ყოველთვის ემატება).
5. Avatar: HeyGen → Replicate SadTalker; LiveAvatar. Google-ის გზა არ არსებობს.
6. Voice: OpenAI (Telegram STT, calls, realtime, pipeline TTS), Azure TTS, Google Cloud TTS `GEMINI_API_KEY`-ით.
7. `lib/ai/llmText.ts:103` — DeepSeek → Atlas → Gemini → Anthropic, თუ caller `googleOnly`-ს არ გადასცემს.
8. `AI_GOOGLE_ONLY` / `VIDEO_GOOGLE_ONLY` ნაგულისხმევად ჩართულია და არცერთ გარემოში არ არის `0`; ისინი Anthropic/Runway/Kling-ის
   ნაწილს ბლოკავს, მაგრამ Developer API-ს — არა.
Production-ის Vertex-ზე გადაყვანა = Production env-ის ცვლილება + deploy (owner-ის ცალკე თანხმობა) + Part 1-ის კოდი
(text/image/music Vertex-ის კლიენტზე). Preview-ის ტესტი (§10.5) ამ ჩამონათვალს არ ეხება.

**განახლება 18:35 UTC (cert branch, ამ branch-ში 10f0e2a-ით შემოვიდა).** Part 1–2-ის კოდმა ეს სურათი Preview-ში შეცვალა:
Google-ის text/STT/TTS/embeddings/orchestrator გამოძახებები `GEMINI_TRANSPORT`-ს მიჰყვება (Part 2 A2), Preview-ში
`GEMINI_TRANSPORT=vertex` 18:00 UTC-დან. Master Task-ის თრედის შედეგი: Gemini Vertex-ით Preview-ის runtime-იდან
**AUTH VERIFIED** 18:13 UTC (`/api/preview/google-check`, შესვლის გარეშე, უფასო) და **INFERENCE VERIFIED** 18:28 UTC
(`scripts/gcp/preview-inference-check.cjs`, owner-ის თანხმობით ერთი პასუხი: `gemini-3.8-flash` 200, „ok", 67 token, WIF,
API key-ის გარეშე). `-latest` alias-ები Vertex-ზე არ არსებობს (c44ba0e9). ზემოთ ჩამოთვლილი fallback-ების ნაწილი cert
branch-ზე უკვე მოხსნილია (R7: image და music, pipeline-ის text Gemini-only); ზუსტი მდგომარეობა certification §L-შია.
**Production უცვლელია:** ყველაფერი API key-ით მიდის, Vertex-ზე გადართვა owner-ის გადაწყვეტილებაა (env + deploy).

### 10.5 ფასიანი ტესტი (პუნქტები 6–7)
გეგმა: `docs/handoffs/2026-10-08-gcp-part0-test-plan.md`. მოკლედ: T1 — ერთი Veo 3.1 Fast კლიპი (4 წმ, 720p, ხმით, ≈ $0.40)
Preview-ზე admin-ის გვერდიდან `/ka/admin/veo-smoke`; T2 — `gemini-3.8-flash`, `gemini-3.1-flash-image`, `lyria-3-clip-preview`
Vertex-ზე owner-ის ანგარიშით (≈ $0.12). ჯამი ≈ $0.52, ზღვარი $2. ~24 სთ-ის შემდეგ owner Billing → Reports-ში და Credits-ში
ამოწმებს, რომ subtotal ≈ $0 და credit ≈ $299.48 (პუნქტი 7).
ტესტის გვერდი: `app/[locale]/admin/veo-smoke/page.tsx` + `app/api/admin/veo-smoke/route.ts` + `lib/veo/smoke.ts`. admin-only
(სხვას 404), submit მხოლოდ `POST {confirm:"paid-test"}`-ით (GET და prefetch არაფერს უშვებს), `VEO_TRANSPORT=vertex`-ის
გარეშე 409, ერთი submit retry-ის გარეშე, DB-ში არაფერს წერს. Unit test: 9 შემთხვევა (`lib/veo/smoke.test.ts`).

**T2 შედეგი (11:49–11:52 UTC, owner-ის თანხმობით 11:47):** `gemini-3.8-flash` 200, `gemini-3.1-flash-image` 200 (PNG 1024×1024),
`lyria-3-clip-preview` 200 (MP3 30.8 წმ) — ჯამი ≈ $0.11. Lyria-ს პირველი მოთხოვნა 400 იყო (`["AUDIO"]`; არ ირიცხება),
მეორე `["AUDIO","TEXT"]`-ით გავიდა. დეტალები: test plan §8. credit-ით დაფარვა ~24 სთ-ში მოწმდება.

**T1 შედეგი (15:49 UTC):** INFERENCE VERIFIED (Veo) — operation `fbe5ed00-…` done, `sample_0.mp4` 4.01 წმ 1280×720 ხმით,
WIF-ით, გასაღების გარეშე (§9.8). ორი ადრეული მცდელობა (14:45, 14:52) payload-ის გამო ჩავარდა, ვიდეო არ შექმნილა.

**ხარჯის ჯამი (inferred, ფასების ცხრილით):** T1 ≈ $0.40 + T2 ≈ $0.11 + Master Task-ის Gemini-ის ერთი მოკლე პასუხი
(67 token, ≪ $0.01) ≈ **$0.51**; ჩავარდნილი Veo ოპერაციები ≈ $0. ზღვარი $2 არ გადაცილებულა. პუნქტი 7: ~24 სთ-ის შემდეგ
(2026-10-09 ~16:00 UTC-დან) owner Billing → Reports-ში (Group by SKU) და Credits-ში ამოწმებს, რომ Subtotal ≈ $0 და
credit ≈ $299.49; ფოტო Claude-ს. მანამდე „credit-მა დაფარა" — **BLOCKED_OWNER**.

**T2 Google-ის მხრიდან (PROVEN, Cloud Monitoring `serviceruntime.googleapis.com/api/request_count`, 12:00 UTC, ბოლო 3 სთ):**
`aiplatform.googleapis.com` → `PredictionService.GenerateContent` **200 ×3, 400 ×1**, credential = owner-ის gcloud OAuth client;
დანარჩენი მხოლოდ model-ის metadata (`GetPublisherModel`/`ListPublisherModels`, უფასო). `generativelanguage.googleapis.com`
ამ პროექტზე იმავე 3 საათში — **0 მოთხოვნა**, ანუ ტესტი AI Studio-ს API-ზე არ წასულა. Monitoring billing-ს არ აჩვენებს:
credit-ით დაფარვა მაინც Billing → Reports-ით მოწმდება (პუნქტი 7). სკრიპტი: owner-ის Mac `~/.myavatar-gcloud/mon.sh` (read-only).
