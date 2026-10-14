# Phone Agent connection implementation handoff

**Date:** 2026-10-14

## Decision

The website onboarding is provider-neutral at the application boundary. The first implementation can use the project's existing Twilio Verify adapter (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID`); uBill is also supported because its current official API documents `POST https://api.ubill.dev/v1/sms/send`, server-side `key` authentication, Georgian Unicode text, and an `otp: true` flag for authentication codes. The phone call provider is not silently assumed to be Twilio: the project's research says Twilio has no Georgian long code/two-way Georgian SMS offering, even though Twilio can send outbound SMS to Georgia.

DIDWW is the primary voice candidate because its current official Georgia pages document +995 local numbers and inbound/outbound SIP trunks; its docs also provide inbound SIP trunk configuration and an OTP Verification product. A current DIDWW documentation page describes SMS trunks, but the project's earlier Georgia feasibility research says Georgian DIDWW numbers do not support SMS. That conflict must be resolved with a provider quote/test before anyone promises two-way SMS. PBX.IM is a fallback candidate, but its API contract was not available in the public page extraction and must be tested before selection.

## Current code truth

The project intentionally returns `phone_calls_ready: false` and `getCallsProvider()` returns `UnavailableCallsProvider`. This is correct until a real provider and a real test call exist. The new onboarding must not weaken that gate. A verified number is not the same as a callable number.

## Production inputs that cannot be invented in code

1. Either the existing Twilio Verify credentials, or a uBill API key and approved brand ID plus account balance.
2. A real +995 DID/voice service and provider credentials.
3. A persistent signed SIP/media bridge that connects the provider audio to the existing Agent G/Gemini Live path.
4. Production migration application.
5. Real Georgian inbound/outbound test calls and owner approval to mark the path ready.

## References

- https://ubill.ge/en/api-docs
- https://www.twilio.com/en-us/guidelines/ge/sms
- https://www.didww.com/phone-numbers/local-numbers/Georgia/Local
- https://www.didww.com/voice/global-sip-trunking/Georgia
- https://doc.didww.com/voice/inbound-trunks/index.html
- https://doc.didww.com/otp-verification/index.html
