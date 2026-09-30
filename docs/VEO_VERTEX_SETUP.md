# Moving Veo from the Gemini API to Vertex AI

Today every clip renders on the **Gemini API**: the `GEMINI_API_KEY` and its AI Studio prepaid balance. The Vertex AI
transport (`lib/veo/vertexClient.ts`, `lib/veo/gcs.ts`, `lib/veo/vertexAuth.ts`) is already built and ships dark: it
turns on by itself the moment the variables below are complete. There is no code change and no redeploy of new code.
Set the variables in Vercel, redeploy, and the next clip goes to Vertex.

Nothing here is needed to run on the Gemini API. The build never asks for Vertex credentials.

## What changes when Vertex is on

| | Gemini API (now) | Vertex AI |
|---|---|---|
| Billing | AI Studio prepaid balance | the GCP project's billing account (a card) |
| Models | `veo-3.1-{,fast-,lite-}generate-preview` | `veo-3.1-generate-001`, `veo-3.1-fast-generate-001` (GA), `veo-3.1-lite-generate-001` |
| Output | a Files-API link we download, crop the watermark band from, and host in Supabase | written straight to **your** GCS bucket; the app hands out a 7-day signed URL |
| "Veo's sound" off | ignored (always renders audio) | honoured: video-only is about half price |
| "Let Google rewrite the prompt" | not offered | offered |
| Region | global | `us-central1` only (Veo on Vertex, 2026-09) |

Jobs already running keep polling on the transport that created them: the operation name says which one
(`projects/…` = Vertex, `models/…` = Gemini API). Switching mid-render strands nothing.

## 1. Attach a card (the only step that needs you)

1. Open **https://console.cloud.google.com/billing** and create a billing account (Billing → Create account), adding the card.
2. Link it to the project: **https://console.cloud.google.com/billing/linkedaccount?project=YOUR_PROJECT_ID**.
   Use the project that owns the AI Studio key, or a new one.
3. Set a budget alert before anything else: **https://console.cloud.google.com/billing/budgets**. Veo Standard is
   $0.40 per second, so a 24 s film is about $9.60.

## 2. Create the resources

Run `scripts/gcp/setup-veo-vertex.sh` from a machine with `gcloud` logged in as a project owner. It does the steps
below and prints the variables to paste into Vercel. The same steps by hand:

| Step | Console |
|---|---|
| Enable the Vertex AI API | https://console.cloud.google.com/apis/library/aiplatform.googleapis.com |
| Enable the Cloud Storage API and the IAM Credentials API | https://console.cloud.google.com/apis/library/storage.googleapis.com · https://console.cloud.google.com/apis/library/iamcredentials.googleapis.com |
| Bucket in **us-central1**, uniform access, **no public access**, lifecycle: delete after 30 days | https://console.cloud.google.com/storage/create-bucket |
| Service account `myavatar-veo` | https://console.cloud.google.com/iam-admin/serviceaccounts/create |
| Roles: `Vertex AI User` on the project; `Storage Object Admin` on the bucket, for the service account **and** for the Vertex AI Service Agent (`service-PROJECT_NUMBER@gcp-sa-aiplatform.iam.gserviceaccount.com`, which writes Veo's output) | https://console.cloud.google.com/iam-admin/iam |

## 3. Give the app its credentials

There are two ways to authenticate. Pick one.

**A. Service-account key (simplest).** Create a JSON key for `myavatar-veo`, then add it to Vercel as a *Sensitive*
variable, together with the project and the bucket:

```
GCP_PROJECT_ID          your-project-id
GCP_VEO_BUCKET          gs://your-bucket
GCP_SERVICE_ACCOUNT_KEY <the key JSON, or its base64>
```

**B. Keyless: Vercel OIDC → Workload Identity Federation (recommended for production).** There is no long-lived
secret to leak. The script prints the pool and provider commands. Set these instead of the key:

```
GCP_PROJECT_ID, GCP_VEO_BUCKET,
GCP_PROJECT_NUMBER, GCP_SERVICE_ACCOUNT_EMAIL,
GCP_WORKLOAD_IDENTITY_POOL_ID, GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID
```

The service account also needs `Service Account Token Creator` on itself: in keyless mode, URLs are signed through
IAM `signBlob`.

Optional variables:

- `GCP_VEO_LOCATION` defaults to `us-central1`.
- `VEO_TRANSPORT=gemini` pins the Gemini API even when Vertex is configured. This is the instant rollback.
- `VEO_TRANSPORT=vertex` refuses to fall back when Vertex is incomplete.

## 4. Check it

- `GET /api/video/engine` should answer `"transport": "vertex"`. The panel's "Veo's sound" switch then works, and
  "Let Google rewrite the prompt" becomes available.
- The admin provider probe lists any Vertex variable that is still missing or malformed, by **name only**.
- Render one 8 s Economy clip first, and confirm the object appears under `gs://your-bucket/veo/…`.

## Cost guards that stay on either way

- **Sign-in required.** An anonymous visitor cannot start a film (`FILM_ALLOW_ANONYMOUS` unset or `0`). The storyboard,
  the frame generator and the render dispatch all refuse a request without a session.
- **Daily budget.** The budget guard prices every Google-only clip at the real Veo rate for its tier, resolution and
  audio (`lib/veo/capabilities.costPerSecondUsd`) and stops new clips at `DAILY_COST_LIMIT` (default $10) and
  `MONTHLY_COST_LIMIT` (default $300).
- **No double charge.** An unclear submit (a timeout or 5xx) is never re-POSTed. Veo has no idempotency key, so a
  retry could pay twice.
