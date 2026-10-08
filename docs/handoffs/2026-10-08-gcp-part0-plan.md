# GCP Part 0 — apply-ის გეგმა დასამტკიცებლად (2026-10-08)

წყარო: `MODE=plan scripts/gcp/part0-wif.sh` (commit fb02b0d), გაშვებული GG-ის Mac-ზე, gcloud
`myavatar.ge@gmail.com`-ით. ეს გეგმა მხოლოდ ბეჭდავს ბრძანებებს, არაფერს უშვებს.

## რა შეიცვლება (gen-lang-client-0671348730, number 467145118875)

| # | ცვლილება | რატომ |
|---|---|---|
| 1 | ჩაირთვება 2 API: `serviceusage`, `storage` (დანარჩენი 4 უკვე ჩართულია) | bucket და API მართვა |
| 2 | შეიქმნება bucket `gs://myavatar-veo-outputs` — us-central1, uniform access, საჯარო წვდომა დაბლოკილი, ობიექტები 30 დღეში იშლება | Veo-ს input/output |
| 3 | შეიქმნება SA `myavatar-veo@…` — **key-ის გარეშე** | Vercel ამ SA-ს სახელით იმუშავებს |
| 4 | 2 custom role: `myavatarVeoInvoker` (`aiplatform.endpoints.predict`), `myavatarUrlSigner` (`iam.serviceAccounts.signBlob`) | Owner/Editor/aiplatform.user-ის ნაცვლად ვიწრო უფლებები |
| 5 | grant-ები: SA → invoker (project); SA → signer (მხოლოდ თავის თავზე); SA და Vertex AI Service Agent → `objectCreator` + `objectViewer` (მხოლოდ ამ bucket-ზე); Vertex AI Service Agent-ის შექმნა | Veo-ს გამოძახება, ატვირთვა, signed URL |
| 6 | WIF pool `vercel` + provider `vercel-oidc`: issuer `https://oidc.vercel.com/kintsurashviligaga-ops-projects`, audience `https://vercel.com/kintsurashviligaga-ops-projects`, condition = team id + project id + **მხოლოდ preview** | keyless შესვლა |
| 7 | impersonation: `roles/iam.workloadIdentityUser` SA-ზე **ერთ** principal-ს — `…/subject/owner:kintsurashviligaga-ops-projects:project:avatar-g-frontend-v3:environment:preview` | მთელი pool-ის ნდობის ნაცვლად |
| 8 | ძველი ფართო binding-ების მოხსნა | ახლა არცერთი არ არსებობს, ამიტომ ეს ნაბიჯი არაფერს შეცვლის |
| V | Vercel **Preview**-ში 3 ცვლადის დამატება: `GCP_PROJECT_NUMBER=467145118875`, `GCP_VEO_BUCKET=gs://myavatar-veo-outputs`, `VEO_TRANSPORT=vertex` | დანარჩენი 5 GCP ცვლადი Preview-ში უკვე სწორადაა |

## რა არ შეიცვლება
Production, `roles/editor` default compute SA-ზე, `vertex-express` SA, API key-ები (`API key 2`, `Gemini API Key`),
`GEMINI_API_KEY` Vercel-ში, billing. SA key არ იქმნება. Veo არ გამოიძახება (inference არ არის).

## ხარჯი
API-ები, SA, role-ები, pool/provider — უფასო. ცარიელი bucket — $0; შენახვა ~$0.02/GB/თვე, 30 დღეში ავტომატურად იშლება.
Billing upgrade არ ხდება.

## უკან დაბრუნება
`gcloud iam workload-identity-pools delete vercel --location=global` (30 დღე აღდგენადია),
`gcloud iam service-accounts delete myavatar-veo@…`, `gcloud iam roles delete myavatarVeoInvoker|myavatarUrlSigner`,
ცარიელი bucket-ის წაშლა, Vercel-ში 3 ცვლადის წაშლა.

## შემოწმება apply-ის შემდეგ
1. `MODE=audit` — read-back: pool/provider, condition, SA policy, bucket IAM, role-ები.
2. AUTH VERIFIED — Preview deployment-ში რეალური STS გაცვლა + impersonation, token-ის გამოტანის გარეშე.
3. INFERENCE VERIFIED — მხოლოდ ცალკე თანხმობით (ფასიანია).

## ზუსტი ბრძანებები
```text
── 1. APIs
  gcloud  services  enable  aiplatform.googleapis.com  iam.googleapis.com  iamcredentials.googleapis.com  sts.googleapis.com  serviceusage.googleapis.com  storage.googleapis.com  --project  gen-lang-client-0671348730

── 2. bucket gs://myavatar-veo-outputs (us-central1, uniform access, public access prevented, 30-day delete)
  gcloud  storage  buckets  create  gs://myavatar-veo-outputs  --project  gen-lang-client-0671348730  --location=us-central1  --uniform-bucket-level-access  --public-access-prevention
  gcloud  storage  buckets  update  gs://myavatar-veo-outputs  --lifecycle-file=<{"rule":[{"action":{"type":"Delete"},"condition":{"age":30}}]}>

── 3. service account myavatar-veo@gen-lang-client-0671348730.iam.gserviceaccount.com (no keys)
  gcloud  iam  service-accounts  create  myavatar-veo  --project  gen-lang-client-0671348730  --display-name=MyAvatar\ Veo\ renderer\ \(WIF\ only\,\ no\ keys\)

── 4. custom roles: Veo invoker (project) and URL signer (on the SA itself)
  gcloud  iam  roles  create  myavatarVeoInvoker  --project  gen-lang-client-0671348730  --title=MyAvatar\ Veo\ invoker  --permissions=aiplatform.endpoints.predict  --stage=GA
  gcloud  iam  roles  create  myavatarUrlSigner  --project  gen-lang-client-0671348730  --title=MyAvatar\ signed-URL\ signer  --permissions=iam.serviceAccounts.signBlob  --stage=GA

── 5. grants
  gcloud  projects  add-iam-policy-binding  gen-lang-client-0671348730  --member=serviceAccount:myavatar-veo@gen-lang-client-0671348730.iam.gserviceaccount.com  --role=projects/gen-lang-client-0671348730/roles/myavatarVeoInvoker  --condition=None
  gcloud  iam  service-accounts  add-iam-policy-binding  myavatar-veo@gen-lang-client-0671348730.iam.gserviceaccount.com  --member=serviceAccount:myavatar-veo@gen-lang-client-0671348730.iam.gserviceaccount.com  --role=projects/gen-lang-client-0671348730/roles/myavatarUrlSigner
  gcloud  storage  buckets  add-iam-policy-binding  gs://myavatar-veo-outputs  --member=serviceAccount:myavatar-veo@gen-lang-client-0671348730.iam.gserviceaccount.com  --role=roles/storage.objectCreator
  gcloud  storage  buckets  add-iam-policy-binding  gs://myavatar-veo-outputs  --member=serviceAccount:myavatar-veo@gen-lang-client-0671348730.iam.gserviceaccount.com  --role=roles/storage.objectViewer
  gcloud  beta  services  identity  create  --service=aiplatform.googleapis.com  --project=gen-lang-client-0671348730
  gcloud  storage  buckets  add-iam-policy-binding  gs://myavatar-veo-outputs  --member=serviceAccount:service-467145118875@gcp-sa-aiplatform.iam.gserviceaccount.com  --role=roles/storage.objectCreator
  gcloud  storage  buckets  add-iam-policy-binding  gs://myavatar-veo-outputs  --member=serviceAccount:service-467145118875@gcp-sa-aiplatform.iam.gserviceaccount.com  --role=roles/storage.objectViewer

── 6. workload identity pool vercel / provider vercel-oidc
  gcloud  iam  workload-identity-pools  create  vercel  --location=global  --project  gen-lang-client-0671348730  --display-name=Vercel  --description=Vercel\ OIDC\ for\ avatar-g-frontend-v3
  gcloud  iam  workload-identity-pools  providers  create-oidc  vercel-oidc  --workload-identity-pool=vercel  --location=global  --project  gen-lang-client-0671348730  --issuer-uri=https://oidc.vercel.com/kintsurashviligaga-ops-projects  --allowed-audiences=https://vercel.com/kintsurashviligaga-ops-projects  --attribute-mapping=google.subject=assertion.sub\,attribute.owner_id=assertion.owner_id\,attribute.project_id=assertion.project_id\,attribute.environment=assertion.environment  --attribute-condition=assertion.owner_id\ ==\ \'team_YGQHjuCUs0f7tKoLtrCgSIFG\'\ \&\&\ assertion.project_id\ ==\ \'prj_k4LQeBUGIAfsXC3ijPTXplTWM5eH\'\ \&\&\ assertion.environment\ in\ \[\'preview\'\]

── 7. who may impersonate myavatar-veo@gen-lang-client-0671348730.iam.gserviceaccount.com: exactly one subject per allowed environment
  gcloud  iam  service-accounts  add-iam-policy-binding  myavatar-veo@gen-lang-client-0671348730.iam.gserviceaccount.com  --role=roles/iam.workloadIdentityUser  --member=principal://iam.googleapis.com/projects/467145118875/locations/global/workloadIdentityPools/vercel/subject/owner:kintsurashviligaga-ops-projects:project:avatar-g-frontend-v3:environment:preview

── 8. remove the broad grants an earlier setup-veo-vertex.sh run would have left (ignored when absent)
  gcloud  iam  service-accounts  remove-iam-policy-binding  myavatar-veo@gen-lang-client-0671348730.iam.gserviceaccount.com  --role=roles/iam.workloadIdentityUser  --member=principalSet://iam.googleapis.com/projects/467145118875/locations/global/workloadIdentityPools/vercel/\*
  gcloud  iam  service-accounts  remove-iam-policy-binding  myavatar-veo@gen-lang-client-0671348730.iam.gserviceaccount.com  --role=roles/iam.serviceAccountTokenCreator  --member=serviceAccount:myavatar-veo@gen-lang-client-0671348730.iam.gserviceaccount.com
  gcloud  storage  buckets  remove-iam-policy-binding  gs://myavatar-veo-outputs  --member=serviceAccount:myavatar-veo@gen-lang-client-0671348730.iam.gserviceaccount.com  --role=roles/storage.objectAdmin
  gcloud  storage  buckets  remove-iam-policy-binding  gs://myavatar-veo-outputs  --member=serviceAccount:service-467145118875@gcp-sa-aiplatform.iam.gserviceaccount.com  --role=roles/storage.objectAdmin
  gcloud  projects  remove-iam-policy-binding  gen-lang-client-0671348730  --member=serviceAccount:myavatar-veo@gen-lang-client-0671348730.iam.gserviceaccount.com  --role=roles/aiplatform.user

```

Vercel (GG-ის Mac-ზე `vercel` CLI, team `kintsurashviligaga-ops-projects`, project `avatar-g-frontend-v3`):
```text
printf 467145118875              | vercel env add GCP_PROJECT_NUMBER preview
printf gs://myavatar-veo-outputs | vercel env add GCP_VEO_BUCKET preview
printf vertex                    | vercel env add VEO_TRANSPORT preview
```
