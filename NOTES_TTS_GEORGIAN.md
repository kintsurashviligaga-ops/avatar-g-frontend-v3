# Georgian TTS model — how to pick (config flip, no code change)

The word-synced ad narration goes through **`POST /v1/text-to-speech/{voice}/with-timestamps`**
(`lib/elevenlabs/ttsTimestamps.ts`). Two things must both be true for a model to work here:

1. **Speaks Georgian well** (не accented), and
2. **Supports the `/with-timestamps` endpoint** — this is what gives real per-character timings
   that drive the word-synced captions. Without it, captions fall back to estimation (worse).

## How to switch (clean config flip — no deploy of code)
- **Global:** set env `ELEVENLABS_TTS_MODEL=<model_id>` (Production + Preview scope on Vercel).
- **Per call:** pass `opts.modelId` to `synthesizeWithTimestamps(...)`.
- Resolution order: per-call → `ELEVENLABS_TTS_MODEL` → default (`eleven_multilingual_v2`).
- Nothing else changes; the code already reads the override (`resolveTtsModel`).

## The options (⚠️ ka + with-timestamps support must be verified with ONE live call — I have no credits)

| model_id | Georgian quality | with-timestamps | Notes |
|----------|------------------|-----------------|-------|
| `eleven_multilingual_v2` | ⚠️ **accented** — ka not in its 29-lang list | ✅ yes (current, proven path) | **Current default.** Reliable timings, but the read has a foreign accent. |
| `eleven_v3` | ✅ **best** — the only model your notes confirm truly speaks ka | ❓ **UNVERIFIED** — v3 is alpha with limited endpoint coverage; `/with-timestamps` may 422 | If it *does* support with-timestamps, this is the pick. Test first: a 422 means it can't drive word-sync. |
| `eleven_turbo_v2_5` | ❓ 32 langs; ka not confirmed | ✅ yes | Fast/cheap. Audition ka quality before committing. |
| `eleven_flash_v2_5` | ❓ 32 langs; ka not confirmed | ✅ yes | Ultra-low latency. Same caveat. |

## Recommended path once credits exist
1. Try `ELEVENLABS_TTS_MODEL=eleven_v3` and make one `/api/ads/tts` call.
   - **200 + valid alignment** → keep it (best ka).
   - **422 / "model not supported"** → v3 can't do with-timestamps; revert.
2. If v3 is out, compare `eleven_turbo_v2_5` vs `eleven_multilingual_v2` on a real Georgian phrase
   and pick by ear. Turbo/flash may read ka better than multilingual_v2's accent.
3. The cloned Georgian voices (`9jZPhI8VfIo3Mx8pl6OF` F / `hYqARi31q6JpW0IjtFUt` M) are voice-level,
   independent of the model — they work with whichever model you choose.

## Why I didn't just set it
Picking the model requires *hearing* the Georgian output + confirming `/with-timestamps` returns
200 for that model — both need a live paid call, and the account is out of credits. So this is left
as a one-env-var flip for you to make + verify. The default stays `eleven_multilingual_v2` (works,
accented) so nothing is broken in the meantime.
