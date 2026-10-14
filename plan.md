# MyAvatar.ge Phone Agent Connection

## User outcome

Signed-in customer opens **Settings → Connections → Phone**, enters a Georgian mobile number, receives a one-time SMS code, verifies ownership, and then enables Agent G calls with a clear toggle. The application must never show “Connected” until the number is verified and the real phone provider is ready.

## Implementation approach

1. Add a server-only phone connection configuration boundary:
   - onboarding is available only when the SMS OTP provider is configured;
   - calls are enabled only when a real voice provider and bridge are configured and the owner has explicitly enabled the production flag;
   - missing credentials fail closed and do not create fake call rows.
2. Add a service-only OTP challenge table with hashed codes, expiration, attempt limits, and one-time consumption.
3. Add `/api/agent-g/phone`:
   - `GET` returns only availability, masked number, verification state, and whether calls are actually ready;
   - `POST {action:start}` normalizes a Georgian mobile and sends an OTP through the server-side uBill adapter;
   - `POST {action:verify}` verifies the code and links the number to the signed-in account;
   - `PATCH {enabled}` toggles Agent G phone access only after verification and real provider readiness;
   - `DELETE` disconnects and clears the link.
4. Replace the unavailable Phone sentence in Connections with an accessible, localized onboarding card and switch.
5. Keep the direct-PSTN provider abstracted. The researched production candidate is DIDWW for a +995 voice/SMS number and SIP trunks; account, number, KYC, bridge, and live-call proof are external owner/provider steps and are not invented by this branch.

## Design

- **Movement:** quiet utility / mobile-first settings, using the existing MyAvatar dark elevated-card language rather than a new visual system.
- **Principles:** one action per state, honest server-derived status, visible progress, and no technical provider jargon for customers.
- **Color:** existing app accent for the next action, emerald only for verified/active, muted text for blocked prerequisites.
- **Interaction:** enter number → send code → enter code → enable calls. The switch is disabled until the server proves the call path.
- **Brand voice:** direct and reassuring. Example: “შეიყვანე ნომერი — Agent G დაგიკავშირდება აქ.” / “კოდი გამოგიგზავნეთ. შეიყვანე იგი დასადასტურებლად.”

## Project structure

- `app/api/agent-g/phone/route.ts` — authenticated connection lifecycle.
- `lib/phone/connection.ts` — readiness and masked status helpers.
- `lib/phone/otp.ts` — code generation and server-side hashing.
- `lib/sms/providers/ubill.ts` — server-only Georgian SMS OTP adapter.
- `components/settings/PhoneConnectionCard.tsx` — localized UI flow.
- `supabase/migrations/20261014a_phone_agent_connection.sql` — verified-link data model.

## Material constraints

- No phone or call status becomes production-active without real provider credentials and a completed test call.
- No user is charged during the connection/OTP flow.
- SMS contains no file bytes; later delivery uses an authenticated, expiring MyAvatar file link.
- Production rollout requires provider secrets, SMS brand approval/balance, the DIDWW/PBX voice number and SIP/bridge setup, database migration, and live Georgian inbound/outbound tests.
