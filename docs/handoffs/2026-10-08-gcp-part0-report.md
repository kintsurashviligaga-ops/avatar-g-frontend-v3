# GCP Part 0 — Vertex AI WIF: ანგარიში (2026-10-08)

სტატუსი: **Part 0 არ არის დასრულებული.** GCP-ის არცერთი მონაცემი ამ სესიიდან არ არის დადასტურებული; ქვემოთ ყველა GCP
მნიშვნელობა მონიშნულია `UNVERIFIED`, სანამ owner-ის read-only audit-ის output არ დაბრუნდება.

| ფენა | სტატუსი |
|---|---|
| CONFIGURED (GCP: billing, APIs, pool/provider, SA, IAM, bucket) | **UNVERIFIED** — წასაკითხი წვდომა არ მქონდა |
| CONFIGURED (Vercel: OIDC Team mode, env vars) | **UNVERIFIED** — Vercel API 403 |
| AUTH VERIFIED (STS exchange + impersonation) | **NOT RUN** |
| INFERENCE VERIFIED (Veo-ს რეალური გამოძახება) | **NOT RUN** (ფასიანია — ცალკე თანხმობა სჭირდება) |
| კოდის token flow ოფიციალურ დოკუმენტაციასთან | **REVIEWED — შესაბამისობაშია** (§3) |
| Least-privilege WIF კონფიგურაცია | **BUILT** — `scripts/gcp/part0-wif.sh` (plan რეჟიმი შემოწმებულია fake gcloud-ით) |

## 1. რა შევამოწმე და რით

| რა | შედეგი | მტკიცებულება |
|---|---|---|
| GCP credentials ამ გარემოში | არ არის | `gcloud auth list` → "No credentialed accounts" |
| Vercel project/team API | 403 | `GET /v9/projects/prj_k4LQeBUGIAfsXC3ijPTXplTWM5eH?teamId=team_YGQH…` → `403 forbidden … scope "kintsurashviligaga-ops-projects"` |
| Vercel team slug | `kintsurashviligaga-ops-projects` — **API-ის მიერ დასახელებული** | იგივე 403 პასუხი team id `team_YGQHjuCUs0f7tKoLtrCgSIFG`-ს ამ scope-ად ასახელებს. ეს არის Vercel-ის პასუხი, არა გამოცნობა; საბოლოოდ დასტურდება Vercel → Settings → General-ში ან audit-ის შემდეგ AUTH ტესტით |
| GCP project number, billing, credit, pool/provider, SA, IAM, bucket, APIs | **UNVERIFIED** | წვდომა არ არის; იხ. §6, owner-ის ერთი read-only ბრძანება |
| myavatar.ge / Console | proxy-ით დაბლოკილია ამ sandbox-დან | წინა audit (repo-state-2026-10-08) |

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
   `//iam.googleapis.com/projects/{PROJECT_NUMBER}/locations/global/workloadIdentityPools/vercel/providers/vercel-oidc`.
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
| Vertex AI Service Agent `service-{N}@gcp-sa-aiplatform…` | `objectCreator` + `objectViewer` | bucket | gs:// input-ის წაკითხვა, `sample_N.mp4`-ის ჩაწერა |

### 4.3 Impersonation — მხოლოდ კონკრეტული federated principal
`roles/iam.workloadIdentityUser` SA-ზე, member:
`principal://iam.googleapis.com/projects/{N}/locations/global/workloadIdentityPools/vercel/subject/owner:kintsurashviligaga-ops-projects:project:avatar-g-frontend-v3:environment:preview`

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
| API | სტატუსი | სჭირდება |
|---|---|---|
| aiplatform.googleapis.com | UNVERIFIED | Veo |
| iam.googleapis.com | UNVERIFIED | pool/provider, custom roles |
| iamcredentials.googleapis.com | UNVERIFIED | generateAccessToken, signBlob |
| sts.googleapis.com | UNVERIFIED | token exchange |
| serviceusage.googleapis.com | UNVERIFIED | API მართვა |
| storage.googleapis.com | UNVERIFIED | bucket |

ჩართვის ფარგლები: API-ის ჩართვა უფასოა; ხარჯი იწყება მხოლოდ გამოყენებისას (Veo წამზე, GCS შენახვა). bucket-ის
შექმნა ცარიელ bucket-ს ქმნის 30-დღიანი წაშლის წესით — თითქმის ნულოვანი ხარჯი, მაგრამ მაინც apply-ის ნაწილია
და owner-ის თანხმობით ეშვება.

## 6. Vercel environment variables (მხოლოდ **Preview**)
| სახელი | მნიშვნელობა | სტატუსი |
|---|---|---|
| `GCP_PROJECT_ID` | `gen-lang-client-0671348730` | owner-ის მიერ მოცემული |
| `GCP_PROJECT_NUMBER` | audit-იდან | UNVERIFIED |
| `GCP_SERVICE_ACCOUNT_EMAIL` | `myavatar-veo@gen-lang-client-0671348730.iam.gserviceaccount.com` | apply-ის შემდეგ |
| `GCP_WORKLOAD_IDENTITY_POOL_ID` | `vercel` | apply-ის შემდეგ |
| `GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID` | `vercel-oidc` | apply-ის შემდეგ |
| `GCP_VEO_BUCKET` | `gs://myavatar-veo-outputs` (თუ სახელი თავისუფალია) | apply-ის შემდეგ |
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
1. **owner (read-only):** Cloud Shell-ში `MODE=audit ./scripts/gcp/part0-wif.sh` და output-ის დაბრუნება. ეს ავსებს §1/§5-ის
   UNVERIFIED ველებს (project number, billing, budget, pools, SA, IAM, bucket, APIs). Credit-ის ნაშთი gcloud-ით არ ჩანს:
   Console → Billing → Credits.
2. **owner (თანხმობა + ცვლილება):** audit-ის შემდეგ `MODE=plan`-ის განხილვა და `MODE=apply`; Vercel-ში OIDC Team mode და §6-ის ცვლადები Preview-ში.
3. **Claude:** AUTH VERIFIED — Preview deployment-ზე `/api/video/engine`-ის `transport` + token exchange-ის შემოწმება
   (inference-ის გარეშე). INFERENCE VERIFIED — ერთი მოკლე Veo კლიპი მხოლოდ owner-ის ცალკე თანხმობით (ფასიანია).
4. Production environment-ის დამატება (`VERCEL_ENVIRONMENTS=preview,production`) — მხოლოდ ზემოთქმულის შემდეგ და ცალკე თანხმობით.
