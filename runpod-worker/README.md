# RunPod FFmpeg Assembly Worker — Agent L

This is the GPU FFmpeg worker that stitches the 5×6s clips + audio lanes into the
final 30-second master. It implements the exact manifest contract that
`app/api/video/assemble/route.ts` dispatches.

`$10 of RunPod credit alone does nothing` — you must **deploy this worker** as a
RunPod Serverless endpoint, then give those two values back to the app:
`RUNPOD_RENDER_WEBHOOK_URL` + `RUNPOD_RENDER_WEBHOOK_TOKEN`.

---

## Deploy (≈10 min)

### 1. Build & push the image
```bash
cd runpod-worker
docker build -t <your-dockerhub-user>/myavatar-render:latest .
docker push <your-dockerhub-user>/myavatar-render:latest
```
(No Docker locally? In the RunPod console use **Serverless → New Endpoint →
Import from GitHub** and point it at this `runpod-worker/` folder — RunPod builds
the image for you.)

### 2. Create the Serverless endpoint
RunPod console → **Serverless → New Endpoint**:
- **Container image:** `<your-dockerhub-user>/myavatar-render:latest`
- **GPU:** any 16 GB tier (e.g. RTX A4000) is plenty for a 30s 1080p stitch
- **Container disk:** 10 GB · **Max workers:** 1–3 · **Idle timeout:** 5s
- **Environment secrets:**
  | Key | Value |
  |---|---|
  | `RUNPOD_RENDER_WEBHOOK_TOKEN` | a long random string **you choose** (the app signs callbacks with it) |
  | `SUPABASE_URL` | `https://<ref>.supabase.co` |
  | `SUPABASE_SERVICE_ROLE_KEY` | your Supabase service-role key |
  | `RENDER_BUCKET` | `renders` (create this Storage bucket in Supabase) |

### 3. Hand the app two values
- `RUNPOD_RENDER_WEBHOOK_URL` → the endpoint's **`/runsync`** URL:
  `https://api.runpod.ai/v2/<ENDPOINT_ID>/runsync`
- `RUNPOD_RENDER_WEBHOOK_TOKEN` → set to your **RunPod API key** (the app sends it
  as the `Authorization: Bearer` on dispatch) — note RunPod auth uses your API
  key; the *callback* token above is a separate shared secret. If you want a
  single value, use the RunPod API key for dispatch and set the same string as
  the worker's `RUNPOD_RENDER_WEBHOOK_TOKEN` so callbacks are authenticated too.

Tell me those two values and I'll set them in Vercel, dispatch a real
authenticated assembly, and verify the callback delivers the final signed URL.

---

## Contract (input → output)

**Input** (`job["input"]`, sent by the app as `{ "input": manifest }`):
```jsonc
{
  "segments": [{ "url": "...", "durationSec": 6, "cameraMotion": "dolly", "render": {} }],
  "voiceoverUrl": "https://… or null",
  "musicUrl": "https://… or null",
  "sfxUrl": "https://… or null",
  "globalRender": { "transition": "crossfade", "vocal_ducking_pct": 30, "fps": 24, "sfx_enabled": true },
  "pipelineId": "…",
  "callbackUrl": "https://myavatar.ge/api/video/assemble/callback"
}
```

**Output** (returned by `/runsync`, parsed by `parseRunPodResponse`):
```json
{ "url": "https://<ref>.supabase.co/storage/v1/object/renders/<id>.mp4" }
```

It also POSTs lifecycle topics to `callbackUrl` for the live SwarmStatusPanel:
`media.pipeline.initiated → assembling → encoded → media.pipeline.completed`
(or `media.pipeline.failed` → the app's Saga compensates: releases the credit
lock + refunds).

## What the filtergraph does
- **Video:** normalizes each clip, then `xfade` transitions between them
  (style from `globalRender.transition`); optional `minterpolate fps=60` when
  `fps=60` (the real "60fps AI Interpolated").
- **Audio:** voiceover at full level; music + SFX mixed and **sidechain-ducked**
  by `vocal_ducking_pct` keyed on the voiceover (true dynamic ducking), then
  mixed back with the voice.
- **Encode:** H.264 / AAC, `+faststart`, `crf 20`.
