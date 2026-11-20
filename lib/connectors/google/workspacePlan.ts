/**
 * lib/connectors/google/workspacePlan.ts — the INTERFACE of the Gmail and Google Calendar connectors, prepared for
 * Google's OAuth verification. NOTHING HERE IS WIRED: no route, no tool, no flag reads these. They exist so the
 * verification submission (scopes, justification, data use) and the later build agree on one contract.
 *
 * Why not built: gmail.readonly / gmail.compose and calendar.events are "sensitive" or "restricted" scopes. Google lets
 * an unverified app use them only for 100 test users with a warning screen; launching them needs verification (and,
 * for restricted Gmail scopes, a yearly CASA security assessment). docs/plugins/GOOGLE_CALENDAR_GMAIL.md has the plan.
 *
 * Until then the Calendar plugin works without any Google grant (lib/agent/plugins/calendar: a Google Calendar
 * "add event" link and an .ics file), and Gmail stays "soon".
 */

/** The narrowest scopes that do the job. Each one goes in the verification form with the reason beside it. */
export const GMAIL_SCOPES = {
  /** Read the user's messages to summarise / search them. Restricted: needs verification + CASA. */
  read: 'https://www.googleapis.com/auth/gmail.readonly',
  /** Create DRAFTS only (the user sends them in Gmail). Sensitive. We never ask for gmail.send. */
  draft: 'https://www.googleapis.com/auth/gmail.compose',
} as const;

export const CALENDAR_SCOPES = {
  /** See and change events on calendars the user picks. Sensitive. */
  events: 'https://www.googleapis.com/auth/calendar.events',
  /** Free/busy only, for "when am I free" without reading event details. Sensitive, smaller. */
  freebusy: 'https://www.googleapis.com/auth/calendar.freebusy',
} as const;

export interface MailSummary { id: string; threadId: string; from: string; subject: string; snippet: string; receivedAt: string }
export interface MailDraftInput { to: string[]; subject: string; body: string; inReplyToThreadId?: string }

/** What the Gmail provider will implement. Every write is a DRAFT the user sends themselves. */
export interface GmailConnector {
  search(userId: string, query: string, max: number): Promise<{ ok: true; messages: MailSummary[] } | { ok: false; reason: 'not_connected' | 'failed' }>;
  read(userId: string, messageId: string): Promise<{ ok: true; subject: string; text: string } | { ok: false; reason: 'not_connected' | 'not_found' | 'failed' }>;
  createDraft(userId: string, d: MailDraftInput): Promise<{ ok: true; draftId: string; openUrl: string } | { ok: false; reason: 'not_connected' | 'bad_input' | 'failed' }>;
}

export interface CalendarEventInput { title: string; startUtc: string; endUtc: string; timeZone: string; details?: string; location?: string; remindMin?: number }
export interface CalendarEventRow extends CalendarEventInput { id: string; htmlLink: string }

/** What the Google Calendar provider will implement. A write happens only on the user's own press (a card). */
export interface CalendarConnector {
  listUpcoming(userId: string, o: { fromUtc: string; toUtc: string; max: number }): Promise<{ ok: true; events: CalendarEventRow[] } | { ok: false; reason: 'not_connected' | 'failed' }>;
  freeBusy(userId: string, o: { fromUtc: string; toUtc: string; timeZone: string }): Promise<{ ok: true; busy: Array<{ startUtc: string; endUtc: string }> } | { ok: false; reason: 'not_connected' | 'failed' }>;
  createEvent(userId: string, e: CalendarEventInput): Promise<{ ok: true; event: CalendarEventRow } | { ok: false; reason: 'not_connected' | 'bad_input' | 'failed' }>;
}
