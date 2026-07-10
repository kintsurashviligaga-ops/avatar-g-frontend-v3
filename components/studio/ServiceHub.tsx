'use client';

/**
 * ServiceHub — the post-auth landing (One Window architecture).
 *
 * Replaces the straight-to-chat landing with a clean, grid-based Service
 * Selection Hub of three product cards, each launching its own tailored studio
 * IN-WINDOW (no route change — the active service lives in a URL hash so refresh /
 * back behaves, but the frame never breaks):
 *
 *   A · Film Studio       → ConversationalFilmStudio (the flagship)
 *   B · Smart Assistant   → OmniStudio (multimodal: voice·text·image)
 *   C · Lip-Sync Studio   → LipsyncStudio (Wav2Lip on Replicate)
 *
 * Each launched studio shows a back control to return to the grid. Strict skin —
 * black · white · electric cyan (#00D2FF).
 */

import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Film, Sparkles, ChevronRight, Loader2 } from 'lucide-react';
import { ChatChrome } from './ChatChrome';
import ErrorBoundary from '@/components/ErrorBoundary';

// PERF: lazy-load each studio so the dashboard's initial JS ships only the shell +
// the studio actually on screen — not all ~8.2k lines of the three studios at once
// (the "opens slowly" report). Omni (~5.6k lines) is the default landing content;
// Film/Lipsync are secondary surfaces reached via the hub. OMNI_CURRENT_ID_KEY is
// INLINED here (matching the literal in ChatChrome) — a static named import would
// drag the whole 5.6k-line OmniStudio back into the initial chunk, defeating the split.
const OMNI_CURRENT_ID_KEY = 'myavatar-omni-current';

// In-shell loader (omni/lipsync render INSIDE ChatChrome, which paints instantly).
const InShellLoading = () => (
  <div className="flex min-h-[60dvh] w-full items-center justify-center">
    <Loader2 className="h-6 w-6 animate-spin text-app-accent" />
  </div>
);
// Full-screen loader (the film studio owns the whole viewport, no surrounding shell).
const FullLoading = () => (
  <div className="fixed inset-0 z-[2] flex items-center justify-center bg-app-bg">
    <Loader2 className="h-6 w-6 animate-spin text-app-accent" />
  </div>
);

const OmniStudio = dynamic(() => import('./OmniStudio'), { ssr: false, loading: InShellLoading });
const LipsyncStudio = dynamic(() => import('./LipsyncStudio'), { ssr: false, loading: InShellLoading });
const ConversationalFilmStudio = dynamic(() => import('./ConversationalFilmStudio'), { ssr: false, loading: FullLoading });
// One Window: the STEP 3 agent + its live process mount IN-PLACE here (inside the same
// ChatChrome shell as the assistant), not on a separate /agent-terminal or /services/agent-g route.
const AgentTerminal = dynamic(() => import('@/components/agent/AgentTerminal'), { ssr: false, loading: InShellLoading });

type Lang = 'ka' | 'en' | 'ru';
type Service = 'hub' | 'film' | 'omni' | 'lipsync' | 'agent';

const COPY: Record<Lang, {
  heading: string; sub: string;
  filmTitle: string; filmSub: string; filmTag: string;
  omniTitle: string; omniSub: string; omniTag: string;
  lipTitle: string; lipSub: string; lipTag: string;
  open: string;
}> = {
  ka: {
    heading: 'აირჩიე სერვისი', sub: 'სამი სტუდია — ერთ სივრცეში',
    filmTitle: 'კინო სტუდია', filmSub: 'ფოტო + სცენარი → 30-წამიანი ფილმი', filmTag: 'მთავარი',
    omniTitle: 'ჭკვიანი ასისტენტი', omniSub: 'ხმა · ტექსტი · სურათი → ჭკვიანი პასუხები', omniTag: 'ასისტენტი',
    lipTitle: 'ლიფსინქ სტუდია', lipSub: 'ვიდეო + აუდიო → ტუჩების სინქრონი', lipTag: 'ლიფსინქი',
    open: 'გახსნა',
  },
  en: {
    heading: 'Choose a service', sub: 'Three studios — one window',
    filmTitle: 'Film Studio', filmSub: 'A photo + a script → a 30-second film', filmTag: 'Main',
    omniTitle: 'Smart Assistant', omniSub: 'Voice · text · image → smart answers', omniTag: 'Assistant',
    lipTitle: 'Lip-Sync Studio', lipSub: 'Video + audio → lip synchronization', lipTag: 'Lip-sync',
    open: 'Open',
  },
  ru: {
    heading: 'Выберите сервис', sub: 'Три студии — одно окно',
    filmTitle: 'Кино-студия', filmSub: 'Фото + сценарий → 30-секундный фильм', filmTag: 'Главное',
    omniTitle: 'Умный ассистент', omniSub: 'Голос · текст · изображение → умные ответы', omniTag: 'Ассистент',
    lipTitle: 'Lip-Sync студия', lipSub: 'Видео + аудио → синхронизация губ', lipTag: 'Синхрон',
    open: 'Открыть',
  },
};

export function ServiceHub({ locale = 'ka', isAuthenticated = false }: { locale?: string; isAuthenticated?: boolean }) {
  const lang: Lang = locale === 'en' ? 'en' : locale === 'ru' ? 'ru' : 'ka';
  const t = COPY[lang];
  // ONE WINDOW: the bare /dashboard lands DIRECTLY on the unified assistant
  // chatbox (omni) — which now hosts every service (chat · image · music · video ·
  // lip-sync) — so the chat IS the landing, no card-selection gate. The 3-card hub
  // stays reachable via #hub (the chatbox's back control) for the richer dedicated
  // Film studio. Every surface rides the URL hash so refresh / back / share behave.
  const [service, setService] = useState<Service>('omni');
  // "New Chat" remounts the assistant by bumping this key — a clean reset of the
  // whole conversation (messages, attachment, mode) without page reload.
  const [chatResetKey, setChatResetKey] = useState(0);

  useEffect(() => {
    const read = () => {
      const h = (typeof window !== 'undefined' ? window.location.hash : '').replace('#', '');
      setService(h === 'film' || h === 'omni' || h === 'lipsync' || h === 'hub' || h === 'agent' ? (h as Service) : 'omni');
    };
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);

  const go = useCallback((s: Service) => {
    // The default chatbox lives on the bare URL (empty hash); everything else —
    // including the card hub — rides an explicit hash so it's shareable.
    if (typeof window !== 'undefined') window.location.hash = s === 'omni' ? '' : s;
    setService(s);
  }, []);

  // Card A — the flagship studio owns the full viewport + its own header (a back
  // control is injected via onExitToHub).
  if (service === 'film') {
    return <ConversationalFilmStudio locale={locale} isAuthenticated={isAuthenticated} onExitToHub={() => go('hub')} />;
  }

  // Cards B & C — wrapped in the full modern-chatbot chrome (top bar with brand +
  // live GEL balance + top-up + hamburger drawer + New Chat). The assistant is the
  // default one-window landing; the back control returns to the card hub.
  if (service === 'omni' || service === 'lipsync' || service === 'agent') {
    return (
      <ChatChrome
        locale={locale}
        // The assistant chatbox IS the home — it has nothing to go "back" to, so it
        // gets NO back control (the old one routed to the #hub card grid, which read
        // as a "ghost page" landing on every press/refresh). Lipsync is a secondary
        // surface reached only from the hub, so it keeps an explicit exit-to-hub. The
        // agent (STEP 3) mounts IN-PLACE here too — its back returns to the assistant.
        onBack={service === 'lipsync' ? () => go('hub') : service === 'agent' ? () => go('omni') : undefined}
        title={service === 'lipsync' ? t.lipTitle : service === 'agent' ? 'Agent G' : undefined}
        onNewChat={service === 'omni' ? () => { try { window.localStorage.removeItem(OMNI_CURRENT_ID_KEY); } catch { /* noop */ } setChatResetKey((k) => k + 1); } : undefined}
        scrollBody={service === 'lipsync' || service === 'agent'}
      >
        {/* PHASE 3 Task 5 — a render crash in the studio keeps the ChatChrome shell +
            shows a localized, friendly retry card instead of blanking the route. */}
        <ErrorBoundary
          fallback={
            <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-6 text-center">
              <span className="text-4xl">⚠️</span>
              <p className="text-[15px] font-semibold text-app-text">{lang === 'en' ? 'Something went wrong' : lang === 'ru' ? 'Что-то пошло не так' : 'რაღაც შეფერხდა'}</p>
              <p className="max-w-xs text-[13px] text-app-muted">{lang === 'en' ? 'Please reload and try again. Your work is safe.' : lang === 'ru' ? 'Перезагрузите и попробуйте снова. Ваши работы сохранены.' : 'გადატვირთეთ და სცადეთ თავიდან. თქვენი ნამუშევრები დაცულია.'}</p>
              <button type="button" onClick={() => window.location.reload()}
                className="mt-1 rounded-xl bg-app-accent px-5 py-2.5 text-[14px] font-semibold text-app-bg transition hover:opacity-90">
                {lang === 'en' ? 'Reload' : lang === 'ru' ? 'Перезагрузить' : 'გადატვირთვა'}
              </button>
            </div>
          }
        >
          {service === 'omni' ? <OmniStudio key={chatResetKey} locale={lang} />
            : service === 'lipsync' ? <LipsyncStudio locale={lang} />
            : <AgentTerminal embedded locale={lang} onExit={() => go('omni')} />}
        </ErrorBoundary>
      </ChatChrome>
    );
  }

  // The hub grid.
  const cards = [
    { id: 'film' as const, icon: <Film size={22} />, title: t.filmTitle, sub: t.filmSub, tag: t.filmTag, primary: true },
    { id: 'omni' as const, icon: <Sparkles size={22} />, title: t.omniTitle, sub: t.omniSub, tag: t.omniTag, primary: false },
  ];

  return (
    // FULL-SCREEN APP SHELL — `fixed inset-0 + 100dvh` pins the hub to the visual
    // viewport so it fills the screen like a native app, escaping the locale
    // layout's `min-h-screen flex items-center justify-center` wrapper that
    // otherwise centred this panel and let the page gradient bleed in above and
    // below (the "opens broken / dead space" report). Mirrors the film studio shell.
    <div className="fixed inset-0 z-[2] overflow-y-auto bg-app-bg text-app-text" style={{ height: '100dvh', paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col px-4 py-8 sm:py-12">
        <div className="mb-8 flex items-center gap-2">
          <span className="text-[15px] font-semibold tracking-tight text-app-text">My<span className="text-app-accent">Avatar</span></span>
        </div>

        <header className="mb-7">
          <h1 className="text-2xl font-semibold tracking-tight text-app-text sm:text-3xl">{t.heading}</h1>
          <p className="mt-1 text-sm text-app-muted">{t.sub}</p>
        </header>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {cards.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => go(c.id)}
              className={`group flex flex-col items-start gap-3 rounded-2xl p-5 text-left transition-colors ${
                c.primary
                  ? 'bg-app-accent/10 hover:bg-app-accent/15'
                  : 'bg-app-elevated/60 hover:bg-app-elevated'
              }`}
            >
              <div className="flex w-full items-center justify-between">
                <span className={`flex h-11 w-11 items-center justify-center rounded-2xl ${c.primary ? 'bg-app-accent/15 text-app-accent' : 'bg-app-surface text-app-muted group-hover:text-app-accent'}`}>
                  {c.icon}
                </span>
                <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-app-muted">{c.tag}</span>
              </div>
              <div className="space-y-1">
                <h2 className="text-[15px] font-semibold leading-tight text-app-text">{c.title}</h2>
                <p className="text-[12.5px] leading-snug text-app-muted">{c.sub}</p>
              </div>
              <span className={`mt-auto inline-flex items-center gap-1 text-[12px] font-semibold ${c.primary ? 'text-app-accent' : 'text-app-muted group-hover:text-app-accent'}`}>
                {t.open} <ChevronRight size={13} className="transition-transform group-hover:translate-x-0.5" />
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default ServiceHub;
