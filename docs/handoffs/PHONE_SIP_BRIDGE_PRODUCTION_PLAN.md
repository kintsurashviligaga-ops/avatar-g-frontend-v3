# DIDWW/SIP + Agent G voice bridge — production preparation

**Status:** PREPARATION ONLY — no Production deploy, no DID/VM purchase, no call-ready flag.

**Goal:** allow a verified MyAvatar user to receive an Agent G call and place a call back, with SMS OTP used only to verify/link the user's phone number.

## Architecture

- **SMS OTP:** existing Twilio Verify adapter in the Vercel app.
- **Voice number:** DIDWW (or an equivalent provider) with a real Georgian `+995` DID and SIP trunk. Twilio Verify is not a Georgian inbound voice number.
- **Media plane:** a persistent VM with a SIP/RTP engine and a signed bridge to the existing Agent G/Gemini Live call service. Vercel serverless functions must remain the control plane; they must not terminate a long-lived SIP/RTP media stream.
- **Security:** the bridge receives short-lived, app-signed call tickets; it stores no model key, prompt, user policy or billing decision. The app remains the authority for link ownership, opt-in, quiet hours, balance, caps, consent and task execution.

## Current code truth

- The existing `services/wa-call-bridge` is **WhatsApp WebRTC/Opus**, not a DIDWW SIP gateway. It cannot be relabeled as a PSTN bridge.
- `lib/calls/providers/index.ts` intentionally returns `UnavailableCallsProvider`.
- `phoneCallsReady()` is fail-closed and must stay false until the DIDWW SIP credentials, bridge URL/secret and a real Georgian test call are proven.
- Production has not been changed by this preparation.

## Required owner/provider inputs

1. DIDWW account registration and approval for a Georgian DID.
2. DIDWW DID, SIP username/password (or IP-auth details), and the exact codec/transport offered by the trunk.
3. A persistent VM with a static public IP. The project research estimates an e2-small-class VM at about `$20.61/month`; DIDWW number/trunk pricing is quote/account dependent.
4. VM firewall and DNS/TLS for `PHONE_BRIDGE_URL`.
5. A real inbound and outbound Georgian test using the owner's own number.
6. Owner approval of call pricing/limits before any paid outbound or task callback is enabled.

No provider purchase or VM provisioning was performed in this task. Payment/registration must be completed by the owner in the provider's account.

## Environment contract

### SMS OTP (Production, later)

- `PHONE_CONNECTION_UI_ENABLED=1`
- `PHONE_OTP_PROVIDER=twilio`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_VERIFY_SERVICE_SID`

### Voice (only after real proof)

- `PHONE_VOICE_PROVIDER=didww`
- `DIDWW_API_KEY`
- `DIDWW_SIP_USERNAME`
- `DIDWW_SIP_PASSWORD`
- `DIDWW_SIP_DID`
- `PHONE_BRIDGE_URL` (HTTPS)
- `PHONE_BRIDGE_SHARED_SECRET` (32+ random characters)
- `PHONE_AGENT_ENABLED=1`
- `PHONE_REAL_CALL_PROVEN=1` **only after the test matrix passes**

Secrets must be stored only in Vercel/VM secret stores and never committed or pasted into chat.

## Release gates

The production gate remains closed until all are true:

- SIP registration/trunk health is green;
- inbound call reaches the bridge and audio flows both ways;
- outbound call rings the intended Georgian mobile and audio flows both ways;
- Georgian speech works in both directions;
- barge-in, hangup, timeout and reconnect are handled;
- linked-number and opt-in checks refuse an unlinked caller;
- call caps, quiet hours, balance and consent checks are enforced;
- call records and failure paths are truthful;
- SMS OTP is tested with a real owner number;
- Preview smoke test passes before Production deploy.

Until then, the app must return `phone_calls_unavailable`; it must never create a fake queued/active call.

## Preparation added

- `scripts/phone-voice-preflight.mjs` checks the non-secret configuration and, with `--check-health`, the bridge `/health` endpoint without printing secret values.
- `phoneCallsReady()` now requires DIDWW SIP identity fields in addition to the bridge and proof flag.
- `.env.example` and the env schema document the SIP credentials.

## Next execution order

1. Owner completes DIDWW registration/number and selects the VM/hosting location.
2. We implement/deploy the SIP media adapter on that VM; the existing WhatsApp bridge is not reused as a false substitute.
3. Set Preview-only secrets and run `npm run voice:preflight:strict` plus the real inbound/outbound test matrix.
4. Record evidence and only then set the proof flag and deploy the combined SMS + voice release to Production.

## References

- [DIDWW Georgia numbers](https://www.didww.com/phone-numbers/local-numbers/Georgia/Local)
- [DIDWW Georgia SIP trunking](https://www.didww.com/voice/global-sip-trunking/Georgia)
- [DIDWW inbound trunk documentation](https://doc.didww.com/voice/inbound-trunks/index.html)
- [Twilio Verify](https://www.twilio.com/docs/verify)
- [Existing bridge README](../../services/wa-call-bridge/README.md)
- [Phone implementation handoff](./phone-agent-connection-implementation.md)
