/**
 * Turn a failed route response into something a person can act on.
 *
 * ⚠️ WHAT THIS FIXES. Nearly every operation in the Surgical Editor ended the same way:
 *
 *   if (status === 402) flash(t.insufficient);
 *   else if (status === 503) flash(t.notConfig);
 *   else flash(t.failed);            // ← "Failed." and nothing else
 *
 * Two specific statuses were handled well and EVERYTHING else — a rejected file, a provider timeout, a
 * prompt the safety filter refused, a mask that covered the whole frame — collapsed into one word. The
 * routes were not silent; they returned a `message` saying precisely what went wrong, and the UI threw
 * it away. A user who is told only "Failed" has exactly one move available: try the identical thing
 * again, and pay for it again.
 *
 * ⚠️ AND THE OPPOSITE MISTAKE, which this must not re-introduce. The naive fix is to print `j.error` —
 * but that field carries MACHINE CODES, and a previous version of the lip-sync studio printed
 * `insufficient_credits` verbatim into a Georgian interface. A raw code is not an explanation; it is a
 * different kind of nothing.
 *
 * So: prefer a human sentence, recognise a machine code for what it is, and when only a code is on offer
 * fall back to the caller's own translated string. Pure, so the distinction is directly testable.
 */

/** snake_case / SCREAMING_CASE with no spaces — a machine code, not a sentence meant for a person. */
function looksLikeCode(s: string): boolean {
  return /^[a-z0-9]+(?:[_.][a-z0-9]+)+$/i.test(s.trim());
}

export function describeOpFailure(body: unknown, fallback: string): string {
  const b = (body ?? {}) as { message?: unknown; error?: unknown; detail?: unknown };
  for (const field of [b.message, b.detail, b.error]) {
    if (typeof field !== 'string') continue;
    const v = field.trim();
    // Bound it: a provider can echo an entire prompt back inside its error, and a toast is not a log.
    if (v && !looksLikeCode(v)) return `${fallback} — ${v.slice(0, 160)}`;
  }
  return fallback;
}
