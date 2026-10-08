# GCP Part 0 — Vertex AI WIF: ანგარიში (2026-10-08)

სტატუსი: **Part 0 არ არის დასრულებული.** read-only audit ჩატარდა (owner-ის Cloud Shell, `myavatar.ge@gmail.com`,
2026-10-08): პროექტი და billing დადასტურებულია, WIF-ის არცერთი ნაწილი ჯერ **არ არსებობს**. least-privilege
კონფიგურაცია მზადაა და owner-ის თანხმობას ელოდება.

| ფენა | სტატუსი |
|---|---|
| CONFIGURED (GCP: APIs, pool/provider, SA, IAM, bucket) | **NOT CONFIGURED** — pool/provider, `myavatar-veo` SA, custom role-ები და bucket არ არსებობს; 6-დან 4 API ჩართულია (§1) |
| CONFIGURED (Vercel: OIDC Team mode, env vars) | **UNVERIFIED** — Vercel API 403 |
| AUTH VERIFIED (STS exchange + impersonation) | **NOT RUN** — გასაცვლელი provider ჯერ არ არსებობს |
| INFERENCE VERIFIED (Veo-ს რეალური გამოძახება) | **NOT RUN** (ფასიანია — ცალკე თანხმობა სჭირდება) |
| კოდის token flow ოფიციალურ დოკუმენტაციასთან | **REVIEWED — შესაბამისობაშია** (§3) |
| Least-privilege WIF კონფიგურაცია | **BUILT** — `scripts/gcp/part0-wif.sh`; apply ელოდება owner-ის თანხმობას |

## 0. ანგარიში
GCP-ზე ყოველი წაკითხვა და ცვლილება მხოლოდ `myavatar.ge@gmail.com`-ით (owner-ის მითითება, 2026-10-08).
`part0-wif.sh` ჩერდება (exit 3) ნებისმიერ რეჟიმში, თუ gcloud-ის აქტიური ანგარიში სხვაა. ამ ანგარიშის წვდომა
პროექტზე **PROVEN**: audit-ის ანგარიშის შემოწმება გავიდა და `projects describe` წარმატებით შესრულდა.

## 1. რა შევამოწმე და რით

**Audit:** owner-მა read-only ბლოკი (ცვლილების გარეშე, prompt-ები გამორთული) გაუშვა Cloud Shell-ში
`myavatar.ge@gmail.com`-ით და output-ის ფოტო დააბრუნა; ქვემოთ ყველა მნიშვნელობა ფოტოსთან არის გადამოწმებული.

| რა | შედეგი | სტატუსი |
|---|---|---|
| gcloud-ის აქტიური ანგარიში | `myavatar.ge@gmail.com` | PROVEN |
| პროექტი | `gen-lang-client-0671348730`, number **`467145118875`**, name "Default Gemini Project", `ACTIVE` | PROVEN |
| billing | მიბმულია, `billingEnabled: True`; ანგარიში "My Billing Account" (`01AE3E-…-C73B11`), `open: True` | PROVEN |
| budget / alert | `billingbudgets.googleapis.com` პროექტზე ჩართული არ არის (`SERVICE_DISABLED`), ამიტომ gcloud-მა ვერ წაიკითხა | **UNVERIFIED** — Console → Billing → Budgets & alerts |
| trial credit-ის ნაშთი და ვადა | gcloud-ით არ ჩანს | **UNVERIFIED** — Console → Billing → Overview / Credits |
| API-ები | ჩართულია: `aiplatform`, `iam`, `iamcredentials`, `sts`. **არ ჩანს:** `serviceusage`, `storage` | PROVEN (§5) |
| WIF pool / provider | არცერთი | PROVEN (წაშლილი pool-ები სიაში არ ჩანს; შემოწმდება `--show-deleted`-ით) |
| service account-ები | `vertex-express@…`, `467145118875-compute@developer…`, `ais-gemini-key-e53c…@467145118875.iam…` | PROVEN |
| `myavatar-veo@…` SA | `NOT_FOUND` (ამიტომ key-ებიც არ აქვს) | PROVEN |
| SA-ების project role-ები | `aiplatform.expressUser` → `vertex-express`; `roles/editor` → default compute SA; დანარჩენი Google-ის service agent-ებია (compute, instanceGroupManager, notebooks) | PROVEN |
| Vertex AI Service Agent | project IAM-ში არ ჩანს (`service-467145118875@gcp-sa-aiplatform…`) | plan-ის ნაბიჯი 5 ქმნის |
| custom role-ები | არცერთი | PROVEN |
| bucket-ები | არცერთი; სახელი `myavatar-veo-outputs` თავისუფალია (GCS JSON API, ანონიმური → `404 notFound`) | PROVEN |
| Vercel project/team API | 403 (`scope "kintsurashviligaga-ops-projects"`) | UNVERIFIED |
| Vercel team slug | `kintsurashviligaga-ops-projects` — Vercel-ის 403 პასუხი team id-ს ამ scope-ად ასახელებს (არა გამოცნობა) | საბოლოოდ დასტურდება AUTH ტესტით |

### 1.1 უსაფრთხოების დაკვირვებები (ცვლილება არ გაკეთებულა)
1. **`roles/editor` default compute SA-ზე** (`467145118875-compute@developer…`) — Google-ის ნაგულისხმევი, ფართო
   უფლება. ჩვენი ნაკადი მას არ იყენებს. მოხსნა ცალკე გადაწყვეტილებაა (შეიძლება Compute/Notebooks-ს სჭირდებოდეს).
2. **`vertex-express` (`roles/aiplatform.expressUser`) და `ais-gemini-key-…`** — Vertex express mode-ისა და AI Studio-ს
   API key-ების SA-ები. ესე იგი პროექტზე API key-ზე დაფუძნებული გზები შეიძლება არსებობდეს, რაც WIF-only მიზანს და
   „AI Studio-ზე fallback არა" წესს ეწინააღმდეგება. ახლა არაფერს ვცვლი: production შეიძლება მათ ჯერ კიდევ იყენებდეს
   (Part 2). შემდეგი read-only შემოწმება: API key-ების metadata (key string-ის გარეშე) და ამ SA-ების user-managed key-ები.
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
| `GCP_PROJECT_ID` | `gen-lang-client-0671348730` | owner-ის მიერ მოცემული |
| `GCP_PROJECT_NUMBER` | `467145118875` | PROVEN (audit) |
| `GCP_SERVICE_ACCOUNT_EMAIL` | `myavatar-veo@gen-lang-client-0671348730.iam.gserviceaccount.com` | apply-ის შემდეგ |
| `GCP_WORKLOAD_IDENTITY_POOL_ID` | `vercel` | apply-ის შემდეგ |
| `GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID` | `vercel-oidc` | apply-ის შემდეგ |
| `GCP_VEO_BUCKET` | `gs://myavatar-veo-outputs` (სახელი თავისუფალია) | apply-ის შემდეგ |
| `GCP_VEO_LOCATION` | `us-central1` | — |
| `VEO_TRANSPORT` | `vertex` | — |
`GCP_SERVICE_ACCOUNT_KEY` — **არ** ისმება. `GEMINI_TRANSPORT` და Gemini-ს Vertex ცვლადები — ჯერ არა (Part 2).
Vercel → Settings → Security → OIDC Federation: Enabled, Issuer Mode **Team**.

## 7. ტესტები
- `bash -n scripts/gcp/part0-wif.sh`, `bash -n scripts/gcp/setup-veo-vertex.sh` — OK.
- `MODE=plan` fake `gcloud`-ით: ბრძანებები, condition და principal-ები სწორად იბეჭდება (§4).
- TypeScript/Jest: TS კოდი არ შეცვლილა; baseline-ს launch-certification თრედი ფლობს.
- AUTH/INFERENCE: არ გაშვებულა.

## 8. ბლოკერები და შემდეგი ნაბიჯი
1. ✓ **read-only audit** — ჩატარდა (§1).
2. **Claude:** gcloud owner-ის Mac-ზე (owner-ის თანხმობა 10:44), ცალკე config-ით `~/.config/gcloud-myavatar`, მხოლოდ
   `myavatar.ge@gmail.com`; შესვლის Allow-ს owner აჭერს. შემდეგ დამატებითი read-only შემოწმება (წაშლილი pool-ები,
   API key-ების metadata, SA key-ები, Vertex Service Agent) და `MODE=plan` რეალურ პროექტზე.
3. **owner (თანხმობა):** plan-ის ზუსტი ცვლილებები — 2 API, bucket, SA, 2 custom role, grant-ები, pool/provider, ერთი
   impersonation binding. მხოლოდ ამის შემდეგ `MODE=apply` და read-back audit.
4. **Vercel:** OIDC Federation Team mode და §6-ის ცვლადები მხოლოდ Preview-ში.
5. **Claude:** AUTH VERIFIED — Preview deployment-ზე `/api/video/engine`-ის `transport` + token exchange
   (inference-ის გარეშე). INFERENCE VERIFIED — ერთი მოკლე Veo კლიპი მხოლოდ owner-ის ცალკე თანხმობით (ფასიანია).
6. **owner (Console):** trial credit-ის ნაშთი/ვადა და budget-ები (Billing → Overview / Budgets & alerts).
7. Production environment-ის დამატება (`VERCEL_ENVIRONMENTS=preview,production`) — მხოლოდ ზემოთქმულის შემდეგ და ცალკე თანხმობით.
