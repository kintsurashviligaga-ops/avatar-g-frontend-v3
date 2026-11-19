# live-relay

The Vertex AI Gemini Live relay. Browsers open a Live session here with a ticket from `/api/voice/live`. The relay
opens Vertex AI with its own Cloud Run service account and pipes frames both ways. It holds no API key and no prompt.
The rules live in `lib/voice/relay` (ticket, setup lock, allowed frames, limits, one log line per session) and are
unit-tested there.

Status: deployed as `live-relay` in us-central1 (2026-10-25), min-instances 1, behind `LIVE_RELAY_URL` (who may open Live:
`LIVE_AUDIENCE`; who may turn the talking avatar on: `LIVE_AVATAR_AUDIENCE`, see `lib/voice/liveAudience`).

## Region

Measured from Tbilisi (GG's network, 2026-10-25, gemini-live-2.5-flash-native-audio, 3 runs each, median):

| Vertex region | setupComplete | first audio |
|---|---|---|
| us-central1 | 1235 ms | 2025 ms |
| europe-west4 | 564 ms | 1185 ms |
| europe-west1 | 550 ms | 1195 ms |

The TLS handshake is the same everywhere (Google's edge is local); the difference is the trip to the region's Live
backend. Put the relay and Vertex in the SAME European region (`--region europe-west4` and
`VERTEX_LIVE_LOCATION=europe-west4`), so audio does not cross the Atlantic twice. All three regions serve the model.

Each `relay.session_end` line also says where the session waited: `setupMs` (connect → setup frame), `upstreamMs`
(setup → Vertex socket open) and `readyMs` (setup → Vertex's setupComplete); -1 means that step never happened.

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
   The relay also speaks three frames of its own (`lib/voice/relay/wire`): `{"relayHello":{"nudge":1}}` right after
   the upgrade, `{"relaySetupAck":{}}` when the setup passes, and it drops the browser's `{"relayNudge":{}}`. An
   iPhone behind iCloud Private Relay held the setup until the browser wrote again (2026-10-26), so a browser that
   heard hello and has no ack writes a nudge, and gives the socket up at 1.8 s instead of 3 s. Deploy the relay
   before the app: a browser nudges only a relay that said hello. `relay.session_end` logs `nudges`.
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
| `LIVE_RELAY_MODEL_LOCATIONS` | `vertexId=region` pairs for models served outside `VERTEX_LIVE_LOCATION`. The talking avatar needs `gemini-3.8-live=us-central1` (europe-west4 closes with 1008 "publisher model not found"). |
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
gcloud run deploy live-relay --source . --region europe-west4 \
  --service-account live-relay@<PROJECT>.iam.gserviceaccount.com \
  --allow-unauthenticated --timeout 3600 --max-instances 2 --concurrency 50 \
  --set-secrets LIVE_RELAY_TICKET_SECRET=live-relay-ticket-secret:latest \
  --set-env-vars GOOGLE_CLOUD_PROJECT=<PROJECT>,VERTEX_LIVE_LOCATION=europe-west4,LIVE_RELAY_MODELS=<vertex model ids>
```

`--allow-unauthenticated` is needed because browsers connect directly; the ticket is the authentication. The same
secret goes into Vercel as `LIVE_RELAY_TICKET_SECRET`, with `LIVE_RELAY_URL=wss://<service host>/v1/live`. Set them on
**Preview first**. Setting them on Production turns Live on for every user.

Moving region: deploy the same service in the new region (same secret, same env, the new `VERTEX_LIVE_LOCATION`), set
`LIVE_RELAY_URL` to the new host on Preview, test, then on Production, then delete the old region's service (or set its
`--min-instances 0`), so the warm instance is not paid twice. To go back, point `LIVE_RELAY_URL` at the old host again.

Rollback: remove `LIVE_RELAY_URL` from Vercel. The app goes back to the REST voice loop at once. Then
`gcloud run services delete live-relay`.

## The talking avatar (`gemini-3.8-live`)

The avatar model is served in us-central1 only. A Europe relay opens it there and keeps voice calls in Europe:

```sh
LIVE_RELAY_MODELS=gemini-live-2.5-flash-native-audio,gemini-3.8-live
LIVE_RELAY_MODEL_LOCATIONS=gemini-3.8-live=us-central1
```

Try it on a tagged revision that takes no traffic, and point only a Preview branch's `LIVE_RELAY_URL` at the tag URL
(`wss://<tag>---<service host>/v1/live`):

```sh
gcloud run deploy live-relay --source . --region europe-west4 --no-traffic --tag avatar \
  --update-env-vars '^@^LIVE_RELAY_MODELS=gemini-live-2.5-flash-native-audio,gemini-3.8-live@LIVE_RELAY_MODEL_LOCATIONS=gemini-3.8-live=us-central1'
```

The app side is `NEXT_PUBLIC_LIVE_AVATAR=1` (a build-time switch: set it, then redeploy).
