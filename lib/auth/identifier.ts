/**
 * lib/auth/identifier.ts — the ONE sign-in field: an email address or a phone number, in whatever shape a person
 * types it. (Owner, 2026-10-01: „რეგისტრაცია ერთ ხაზში უნდა იყოს ტელეფონის ნომრით ან მაილით".)
 *
 * Phone numbers are normalised to E.164, which is what Supabase's phone auth wants. Georgia is the default country:
 * a local mobile number (9 digits starting with 5 — `599 12 34 56`, `0599…` is not a Georgian format but is
 * tolerated) becomes `+995…`. Anything with a leading `+` or `00` is taken as already international.
 *
 * PURE + TOTAL: no I/O, never throws.
 */

export type Identifier =
  | { kind: 'email'; email: string }
  | { kind: 'phone'; phone: string }
  | { kind: 'invalid' };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Does the text look like the person is typing a phone number (so far)? Drives the field's icon. */
export function looksLikePhone(raw: string): boolean {
  const t = raw.trim();
  return t.length > 0 && !t.includes('@') && /^[+\d(][\d\s().-]*$/.test(t);
}

/** E.164 for a typed phone number, or null. */
export function normalizePhone(raw: string): string | null {
  const t = raw.trim();
  if (!looksLikePhone(t)) return null;
  let digits = t.replace(/[^\d+]/g, '');
  if (digits.startsWith('00')) digits = `+${digits.slice(2)}`;
  if (digits.indexOf('+') > 0) return null; // a "+" anywhere but the front is not a number
  if (!digits.startsWith('+')) {
    const d = digits.replace(/^0+/, '');
    if (/^5\d{8}$/.test(d)) digits = `+995${d}`; // a Georgian mobile, typed locally
    else if (/^995\d{9}$/.test(d)) digits = `+${d}`; // the country code without its plus
    else return null; // a bare foreign number is ambiguous — ask for the +
  }
  // E.164: a country code that does not start with 0, then up to 15 digits in all.
  return /^\+[1-9]\d{7,14}$/.test(digits) ? digits : null;
}

export function parseIdentifier(raw: string, opts: { phone: boolean }): Identifier {
  const t = (raw ?? '').trim();
  if (!t) return { kind: 'invalid' };
  if (t.includes('@')) {
    const email = t.toLowerCase();
    return EMAIL_RE.test(email) && email.length <= 254 ? { kind: 'email', email } : { kind: 'invalid' };
  }
  if (!opts.phone) return { kind: 'invalid' };
  const phone = normalizePhone(t);
  return phone ? { kind: 'phone', phone } : { kind: 'invalid' };
}

/** `+995599123456` → `+995 599 12 34 56` for the „we sent a code to …" line. Other countries are shown as typed in
 *  E.164 — country codes are 1–3 digits, and guessing the split wrong reads worse than no split. */
export function formatPhone(e164: string): string {
  const ge = /^\+995(\d{3})(\d{2})(\d{2})(\d{2})$/.exec(e164);
  return ge ? `+995 ${ge[1]} ${ge[2]} ${ge[3]} ${ge[4]}` : e164;
}
