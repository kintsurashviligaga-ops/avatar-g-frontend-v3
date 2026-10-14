# Voice security
## Verified scope
- Preference schemas accept fixed enums only; unknown keys cannot become provider instructions.
- Preferences are account-scoped local device data, not credentials or server authorization.
- Existing authenticated mint, server-owned history, model allowlist and rate limits are retained. No RLS policy, ledger, service credential or migration changed.
- Native tool dispatch blocks start_generation and start/confirm/generate/run on agent_task/extract_audio/music/image/video studio calls before invoking the legacy handler. Spoken yes and countdowns cannot satisfy this gate.
- Mixed batches preserve safe quote/status calls and discard handler replies for non-dispatched IDs.
- Read-aloud is explicit, stops on microphone release and cannot start while a native call is active. Pending synthesis is aborted on Stop and stale audio cannot play.
## Limits
This is a client dispatch defense, not a replacement for authenticated server quote/confirmation, RLS and idempotency. A forged HTTP client is outside that boundary; backend authority remains essential. Existing shared prompt/legacy dispatcher contracts require the protected integration proposal. Arbitrary chat requests and future tool additions need review against backend paid-action gates.
Prompt restrictions on jokes, brevity and truth are not deterministic guarantees of model behavior. Live provider verification has not run.
No Production access, credential change, DB migration, deployment, paid generation or merge performed. CI uses dummy Supabase values and fake WebSocket/audio, with no Google secret. Tests are not proof of real RLS/Storage or billing settlement.
