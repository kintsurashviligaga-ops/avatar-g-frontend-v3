# Expression and provider compatibility
Existing Google Live transport/model configuration is reused. No provider was added, no model default changed and no paid call was made.
Internal style represents tone, energy, pace, meaningful emphasis, thought-boundary pauses, humor intent and optional amusement. Google receives textual presentation guidance, not invented prosody fields, laughter tags, SSML or guarantees of exact pitch/rate.
| Capability | Implemented mapping | Evidence class |
|---|---|---|
| Personality, pace, tone, short answer | Fixed system instructions | Unit-tested contract; audible quality BLOCKED |
| Voice identity | Existing prebuilt Aoede / Charon | Setup serialization; live listening BLOCKED |
| Turn eagerness | Known model families only: silence 400 / 700 / 1200 ms, prefix 300 ms | Unit-tested wire shape; model acceptance BLOCKED |
| Laughter / whisper / breath | No literal spoken tags or mandatory cues | Prompt constraint only |
| Affective dialogue | Not enabled | 3.8 model guide says removed |
| Proactive audio | No explicit toggle sent | 3.8 model guide says always enabled |
| Thinking configuration | Legacy thinkingBudget only on 2.5; omit on standard 3.x | Regression tested |
| Unknown model | No VAD override | Fail-safe unit test |
The model-specific [Gemini 3.8 Live guide](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-live) takes precedence over generic examples. It removes affective dialogue and does not permit disabling proactive audio; standard 3.8 does not accept thinkingLevel. Extended-model capabilities are not enabled by this change.
The [Live capabilities guide](https://ai.google.dev/gemini-api/docs/live-api/capabilities) documents prebuilt voices, automatic activity detection and streamed audio. This is documentation compatibility, not evidence that a configured account/model accepted this build.
