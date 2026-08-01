'use client';

import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';

/**
 * Offer to install the PWA.
 *
 * ⚠️ THIS IS THE ONLY WAY TO REMOVE THE "myavatar.ge" PILL, and it is worth being precise about why.
 * That pill is the browser's address bar — in a tab it sits in the bottom toolbar beside back/forward/
 * reload, and when the keyboard opens the browser collapses it to a chip above the keys. It is painted
 * by the browser OUTSIDE the document, so no CSS, JS or meta tag in the page can move or hide it. A page
 * cannot paint over its own browser's UI, by design.
 *
 * The manifest already declares `display: standalone`, so an INSTALLED copy runs with no browser chrome
 * at all — no address bar, no pill, and the keyboard docks against the app itself. Everything needed was
 * already in place except an invitation, so users stayed in a tab and met the pill every time.
 *
 * ⚠️ THE BUTTON HIDES ITSELF UNLESS IT CAN ACTUALLY DO SOMETHING. It renders only when Chromium has
 * fired `beforeinstallprompt` — i.e. the app is installable and not yet installed. A permanent "install"
 * button that does nothing on an already-installed app, or on a browser that cannot install, is worse
 * than no button: it teaches people the UI lies.
 *
 * iOS Safari never fires that event; installing there is Share → Add to Home Screen, which no API can
 * trigger. Rather than show a button that cannot work, this stays hidden on iOS. Surfacing that
 * instruction is a separate, deliberate piece of copy — not something to fake with a dead control.
 */

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const COPY = {
  ka: { install: 'აპლიკაციის დაყენება', title: 'დააყენე მთავარ ეკრანზე — ბრაუზერის ზოლის გარეშე' },
  en: { install: 'Install app', title: 'Add to your home screen — no browser bar' },
  ru: { install: 'Установить', title: 'На главный экран — без строки браузера' },
} as const;

export function InstallAppButton({ locale = 'ka' }: { locale?: 'ka' | 'en' | 'ru' }) {
  const [deferred, setDeferred] = useState<InstallPromptEvent | null>(null);
  const t = COPY[locale] ?? COPY.ka;

  useEffect(() => {
    // Already running installed → nothing to offer. `standalone` is the iOS-Safari-only property.
    const installed = window.matchMedia?.('(display-mode: standalone)')?.matches
      || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (installed) return;

    const onPrompt = (e: Event) => {
      // Chromium shows its own mini-infobar unless this is prevented; we want our own entry point so the
      // offer appears where the user already is, rather than as a banner they reflexively dismiss.
      e.preventDefault();
      setDeferred(e as InstallPromptEvent);
    };
    // Once installed, retract the offer immediately — the event does not fire again.
    const onInstalled = () => setDeferred(null);

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (!deferred) return null;

  return (
    <button
      type="button"
      title={t.title}
      onClick={async () => {
        try {
          await deferred.prompt();
          await deferred.userChoice;
        } catch { /* user dismissed, or the browser withdrew the prompt — nothing to recover */ }
        // The prompt is single-use whatever the outcome; keeping it would give a button that no-ops.
        setDeferred(null);
      }}
      className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full bg-app-accent/15 px-3 text-[12.5px] font-semibold text-app-accent ring-1 ring-app-accent/30 transition hover:bg-app-accent/25 active:scale-[0.97]"
    >
      <Download size={15} className="shrink-0" />
      <span className="whitespace-nowrap">{t.install}</span>
    </button>
  );
}
