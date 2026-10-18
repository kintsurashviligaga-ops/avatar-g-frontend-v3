'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Camera, Check, Download, KeyRound, Loader2, LogOut, MonitorSmartphone, ScanFace, Trash2, Wallet, X,
} from 'lucide-react';

import { useDialogA11y } from '@/hooks/useDialogA11y';
import { historyLabel, type CreditHistoryItem } from '@/lib/billing/creditHistory';
import { formatCreditBalance } from '@/lib/billing/gel';
import { createBrowserClient } from '@/lib/supabase/browser';

/**
 * The chat's profile sheet: Settings → „პროფილი“.
 *
 * The owner's PRD (2026-10-18, 2.3): „პარამეტრებიდან პროფილზე დაჭერისას იხსნება მხოლოდ ფოტოსა და სახელის შეცვლის
 * ფანჯარა … უნდა მოიცავდეს პროფილის მართვის სრულფასოვან დეტალებს“. It used to be a photo and a name field. Now it is
 * the whole account, in the chat's own window (nothing here sends anyone to another page):
 *
 *   photo · name        the photo upload (ChatChrome owns it: the header shows the same photo) and the name, saved here
 *   details             the email and whether it is confirmed, the phone, how they sign in, since when
 *   language            ქართული · English · Русский (the chat stays open across the switch: ChatChrome's onLanguage)
 *   balance             the credits, „შევსება“ (the credits sheet) and the last five movements
 *   security            change or set the password (8+, typed twice; every other device is signed out after it),
 *                       and sign out of every other device
 *   (and the row that creates the user's own live avatar, under the details)
 *   your data           download everything the account holds (JSON, /api/account/export), delete the account
 *                       (/account/delete keeps its own confirmation)
 *   sign out
 *
 * Signed-in only: ChatChrome opens it from the signed-in menu. The account's details are read when it opens.
 */

type Lang = 'ka' | 'en' | 'ru';
const LANGS: { code: Lang; native: string }[] = [
  { code: 'ka', native: 'ქართული' },
  { code: 'en', native: 'English' },
  { code: 'ru', native: 'Русский' },
];

/** New passwords: 8 or more, as the sign-up sheet (NIST SP 800-63B's floor). */
export const PROFILE_MIN_PASSWORD = 8;
/** How many ledger movements the sheet shows. */
export const PROFILE_HISTORY_LIMIT = 5;

export const PROFILE_STRINGS = {
  ka: {
    title: 'პროფილი', close: 'დახურვა', changePhoto: 'ფოტოს შეცვლა', uploading: 'იტვირთება…',
    personal: 'პირადი მონაცემები', name: 'სახელი', save: 'შენახვა', saved: 'შენახულია', saveFailed: 'ვერ შეინახა. სცადეთ თავიდან.',
    email: 'ელფოსტა', verified: 'დადასტურებულია', notVerified: 'დაუდასტურებელი', phone: 'ტელეფონი',
    methods: 'შესვლის გზა', google: 'Google', byEmail: 'ელფოსტა', byPhone: 'ტელეფონი', since: 'ანგარიში შექმნილია',
    language: 'ენა',
    balance: 'ბალანსი', topUp: 'შევსება', recent: 'ბოლო მოძრაობები', recentEmpty: 'მოძრაობები ჯერ არ არის.', loading: 'იტვირთება…',
    security: 'უსაფრთხოება', changePassword: 'პაროლის შეცვლა', setPassword: 'პაროლის დაყენება',
    newPassword: 'ახალი პაროლი', repeatPassword: 'გაიმეორეთ პაროლი', passwordHint: 'მინიმუმ 8 სიმბოლო.', cancel: 'გაუქმება',
    errWeak: 'პაროლი მინიმუმ 8 სიმბოლო უნდა იყოს.', errMismatch: 'პაროლები არ ემთხვევა.',
    errSame: 'ახალი პაროლი ძველს არ უნდა ემთხვეოდეს.', errReauth: 'უსაფრთხოებისთვის ჯერ თავიდან შედით, მერე შეცვალეთ პაროლი.',
    errGeneric: 'ვერ შეიცვალა. სცადეთ თავიდან.', passwordSaved: 'პაროლი შეიცვალა. სხვა მოწყობილობებზე სესია დასრულდა.',
    signOutOthers: 'სხვა მოწყობილობებიდან გასვლა', signedOutOthers: 'სხვა მოწყობილობებზე სესია დასრულდა.', failed: 'ვერ მოხერხდა. სცადეთ თავიდან.',
    data: 'ჩემი მონაცემები', download: 'მონაცემების ჩამოტვირთვა (JSON)', downloading: 'მზადდება…',
    downloadFailed: 'ჩამოტვირთვა ვერ მოხერხდა. სცადეთ თავიდან.', deleteAccount: 'ანგარიშის წაშლა', signOut: 'გასვლა',
  },
  en: {
    title: 'Profile', close: 'Close', changePhoto: 'Change photo', uploading: 'Uploading…',
    personal: 'Personal details', name: 'Name', save: 'Save', saved: 'Saved', saveFailed: "Couldn't save. Try again.",
    email: 'Email', verified: 'Verified', notVerified: 'Not verified', phone: 'Phone',
    methods: 'Sign-in method', google: 'Google', byEmail: 'Email', byPhone: 'Phone', since: 'Member since',
    language: 'Language',
    balance: 'Balance', topUp: 'Top up', recent: 'Recent activity', recentEmpty: 'No activity yet.', loading: 'Loading…',
    security: 'Security', changePassword: 'Change password', setPassword: 'Set a password',
    newPassword: 'New password', repeatPassword: 'Repeat the password', passwordHint: 'At least 8 characters.', cancel: 'Cancel',
    errWeak: 'Use at least 8 characters.', errMismatch: "The passwords don't match.",
    errSame: 'Choose a password different from the current one.', errReauth: 'For your security, sign in again, then change the password.',
    errGeneric: "Couldn't change it. Try again.", passwordSaved: 'Password changed. Other devices were signed out.',
    signOutOthers: 'Sign out of other devices', signedOutOthers: 'Other devices were signed out.', failed: "That didn't work. Try again.",
    data: 'Your data', download: 'Download my data (JSON)', downloading: 'Preparing…',
    downloadFailed: "Couldn't download. Try again.", deleteAccount: 'Delete account', signOut: 'Sign out',
  },
  ru: {
    title: 'Профиль', close: 'Закрыть', changePhoto: 'Сменить фото', uploading: 'Загрузка…',
    personal: 'Личные данные', name: 'Имя', save: 'Сохранить', saved: 'Сохранено', saveFailed: 'Не удалось сохранить. Попробуйте снова.',
    email: 'Эл. почта', verified: 'Подтверждена', notVerified: 'Не подтверждена', phone: 'Телефон',
    methods: 'Способ входа', google: 'Google', byEmail: 'Эл. почта', byPhone: 'Телефон', since: 'Аккаунт создан',
    language: 'Язык',
    balance: 'Баланс', topUp: 'Пополнить', recent: 'Последние операции', recentEmpty: 'Операций пока нет.', loading: 'Загрузка…',
    security: 'Безопасность', changePassword: 'Сменить пароль', setPassword: 'Задать пароль',
    newPassword: 'Новый пароль', repeatPassword: 'Повторите пароль', passwordHint: 'Не меньше 8 символов.', cancel: 'Отмена',
    errWeak: 'Пароль — не меньше 8 символов.', errMismatch: 'Пароли не совпадают.',
    errSame: 'Новый пароль должен отличаться от текущего.', errReauth: 'В целях безопасности войдите заново, затем смените пароль.',
    errGeneric: 'Не удалось сменить. Попробуйте снова.', passwordSaved: 'Пароль изменён. На других устройствах выполнен выход.',
    signOutOthers: 'Выйти на других устройствах', signedOutOthers: 'На других устройствах выполнен выход.', failed: 'Не получилось. Попробуйте снова.',
    data: 'Ваши данные', download: 'Скачать мои данные (JSON)', downloading: 'Готовим…',
    downloadFailed: 'Не удалось скачать. Попробуйте снова.', deleteAccount: 'Удалить аккаунт', signOut: 'Выйти',
  },
} as const;
type Copy = (typeof PROFILE_STRINGS)[Lang];

/** What the sheet reads about the account when it opens (Supabase's own user record). */
export interface AccountDetails {
  emailConfirmed: boolean;
  phone: string | null;
  /** google · email · phone, in the order the account gained them. */
  methods: string[];
  createdAt: string | null;
  /** False for an account that signed up with Google or a code and never set one: the button says „set“, not „change“. */
  hasPassword: boolean;
}

type AuthUser = {
  email?: string | null; phone?: string | null; created_at?: string | null; email_confirmed_at?: string | null;
  identities?: { provider?: string }[] | null; app_metadata?: { providers?: string[]; provider?: string } | null;
  user_metadata?: { password_set?: boolean } | null;
};

export function accountDetailsOf(user: AuthUser | null | undefined): AccountDetails {
  const fromIdentities = (user?.identities ?? []).map((i) => i?.provider).filter((p): p is string => !!p);
  const fromMeta = user?.app_metadata?.providers ?? (user?.app_metadata?.provider ? [user.app_metadata.provider] : []);
  const methods = Array.from(new Set([...fromIdentities, ...fromMeta])).filter((m) => m === 'google' || m === 'email' || m === 'phone');
  // password_set is written by the sign-up and reset steps (AuthModal). An older email account never wrote it and has
  // one: only an explicit false means none.
  const hasPassword = user?.user_metadata?.password_set === false ? false : methods.includes('email');
  return {
    emailConfirmed: !!user?.email_confirmed_at,
    phone: user?.phone ? String(user.phone) : null,
    methods,
    createdAt: user?.created_at ?? null,
    hasPassword,
  };
}

/** Supabase's answer to a password change, in the person's words. */
export function passwordErrorOf(err: unknown, t: Copy): string {
  const e = (err ?? {}) as { code?: string; message?: string };
  const text = `${e.code ?? ''} ${e.message ?? ''}`.toLowerCase();
  if (/same_password|different from the old/.test(text)) return t.errSame;
  if (/reauthenticat|session_not_found|not authenticated|jwt/.test(text)) return t.errReauth;
  if (/weak_password|at least|too short/.test(text)) return t.errWeak;
  return t.errGeneric;
}

const KA_MONTHS = ['იანვარი', 'თებერვალი', 'მარტი', 'აპრილი', 'მაისი', 'ივნისი', 'ივლისი', 'აგვისტო', 'სექტემბერი', 'ოქტომბერი', 'ნოემბერი', 'დეკემბერი'];

/**
 * „1 ოქტომბერი 2026“ / „17 ოქტ“. Georgian is written out here: a browser without Georgian locale data (measured: the
 * test Chromium) silently falls back to "October 1, 2026" for ka-GE.
 */
export function dateOf(iso: string | null, lang: Lang, withYear = true): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  if (lang === 'ka') {
    const month = KA_MONTHS[d.getMonth()]!;
    return withYear ? `${d.getDate()} ${month} ${d.getFullYear()}` : `${d.getDate()} ${month.slice(0, 3)}`;
  }
  return d.toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US',
    withYear ? { day: 'numeric', month: 'long', year: 'numeric' } : { day: 'numeric', month: 'short' });
}

export interface ProfileSheetProps {
  open: boolean;
  locale: string;
  onClose: () => void;
  name: string | null;
  email: string | null;
  /** The photo, its upload and its load failure are ChatChrome's: the header shows the same one. */
  avatarUrl: string | null;
  avatarBroken: boolean;
  onAvatarBroken: () => void;
  avatarBusy: boolean;
  onPickPhoto: (file: File) => void;
  /** The name as saved (null = cleared), for the header and the menu. */
  onNameSaved: (name: string | null) => void;
  /** The wallet, in credits (ChatChrome's balance). */
  balance: number | null;
  onTopUp: () => void;
  liveAvatarLabel: string;
  onLiveAvatar: () => void;
  onLanguage: (code: Lang) => void;
  onSignOut: () => void;
}

export function ProfileSheet(props: ProfileSheetProps) {
  const { open, locale, onClose } = props;
  const lang: Lang = locale === 'en' || locale === 'ru' ? locale : 'ka';
  const t = PROFILE_STRINGS[lang];
  const dialogRef = useDialogA11y<HTMLElement>(open, onClose);

  const [details, setDetails] = useState<AccountDetails | null>(null);
  const [nameDraft, setNameDraft] = useState(props.name ?? '');
  const [nameState, setNameState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const [history, setHistory] = useState<CreditHistoryItem[] | null>(null);

  // Read the account each time the sheet opens: a password set elsewhere, a confirmed email, a new sign-in method.
  useEffect(() => {
    if (!open) return;
    setNameDraft(props.name ?? '');
    setNameState('idle');
    let alive = true;
    createBrowserClient().auth.getUser()
      .then(({ data }) => { if (alive) setDetails(accountDetailsOf(data.user as AuthUser | null)); })
      .catch(() => { if (alive) setDetails(accountDetailsOf(null)); });
    setHistory(null);
    fetch(`/api/credits/history?limit=${PROFILE_HISTORY_LIMIT}`, { credentials: 'include', cache: 'no-store' })
      .then((r) => r.json().catch(() => ({})))
      .then((j: { items?: CreditHistoryItem[] }) => { if (alive) setHistory(Array.isArray(j.items) ? j.items.slice(0, PROFILE_HISTORY_LIMIT) : []); })
      .catch(() => { if (alive) setHistory([]); });
    return () => { alive = false; };
    // The name seeds the field once per opening; a save while open must not reset what is being typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const saveName = useCallback(async () => {
    const next = nameDraft.trim().slice(0, 60);
    setNameState('saving');
    try {
      const { error } = await createBrowserClient().auth.updateUser({ data: { name: next } });
      if (error) throw error;
      props.onNameSaved(next || null);
      setNameState('saved');
    } catch {
      setNameState('failed');
    }
  }, [nameDraft, props]);

  if (!open) return null;
  const nameChanged = nameDraft.trim() !== (props.name ?? '').trim();
  const initial = (props.name?.[0] || props.email?.[0] || 'U').toUpperCase();

  return (
    <div className="fixed inset-0 z-[86] flex items-center justify-center bg-black/60 p-4 max-sm:p-0" onClick={onClose}>
      <aside ref={dialogRef} role="dialog" aria-modal="true" aria-label={t.title} data-testid="profile-sheet" onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-[420px] flex-col overflow-hidden rounded-2xl bg-app-surface shadow-[0_0_60px_rgba(0,0,0,0.45)] max-sm:h-full max-sm:!max-h-full max-sm:max-w-none max-sm:rounded-none"
        style={{ maxHeight: 'min(88vh, 760px)' }}>
        <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between border-b border-app-border/10 bg-app-surface px-5 py-4" style={{ paddingTop: 'calc(1rem + env(safe-area-inset-top, 0px))' }}>
          <span className="text-[16px] font-semibold tracking-tight text-app-text">{t.title}</span>
          <button type="button" onClick={onClose} aria-label={t.close} className="flex h-11 w-11 items-center justify-center rounded-full text-app-muted transition-colors hover:bg-app-elevated hover:text-app-text touch-manipulation"><X className="h-[18px] w-[18px]" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-2 [scrollbar-color:rgb(var(--app-border)/0.3)_transparent] [scrollbar-width:thin]" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}>
          {/* Photo, name, email at the top: who this account is. */}
          <div className="flex flex-col items-center gap-2 px-2 pb-2 pt-3">
            <PhotoButton {...props} initial={initial} t={t} />
            <p className="max-w-full truncate text-[16px] font-semibold text-app-text" data-testid="profile-display-name">{props.name || props.email}</p>
            {props.name && props.email && <p className="max-w-full truncate text-[13px] text-app-muted">{props.email}</p>}
          </div>

          <Section title={t.personal}>
            <label className="block px-2 pt-1">
              <span className="mb-1.5 block text-[12px] text-app-muted">{t.name}</span>
              <div className="flex items-center gap-2">
                <input value={nameDraft} onChange={(e) => { setNameDraft(e.target.value); if (nameState !== 'saving') setNameState('idle'); }}
                  maxLength={60} placeholder={props.email ?? ''} autoComplete="name" data-testid="profile-name-input"
                  className="min-h-[48px] min-w-0 flex-1 rounded-xl border border-app-border/15 bg-app-bg/40 px-3 text-[16px] text-app-text outline-none transition-colors placeholder:text-app-muted focus:border-app-accent/60 focus:ring-2 focus:ring-app-accent/25" />
                <button type="button" onClick={() => void saveName()} disabled={!nameChanged || nameState === 'saving'} data-testid="profile-name-save"
                  className="inline-flex min-h-[48px] shrink-0 items-center gap-1.5 rounded-xl bg-app-accent px-4 text-[14px] font-semibold text-app-bg transition-opacity hover:opacity-90 disabled:opacity-40">
                  {nameState === 'saving' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}{t.save}
                </button>
              </div>
            </label>
            <p role="status" aria-live="polite" className={`min-h-[20px] px-2 pt-1 text-[12px] ${nameState === 'failed' ? 'text-app-danger' : 'text-app-muted'}`} data-testid="profile-name-status">
              {nameState === 'saved' ? t.saved : nameState === 'failed' ? t.saveFailed : ''}
            </p>
            <dl className="px-2 text-[14px]" data-testid="profile-details">
              {props.email && (
                <Row label={t.email}>
                  <span className="min-w-0 truncate text-app-text" data-testid="profile-email">{props.email}</span>
                  {details && (
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${details.emailConfirmed ? 'bg-app-accent/10 text-app-accent' : 'bg-app-border/10 text-app-muted'}`} data-testid="profile-email-state">
                      {details.emailConfirmed ? t.verified : t.notVerified}
                    </span>
                  )}
                </Row>
              )}
              {details?.phone && <Row label={t.phone}><span className="text-app-text">{details.phone}</span></Row>}
              {details && details.methods.length > 0 && (
                <Row label={t.methods}>
                  <span className="text-app-text" data-testid="profile-methods">
                    {details.methods.map((m) => (m === 'google' ? t.google : m === 'phone' ? t.byPhone : t.byEmail)).join(' · ')}
                  </span>
                </Row>
              )}
              {details?.createdAt && <Row label={t.since}><span className="text-app-text" data-testid="profile-since">{dateOf(details.createdAt, lang)}</span></Row>}
            </dl>
            <button type="button" onClick={() => { onClose(); props.onLiveAvatar(); }} className={`${ROW} mt-1`} data-testid="profile-live-avatar">
              <ScanFace className="h-[18px] w-[18px] text-app-accent" aria-hidden /> {props.liveAvatarLabel}
            </button>
          </Section>

          <Section title={t.language}>
            <div className="flex flex-wrap gap-2 px-2 pt-1" role="group" aria-label={t.language}>
              {LANGS.map((l) => (
                <button key={l.code} type="button" onClick={() => { if (l.code !== lang) props.onLanguage(l.code); }} aria-pressed={l.code === lang} data-testid={`profile-lang-${l.code}`}
                  className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-4 text-[14px] font-medium transition-colors ${l.code === lang ? 'bg-app-accent text-app-bg' : 'bg-app-elevated text-app-text ring-1 ring-app-border/15 hover:bg-app-border/10'}`}>
                  {l.code === lang && <Check className="h-3.5 w-3.5" aria-hidden />}{l.native}
                </button>
              ))}
            </div>
          </Section>

          <Section title={t.balance}>
            <div className="flex items-center justify-between gap-3 px-2 pt-1">
              <span className="flex items-center gap-2 text-[15px] font-semibold tabular-nums text-app-text" data-testid="profile-balance">
                <Wallet className="h-[18px] w-[18px] text-app-muted" aria-hidden /> {formatCreditBalance(props.balance, lang)}
              </span>
              <button type="button" onClick={props.onTopUp} data-testid="profile-topup" data-iap-external
                className="inline-flex min-h-[44px] items-center rounded-full bg-app-accent px-4 text-[14px] font-semibold text-app-bg transition-opacity hover:opacity-90">{t.topUp}</button>
            </div>
            <p className="px-2 pb-1 pt-3 text-[12px] text-app-muted">{t.recent}</p>
            <div className="px-2" data-testid="profile-history">
              {history === null ? (
                <p className="flex items-center gap-2 py-2 text-[13px] text-app-muted"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> {t.loading}</p>
              ) : history.length === 0 ? (
                <p className="py-2 text-[13px] text-app-muted">{t.recentEmpty}</p>
              ) : (
                <ul className="divide-y divide-app-border/10">
                  {history.map((it, i) => {
                    const label = historyLabel(it.action);
                    const plus = it.creditsDelta > 0;
                    return (
                      <li key={i} className="flex items-center justify-between gap-3 py-2 text-[13.5px]">
                        <span className="flex min-w-0 items-center gap-2 text-app-text">
                          <span className="shrink-0 tabular-nums text-app-muted">{dateOf(it.createdAt, lang, false)}</span>
                          <span className="truncate">{label.emoji} {label[lang]}</span>
                        </span>
                        <span className={`shrink-0 font-semibold tabular-nums ${plus ? 'text-app-accent' : 'text-app-muted'}`}>{plus ? '+' : '−'}{Math.abs(it.creditsDelta)}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </Section>

          <SecuritySection t={t} hasPassword={details?.hasPassword ?? true} />

          <Section title={t.data}>
            <DownloadRow t={t} />
            <a href={`/${lang}/account/delete`} className={`${ROW} text-app-danger hover:bg-app-danger/10`} data-testid="profile-delete">
              <Trash2 className="h-[18px] w-[18px]" aria-hidden /> {t.deleteAccount}
            </a>
          </Section>

          <div className="border-t border-app-border/10 pt-2">
            <button type="button" onClick={() => { onClose(); props.onSignOut(); }} className={`${ROW} hover:bg-app-danger/10 hover:text-app-danger`} data-testid="profile-signout">
              <LogOut className="h-[18px] w-[18px] text-app-muted" aria-hidden /> {t.signOut}
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}

const ROW = 'flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[14px] text-app-text transition-colors hover:bg-app-elevated disabled:opacity-50';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-app-border/10 pb-2 pt-1 first-of-type:border-t-0">
      <h2 className="px-2 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-app-muted">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-[40px] items-center justify-between gap-3 border-t border-app-border/5 py-1.5 first:border-t-0">
      <dt className="shrink-0 text-app-muted">{label}</dt>
      <dd className="flex min-w-0 items-center justify-end gap-2 text-right">{children}</dd>
    </div>
  );
}

function PhotoButton({ avatarUrl, avatarBroken, onAvatarBroken, avatarBusy, onPickPhoto, initial, t }: ProfileSheetProps & { initial: string; t: Copy }) {
  const [input, setInput] = useState<HTMLInputElement | null>(null);
  return (
    <>
      <button type="button" onClick={() => input?.click()} disabled={avatarBusy} aria-label={t.changePhoto} data-testid="profile-photo"
        className="group relative h-20 w-20 overflow-hidden rounded-full bg-app-accent/15 ring-2 ring-app-border/15 transition hover:ring-app-accent/40">
        {avatarUrl && !avatarBroken ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="" referrerPolicy="no-referrer" onError={onAvatarBroken} className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-[26px] font-bold text-app-accent">{initial}</span>
        )}
        <span className="absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 transition-opacity group-hover:opacity-100">
          {avatarBusy ? <Loader2 className="h-5 w-5 animate-spin text-white" /> : <Camera className="h-5 w-5 text-white" />}
        </span>
      </button>
      <button type="button" onClick={() => input?.click()} disabled={avatarBusy}
        className="min-h-[36px] text-[13px] font-medium text-app-accent transition hover:opacity-80 disabled:opacity-50">
        {avatarBusy ? t.uploading : t.changePhoto}
      </button>
      <input ref={setInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" data-testid="profile-photo-input"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onPickPhoto(f); e.target.value = ''; }} />
    </>
  );
}

function SecuritySection({ t, hasPassword }: { t: Copy; hasPassword: boolean }) {
  const [editing, setEditing] = useState(false);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState<'password' | 'others' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const savePassword = async () => {
    setError(null); setNotice(null);
    if (pw.length < PROFILE_MIN_PASSWORD) { setError(t.errWeak); return; }
    if (pw !== pw2) { setError(t.errMismatch); return; }
    setBusy('password');
    try {
      const s = createBrowserClient();
      const { error: e } = await s.auth.updateUser({ password: pw, data: { password_set: true } });
      if (e) throw e;
      // The old password may be known to someone else (the reason most people change it): every OTHER session ends.
      await s.auth.signOut({ scope: 'others' }).catch(() => undefined);
      setPw(''); setPw2(''); setEditing(false);
      setNotice(t.passwordSaved);
    } catch (err) {
      setError(passwordErrorOf(err, t));
    } finally {
      setBusy(null);
    }
  };

  const signOutOthers = async () => {
    setError(null); setNotice(null);
    setBusy('others');
    try {
      const { error: e } = await createBrowserClient().auth.signOut({ scope: 'others' });
      if (e) throw e;
      setNotice(t.signedOutOthers);
    } catch {
      setError(t.failed);
    } finally {
      setBusy(null);
    }
  };

  const field = 'min-h-[48px] w-full rounded-xl border border-app-border/15 bg-app-bg/40 px-3 text-[16px] text-app-text outline-none transition-colors placeholder:text-app-muted focus:border-app-accent/60 focus:ring-2 focus:ring-app-accent/25';
  return (
    <Section title={t.security}>
      {!editing ? (
        <button type="button" onClick={() => { setEditing(true); setError(null); setNotice(null); }} className={ROW} data-testid="profile-password">
          <KeyRound className="h-[18px] w-[18px] text-app-muted" aria-hidden /> {hasPassword ? t.changePassword : t.setPassword}
        </button>
      ) : (
        <form className="space-y-2 px-2 pt-1" onSubmit={(e) => { e.preventDefault(); void savePassword(); }} data-testid="profile-password-form">
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder={t.newPassword} aria-label={t.newPassword}
            autoComplete="new-password" className={field} data-testid="profile-password-new" />
          <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder={t.repeatPassword} aria-label={t.repeatPassword}
            autoComplete="new-password" className={field} data-testid="profile-password-repeat" />
          <p className="text-[12px] text-app-muted">{t.passwordHint}</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => { setEditing(false); setPw(''); setPw2(''); setError(null); }} disabled={busy === 'password'}
              className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl px-4 text-[14px] font-medium text-app-muted ring-1 ring-app-border/15 transition-colors hover:text-app-text">{t.cancel}</button>
            <button type="submit" disabled={busy === 'password'} data-testid="profile-password-save"
              className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-app-accent px-4 text-[14px] font-semibold text-app-bg transition-opacity hover:opacity-90 disabled:opacity-50">
              {busy === 'password' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}{t.save}
            </button>
          </div>
        </form>
      )}
      <button type="button" onClick={() => void signOutOthers()} disabled={busy === 'others'} className={ROW} data-testid="profile-signout-others">
        {busy === 'others' ? <Loader2 className="h-[18px] w-[18px] animate-spin text-app-muted" aria-hidden /> : <MonitorSmartphone className="h-[18px] w-[18px] text-app-muted" aria-hidden />} {t.signOutOthers}
      </button>
      <p role="status" aria-live="polite" data-testid="profile-security-status"
        className={`min-h-[20px] px-3 text-[12.5px] ${error ? 'text-app-danger' : 'text-app-accent'}`}>{error ?? notice ?? ''}</p>
    </Section>
  );
}

/** The file name the export route names (Content-Disposition), else one with today's date. */
export function exportFileName(disposition: string | null, today = new Date()): string {
  const m = disposition?.match(/filename="?([^";]+)"?/i);
  return m?.[1] || `myavatar-data-${today.toISOString().slice(0, 10)}.json`;
}

function DownloadRow({ t }: { t: Copy }) {
  const [state, setState] = useState<'idle' | 'busy' | 'failed'>('idle');
  const download = async () => {
    setState('busy');
    try {
      const r = await fetch('/api/account/export', { credentials: 'include', cache: 'no-store' });
      if (!r.ok) throw new Error(String(r.status));
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = exportFileName(r.headers.get('Content-Disposition'));
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setState('idle');
    } catch {
      setState('failed');
    }
  };
  return (
    <>
      <button type="button" onClick={() => void download()} disabled={state === 'busy'} className={ROW} data-testid="profile-export">
        {state === 'busy' ? <Loader2 className="h-[18px] w-[18px] animate-spin text-app-muted" aria-hidden /> : <Download className="h-[18px] w-[18px] text-app-muted" aria-hidden />}
        {state === 'busy' ? t.downloading : t.download}
      </button>
      {state === 'failed' && <p role="alert" className="px-3 pb-1 text-[12.5px] text-app-danger">{t.downloadFailed}</p>}
    </>
  );
}

export default ProfileSheet;
