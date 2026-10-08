'use client';

/**
 * AuthModal — the studio's sign-in sheet: Log in · Sign up · Forgot password, in the window (no sign-in page).
 *
 * THE MODEL (owner, 2026-10-03 — X / ChatGPT references: „Log in" and „Sign up for free", one clear step at a time):
 *
 *   Log in   Google · (phone) · or an email → we look the address up (/api/auth/lookup):
 *              no account   → „no account with this email" + one tap to create it
 *              a password   → the password step; „forgot password?" and „sign in with a code" beside it
 *              codes only   → a code is mailed straight away (6–10 digits: Supabase's setting, from the send's answer)
 *   Sign up  Google · (phone) · or an email → a CONFIRMATION code (/api/auth/email-otp/send, purpose `register`):
 *              already registered → „this email is already registered" + one tap to log in — an address that has an
 *                                   account NEVER registers again (the lookup says so first, and Supabase refuses
 *                                   `email_exists` at the send even if the lookup is unavailable)
 *              new                → the code proves the address → name + password → in
 *   Forgot   a RESET code by email (purpose `recovery`) → the new password → other devices are signed out
 *
 * Every code is Supabase's own (generateLink + verifyOtp): we only deliver it. No session exists until a code or a
 * password is verified by Supabase. Phone numbers appear only when the project's Phone provider is on (GoTrue
 * /settings), and follow the same steps by SMS.
 *
 * Look (docs/DESIGN.md): one accent, ink text on it; hairlines, no glow, no gradient; 48 px fields and pills; 16 px
 * inputs (iOS zooms below that); a fade and an 8 px rise, none under reduced motion.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { ArrowLeft, Eye, EyeOff, Loader2, Mail, Phone, X } from 'lucide-react';
import { createBrowserClient, isSupabaseConfigured } from '@/lib/supabase/browser';
import { track } from '@/lib/analytics/track';
import { SUPPORT_EMAIL, buildSupportMailto } from '@/lib/support';
import { formatPhone, parseIdentifier } from '@/lib/auth/identifier';
import { isAccountStatus, type AccountStatus } from '@/lib/auth/accountStatus';
import { legalHref } from '@/lib/legal/links';
import { useDialogA11y } from '@/hooks/useDialogA11y';

type Lang = 'ka' | 'en' | 'ru';

/**
 * What the caller may ask for. `login` / `signup` / `recover` are the sheet's own; the rest are older names still
 * dispatched by some surfaces (`register` = sign-up, `newPassword` = the reset link's last step, `continue` / `magic`
 * / `reset` = log in).
 */
export type AuthEntry = 'login' | 'signup' | 'recover' | 'register' | 'newPassword' | 'continue' | 'magic' | 'reset';

type Flow = 'login' | 'signup';
type Step = 'start' | 'password' | 'code' | 'profile' | 'newPassword';
type CodeKind = 'signin' | 'register' | 'recovery';
type Who = { kind: 'email'; email: string } | { kind: 'phone'; phone: string };
type Issue = 'noAccount' | 'exists' | null;

/** New passwords: 8 or more (NIST SP 800-63B's floor). Signing in still accepts whatever an account already has. */
const MIN_PASSWORD = 8;
const RESEND_SECONDS = 60;

interface AuthModalProps {
  open: boolean;
  locale: Lang;
  onClose: () => void;
  onAuthed?: () => void;
  initialMode?: AuthEntry;
  /** An error to show the moment the sheet opens — e.g. an OAuth failure bounced back by /auth/callback as ?error=. */
  initialError?: string | null;
  /** Where a ROUND-TRIP (Google, an old reset link) returns to. Must already be safe (safeInternalPath). */
  returnTo?: string | null;
}

const COPY = {
  ka: {
    titleLogin: 'შესვლა MyAvatar-ში', titleSignup: 'შექმენი ანგარიში',
    subSignup: 'უფასოა. ბალანსი და შენი ყველა ნამუშევარი — ერთ ადგილას.',
    google: 'Google-ით გაგრძელება', phone: 'ტელეფონით გაგრძელება', emailInstead: 'ელფოსტით გაგრძელება', or: 'ან',
    email: 'ელფოსტა', phoneNumber: 'ტელეფონის ნომერი', phoneHint: 'მაგ. 599 12 34 56',
    cont: 'გაგრძელება',
    noAccountQ: 'არ გაქვს ანგარიში?', signupLink: 'დარეგისტრირდი', haveAccountQ: 'უკვე გაქვს ანგარიში?', loginLink: 'შესვლა',
    termsLead: 'გაგრძელებით ეთანხმები', terms: 'წესებს', and: 'და', privacy: 'კონფიდენციალურობის პოლიტიკას', termsTail: '.',
    noAccountEmail: 'ამ ელფოსტით ანგარიში ვერ მოიძებნა.', noAccountPhone: 'ამ ნომრით ანგარიში ვერ მოიძებნა.', createIt: 'შექმენი ანგარიში',
    existsEmail: 'ეს ელფოსტა უკვე რეგისტრირებულია.', existsPhone: 'ეს ნომერი უკვე რეგისტრირებულია.', loginInstead: 'შესვლა',
    passwordTitle: 'შეიყვანე პაროლი', password: 'პაროლი', show: 'პაროლის ჩვენება', hide: 'პაროლის დამალვა',
    loginCta: 'შესვლა', forgot: 'დაგავიწყდა პაროლი?', useCode: 'კოდით შესვლა', change: 'შეცვლა', back: 'უკან', close: 'დახურვა',
    codeTitle: { signin: 'შეიყვანე კოდი', register: 'დაადასტურე ელფოსტა', recovery: 'პაროლის აღდგენა' },
    codeTitlePhone: 'დაადასტურე ნომერი',
    codeSent: (n: number) => `გამოგიგზავნეთ ${n}-ნიშნა კოდი:`, codeLabel: (n: number) => `${n}-ნიშნა კოდი`, verify: 'დადასტურება',
    resend: 'კოდის ხელახლა გაგზავნა', resendIn: (s: number) => `ხელახლა გაგზავნა ${s} წმ-ში`, resent: 'ახალი კოდი გამოგზავნილია.',
    spam: 'არ ჩანს? შეამოწმე სპამის საქაღალდე.',
    profileTitle: 'დაასრულე რეგისტრაცია', profileSub: 'მისამართი დადასტურებულია. დაამატე სახელი და აირჩიე პაროლი.',
    name: 'სახელი', newPassword: 'პაროლი', pwHint: `მინიმუმ ${MIN_PASSWORD} სიმბოლო`, finish: 'დასრულება', later: 'პაროლს მოგვიანებით დავაყენებ',
    newPwTitle: 'ახალი პაროლი', newPwSub: 'კოდი დადასტურდა. აირჩიე ახალი პაროლი — სხვა მოწყობილობებზე ანგარიშიდან გამოხვალ.',
    repeat: 'გაიმეორე პაროლი', savePw: 'პაროლის შენახვა', saved: 'პაროლი შეიცვალა.',
    errEmail: 'შეიყვანე სწორი ელფოსტა.', errPhone: 'შეიყვანე ტელეფონის ნომერი, მაგ. 599 12 34 56.',
    errPassword: 'პაროლი არასწორია.', errCredentials: 'ელფოსტა ან პაროლი არასწორია.',
    errWeak: `პაროლი უნდა იყოს მინიმუმ ${MIN_PASSWORD} სიმბოლო.`, errPwned: 'ეს პაროლი ძალიან გავრცელებულია — აირჩიე სხვა.',
    errMismatch: 'პაროლები არ ემთხვევა.', errCode: 'კოდი არასწორია. შეამოწმე და სცადე ხელახლა.',
    errExpired: 'კოდს ვადა გაუვიდა — გამოითხოვე ახალი.', errCodeLength: (n: number) => `შეიყვანე ${n}-ნიშნა კოდი.`,
    errRate: 'ძალიან ბევრი მცდელობა — სცადე რამდენიმე წუთში.', errRateIn: (m: number) => `ძალიან ბევრი მცდელობა — სცადე ${m} წუთში.`,
    errNetwork: 'ქსელის შეცდომა. შეამოწმე კავშირი და სცადე ხელახლა.', errGeneric: 'ვერ მოხერხდა. სცადე ხელახლა.',
    errSend: `კოდის გაგზავნა ვერ მოხერხდა. სცადე ერთ წუთში ან მოგვწერე ${SUPPORT_EMAIL}.`,
    errOutdated: 'MyAvatar განახლდა — გადატვირთე გვერდი და სცადე ხელახლა.',
    notConfigured: 'ავტორიზაცია ამ გარემოში გამორთულია.',
  },
  en: {
    titleLogin: 'Log in to MyAvatar', titleSignup: 'Create your account',
    subSignup: "It's free. Your balance and everything you make, in one place.",
    google: 'Continue with Google', phone: 'Continue with phone', emailInstead: 'Continue with email', or: 'or',
    email: 'Email', phoneNumber: 'Phone number', phoneHint: 'With the country code, e.g. +995 599 12 34 56',
    cont: 'Continue',
    noAccountQ: "Don't have an account?", signupLink: 'Sign up', haveAccountQ: 'Already have an account?', loginLink: 'Log in',
    termsLead: 'By continuing, you agree to the', terms: 'Terms', and: 'and the', privacy: 'Privacy Policy', termsTail: '.',
    noAccountEmail: "We couldn't find an account with this email.", noAccountPhone: "We couldn't find an account with this number.", createIt: 'Create an account',
    existsEmail: 'This email is already registered.', existsPhone: 'This number is already registered.', loginInstead: 'Log in',
    passwordTitle: 'Enter your password', password: 'Password', show: 'Show password', hide: 'Hide password',
    loginCta: 'Log in', forgot: 'Forgot password?', useCode: 'Log in with a code', change: 'Change', back: 'Back', close: 'Close',
    codeTitle: { signin: 'Enter the code', register: 'Confirm your email', recovery: 'Reset your password' },
    codeTitlePhone: 'Confirm your number',
    codeSent: (n: number) => `We sent a ${n}-digit code to`, codeLabel: (n: number) => `${n}-digit code`, verify: 'Verify',
    resend: 'Resend code', resendIn: (s: number) => `Resend in ${s}s`, resent: 'A new code is on its way.',
    spam: "Can't see it? Check your spam folder.",
    profileTitle: 'Finish signing up', profileSub: 'Confirmed. Add your name and choose a password.',
    name: 'Name', newPassword: 'Password', pwHint: `At least ${MIN_PASSWORD} characters`, finish: 'Finish', later: "I'll set a password later",
    newPwTitle: 'Choose a new password', newPwSub: 'Code confirmed. Choose a new password — your other devices will be signed out.',
    repeat: 'Repeat the password', savePw: 'Save password', saved: 'Password changed.',
    errEmail: 'Enter a valid email address.', errPhone: 'Enter a phone number with the country code, e.g. +995 599 12 34 56.',
    errPassword: 'That password is not correct.', errCredentials: 'Email or password is not correct.',
    errWeak: `Use at least ${MIN_PASSWORD} characters.`, errPwned: 'That password is too common — choose another one.',
    errMismatch: "The passwords don't match.", errCode: "That code isn't right. Check it and try again.",
    errExpired: 'That code has expired — request a new one.', errCodeLength: (n: number) => `Enter the ${n}-digit code.`,
    errRate: 'Too many attempts — try again in a few minutes.', errRateIn: (m: number) => `Too many attempts — try again in ${m} min.`,
    errNetwork: 'Network error. Check your connection and try again.', errGeneric: 'Something went wrong. Please try again.',
    errSend: `We couldn't send the code right now. Try again in a minute, or write to ${SUPPORT_EMAIL}.`,
    errOutdated: 'MyAvatar was updated — reload the page and try again.',
    notConfigured: 'Sign-in is switched off in this environment.',
  },
  ru: {
    titleLogin: 'Вход в MyAvatar', titleSignup: 'Создайте аккаунт',
    subSignup: 'Бесплатно. Баланс и все ваши работы — в одном месте.',
    google: 'Продолжить с Google', phone: 'Продолжить по телефону', emailInstead: 'Продолжить по e-mail', or: 'или',
    email: 'Эл. почта', phoneNumber: 'Номер телефона', phoneHint: 'С кодом страны, напр. +995 599 12 34 56',
    cont: 'Продолжить',
    noAccountQ: 'Нет аккаунта?', signupLink: 'Зарегистрироваться', haveAccountQ: 'Уже есть аккаунт?', loginLink: 'Войти',
    termsLead: 'Продолжая, вы принимаете', terms: 'Условия', and: 'и', privacy: 'Политику конфиденциальности', termsTail: '.',
    noAccountEmail: 'Аккаунт с этой почтой не найден.', noAccountPhone: 'Аккаунт с этим номером не найден.', createIt: 'Создать аккаунт',
    existsEmail: 'Эта почта уже зарегистрирована.', existsPhone: 'Этот номер уже зарегистрирован.', loginInstead: 'Войти',
    passwordTitle: 'Введите пароль', password: 'Пароль', show: 'Показать пароль', hide: 'Скрыть пароль',
    loginCta: 'Войти', forgot: 'Забыли пароль?', useCode: 'Войти по коду', change: 'Изменить', back: 'Назад', close: 'Закрыть',
    codeTitle: { signin: 'Введите код', register: 'Подтвердите почту', recovery: 'Сброс пароля' },
    codeTitlePhone: 'Подтвердите номер',
    codeSent: (n: number) => `Мы отправили ${n}-значный код на`, codeLabel: (n: number) => `${n}-значный код`, verify: 'Подтвердить',
    resend: 'Отправить код снова', resendIn: (s: number) => `Повторно через ${s} с`, resent: 'Новый код отправлен.',
    spam: 'Не видно? Проверьте папку «Спам».',
    profileTitle: 'Завершите регистрацию', profileSub: 'Подтверждено. Укажите имя и придумайте пароль.',
    name: 'Имя', newPassword: 'Пароль', pwHint: `Минимум ${MIN_PASSWORD} символов`, finish: 'Готово', later: 'Задам пароль позже',
    newPwTitle: 'Новый пароль', newPwSub: 'Код подтверждён. Придумайте новый пароль — на других устройствах мы выполним выход.',
    repeat: 'Повторите пароль', savePw: 'Сохранить пароль', saved: 'Пароль изменён.',
    errEmail: 'Введите корректный адрес эл. почты.', errPhone: 'Введите номер с кодом страны, напр. +995 599 12 34 56.',
    errPassword: 'Неверный пароль.', errCredentials: 'Неверная почта или пароль.',
    errWeak: `Минимум ${MIN_PASSWORD} символов.`, errPwned: 'Этот пароль слишком распространён — выберите другой.',
    errMismatch: 'Пароли не совпадают.', errCode: 'Неверный код. Проверьте и попробуйте снова.',
    errExpired: 'Срок действия кода истёк — запросите новый.', errCodeLength: (n: number) => `Введите ${n}-значный код.`,
    errRate: 'Слишком много попыток — попробуйте через несколько минут.', errRateIn: (m: number) => `Слишком много попыток — попробуйте через ${m} мин.`,
    errNetwork: 'Ошибка сети. Проверьте подключение и попробуйте снова.', errGeneric: 'Не получилось. Попробуйте снова.',
    errSend: `Не удалось отправить код. Попробуйте через минуту или напишите на ${SUPPORT_EMAIL}.`,
    errOutdated: 'MyAvatar обновился — перезагрузите страницу и попробуйте снова.',
    notConfigured: 'Вход в этой среде отключён.',
  },
} as const;
type Copy = (typeof COPY)[Lang];

/** Official Google brand mark (4-colour 'G'). */
function GoogleIcon() {
  return (
    <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

/**
 * A provider / network error → one short, localised line. Raw JSON or HTML, and anything long, becomes the generic
 * line: the person never sees a dump.
 */
export function humanizeAuthError(err: unknown, t: Copy, ctx: { knownAccount?: boolean } = {}): string {
  const raw = (err instanceof Error ? err.message : typeof err === 'string' ? err : '').trim();
  if (!raw || /^[[{<]/.test(raw)) return t.errGeneric;
  const m = raw.toLowerCase();
  if (/invalid login credentials|invalid email or password|wrong password|bad credentials/.test(m)) return ctx.knownAccount ? t.errPassword : t.errCredentials;
  // Expiry FIRST: Supabase's „Email link is invalid or has expired" also reads like an invalid address.
  if (/expired|otp_expired|link is invalid/.test(m)) return t.errExpired;
  if (/pwned|easy to guess|compromised|leaked/.test(m)) return t.errPwned;
  if (/password.*(short|at least|weak|characters|minimum)|weak password/.test(m)) return t.errWeak;
  if (/unable to validate email|invalid.*email|email.*invalid/.test(m)) return t.errEmail;
  if (/rate limit|too many|429|over_email_send_rate|over_sms_send_rate/.test(m)) return t.errRate;
  if (/invalid.*(otp|token|code)|(otp|token|code).*invalid|incorrect.*code/.test(m)) return t.errCode;
  if (/network|failed to fetch|fetch failed|timeout|offline/.test(m)) return t.errNetwork;
  // A bare machine code (OAuth's `access_denied`, … bounced back by /auth/callback) is not a sentence.
  if (/^[a-z0-9]+(_[a-z0-9]+)+$/.test(m)) return t.errGeneric;
  return raw.length <= 120 ? raw : t.errGeneric;
}

/** The caller's entry → where the sheet opens. */
function entryOf(m: AuthEntry | undefined): { flow: Flow; step: Step } {
  if (m === 'signup' || m === 'register') return { flow: 'signup', step: 'start' };
  if (m === 'recover' || m === 'newPassword') return { flow: 'login', step: 'newPassword' };
  return { flow: 'login', step: 'start' };
}

export default function AuthModal({ open, locale, onClose, onAuthed, initialMode = 'login', initialError = null, returnTo = null }: AuthModalProps) {
  const t: Copy = COPY[locale] ?? COPY.ka;
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const titleId = useId();
  const dialogRef = useDialogA11y<HTMLDivElement>(open, onClose);

  const [flow, setFlow] = useState<Flow>(entryOf(initialMode).flow);
  const [step, setStep] = useState<Step>(entryOf(initialMode).step);
  /** The field on the first step: an email, or (phone mode) a number. */
  const [usePhone, setUsePhone] = useState(false);
  const [identifier, setIdentifier] = useState('');
  /** The parsed address the later steps act on. */
  const [who, setWho] = useState<Who | null>(null);
  const [status, setStatus] = useState<AccountStatus>('unknown');
  const [codeKind, setCodeKind] = useState<CodeKind>('signin');
  const [code, setCode] = useState('');
  /** Digits in the code just sent: 6 for SMS; for email, Supabase's project setting (6–10), from the send's answer. */
  const [codeLength, setCodeLength] = useState(6);
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [name, setName] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [issue, setIssue] = useState<Issue>(null);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [phoneEnabled, setPhoneEnabled] = useState(false);
  const [mounted, setMounted] = useState(false);
  const codeRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => setMounted(true), []);

  const backTo = returnTo || `/${locale}/dashboard`;
  const clearMessages = useCallback(() => { setError(null); setNotice(null); setIssue(null); }, []);

  // ── Open / reopen: land where the caller asked, with nothing stale on screen. ──
  useEffect(() => {
    if (!open) return;
    const e = entryOf(initialMode);
    setFlow(e.flow); setStep(e.step);
    setCode(''); setPassword(''); setPassword2(''); setShowPw(false); setIssue(null); setNotice(null);
    // ⚠️ initialError comes from the URL (?error=), so anyone can write it: show only what humanizeAuthError
    // RECOGNISES — free text it would pass through verbatim becomes the generic line (no spoofed messages here).
    const known = initialError ? humanizeAuthError(initialError, t) : null;
    setError(known && known === initialError?.trim() ? t.errGeneric : known);
  }, [open, initialMode, initialError, t]);

  // Body scroll stays where it is behind the sheet.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // A referral (?ref=CODE) survives until the account exists, then the existing system redeems it.
  useEffect(() => {
    try {
      const ref = new URLSearchParams(window.location.search).get('ref');
      if (ref) localStorage.setItem('myavatar:ref', ref.trim().toUpperCase());
    } catch { /* private mode */ }
  }, []);
  const redeemRef = useCallback(async () => {
    let refCode = '';
    try { refCode = localStorage.getItem('myavatar:ref') || ''; } catch { /* ignore */ }
    if (refCode.trim().length < 6) return;
    try {
      await fetch('/api/referral/redeem', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ code: refCode.trim() }) });
      try { localStorage.removeItem('myavatar:ref'); } catch { /* ignore */ }
    } catch { /* best-effort */ }
  }, []);

  // Which providers this project really has (GoTrue's public /settings) — never a button that 400s.
  useEffect(() => {
    if (!open) return;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anon) return;
    const ctrl = new AbortController();
    fetch(`${url}/auth/v1/settings`, { headers: { apikey: anon }, signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { external?: Record<string, boolean> } | null) => {
        setGoogleEnabled(Boolean(j?.external?.google));
        setPhoneEnabled(Boolean(j?.external?.phone));
      })
      .catch(() => { /* fail-soft: email only */ });
    return () => ctrl.abort();
  }, [open]);

  // The resend countdown ticks only while it is running.
  useEffect(() => {
    if (step !== 'code' || resendAt <= Date.now()) return;
    const id = window.setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (n >= resendAt) window.clearInterval(id);
    }, 1000);
    return () => window.clearInterval(id);
  }, [step, resendAt]);
  const resendLeft = Math.max(0, Math.ceil((resendAt - now) / 1000));

  const supabaseOr = useCallback(() => {
    const s = createBrowserClient();
    if (!s || !isSupabaseConfigured()) { setError(t.notConfigured); return null; }
    return s;
  }, [t]);

  /** Signed in: let the session cookie land before the server tree re-renders as a member. */
  const finish = useCallback(async () => {
    onAuthed?.(); onClose();
    const s = createBrowserClient();
    if (s) await s.auth.getSession();
    router.refresh();
  }, [onAuthed, onClose, router]);

  // ── Server calls ─────────────────────────────────────────────────────────────────────────────────────────────
  const lookup = useCallback(async (w: Who): Promise<AccountStatus | 'rate'> => {
    try {
      const res = await fetch('/api/auth/lookup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: w.kind === 'email' ? w.email : w.phone }),
      });
      if (res.status === 429) return 'rate';
      const j = (await res.json().catch(() => null)) as { status?: unknown } | null;
      return isAccountStatus(j?.status) ? j.status : 'unknown';
    } catch {
      return 'unknown';
    }
  }, []);

  /** Mail (or text) a code. Returns null when sent, else what to show. `issue` is set for the two answers with an action. */
  const sendCode = useCallback(async (w: Who, kind: CodeKind): Promise<string | null> => {
    if (w.kind === 'phone') {
      const s = supabaseOr();
      if (!s) return t.notConfigured;
      // A NEW number is created only by sign-up; log-in and „forgot password" never make an account.
      const { error: e } = await s.auth.signInWithOtp({ phone: w.phone, options: { shouldCreateUser: kind === 'register' } });
      if (e) {
        if (kind !== 'register' && /signups? not allowed|not found|no user/i.test(e.message)) { setIssue('noAccount'); return ''; }
        return humanizeAuthError(e, t);
      }
      setCodeLength(6);
      return null;
    }
    let res: Response;
    try {
      res = await fetch('/api/auth/email-otp/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: w.email, purpose: kind, locale }),
      });
    } catch {
      return t.errNetwork;
    }
    const j = (await res.json().catch(() => null)) as { error?: string; length?: unknown } | null;
    if (res.ok) {
      // A server older than the `length` field sent six.
      const n = j?.length;
      setCodeLength(typeof n === 'number' && Number.isInteger(n) && n >= 6 && n <= 10 ? n : 6);
      return null;
    }
    if (j?.error === 'account_exists') { setIssue('exists'); return ''; }
    if (j?.error === 'no_account') { setIssue('noAccount'); return ''; }
    if (res.status === 429) {
      const secs = Number(res.headers.get('Retry-After'));
      return Number.isFinite(secs) && secs > 0 ? t.errRateIn(Math.max(1, Math.ceil(secs / 60))) : t.errRate;
    }
    if (res.status === 410 || j?.error === 'client_outdated') return t.errOutdated;
    if (j?.error === 'invalid_email') return t.errEmail;
    // mail_not_configured / not_configured / send_failed carry an operator-facing message: say what a person can do.
    return t.errSend;
  }, [locale, supabaseOr, t]);

  const startCode = useCallback(async (w: Who, kind: CodeKind) => {
    const failure = await sendCode(w, kind);
    if (failure !== null) { if (failure) setError(failure); return false; }
    track('auth_code_requested', { method: w.kind, purpose: kind });
    setCodeKind(kind); setCode(''); setResendAt(Date.now() + RESEND_SECONDS * 1000); setNow(Date.now());
    setStep('code');
    return true;
  }, [sendCode]);

  // ── Step 1: the address ──────────────────────────────────────────────────────────────────────────────────────
  /** Where an address goes next, for this flow and what the lookup said. */
  const route = useCallback(async (w: Who, f: Flow, st: AccountStatus) => {
    if (f === 'login') {
      if (st === 'none') { setIssue('noAccount'); return; }
      if (st === 'code') { await startCode(w, 'signin'); return; }
      setStep('password'); // a password, or not known — the code is one tap away on that step
      return;
    }
    if (st === 'password' || st === 'code') { setIssue('exists'); return; }
    await startCode(w, 'register'); // the send refuses a registered address by itself too (account_exists)
  }, [startCode]);

  const submitIdentifier = useCallback(async () => {
    clearMessages();
    const id = parseIdentifier(identifier, { phone: usePhone });
    if (id.kind === 'invalid' || (usePhone && id.kind !== 'phone') || (!usePhone && id.kind !== 'email')) {
      setError(usePhone ? t.errPhone : t.errEmail);
      return;
    }
    const w: Who = id.kind === 'email' ? { kind: 'email', email: id.email } : { kind: 'phone', phone: id.phone };
    if (!supabaseOr()) return;
    setBusy(true);
    try {
      const st = await lookup(w);
      if (st === 'rate') { setError(t.errRate); return; }
      setWho(w); setStatus(st);
      await route(w, flow, st);
    } finally {
      setBusy(false);
    }
  }, [clearMessages, identifier, usePhone, t, supabaseOr, lookup, route, flow]);

  /** The action inside an issue box: switch to the other flow with the same address, and carry on in one tap. */
  const switchFlowAndGo = useCallback(async () => {
    if (!who) return;
    const next: Flow = flow === 'login' ? 'signup' : 'login';
    setFlow(next); clearMessages();
    setBusy(true);
    try {
      // An address the sign-up just found registered: log in. One the log-in did not find: create it.
      await route(who, next, next === 'login' ? (status === 'code' ? 'code' : 'password') : 'none');
    } finally {
      setBusy(false);
    }
  }, [who, flow, status, clearMessages, route]);

  // ── Step 2a: the password ────────────────────────────────────────────────────────────────────────────────────
  const submitPassword = useCallback(async () => {
    clearMessages();
    if (!who || !password) return;
    const s = supabaseOr();
    if (!s) return;
    setBusy(true);
    try {
      const { error: e } = who.kind === 'email'
        ? await s.auth.signInWithPassword({ email: who.email, password })
        : await s.auth.signInWithPassword({ phone: who.phone, password });
      if (e) throw e;
      track('user_login', { method: 'password' });
      await finish();
    } catch (err) {
      setError(humanizeAuthError(err, t, { knownAccount: status === 'password' }));
    } finally {
      setBusy(false);
    }
  }, [clearMessages, who, password, supabaseOr, finish, t, status]);

  const codeInstead = useCallback(async (kind: CodeKind) => {
    if (!who) return;
    clearMessages(); setPassword('');
    setBusy(true);
    try { await startCode(who, kind); } finally { setBusy(false); }
  }, [who, clearMessages, startCode]);

  // ── Step 2b: the code ────────────────────────────────────────────────────────────────────────────────────────
  const verifyCode = useCallback(async (value?: string) => {
    clearMessages();
    const digits = (value ?? code).replace(/\D/g, '');
    if (digits.length !== codeLength) { setError(t.errCodeLength(codeLength)); return; }
    if (!who) return;
    const s = supabaseOr();
    if (!s) return;
    setBusy(true);
    try {
      const { data, error: e } = who.kind === 'phone'
        ? await s.auth.verifyOtp({ phone: who.phone, token: digits, type: 'sms' })
        : await s.auth.verifyOtp({ email: who.email, token: digits, type: codeKind === 'recovery' ? 'recovery' : 'email' });
      if (e) throw e;
      if (!data.session) { setError(t.errCode); return; }
      setCode('');
      if (codeKind === 'register') {
        track('user_signup', { method: who.kind, verified: true });
        await redeemRef();
        setStep('profile');
      } else if (codeKind === 'recovery') {
        setStep('newPassword');
      } else {
        track('user_login', { method: `${who.kind}_code` });
        await finish();
      }
    } catch (err) {
      setError(humanizeAuthError(err, t));
    } finally {
      setBusy(false);
    }
  }, [clearMessages, code, codeLength, t, who, supabaseOr, codeKind, redeemRef, finish]);

  const resend = useCallback(async () => {
    if (!who || resendLeft > 0) return;
    clearMessages();
    setBusy(true);
    try {
      const failure = await sendCode(who, codeKind);
      if (failure !== null) { if (failure) setError(failure); return; }
      setNotice(t.resent); setResendAt(Date.now() + RESEND_SECONDS * 1000); setNow(Date.now());
      codeRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }, [who, resendLeft, clearMessages, sendCode, codeKind, t]);

  // ── Step 3: name + password (sign-up) / the new password (forgot) ───────────────────────────────────────────
  const saveProfile = useCallback(async (skipPassword: boolean) => {
    clearMessages();
    if (!skipPassword && password.length < MIN_PASSWORD) { setError(t.errWeak); return; }
    const s = supabaseOr();
    if (!s) return;
    setBusy(true);
    try {
      const data: Record<string, unknown> = { password_set: !skipPassword };
      if (name.trim()) data.name = name.trim().slice(0, 60);
      const { error: e } = await s.auth.updateUser(skipPassword ? { data } : { password, data });
      if (e) throw e;
      setPassword('');
      await finish();
    } catch (err) {
      setError(humanizeAuthError(err, t));
    } finally {
      setBusy(false);
    }
  }, [clearMessages, password, name, supabaseOr, finish, t]);

  const saveNewPassword = useCallback(async () => {
    clearMessages();
    if (password.length < MIN_PASSWORD) { setError(t.errWeak); return; }
    if (password !== password2) { setError(t.errMismatch); return; }
    const s = supabaseOr();
    if (!s) return;
    setBusy(true);
    try {
      const { error: e } = await s.auth.updateUser({ password, data: { password_set: true } });
      if (e) throw e;
      // A reset means the old password may be known to someone else: every OTHER session ends now.
      await s.auth.signOut({ scope: 'others' }).catch(() => undefined);
      track('password_reset_completed', {});
      setPassword(''); setPassword2('');
      // Let „password changed" be read before the sheet goes.
      setNotice(t.saved);
      window.setTimeout(() => { void finish(); }, 1200);
    } catch (err) {
      setError(humanizeAuthError(err, t));
    } finally {
      setBusy(false);
    }
  }, [clearMessages, password, password2, supabaseOr, t, finish]);

  const handleGoogle = useCallback(async () => {
    const s = supabaseOr();
    if (!s) return;
    setBusy(true);
    try {
      // → Google → /auth/callback (exchanges the code) → back where the person was, in their language.
      const { error: e } = await s.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(backTo)}` },
      });
      if (e) throw e;
    } catch (err) {
      setBusy(false);
      setError(humanizeAuthError(err, t));
    }
  }, [supabaseOr, backTo, t]);

  // ── Navigation inside the sheet ─────────────────────────────────────────────────────────────────────────────
  const toStart = useCallback(() => { clearMessages(); setStep('start'); setCode(''); setPassword(''); }, [clearMessages]);
  const switchFlow = useCallback((f: Flow) => { clearMessages(); setFlow(f); setStep('start'); }, [clearMessages]);

  const shownAddress = who ? (who.kind === 'phone' ? formatPhone(who.phone) : who.email) : '';
  const title = step === 'start' ? (flow === 'login' ? t.titleLogin : t.titleSignup)
    : step === 'password' ? t.passwordTitle
      : step === 'code' ? (who?.kind === 'phone' && codeKind !== 'recovery' ? t.codeTitlePhone : t.codeTitle[codeKind])
        : step === 'profile' ? t.profileTitle : t.newPwTitle;
  const canGoBack = step === 'password' || step === 'code';

  const motionProps = useMemo(() => reduceMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: 8 } }, [reduceMotion]);

  if (!mounted || typeof document === 'undefined') return null;

  const field = 'block h-12 w-full rounded-2xl border border-app-border/15 bg-app-elevated px-4 text-[16px] text-app-text outline-none transition-colors placeholder:text-app-muted focus:border-app-accent/70 focus:ring-2 focus:ring-app-accent/25 disabled:opacity-60';
  const label = 'mb-1.5 block text-[13px] font-medium text-app-muted';
  const primary = 'flex h-12 w-full items-center justify-center gap-2 rounded-full bg-app-accent text-[15px] font-semibold text-app-bg transition-opacity hover:opacity-90 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent';
  const outline = 'flex h-12 w-full items-center justify-center gap-2.5 rounded-full border border-app-border/20 text-[15px] font-semibold text-app-text transition-colors hover:bg-app-elevated disabled:opacity-50';
  const textLink = 'inline-flex min-h-[44px] items-center text-[14px] font-medium text-app-accent transition-opacity hover:opacity-80 disabled:opacity-50';
  const spinner = busy ? <Loader2 size={17} className="animate-spin" aria-hidden="true" /> : null;

  const passwordInput = (id: string, value: string, set: (v: string) => void, opts: { autoComplete: string; label: string; autoFocus?: boolean; hint?: string }) => (
    <div>
      <label htmlFor={id} className={label}>{opts.label}</label>
      <div className="relative">
        <input id={id} value={value} onChange={(e) => set(e.target.value)} type={showPw ? 'text' : 'password'}
          autoComplete={opts.autoComplete} autoFocus={opts.autoFocus} data-autofocus={opts.autoFocus ? '' : undefined} required aria-describedby={opts.hint ? `${id}-hint` : undefined}
          className={`${field} pr-12`} data-testid={`auth-${id.split(':').pop()}`} />
        <button type="button" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? t.hide : t.show} aria-pressed={showPw}
          className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-app-muted transition-colors hover:text-app-text">
          {showPw ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
        </button>
      </div>
      {opts.hint ? <p id={`${id}-hint`} className="mt-1.5 px-1 text-[12.5px] text-app-muted">{opts.hint}</p> : null}
    </div>
  );

  /** The address the later steps are about, with a way to change it — and a hidden username for password managers. */
  const addressChip = who ? (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-app-border/10 bg-app-elevated/60 px-4 py-2.5">
      <span className="min-w-0 truncate text-[14px] text-app-text" data-testid="auth-address">{shownAddress}</span>
      <button type="button" onClick={toStart} className="shrink-0 text-[13px] font-medium text-app-accent hover:opacity-80">{t.change}</button>
      <input type="text" name="username" autoComplete="username" value={who.kind === 'email' ? who.email : who.phone} readOnly tabIndex={-1} aria-hidden="true" className="sr-only" />
    </div>
  ) : null;

  const messages = (
    <>
      {error && <p role="alert" className="px-1 text-[13px] leading-snug text-app-danger">{error}</p>}
      {notice && <p role="status" className="px-1 text-[13px] leading-snug text-emerald-400">{notice}</p>}
      {issue && who && (
        <div role="alert" data-testid={`auth-issue-${issue}`} className="rounded-2xl border border-app-border/15 bg-app-elevated/60 px-4 py-3">
          <p className="text-[14px] leading-snug text-app-text">
            {issue === 'exists' ? (who.kind === 'phone' ? t.existsPhone : t.existsEmail) : (who.kind === 'phone' ? t.noAccountPhone : t.noAccountEmail)}
          </p>
          <button type="button" onClick={() => void switchFlowAndGo()} disabled={busy} className={`${textLink} min-h-[40px]`} data-testid="auth-issue-action">
            {issue === 'exists' ? t.loginInstead : t.createIt}
          </button>
        </div>
      )}
    </>
  );

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div key="auth-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
          onClick={onClose}
          className="fixed inset-0 z-[120] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4">
          <motion.div
            key="auth-card" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} data-testid="auth-sheet" data-flow={flow} data-step={step}
            {...motionProps} transition={{ duration: 0.22, ease: [0.2, 0.7, 0.2, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[92dvh] w-full overflow-y-auto overscroll-contain rounded-t-[28px] border border-app-border/10 bg-app-surface px-6 pb-6 pt-4 shadow-[0_24px_64px_-24px_rgba(0,0,0,0.7)] [scrollbar-width:none] sm:max-w-[420px] sm:rounded-[28px] sm:px-8 sm:pb-8 sm:pt-5 [&::-webkit-scrollbar]:hidden"
            style={{ paddingBottom: 'max(1.5rem, calc(env(safe-area-inset-bottom, 0px) + 1rem))' }}
          >
            <div className="-mx-2 mb-2 flex h-11 items-center justify-between">
              {canGoBack ? (
                <button type="button" onClick={toStart} aria-label={t.back}
                  className="flex h-11 w-11 items-center justify-center rounded-full text-app-muted transition-colors hover:bg-app-elevated hover:text-app-text">
                  <ArrowLeft size={20} aria-hidden="true" />
                </button>
              ) : <span aria-hidden="true" />}
              <button type="button" onClick={onClose} aria-label={t.close}
                className="flex h-11 w-11 items-center justify-center rounded-full text-app-muted transition-colors hover:bg-app-elevated hover:text-app-text">
                <X size={20} aria-hidden="true" />
              </button>
            </div>

            <h2 id={titleId} className="text-[26px] font-bold leading-[1.15] tracking-[-0.01em] text-app-text">{title}</h2>

            {/* ── 1 · the way in ── */}
            {step === 'start' && (
              <div className="mt-2">
                {flow === 'signup' && <p className="text-[14px] leading-relaxed text-app-muted">{t.subSignup}</p>}
                <div className="mt-6 space-y-3">
                  {googleEnabled && (
                    <button type="button" onClick={() => void handleGoogle()} disabled={busy} data-testid="auth-google"
                      className="flex h-12 w-full items-center justify-center gap-3 rounded-full bg-white text-[15px] font-semibold text-[#1f1f1f] transition-colors hover:bg-[#f2f2f2] disabled:opacity-50">
                      <GoogleIcon /> {t.google}
                    </button>
                  )}
                  {phoneEnabled && (
                    <button type="button" onClick={() => { clearMessages(); setIdentifier(''); setUsePhone((v) => !v); }} className={outline} data-testid="auth-phone-toggle">
                      {usePhone ? <Mail size={18} aria-hidden="true" /> : <Phone size={18} aria-hidden="true" />} {usePhone ? t.emailInstead : t.phone}
                    </button>
                  )}
                </div>
                {(googleEnabled || phoneEnabled) && (
                  <div className="my-5 flex items-center gap-3 text-[13px] text-app-muted" aria-hidden="true">
                    <span className="h-px flex-1 bg-app-border/15" />{t.or}<span className="h-px flex-1 bg-app-border/15" />
                  </div>
                )}
                <form onSubmit={(e) => { e.preventDefault(); void submitIdentifier(); }} className={`space-y-3 ${googleEnabled || phoneEnabled ? '' : 'mt-6'}`} noValidate>
                  <div>
                    <label htmlFor={`${titleId}-id`} className={label}>{usePhone ? t.phoneNumber : t.email}</label>
                    <input id={`${titleId}-id`} value={identifier} onChange={(e) => { setIdentifier(e.target.value); if (issue) setIssue(null); }}
                      type={usePhone ? 'tel' : 'email'} inputMode={usePhone ? 'tel' : 'email'} autoComplete={usePhone ? 'tel' : 'email'}
                      autoCapitalize="none" autoCorrect="off" spellCheck={false} autoFocus data-autofocus required data-testid="auth-identifier"
                      placeholder={usePhone ? t.phoneHint : undefined} className={field} />
                  </div>
                  {messages}
                  <button type="submit" disabled={busy || !identifier.trim()} className={primary} data-testid="auth-continue">{spinner}{t.cont}</button>
                </form>
                <p className="mt-5 text-center text-[14px] text-app-muted">
                  {flow === 'login' ? t.noAccountQ : t.haveAccountQ}{' '}
                  <button type="button" onClick={() => switchFlow(flow === 'login' ? 'signup' : 'login')} className={textLink} data-testid="auth-switch">
                    {flow === 'login' ? t.signupLink : t.loginLink}
                  </button>
                </p>
                <p className="mt-2 text-center text-[12px] leading-relaxed text-app-muted">
                  {t.termsLead}{' '}
                  <a href={legalHref(locale, 'terms')} target="_blank" rel="noopener noreferrer" className="text-app-text underline-offset-2 hover:underline">{t.terms}</a>{' '}
                  {t.and}{' '}
                  <a href={legalHref(locale, 'privacy')} target="_blank" rel="noopener noreferrer" className="text-app-text underline-offset-2 hover:underline">{t.privacy}</a>{t.termsTail}
                </p>
              </div>
            )}

            {/* ── 2a · the password ── */}
            {step === 'password' && (
              <form onSubmit={(e) => { e.preventDefault(); void submitPassword(); }} className="mt-6 space-y-3">
                {addressChip}
                {passwordInput(`${titleId}:password`, password, setPassword, { autoComplete: 'current-password', label: t.password, autoFocus: true })}
                {messages}
                <button type="submit" disabled={busy || !password} className={primary} data-testid="auth-login">{spinner}{t.loginCta}</button>
                <div className="flex flex-wrap items-center justify-between gap-x-4">
                  <button type="button" onClick={() => void codeInstead('recovery')} disabled={busy} className={textLink} data-testid="auth-forgot">{t.forgot}</button>
                  <button type="button" onClick={() => void codeInstead('signin')} disabled={busy} className={textLink} data-testid="auth-use-code">{t.useCode}</button>
                </div>
              </form>
            )}

            {/* ── 2b · the code ── */}
            {step === 'code' && (
              <form onSubmit={(e) => { e.preventDefault(); void verifyCode(); }} className="mt-2 space-y-3">
                <p className="text-[14px] leading-relaxed text-app-muted">
                  {t.codeSent(codeLength)}
                  <span className="block font-medium text-app-text [overflow-wrap:anywhere]" data-testid="auth-address">{shownAddress}</span>
                </p>
                <label htmlFor={`${titleId}-code`} className="sr-only">{t.codeLabel(codeLength)}</label>
                <input id={`${titleId}-code`} ref={codeRef} value={code}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, '').slice(0, codeLength);
                    setCode(v);
                    // A complete code (typed, pasted, or filled from the SMS / mail by the OS) verifies at once.
                    if (v.length === codeLength && !busy) void verifyCode(v);
                  }}
                  inputMode="numeric" autoComplete="one-time-code" autoFocus data-autofocus maxLength={codeLength} placeholder={'•'.repeat(codeLength)} data-testid="auth-code"
                  className={`${field} mt-2 h-14 text-center text-[26px] font-semibold tracking-[0.5em] placeholder:tracking-[0.5em]`} />
                {messages}
                <button type="submit" disabled={busy || code.length !== codeLength} className={primary} data-testid="auth-verify">{spinner}{t.verify}</button>
                <div className="flex flex-wrap items-center justify-between gap-x-4">
                  <button type="button" onClick={() => void resend()} disabled={busy || resendLeft > 0}
                    className={`${textLink} disabled:text-app-muted disabled:opacity-100`} data-testid="auth-resend">
                    {resendLeft > 0 ? t.resendIn(resendLeft) : t.resend}
                  </button>
                  <button type="button" onClick={toStart} className={textLink}>{t.change}</button>
                </div>
                {who?.kind === 'email' && <p className="px-1 text-[12.5px] text-app-muted">{t.spam}</p>}
              </form>
            )}

            {/* ── 3a · name + password (sign-up) ── */}
            {step === 'profile' && (
              <form onSubmit={(e) => { e.preventDefault(); void saveProfile(false); }} className="mt-2 space-y-3">
                <p className="text-[14px] leading-relaxed text-app-muted">{t.profileSub}</p>
                <div>
                  <label htmlFor={`${titleId}-name`} className={label}>{t.name}</label>
                  <input id={`${titleId}-name`} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={60} autoFocus data-autofocus className={field} data-testid="auth-name" />
                </div>
                {who && <input type="text" name="username" autoComplete="username" value={who.kind === 'email' ? who.email : who.phone} readOnly tabIndex={-1} aria-hidden="true" className="sr-only" />}
                {passwordInput(`${titleId}:new-password`, password, setPassword, { autoComplete: 'new-password', label: t.newPassword, hint: t.pwHint })}
                {messages}
                <button type="submit" disabled={busy || password.length < MIN_PASSWORD} className={primary} data-testid="auth-finish">{spinner}{t.finish}</button>
                <button type="button" onClick={() => void saveProfile(true)} disabled={busy} className={`${textLink} w-full justify-center text-app-muted`} data-testid="auth-later">{t.later}</button>
              </form>
            )}

            {/* ── 3b · the new password (forgot) ── */}
            {step === 'newPassword' && (
              <form onSubmit={(e) => { e.preventDefault(); void saveNewPassword(); }} className="mt-2 space-y-3">
                <p className="text-[14px] leading-relaxed text-app-muted">{t.newPwSub}</p>
                {who && <input type="text" name="username" autoComplete="username" value={who.kind === 'email' ? who.email : who.phone} readOnly tabIndex={-1} aria-hidden="true" className="sr-only" />}
                {passwordInput(`${titleId}:new-password`, password, setPassword, { autoComplete: 'new-password', label: t.newPassword, autoFocus: true, hint: t.pwHint })}
                {passwordInput(`${titleId}:repeat`, password2, setPassword2, { autoComplete: 'new-password', label: t.repeat })}
                {messages}
                <button type="submit" disabled={busy || !password || !password2} className={primary} data-testid="auth-save-password">{spinner}{t.savePw}</button>
              </form>
            )}

            <p className="mt-6 text-center text-[12px] text-app-muted">
              <a href={buildSupportMailto({ subject: 'MyAvatar — help' })} className="transition-colors hover:text-app-text">{SUPPORT_EMAIL}</a>
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

