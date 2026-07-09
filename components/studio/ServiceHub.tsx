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
import { Film, Sparkles, ChevronRight, Loader2, Play } from 'lucide-react';
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
  heroTitle: string; heroSub: string; heroCta: string; heroNote: string;
  showcaseTitle: string; assistantCta: string;
  filmTitle: string; filmSub: string; filmTag: string;
  omniTitle: string; omniSub: string; omniTag: string;
  lipTitle: string; lipSub: string; lipTag: string;
  open: string;
}> = {
  ka: {
    heading: 'აირჩიე სერვისი', sub: 'სამი სტუდია — ერთ სივრცეში',
    heroTitle: 'შენი ისტორია — 30 წამში ფილმად',
    heroSub: 'ერთი ფოტო და რამდენიმე სიტყვა — ჩვენ ვაქცევთ კინოდ. ხმა, სცენები და მონტაჟი — ავტომატურად.',
    heroCta: 'შექმენი შენი პირველი ფილმი',
    heroNote: 'პირველი ფილმი — უფასოდ',
    showcaseTitle: 'ნამუშევრები',
    assistantCta: 'ან გახსენი ჭკვიანი ასისტენტი',
    filmTitle: 'კინო სტუდია', filmSub: 'ფოტო + სცენარი → 30-წამიანი ფილმი', filmTag: 'მთავარი',
    omniTitle: 'ჭკვიანი ასისტენტი', omniSub: 'ხმა · ტექსტი · სურათი → ჭკვიანი პასუხები', omniTag: 'ასისტენტი',
    lipTitle: 'ლიფსინქ სტუდია', lipSub: 'ვიდეო + აუდიო → ტუჩების სინქრონი', lipTag: 'ლიფსინქი',
    open: 'გახსნა',
  },
  en: {
    heading: 'Choose a service', sub: 'Three studios — one window',
    heroTitle: 'Your story — a film in 30 seconds',
    heroSub: 'One photo and a few words become cinema. Voice, scenes and editing — all automatic.',
    heroCta: 'Create your first film',
    heroNote: 'Your first film is free',
    showcaseTitle: 'Showcase',
    assistantCta: 'or open the Smart Assistant',
    filmTitle: 'Film Studio', filmSub: 'A photo + a script → a 30-second film', filmTag: 'Main',
    omniTitle: 'Smart Assistant', omniSub: 'Voice · text · image → smart answers', omniTag: 'Assistant',
    lipTitle: 'Lip-Sync Studio', lipSub: 'Video + audio → lip synchronization', lipTag: 'Lip-sync',
    open: 'Open',
  },
  ru: {
    heading: 'Выберите сервис', sub: 'Три студии — одно окно',
    heroTitle: 'Ваша история — фильм за 30 секунд',
    heroSub: 'Одно фото и несколько слов превращаются в кино. Голос, сцены и монтаж — автоматически.',
    heroCta: 'Создай свой первый фильм',
    heroNote: 'Первый фильм бесплатно',
    showcaseTitle: 'Работы',
    assistantCta: 'или откройте умного ассистента',
    filmTitle: 'Кино-студия', filmSub: 'Фото + сценарий → 30-секундный фильм', filmTag: 'Главное',
    omniTitle: 'Умный ассистент', omniSub: 'Голос · текст · изображение → умные ответы', omniTag: 'Ассистент',
    lipTitle: 'Lip-Sync студия', lipSub: 'Видео + аудио → синхронизация губ', lipTag: 'Синхрон',
    open: 'Открыть',
  },
};

/** Showcase render posters — genre exemplars of what the film studio makes. Each opens the Film Studio.
 *  Styled gradient posters (no fabricated asset URLs); a real render thumbnail can drop into `poster` later. */
const SHOWCASE: { key: string; ka: string; en: string; ru: string; gradient: string }[] = [
  { key: 'epic', ka: 'ისტორიული ეპოსი', en: 'Historical epic', ru: 'Исторический эпос', gradient: 'from-amber-500/40 via-orange-800/25 to-black' },
  { key: 'music', ka: 'მუსიკალური ვიდეო', en: 'Music video', ru: 'Клип', gradient: 'from-fuchsia-500/40 via-purple-800/25 to-black' },
  { key: 'product', ka: 'პროდუქტის რეკლამა', en: 'Product ad', ru: 'Реклама продукта', gradient: 'from-cyan-400/40 via-sky-800/25 to-black' },
  { key: 'portrait', ka: 'პორტრეტული ისტორია', en: 'Portrait story', ru: 'Портретная история', gradient: 'from-emerald-400/35 via-teal-800/25 to-black' },
  { key: 'travel', ka: 'მოგზაურობა', en: 'Travel reel', ru: 'Путешествие', gradient: 'from-blue-400/35 via-indigo-800/25 to-black' },
  { key: 'drama', ka: 'მოკლემეტრაჟიანი დრამა', en: 'Short drama', ru: 'Короткая драма', gradient: 'from-rose-500/35 via-red-900/25 to-black' },
];

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

  // The hub / landing — a conversion-focused hero around ONE central CTA (create your first film),
  // backed by a high-fidelity showcase render grid. The fixed inset-0 + 100dvh shell pins it to the
  // viewport like a native app; ag-fixed-shell (DAY-3) keeps it a strict, non-drifting bounding box.
  return (
    <div className="ag-fixed-shell fixed inset-0 z-[2] overflow-y-auto bg-app-bg text-app-text" style={{ height: '100dvh', paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col px-4 py-8 sm:py-12">
        <div className="mb-8 flex items-center gap-2">
          <span className="text-[15px] font-semibold tracking-tight text-app-text">My <span className="text-app-accent">Avatar</span></span>
        </div>

        {/* HERO — one central, highly prominent CTA */}
        <header className="mb-10 flex flex-col items-center text-center">
          <h1 className="max-w-2xl text-balance text-3xl font-bold leading-[1.1] tracking-tight text-app-text sm:text-5xl">
            {t.heroTitle}
          </h1>
          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-app-muted sm:text-base">{t.heroSub}</p>
          <button
            type="button"
            onClick={() => go('film')}
            className="ag-no-drag group mt-8 inline-flex items-center gap-2.5 rounded-2xl bg-app-accent px-8 py-4 text-[16px] font-bold text-app-bg shadow-[0_10px_40px_-8px_rgba(0,210,255,0.55)] transition-all hover:scale-[1.03] hover:shadow-[0_14px_50px_-6px_rgba(0,210,255,0.7)] active:scale-100 sm:text-[17px]"
          >
            <Film size={20} className="transition-transform group-hover:-rotate-6" />
            {t.heroCta}
            <ChevronRight size={18} className="transition-transform group-hover:translate-x-0.5" />
          </button>
          <span className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-app-accent">
            <span className="h-1.5 w-1.5 rounded-full bg-app-accent" /> {t.heroNote}
          </span>
        </header>

        {/* SHOWCASE — high-fidelity render grid; each poster opens the Film Studio */}
        <section className="mb-8">
          <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-app-muted">{t.showcaseTitle}</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {SHOWCASE.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => go('film')}
                aria-label={s[lang]}
                className={`ag-no-drag group relative aspect-[4/5] overflow-hidden rounded-2xl border border-app-border/10 bg-gradient-to-br ${s.gradient} text-left transition-transform hover:scale-[1.02]`}
              >
                {/* subtle film grain / vignette for a cinematic poster feel */}
                <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_-10%,rgba(255,255,255,0.10),transparent_60%)]" />
                <span className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/30 text-white/90 backdrop-blur-sm transition-colors group-hover:bg-app-accent group-hover:text-app-bg">
                  <Play size={15} className="ml-0.5 fill-current" />
                </span>
                <span className="absolute inset-x-0 bottom-0 flex flex-col gap-0.5 bg-gradient-to-t from-black/70 to-transparent p-3">
                  <span className="text-[13px] font-semibold leading-tight text-white">{s[lang]}</span>
                  <span className="text-[10.5px] font-medium uppercase tracking-wider text-white/60">30s · MyAvatar</span>
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* Secondary — the multimodal assistant, one tap away */}
        <button
          type="button"
          onClick={() => go('omni')}
          className="ag-no-drag group mx-auto inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13.5px] font-semibold text-app-muted transition-colors hover:text-app-accent"
        >
          <Sparkles size={16} /> {t.assistantCta}
          <ChevronRight size={14} className="transition-transform group-hover:translate-x-0.5" />
        </button>
      </div>
    </div>
  );
}

export default ServiceHub;
