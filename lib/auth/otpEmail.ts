/**
 * lib/auth/otpEmail.ts — the pure half of self-delivered 6-digit auth codes.
 *
 * WHY WE DELIVER THE MAIL OURSELVES: Supabase renders whatever its "Confirm signup" / "Magic Link"
 * templates contain. Those templates ship with `{{ .ConfirmationURL }}`, which produces a LINK, and this
 * project cannot edit them — the dashboard editor locks the token variables. No client-side change can
 * make a link into a code.
 *
 * WHAT WE DO NOT DO: mint our own credentials. Rolling a private OTP table means owning code generation,
 * hashing, expiry, replay and session minting — an entire auth surface to get wrong. Instead
 * `auth.admin.generateLink()` is called server-side: it GENERATES a code WITHOUT SENDING ANY EMAIL and
 * returns Supabase's own `email_otp` in the response. We only take over the transport. The code stays
 * Supabase's, so `verifyOtp()` validates it natively, with its own expiry and single-use semantics, and
 * hands back a genuine session. No new trust boundary, no schema change.
 *
 * PURE + TOTAL: no imports, no I/O, never throws.
 */

export type OtpPurpose = 'signup' | 'signin';
export type OtpLocale = 'ka' | 'en' | 'ru';

/** Supabase's admin link types, mapped from our product-level purpose. */
export function linkTypeFor(purpose: OtpPurpose): 'signup' | 'magiclink' {
  return purpose === 'signup' ? 'signup' : 'magiclink';
}

/** The `verifyOtp` type the CLIENT must use for a code produced by this purpose. Mismatch = rejection. */
export function verifyTypeFor(purpose: OtpPurpose): 'signup' | 'email' {
  return purpose === 'signup' ? 'signup' : 'email';
}

export function isOtpPurpose(v: unknown): v is OtpPurpose {
  return v === 'signup' || v === 'signin';
}

/** Exactly six digits. Anything else means the provider response changed and must not be mailed. */
export function isSixDigitCode(v: unknown): v is string {
  return typeof v === 'string' && /^\d{6}$/.test(v);
}

/**
 * Pull the one-time code out of an `admin.generateLink()` response.
 *
 * Shape-tolerant on purpose: the SDK nests it under `properties`, the raw GoTrue endpoint returns it at
 * the top level, and both have appeared across versions. Returns null rather than guessing — mailing a
 * wrong or empty value would lock the user out with no way to tell why.
 */
export function extractEmailOtp(response: unknown): string | null {
  if (!response || typeof response !== 'object') return null;
  const r = response as Record<string, unknown>;
  const direct = r.email_otp;
  if (isSixDigitCode(direct)) return direct;
  const props = r.properties;
  if (props && typeof props === 'object') {
    const nested = (props as Record<string, unknown>).email_otp;
    if (isSixDigitCode(nested)) return nested;
  }
  // The SDK wraps everything one level deeper in `data`.
  const data = r.data;
  if (data && typeof data === 'object') return extractEmailOtp(data);
  return null;
}

/** Basic address sanity. Deliberately permissive — Supabase is the real validator. */
export function isPlausibleEmail(v: unknown): v is string {
  return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) && v.trim().length <= 254;
}

export function normalizeLocale(v: unknown): OtpLocale {
  return v === 'en' ? 'en' : v === 'ru' ? 'ru' : 'ka';
}

interface Copy {
  subject: (code: string) => string;
  heading: string;
  lead: string;
  expires: string;
  ignore: string;
}

const COPY: Record<OtpLocale, Record<OtpPurpose, Copy>> = {
  ka: {
    signup: {
      subject: (c) => `${c} — თქვენი დადასტურების კოდი`,
      heading: 'დაადასტურეთ ელფოსტა',
      lead: 'შეიყვანეთ ეს კოდი რეგისტრაციის დასასრულებლად:',
      expires: 'კოდი მოქმედებს 1 საათი და მხოლოდ ერთხელ გამოიყენება.',
      ignore: 'თუ ეს თქვენ არ ყოფილხართ, უბრალოდ იგნორირება გაუკეთეთ ამ წერილს.',
    },
    signin: {
      subject: (c) => `${c} — შესვლის კოდი`,
      heading: 'შესვლის კოდი',
      lead: 'შეიყვანეთ ეს კოდი ანგარიშში შესასვლელად:',
      expires: 'კოდი მოქმედებს 1 საათი და მხოლოდ ერთხელ გამოიყენება.',
      ignore: 'თუ შესვლას არ ცდილობდით, იგნორირება გაუკეთეთ ამ წერილს — ანგარიში დაცულია.',
    },
  },
  en: {
    signup: {
      subject: (c) => `${c} — your confirmation code`,
      heading: 'Confirm your email',
      lead: 'Enter this code to finish creating your account:',
      expires: 'The code is valid for 1 hour and can be used once.',
      ignore: "If this wasn't you, just ignore this email.",
    },
    signin: {
      subject: (c) => `${c} — your sign-in code`,
      heading: 'Sign-in code',
      lead: 'Enter this code to sign in:',
      expires: 'The code is valid for 1 hour and can be used once.',
      ignore: "If you weren't signing in, ignore this email — your account is safe.",
    },
  },
  ru: {
    signup: {
      subject: (c) => `${c} — код подтверждения`,
      heading: 'Подтвердите почту',
      lead: 'Введите этот код, чтобы завершить регистрацию:',
      expires: 'Код действует 1 час и используется один раз.',
      ignore: 'Если это были не вы, просто проигнорируйте письмо.',
    },
    signin: {
      subject: (c) => `${c} — код для входа`,
      heading: 'Код для входа',
      lead: 'Введите этот код, чтобы войти:',
      expires: 'Код действует 1 час и используется один раз.',
      ignore: 'Если вы не входили, проигнорируйте письмо — аккаунт в безопасности.',
    },
  },
};

/** Escape anything interpolated into the HTML. The code is digits-only, but never trust that twice. */
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export interface OtpMail {
  subject: string;
  html: string;
  text: string;
}

/**
 * Build the code email.
 *
 * The code is in the SUBJECT as well as the body: on a phone, that means it is readable from the
 * notification without opening the mail, which is what every provider does and what people expect.
 */
export function buildOtpEmail(code: string, purpose: OtpPurpose, locale: OtpLocale): OtpMail | null {
  if (!isSixDigitCode(code)) return null;
  const c = COPY[locale][purpose];
  const safe = esc(code);
  const html = [
    '<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#0B0B0F">',
    `<h1 style="margin:0 0 8px;font-size:20px;font-weight:700">${esc(c.heading)}</h1>`,
    `<p style="margin:0 0 24px;font-size:14px;color:#5A5A66">${esc(c.lead)}</p>`,
    `<div style="font-size:34px;font-weight:700;letter-spacing:10px;text-align:center;padding:18px 0;background:#F4F4F7;border-radius:12px">${safe}</div>`,
    `<p style="margin:24px 0 0;font-size:12px;color:#8A8A96">${esc(c.expires)}</p>`,
    `<p style="margin:8px 0 0;font-size:12px;color:#8A8A96">${esc(c.ignore)}</p>`,
    '</div>',
  ].join('');
  return {
    subject: c.subject(code),
    html,
    text: `${c.heading}\n\n${c.lead}\n\n${code}\n\n${c.expires}\n${c.ignore}`,
  };
}
