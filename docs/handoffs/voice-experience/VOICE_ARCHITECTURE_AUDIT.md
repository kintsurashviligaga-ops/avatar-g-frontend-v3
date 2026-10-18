# Voice Experience v2 — Stage A audit
Date: 2026-10-14. Base main: fef867a6ebad67a2a0a56a24e0b15c683a353d79.
Independent branch: astra/agent-g-voice-experience-v2-20261014.
No production mutation or paid provider calls authorized.

## Recovery
No prior Voice v2 branch/checkpoint exists in the enumerated local worktrees/branches. Existing Astra checkpoint 503829dc belongs to Vertex migration, not this mission; retained untouched. PROJECT_MASTER.md records earlier Voice improvements and Agent G Part 4; CLAUDE.md/AGENTS.md absent in this checkout. Existing infrastructure is reused.

## Code evidence / initial classification
| Surface | Code | Initial status | Finding |
|---|---|---|---|
| Live audio | useGeminiLiveSession, geminiLive | BUILT, hardware NOT_TESTED | PCM16k capture,24k streamed playback, buffering, deadlines, resumption, VAD, local playback flush already exist |
| Microphone | micAcquire, livePrime, micBus | BUILT | Permission/error ladder, late stream cleanup, iOS gesture priming; repeated prime replaces active pending request |
| Dictation | components/chat/composer/useDictation | BUILT | Editable transcript; browser recognition or Google STT fallback; must not be described as provider-cost-free |
| Dictation response | OmniStudio autoPlayReplyRef | BROKEN against v2 | viaVoice automatically synthesizes and reads full written answer; protected-file integration patch required |
| Read aloud | OmniStudio speakMsg, premium-tts | PARTIAL | Chunked selected-message reader exists; premium helper has uncancelled in-flight fetch/late playback race |
| Personality | lib/agents/profile, services/personas | BUILT | Reuse knowledge/tool/security profile. Add independent voice presentation preferences, not another model |
| Tools/spend | liveTools,liveActions,voiceLedger,spokenYes | BROKEN against v2 | Legacy spoken-yes countdown can authorize generation. New mission requires authenticated UI confirmation |
| Auth/context | voice/live route,liveThread,memory/context | BUILT | Authenticated token mint; server-owned history; scoped memory; real runtime NOT_TESTED here |
| Models | google/models,buildLiveSetup | BUILT | Existing model allowlist/default preserved. New expressive fields require model-specific verification |
| Studios | PR64/60/65 | PARTIAL | Separate branches; no changes to those branches. Integration must be disposable/pinned |
| Hardware / provider | no authorized calls | BLOCKED | Real mic, Safari/Bluetooth, native Georgian listening, paid Live and latency require separate gates |

## Ownership
See FILE_OWNERSHIP_MATRIX.md. Contested files receive reviewable patches only. Isolated code and uncontested Voice adapters may be implemented and tested directly on this branch.
