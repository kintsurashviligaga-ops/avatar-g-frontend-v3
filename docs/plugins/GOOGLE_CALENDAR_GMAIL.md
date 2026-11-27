# Gmail and Google Calendar: what is ready, what waits on Google

**Not built, on purpose.** The interface is in `lib/connectors/google/workspacePlan.ts`; nothing reads it yet.

## Why it waits

| Scope | Class | What Google requires to launch |
|-------|-------|--------------------------------|
| `gmail.readonly` | Restricted | OAuth verification **and** a yearly CASA security assessment (paid, third-party). |
| `gmail.compose` (drafts only, never `gmail.send`) | Sensitive | OAuth verification. |
| `calendar.events` | Sensitive | OAuth verification. |
| `calendar.freebusy` | Sensitive | OAuth verification (smaller ask). |

Unverified, Google allows 100 test users and shows them a warning screen. That is fine for GG's own testing and not for
launch.

## What works today without Google

The Calendar plugin (`calendar_prepare_event`) turns "Friday 15:00 Tbilisi, 45 min" into:

- a `calendar.google.com/calendar/render?action=TEMPLATE…` link with the zone (`ctz`): the user presses Save in their own Google Calendar;
- an RFC 5545 `.ics` (UTC times, escaped, folded, optional alarm) any calendar imports.

No grant, no verification, nothing stored.

## Verification submission checklist (for GG)

1. OAuth consent screen in project `gen-lang-client-0671348730`: app name, support email, myavatar.ge privacy policy and terms (already public), authorised domain myavatar.ge.
2. Add only the scopes above you want at launch. Recommended first wave: `calendar.events` + `gmail.compose`. Leave `gmail.readonly` for a second wave (CASA).
3. Justification text per scope (draft): "Agent G creates calendar events and email drafts only when the user asks and presses Save; it never sends email and never reads mail without the user's request."
4. A screen recording of the flow (we record it on a Preview with test users once the routes exist).
5. Update the privacy page rows (Drive already has them) for Gmail/Calendar data use.

## Build plan once verified (one draft PR, flag `CONNECTORS_GOOGLE_WORKSPACE`, off)

- Reuse Drive's flow (`lib/connectors/google/oauth.ts`): incremental consent, one more provider id per scope group.
- Tools: `gmail_search` / `gmail_read` (inspect), `gmail_prepare_draft` (prepare → Save card calls `createDraft`), `calendar_free_busy` / `calendar_list` (inspect), `calendar_prepare_event` gains a "Save to Google Calendar" card when linked.
- Reminders: `agent_reminders` table (migration 20261120b), a cron sweep, delivery by web push (already in the app) — after the database is back.
