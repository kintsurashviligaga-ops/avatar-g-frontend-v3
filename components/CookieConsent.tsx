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
}> = {
  ka: {
    title:         'ქუქის გამოყენება',
    body:          'ვიყენებთ აუცილებელ ქუქი-ფაილებს სესიის, ენისა და უსაფრთხოებისთვის. ანალიტიკის ქუქი მხოლოდ შენი თანხმობით.',
    privacyLink:   'კონფიდენციალურობა',
    acceptAll:     'ყველაფერი',
    necessaryOnly: 'მხოლოდ აუცილებელი',
  },
  en: {
    title:         'Cookies',
    body:          'We use essential cookies for session, language, and security. Analytics cookies only with your consent.',
    privacyLink:   'Privacy',
    acceptAll:     'Accept all',
    necessaryOnly: 'Necessary only',
  },
  ru: {
    title:         'Cookies',
    body:          'Мы используем технически необходимые cookies для сессии, языка и безопасности. Аналитические — только с вашего согласия.',
    privacyLink:   'Конфиденциальность',
    acceptAll:     'Принять все',
    necessaryOnly: 'Только необходимые',
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

  if (!show) return null;

  const pick = (c: Choice) => {
    applyChoice(c);
    setShow(false);
  };

  return (
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
        {t.body}
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
  );
}
