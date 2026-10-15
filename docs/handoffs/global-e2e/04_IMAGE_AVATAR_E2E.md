# 04 — Image / Photo / Avatar E2E (PR #60 head be9edee3 and related)

## Live (real Google) — this run

| Test | Result | Evidence |
|---|---|---|
| Text → image, `gemini-3.1-flash-image` on Vertex (global), aspect 16:9 | **PASS** — HTTP 200, `finishReason STOP`, PNG 1376×768 rgb24, 1.51 MB; photorealistic, prompt-faithful (red tin robot, desk, window light, no people/text) | `evidence/IMG-1-generate.640.jpg`, sha256 `fe24624f…` |
| Image-to-image edit (replace background) with the generated image as input | **PASS** — HTTP 200, PNG 1376×768; robot identical in shape, colour, pose, position and scale; only the background replaced (desk/props removed, blue studio backdrop) | `evidence/IMG-2-edit-background.640.jpg`, input sha recorded = IMG-1 |
| Aspect | requested 16:9 → 1376×768 (1.79:1 — Google's 16:9 bucket, not exactly 1.777) | ffprobe |
| Original preservation | the edit call produced a new object; IMG-1 bytes unchanged (sha) | result.json |

This closes the gap stated in `lib/image/studio/capabilities.ts:7` ("Live operation evidence remains null") for **generate** and a
**replace_background**-type edit at the provider level. The other adapter operations (replace/remove object, extend, character
variation, product scene) remain NOT_TESTED live.

## Application path (Image Studio #60)

| Item | Status | Evidence |
|---|---|---|
| quote → confirm (`confirmed:true`) → reserve → provider → private `renders/image-studio/…` → Library version → refund once | PROVEN_ISOLATED (stand-in provider) | CI on be9edee3: `isolated-db` ✅, `image-browser` ✅, live E2E desktop+phone ✅ (run 38527016387 / 38527016388) |
| Cross-user isolation, public-bucket refusal, MIME/magic checks | PROVEN_ISOLATED / unit | `live.test.ts`, isolated-db job |
| On a deployed app with real provider | **BLOCKED** — gated by `AGENT_G_MEDIA_EXEC` (admin-only on Preview) and Preview = Production DB | 10 |

## Avatar / Photoshoot / Interior

All third-party by default (`MEDIA_GOOGLE_ONLY` off): avatar = HeyGen + ElevenLabs; photoshoot = NanoBanana; interior = NanoBanana /
Gemini vision. No live test (outside the Google-only budget). Status BUILT; **provider-boundary decision needed from the owner**
(either set `MEDIA_GOOGLE_ONLY=1` — photoshoot then switches to the Google image model — or accept the third parties).
