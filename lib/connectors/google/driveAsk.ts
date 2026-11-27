/**
 * lib/connectors/google/driveAsk.ts — does a chat message ask about the user's Google Drive?
 *
 * ⚠️ THE CHAT MODEL HAS NO DRIVE TOOL. Only Agent G's loop (POST /api/agent/run, drive_list_files / drive_read_file) can
 * see the files the user picked, so „რა წერია ჩემ დრაივზე?" typed in the chat was answered by the plain chat model with
 * „I cannot see your Drive" (GG, myavatar.ge 2026-11-05 14:17Z). A message that names Drive goes to Agent G instead
 * (components/studio/OmniStudio), only when the server says Drive is open to this user.
 *
 * Names only: „Drive", „Google Drive", „დრაივ…", „გუგლ დისკ…", „драйв", „гугл диск". A plain „disk" or „file" is not
 * enough (a hard disk, a file attached in the chat), and „drive" as a verb inside a longer English word is not matched.
 */

const DRIVE_WORDS: readonly RegExp[] = [
  /\bgoogle\s*drive\b/i,
  /\bg-?drive\b/i,
  /\b(?:my|the|in|on|from|to)\s+drive\b/i,
  /\bdrive\s+(?:file|files|folder|doc|docs|pdf)\b/i,
  /დრაივ/u,
  /გუგლ\s*დისკ/u,
  /драйв/iu,
  /гугл\s*диск/iu,
  /google\s*диск/iu,
];

/** Bigger than any question; a pasted document that mentions Drive is not a question about it. */
export const DRIVE_ASK_MAX_CHARS = 600;

export function isDriveAsk(text: string): boolean {
  const t = (text ?? '').trim();
  if (!t || t.length > DRIVE_ASK_MAX_CHARS) return false;
  return DRIVE_WORDS.some((re) => re.test(t));
}

/** What Agent G is handed: the user's words, plus where to look, so the loop starts with drive_list_files. */
export function driveAgentGoal(text: string): string {
  return `${text.trim()}\n\n(The user is asking about the files they picked in their Google Drive: call drive_list_files first, then drive_read_file for the file(s) the question is about. Answer in the user's language.)`;
}
