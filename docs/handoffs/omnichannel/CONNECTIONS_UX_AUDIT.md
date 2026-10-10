# Settings → Connections: UX audit

Last updated: 2026-10-10. Branch `claude/launch-certification-wmvitt` (draft PR #50).

**Production** (`6c7dff4`) does not have this section yet. Its Settings page still shows the older standalone WhatsApp
card (`WhatsAppLinkCard`). Everything below is on the branch and its Preview.

## 1. The owner's rules (Omnichannel A3 / B, 2026-10-10 13:10Z)

- Only four words: **Connect**, **Connected**, **Temporarily unavailable**, **Disconnect** (an action inside a connected
  row). A guest sees **Sign in**; Notifications shows **On** for a member.
- Never "Connected" because a key exists. WhatsApp is connected only when the person's own number sent the one-time
  code and the Meta-signed webhook bound it.
- Cloud integrations with no real access are not shown as working. Telegram is not presented as phone calling.
- No technical reason reaches the browser: no env names, no table names, no full phone number.
- Calls are never for minor news, and the default is moderate.
- The black/blue minimalist design system stays as it is.

## 2. What decides each word

The route `GET /api/agent-g/channels` gathers facts on the server. `lib/connections/model.ts` (pure) turns them into
one state per row. The browser only displays it.

| Row | Facts read on the server | State today (branch, shared database) |
|---|---|---|
| Phone: calls & SMS | `phoneCallsReady()` (`lib/calls/availability.ts`): `false` in code, no real provider | Temporarily unavailable |
| WhatsApp | platform keys and webhook secrets present; the link tables answer; this person has a linked number | Temporarily unavailable on Preview: the link tables (migration `20261003c`) are not in the shared database. With the tables: Connect, then Connected with the number masked (`+995 5•• ••• •12`) |
| Telegram | bot keys; `TELEGRAM_BINDING_LIVE` (`false`); link tables; linked | Temporarily unavailable (owner 15:38Z: later) |
| Notifications | signed in | On (guest: Sign in) |

Web chat and Live Voice are the app itself and are not rows.

## 3. Inside each row

A row opens in place, one at a time.

- **Phone, Telegram:** one plain sentence ("Agent G calls and SMS are not available yet."). Nothing to press.
- **WhatsApp:** the existing link flow, embedded (`components/agent-g/WhatsAppLinkCard.tsx`): Connect → Open WhatsApp
  → send the code → Connected. Inside a connected row: the masked number, the alerts switch, and Disconnect with a
  confirm step. Every WhatsApp "link your number" reply points to `/settings#whatsapp`, which opens this row.
- **Notifications:** this browser's push (`PushPermissionCard`), then "what goes where" (`NotificationPrefsPanel`):
  - the site is always on and is shown as a chip, not a switch;
  - WhatsApp is one switch per kind of news, offered only when the server says this person's number is linked;
  - Telegram, SMS and calls are named as temporarily unavailable and offer nothing to press;
  - a press saves at once; a failed save puts the switch back and says so.

Preferences live in the person's auth `app_metadata.notify_prefs` (no new table, no migration), behind
`GET/PUT /api/notifications/preferences` with a strict schema, a size cap and a rate limit.

Defaults are moderate:

| News | Site | WhatsApp | Call |
|---|---|---|---|
| Task completed | always | on | off; may ring only when calls exist, inside the call window |
| Your approval is needed | always | on | never |
| Something needs your attention | always | off | never |
| Scheduled report | always | off | off; may ring only when calls exist |
| Reminder | always | off | off; may ring only when calls exist |

Agent G calls are off by default (`agentCalls.enabled = false`, 15 minutes a call, 30 a day; hard caps 30 and 120).

## 4. Mobile check (2026-10-10, real Chromium, server mocked)

`tests/connections.spec.ts` (6 tests) opens `/{lang}/settings` with the three routes mocked. It covers:
- a phone at 390 and 360 px, a tablet at 820 px and a desktop at 1280 px;
- light and dark themes, and Georgian, English and Russian.

It checks:
- the four rows in order, each with its word in the page's language;
- nothing technical on the page;
- nothing spills sideways;
- every row at least 56 px tall and every button inside an opened row at least 44 px;
- no text running under its neighbour;
- a press on a WhatsApp switch sends one save with only that change;
- a failed save puts the switch back with a message;
- a guest sees Sign in, while phone and Telegram stay unavailable.

**Found and fixed in this check:** on a phone, the status word overlapped the row's name. "Telegram" was cut by
"Temporarily unavailable", and "Phone: calls & SMS" broke into four lines. In the notification list, Georgian names ran
under the chips.

The fix:
- on narrow screens the status word sits under the name;
- the opened row drops its left indent;
- a kind of news keeps room for its words, and its chips move to the next line when the row is too narrow.

The spec failed before the fix and passes after it.

Screenshots (Georgian, dark):
- [phone, rows](evidence/connections-phone-ka-dark-rows-2026-10-10.png)
- [phone, notifications](evidence/connections-phone-ka-dark-notifications-2026-10-10.png)
- [desktop, rows](evidence/connections-desktop-ka-dark-rows-2026-10-10.png)

The "site" chip is 32 px tall. It is a label, not a button.

## 5. Open

| Item | Label |
|---|---|
| The section on a real iPhone and Android phone | BUILT_NOT_PROVEN (Chromium at phone width only) |
| WhatsApp "Connect → Connected" on Preview | BLOCKED_OWNER: needs migration `20261003c` in the shared database (GG's word) |
| The section in Production | waits on the merge and deploy (GG's word) |
| Telegram, SMS, phone rows becoming usable | DISABLED until the owner turns these channels on (15:38Z: later) |
