/**
 * lib/auth/otpEmail.ts — the pure half of self-delivered auth codes (6–10 digits, Supabase's setting).
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

/**
 * - `signup`   — the old two-field registration (email + chosen password); RETIRED (the route answers 410).
 * - `signin`   — a code for an EXISTING account only. An unknown address gets no mail and `no_account`
 *                (2026-10-03: the sheet says „no account — create one" instead of leaving people waiting for a code).
 * - `continue` — the 2026-10-01 one-field flow, kept for tabs still running that build: a code for anyone (an
 *                unknown address gets an account), and the answer never says which.
 * - `register` — SIGN-UP (2026-10-03, the owner: an address that already has an account must not register again).
 *                A new address gets an UNCONFIRMED account and a confirmation code; a confirmed one is refused with
 *                `account_exists`, and the sheet sends the person to log in.
 * - `recovery` — „forgot password": a RESET code for an existing account. It verifies with
 *                `type: 'recovery'` and the sheet then asks for the new password.
 */
export type OtpPurpose = 'signup' | 'signin' | 'continue' | 'register' | 'recovery';
export type OtpLocale = 'ka' | 'en' | 'ru';

/** Supabase's admin link types, mapped from our product-level purpose. */
export function linkTypeFor(purpose: OtpPurpose): 'signup' | 'magiclink' | 'recovery' {
  return purpose === 'signup' || purpose === 'register' ? 'signup' : purpose === 'recovery' ? 'recovery' : 'magiclink';
}

/** The `verifyOtp` type the CLIENT must use for a code produced by this purpose. Mismatch = rejection. */
export function verifyTypeFor(purpose: OtpPurpose): 'signup' | 'email' | 'recovery' {
  return purpose === 'signup' ? 'signup' : purpose === 'recovery' ? 'recovery' : 'email';
}

export function isOtpPurpose(v: unknown): v is OtpPurpose {
  return v === 'signup' || v === 'signin' || v === 'continue' || v === 'register' || v === 'recovery';
}

/**
 * A Supabase email code: 6 to 10 digits, the range of the project's „Email OTP Length" setting. Anything else means the
 * provider response changed and must not be mailed.
 *
 * ⚠️ IT WAS EXACTLY SIX (2026-10-01 → 10-08). Every send in the Vercel logs answered 502 `no email_otp in generateLink
 * response` (production 10-03 07:18 and 07:24, Preview 10-08 12:08), so code sign-in, sign-up and password reset never
 * delivered a code. GoTrue's email_otp is digits only, so the likely cause is a project OTP length other than 6
 * (inferred; the send now logs the shape if it still fails). The sheet learns the length from the send's answer.
 */
export function isEmailOtpCode(v: unknown): v is string {
  return typeof v === 'string' && /^\d{6,10}$/.test(v);
}

/** What a generateLink answer held where the code should be — key names and a length, never the value (for the log). */
export function describeOtpShape(response: unknown): string {
  const r = (response && typeof response === 'object' ? response : {}) as Record<string, unknown>;
  const inner = (r.data && typeof r.data === 'object' ? r.data : r) as Record<string, unknown>;
  const props = (inner.properties && typeof inner.properties === 'object' ? inner.properties : {}) as Record<string, unknown>;
  const v = props.email_otp ?? inner.email_otp;
  const kind = typeof v === 'string' ? `string(${v.length}${/^\d+$/.test(v) ? ', digits' : ''})` : typeof v;
  return `keys=[${Object.keys(inner).join(',')}] properties=[${Object.keys(props).join(',')}] email_otp=${kind}`;
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
  if (isEmailOtpCode(direct)) return direct;
  const props = r.properties;
  if (props && typeof props === 'object') {
    const nested = (props as Record<string, unknown>).email_otp;
    if (isEmailOtpCode(nested)) return nested;
  }
  // The SDK wraps everything one level deeper in `data`.
  const data = r.data;
  if (data && typeof data === 'object') return extractEmailOtp(data);
  return null;
}

/**
 * Does this provider error mean "no such account", as opposed to a real failure?
 *
 * LOAD-BEARING FOR SECURITY *AND* FOR NOT LYING. A sign-in for an unknown address must answer OK, or the
 * endpoint becomes an account-enumeration oracle. But that exemption must apply ONLY to this case: the
 * first version swallowed every sign-in error, so a bad service-role key, a GoTrue 5xx, its rate limit
 * or a network fault all reported "code sent" while nothing was generated and nothing was logged.
 */
export function isUserNotFoundError(message: unknown): boolean {
  const m = String(message ?? '').toLowerCase();
  if (!m) return false;
  return m.includes('not found') || m.includes('no user') || m.includes('does not exist');
}

/** Does this provider error mean the address is already registered? */
export function isEmailTakenError(message: unknown): boolean {
  const m = String(message ?? '').toLowerCase();
  if (!m) return false;
  return m.includes('already') || m.includes('registered') || m.includes('exists');
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
    continue: {
      subject: (c) => `${c} — თქვენი MyAvatar კოდი`,
      heading: 'თქვენი კოდი',
      lead: 'შეიყვანეთ ეს კოდი MyAvatar-ში — ახალ ანგარიშს შექმნის ან არსებულში შეგიყვანთ:',
      expires: 'კოდი მოქმედებს 1 საათი და მხოლოდ ერთხელ გამოიყენება.',
      ignore: 'თუ ეს თქვენ არ ყოფილხართ, უბრალოდ იგნორირება გაუკეთეთ ამ წერილს.',
    },
    register: {
      subject: (c) => `${c} — დაადასტურეთ ელფოსტა`,
      heading: 'დაადასტურეთ ელფოსტა',
      lead: 'შეიყვანეთ ეს კოდი MyAvatar-ში რეგისტრაციის დასასრულებლად:',
      expires: 'კოდი მოქმედებს 1 საათი და მხოლოდ ერთხელ გამოიყენება.',
      ignore: 'თუ რეგისტრაციას არ ცდილობდით, უბრალოდ იგნორირება გაუკეთეთ ამ წერილს.',
    },
    recovery: {
      subject: (c) => `${c} — პაროლის აღდგენის კოდი`,
      heading: 'პაროლის აღდგენა',
      lead: 'შეიყვანეთ ეს კოდი MyAvatar-ში და შემდეგ აირჩიეთ ახალი პაროლი:',
      expires: 'კოდი მოქმედებს 1 საათი და მხოლოდ ერთხელ გამოიყენება.',
      ignore: 'თუ პაროლის აღდგენას არ ცდილობდით, იგნორირება გაუკეთეთ ამ წერილს — პაროლი არ შეცვლილა.',
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
    continue: {
      subject: (c) => `${c} — your MyAvatar code`,
      heading: 'Your code',
      lead: 'Enter this code in MyAvatar — it signs you in, or creates your account if you are new:',
      expires: 'The code is valid for 1 hour and can be used once.',
      ignore: "If this wasn't you, just ignore this email.",
    },
    register: {
      subject: (c) => `${c} — confirm your email`,
      heading: 'Confirm your email',
      lead: 'Enter this code in MyAvatar to finish creating your account:',
      expires: 'The code is valid for 1 hour and can be used once.',
      ignore: "If you weren't signing up, just ignore this email.",
    },
    recovery: {
      subject: (c) => `${c} — your password reset code`,
      heading: 'Reset your password',
      lead: 'Enter this code in MyAvatar, then choose a new password:',
      expires: 'The code is valid for 1 hour and can be used once.',
      ignore: "If you didn't ask to reset your password, ignore this email — your password has not changed.",
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
    continue: {
      subject: (c) => `${c} — ваш код MyAvatar`,
      heading: 'Ваш код',
      lead: 'Введите этот код в MyAvatar — он выполнит вход или создаст аккаунт, если вы новый пользователь:',
      expires: 'Код действует 1 час и используется один раз.',
      ignore: 'Если это были не вы, просто проигнорируйте письмо.',
    },
    register: {
      subject: (c) => `${c} — подтвердите почту`,
      heading: 'Подтвердите почту',
      lead: 'Введите этот код в MyAvatar, чтобы завершить регистрацию:',
      expires: 'Код действует 1 час и используется один раз.',
      ignore: 'Если вы не регистрировались, просто проигнорируйте письмо.',
    },
    recovery: {
      subject: (c) => `${c} — код для сброса пароля`,
      heading: 'Сброс пароля',
      lead: 'Введите этот код в MyAvatar, затем придумайте новый пароль:',
      expires: 'Код действует 1 час и используется один раз.',
      ignore: 'Если вы не запрашивали сброс пароля, проигнорируйте письмо — пароль не изменился.',
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
  if (!isEmailOtpCode(code)) return null;
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
