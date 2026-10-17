# Phone Agent connection — outcome checklist

## Delivered in code

- [ ] Settings → Connections → Phone shows a localized connect flow instead of a dead-end sentence when the server has OTP onboarding configured.
- [ ] A signed-in user can enter a Georgian mobile number, request a one-time SMS code, enter the code, and link only a number they control.
- [ ] OTP codes are hashed server-side, expire, have attempt limits, are rate-limited, and are consumed once.
- [ ] The server returns only a masked linked number and never exposes the OTP, full phone number, provider keys, or database details to the browser.
- [ ] A verified number can be enabled with a toggle only after the real voice path is ready; otherwise the toggle stays disabled and the UI explains that setup is pending.
- [ ] Disconnect clears the verified phone link and disables callbacks.
- [ ] Missing provider configuration fails closed and preserves the honest unavailable state.

## Owner/provider steps still required

- [ ] Add either the existing Twilio Verify credentials (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID`) or create/verify the uBill account, reserve a brand name, fund it, and add the server-side OTP secrets.
- [ ] Choose and provision the +995 voice number and inbound/outbound voice service (DIDWW is the primary researched candidate; PBX.IM is fallback).
- [ ] Deploy the persistent SIP/media bridge and configure signed webhook credentials.
- [ ] Apply `supabase/migrations/20261014a_phone_agent_connection.sql` to Production.
- [ ] Run real Georgian inbound and outbound calls, then explicitly enable the production readiness flag.
- [ ] Only after the real call proof: enable the user-facing phone toggle in Production.
