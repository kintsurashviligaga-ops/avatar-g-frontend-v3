# live-relay

The Vertex AI Gemini Live relay. Browsers open a Live session here with a ticket from `/api/voice/live`. The relay
opens Vertex AI with its own Cloud Run service account and pipes frames both ways. It holds no API key and no prompt.
The rules live in `lib/voice/relay` (ticket, setup lock, allowed frames, limits, one log line per session) and are
unit-tested there.

Status: **BUILT, not deployed.** Nothing here has spoken to Vertex AI yet.

## How a call runs

1. `/api/voice/live` builds the setup (model, prompt, voice, tools), as before. With `LIVE_RELAY_URL` and
   `LIVE_RELAY_TICKET_SECRET` set, it signs a ticket that carries that setup's digest, expires with the session and
   names the relay URL (`relayUrl`).
2. The browser opens `wss://<relay>/v1/live?ticket=…` and sends that setup as its first frame.
3. The relay checks the signature, the expiry and the digest. A new session has to start within 2 minutes, once per
   ticket; a resumption may reuse the ticket until it expires. It also checks the model against `LIVE_RELAY_MODELS`.
   It then rewrites the model to `projects/<p>/locations/<l>/publishers/google/models/<m>` and opens Vertex.
4. From the browser, only `realtimeInput`, `clientContent` and `toolResponse` frames pass. A second `setup` closes the
   session. Everything from Vertex goes back unchanged.
5. The relay ends a session at its length limit, when idle, on a frame or byte limit, or when either side closes. It
   logs `relay.session_end` with the duration, bytes and the tokens Vertex reported.

The used-ticket memory is per instance. Keep `--max-instances` small until the relay has a shared store.

## Env

| Name | Meaning |
|---|---|
| `LIVE_RELAY_TICKET_SECRET` | Shared with the app, at least 32 characters. Put it in Secret Manager. |
| `GOOGLE_CLOUD_PROJECT` | The Vertex project. |
| `VERTEX_LIVE_LOCATION` | Region, default `us-central1`. |
| `LIVE_RELAY_MODELS` | Vertex model ids the relay opens, comma-separated. Required. |
| `LIVE_RELAY_MODEL_MAP` | `appId=vertexId` pairs, comma-separated, for app ids that are named differently on Vertex. |
| `LIVE_RELAY_ALLOWED_ORIGINS` | e.g. `https://myavatar.ge,https://<preview>.vercel.app`. Empty means any origin. |
| `LIVE_RELAY_MAX_SESSION_MS`, `LIVE_RELAY_IDLE_MS`, `LIVE_RELAY_MAX_FRAME_BYTES`, `LIVE_RELAY_MAX_CLIENT_BYTES` | Limits. Defaults: 15 min, 60 s, 512 KB, 64 MB. |

## Deploy (owner's gcloud, after the owner's go)

```sh
cd services/live-relay && npm ci && npm run build      # dist/main.cjs, one file
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com
gcloud iam service-accounts create live-relay --display-name="Live relay"
gcloud projects add-iam-policy-binding <PROJECT> --member=serviceAccount:live-relay@<PROJECT>.iam.gserviceaccount.com --role=roles/aiplatform.user
openssl rand -base64 48 | tr -d '\n' | gcloud secrets create live-relay-ticket-secret --data-file=-
gcloud secrets add-iam-policy-binding live-relay-ticket-secret --member=serviceAccount:live-relay@<PROJECT>.iam.gserviceaccount.com --role=roles/secretmanager.secretAccessor
gcloud run deploy live-relay --source . --region us-central1 \
  --service-account live-relay@<PROJECT>.iam.gserviceaccount.com \
  --allow-unauthenticated --timeout 3600 --max-instances 2 --concurrency 50 \
  --set-secrets LIVE_RELAY_TICKET_SECRET=live-relay-ticket-secret:latest \
  --set-env-vars GOOGLE_CLOUD_PROJECT=<PROJECT>,VERTEX_LIVE_LOCATION=us-central1,LIVE_RELAY_MODELS=<vertex model ids>
```

`--allow-unauthenticated` is needed because browsers connect directly; the ticket is the authentication. The same
secret goes into Vercel as `LIVE_RELAY_TICKET_SECRET`, with `LIVE_RELAY_URL=wss://<service host>/v1/live`. Set them on
**Preview first**. Setting them on Production turns Live on for every user.

Rollback: remove `LIVE_RELAY_URL` from Vercel. The app goes back to the REST voice loop at once. Then
`gcloud run services delete live-relay`.
