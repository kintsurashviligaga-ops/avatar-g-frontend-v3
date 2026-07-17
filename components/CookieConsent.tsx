'use client';

/**
 * CookieConsent — GDPR / Georgian DPA cookie consent banner.
 *
 * Stores decision in localStorage under `myavatar-cookie-consent`.
 * Once a user picks "Accept all" or "Necessary only", the banner never
 * shows again unless they manually clear the value.
 *
 * "Necessary only" disables analytics SDKs (PostHog, Vercel) via the
 * `window.__myavatarAnalyticsAllowed` flag — code that initialises
 * those SDKs checks this flag and no-ops if false.
 *
 * The "Privacy" trigger opens an IN-APP scrollable modal (no navigation away) so the
 * consent decision never yanks the user off the page.
 */

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';

type Lang = 'ka' | 'en' | 'ru';
type Choice = 'all' | 'necessary';

const KEY = 'myavatar-cookie-consent';

const COPY: Record<Lang, {
  title: string;
  body: string;
  privacyLink: string;
  acceptAll: string;
  necessaryOnly: string;
  privacyTitle: string;
  privacyClose: string;
  sections: { h: string; p: string }[];
}> = {
  ka: {
    title:         'ქუქის გამოყენება',
    body:          'ვიყენებთ აუცილებელ ქუქი-ფაილებს სესიის, ენისა და უსაფრთხოებისთვის. ანალიტიკის ქუქი მხოლოდ შენი თანხმობით.',
    privacyLink:   'კონფიდენციალურობა',
    acceptAll:     'ყველაფერი',
    necessaryOnly: 'მხოლოდ აუცილებელი',
    privacyTitle:  'კონფიდენციალურობის პოლიტიკა',
    privacyClose:  'დახურვა',
    sections: [
      { h: 'მონაცემთა გამკონტროლებელი', p: 'MyAvatar ოპერირდება საქართველოში. კონფიდენციალურობის ნებისმიერ საკითხზე: support@myavatar.ge' },
      { h: 'რას ვაგროვებთ', p: 'მხოლოდ საჭიროს: ელფოსტა (ავთენტიფიკაცია), პრომპტები და გენერირებული მედია (სერვისის მუშაობა), გადახდის ისტორია (კანონი), მოწყობილობის ID/IP/ლოგები (უსაფრთხოება). არჩევითი — სახელი, ტელეფონი, ფოტო/ხმის ნიმუში ავატარისთვის — მხოლოდ მკაფიო თანხმობით.' },
      { h: 'ვისთან ვიზიარებთ', p: 'მონაცემებს არ ვყიდით. ვიზიარებთ მხოლოდ ფუნქციონირებისთვის საჭირო სერვისებთან (Supabase, Stripe, Anthropic, Google, Replicate, ElevenLabs, Vercel) — თითოეულს მხოლოდ საჭირო მინიმუმი.' },
      { h: 'რამდენ ხანს ვინახავთ', p: 'ანგარიშის მონაცემები — გაუქმებამდე. გადახდები — 5 წელი (კანონი). გენერირებული მედია — სანამ თვითონ არ წაშლი.' },
      { h: 'თქვენი უფლებები', p: 'წვდომა, შესწორება, წაშლა („დავიწყების უფლება“), გადატანა, დამუშავების შეჩერება, თანხმობის გაუქმება, საჩივარი პერსონალურ მონაცემთა დაცვის სამსახურში.' },
      { h: 'უსაფრთხოება', p: 'მონაცემები გადაიცემა TLS დაშიფვრით. პაროლები არასოდეს ინახება ღია სახით. მოქმედებს Sentry-მონიტორინგი და სიჩქარის შეზღუდვა.' },
      { h: 'კონტაქტი', p: 'ნებისმიერ კითხვაზე: support@myavatar.ge' },
    ],
  },
  en: {
    title:         'Cookies',
    body:          'We use essential cookies for session, language, and security. Analytics cookies only with your consent.',
    privacyLink:   'Privacy',
    acceptAll:     'Accept all',
    necessaryOnly: 'Necessary only',
    privacyTitle:  'Privacy Policy',
    privacyClose:  'Close',
    sections: [
      { h: 'Data controller', p: 'MyAvatar operates from Georgia. For any privacy question: support@myavatar.ge' },
      { h: 'What we collect', p: 'Only what is needed: email (authentication), prompts and generated media (running the service), purchase history (law), device ID / IP / logs (security). Optional — name, phone, photo/voice sample for an avatar — only with explicit consent.' },
      { h: 'Who we share with', p: 'We never sell data. We share only with services strictly required to function (Supabase, Stripe, Anthropic, Google, Replicate, ElevenLabs, Vercel) — each gets only the minimum needed.' },
      { h: 'How long we keep it', p: 'Account data — until deletion. Payments — 5 years (legal). Generated media — until you delete it.' },
      { h: 'Your rights', p: 'Access, correction, erasure ("right to be forgotten"), portability, restriction, consent withdrawal, and a complaint with the Georgian Personal Data Protection Service.' },
      { h: 'Security', p: 'Data is transmitted over TLS. Passwords are never stored in plain text. Sentry error monitoring and rate limiting are in place.' },
      { h: 'Contact', p: 'Any question: support@myavatar.ge' },
    ],
  },
  ru: {
    title:         'Cookies',
    body:          'Мы используем технически необходимые cookies для сессии, языка и безопасности. Аналитические — только с вашего согласия.',
    privacyLink:   'Конфиденциальность',
    acceptAll:     'Принять все',
    necessaryOnly: 'Только необходимые',
    privacyTitle:  'Политика конфиденциальности',
    privacyClose:  'Закрыть',
    sections: [
      { h: 'Контролёр данных', p: 'MyAvatar работает из Грузии. По вопросам конфиденциальности: support@myavatar.ge' },
      { h: 'Какие данные мы собираем', p: 'Только необходимое: email (аутентификация), запросы и сгенерированный медиа (работа сервиса), история платежей (закон), ID устройства / IP / логи (безопасность). Опционально — имя, телефон, фото/голос для аватара — только с явного согласия.' },
      { h: 'С кем делимся', p: 'Мы никогда не продаём данные. Делимся только с сервисами, необходимыми для работы (Supabase, Stripe, Anthropic, Google, Replicate, ElevenLabs, Vercel) — каждому лишь необходимый минимум.' },
      { h: 'Сроки хранения', p: 'Данные аккаунта — до удаления. Платежи — 5 лет (закон). Сгенерированный медиа — пока вы не удалите.' },
      { h: 'Ваши права', p: 'Доступ, исправление, удаление («право быть забытым»), перенос, ограничение обработки, отзыв согласия, жалоба в Службу защиты персональных данных Грузии.' },
      { h: 'Безопасность', p: 'Данные передаются по TLS. Пароли никогда не хранятся открыто. Работают мониторинг Sentry и rate-limiting.' },
      { h: 'Контакты', p: 'Любой вопрос: support@myavatar.ge' },
    ],
  },
};

declare global {
  interface Window {
    __myavatarAnalyticsAllowed?: boolean;
  }
}

function applyChoice(choice: Choice) {
  if (typeof window === 'undefined') return;
  window.__myavatarAnalyticsAllowed = choice === 'all';
  try { localStorage.setItem(KEY, choice); } catch { /* ignore */ }
}

export default function CookieConsent() {
  const params = useParams();
  const locale = (typeof params?.locale === 'string' ? params.locale : 'ka') as Lang;
  const t = COPY[locale === 'ka' || locale === 'en' || locale === 'ru' ? locale : 'ka'];

  const [show, setShow] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);

  // Publish the banner's height as a CSS var so the chat composer (a fixed
  // bottom surface) can lift itself clear of it — otherwise the banner overlaps
  // the input's bottom controls on first visit. Collapses to 0 once dismissed.
  useEffect(() => {
    const root = document.documentElement;
    if (!show) { root.style.setProperty('--cookie-bar-h', '0px'); return; }
    const apply = () => {
      const h = barRef.current?.offsetHeight ?? 0;
      root.style.setProperty('--cookie-bar-h', h ? `${h + 20}px` : '0px');
    };
    apply();
    const id = window.setTimeout(apply, 150); // after layout settles
    window.addEventListener('resize', apply);
    return () => { window.clearTimeout(id); window.removeEventListener('resize', apply); root.style.setProperty('--cookie-bar-h', '0px'); };
  }, [show]);

  useEffect(() => {
    try {
      const v = localStorage.getItem(KEY);
      if (v === 'all' || v === 'necessary') {
        window.__myavatarAnalyticsAllowed = v === 'all';
      } else {
        setShow(true);
      }
    } catch {
      setShow(true);
    }
  }, []);

  // Close the privacy modal on Escape.
  useEffect(() => {
    if (!privacyOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPrivacyOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [privacyOpen]);

  if (!show) return null;

  const pick = (c: Choice) => {
    applyChoice(c);
    setShow(false);
  };

  return (
    <>
      <div
        ref={barRef}
        role="dialog"
        aria-live="polite"
        aria-label={t.title}
        className="fixed left-3 right-3 z-[60] bottom-3 sm:left-auto sm:right-4 sm:bottom-4 sm:max-w-[420px] rounded-2xl border border-app-border/15 bg-app-surface backdrop-blur-md p-4 text-app-text shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8)]"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}
      >
        <div className="text-[14px] font-semibold mb-1">{t.title}</div>
        <p className="text-[12px] text-app-muted leading-relaxed">
          {t.body}{' '}
          {/* IN-APP privacy — a button (not a link) that opens a modal, so it never navigates away. */}
          <button
            type="button"
            onClick={() => setPrivacyOpen(true)}
            className="text-violet-500 dark:text-violet-300 hover:text-violet-400 dark:hover:text-violet-200 underline-offset-4 hover:underline transition"
          >
            {t.privacyLink}
          </button>
        </p>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => pick('all')}
            data-testid="cookie-accept"
            className="flex-1 inline-flex items-center justify-center h-9 rounded-full bg-app-text text-app-bg text-[12px] font-semibold hover:opacity-90 transition"
          >
            {t.acceptAll}
          </button>
          <button
            type="button"
            onClick={() => pick('necessary')}
            data-testid="cookie-necessary"
            className="flex-1 inline-flex items-center justify-center h-9 rounded-full bg-app-elevated border border-app-border/15 text-app-text text-[12px] font-medium hover:border-app-border/30 transition"
          >
            {t.necessaryOnly}
          </button>
        </div>
      </div>

      {/* In-app scrollable privacy modal — no navigation, dismiss via backdrop / X / Esc. */}
      {privacyOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t.privacyTitle}
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-6"
          onClick={() => setPrivacyOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[85dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-app-border/15 bg-app-surface text-app-text shadow-2xl sm:max-w-[540px] sm:rounded-2xl"
          >
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-app-border/10 px-5 py-3.5">
              <h2 className="text-[15px] font-bold">{t.privacyTitle}</h2>
              <button
                type="button"
                onClick={() => setPrivacyOpen(false)}
                aria-label={t.privacyClose}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-app-muted transition hover:bg-app-elevated hover:text-app-text"
              >
                ✕
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
              {t.sections.map((s) => (
                <section key={s.h} className="space-y-1">
                  <h3 className="text-[13px] font-semibold text-app-text">{s.h}</h3>
                  <p className="text-[12.5px] leading-relaxed text-app-muted">{s.p}</p>
                </section>
              ))}
            </div>
            <div className="shrink-0 border-t border-app-border/10 p-4" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}>
              <button
                type="button"
                onClick={() => setPrivacyOpen(false)}
                className="w-full inline-flex items-center justify-center h-10 rounded-full bg-app-text text-app-bg text-[13px] font-semibold hover:opacity-90 transition"
              >
                {t.privacyClose}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
