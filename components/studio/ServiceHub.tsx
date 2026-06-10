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
import { Film, Sparkles, Wand2, ArrowLeft, ChevronRight } from 'lucide-react';
import { ConversationalFilmStudio } from './ConversationalFilmStudio';
import OmniStudio from './OmniStudio';
import LipsyncStudio from './LipsyncStudio';

type Lang = 'ka' | 'en' | 'ru';
type Service = 'hub' | 'film' | 'omni' | 'lipsync';

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

  useEffect(() => {
    const read = () => {
      const h = (typeof window !== 'undefined' ? window.location.hash : '').replace('#', '');
      setService(h === 'film' || h === 'omni' || h === 'lipsync' || h === 'hub' ? (h as Service) : 'omni');
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

  // Cards B & C — wrapped in a slim back-header shell.
  if (service === 'omni' || service === 'lipsync') {
    return (
      <div className="fixed inset-0 z-0 flex flex-col bg-black text-white" style={{ height: '100dvh' }}>
        <header className="sticky top-0 z-30 shrink-0 border-b border-white/10 bg-black/90 backdrop-blur-xl" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
          <div className="mx-auto flex h-14 w-full max-w-3xl items-center gap-2 px-4">
            <button type="button" onClick={() => go('hub')} aria-label="Services" className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-white/10 hover:text-[#00D2FF]">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <span className="truncate text-sm font-bold tracking-wide text-white">
              {service === 'omni' ? t.omniTitle : t.lipTitle}
            </span>
          </div>
        </header>
        <div className={`min-h-0 flex-1 ${service === 'lipsync' ? 'overflow-y-auto' : 'flex'}`}>
          {service === 'omni' ? <OmniStudio locale={lang} /> : <LipsyncStudio locale={lang} />}
        </div>
      </div>
    );
  }

  // The hub grid.
  const cards = [
    { id: 'film' as const, icon: <Film size={22} />, title: t.filmTitle, sub: t.filmSub, tag: t.filmTag, primary: true },
    { id: 'omni' as const, icon: <Sparkles size={22} />, title: t.omniTitle, sub: t.omniSub, tag: t.omniTag, primary: false },
    { id: 'lipsync' as const, icon: <Wand2 size={22} />, title: t.lipTitle, sub: t.lipSub, tag: t.lipTag, primary: false },
  ];

  return (
    // FULL-SCREEN APP SHELL — `fixed inset-0 + 100dvh` pins the hub to the visual
    // viewport so it fills the screen like a native app, escaping the locale
    // layout's `min-h-screen flex items-center justify-center` wrapper that
    // otherwise centred this panel and let the page gradient bleed in above and
    // below (the "opens broken / dead space" report). Mirrors the film studio shell.
    <div className="fixed inset-0 z-0 overflow-y-auto bg-black text-white" style={{ height: '100dvh', paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col px-4 py-8 sm:py-12">
        <div className="mb-8 flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#00D2FF]/40 bg-[#00D2FF]/10 text-[15px] shadow-[0_0_15px_rgba(0,210,255,0.25)]" aria-hidden>🚀</span>
          <span className="text-sm font-bold tracking-wide text-white">MyAvatar<span className="text-[#00D2FF]">.ge</span></span>
        </div>

        <header className="mb-7">
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">{t.heading}</h1>
          <p className="mt-1 text-sm text-neutral-500">{t.sub}</p>
        </header>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {cards.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => go(c.id)}
              className={`group flex flex-col items-start gap-3 rounded-2xl border bg-black p-5 text-left transition-all hover:-translate-y-0.5 ${
                c.primary
                  ? 'border-[#00D2FF]/40 ring-1 ring-[#00D2FF]/20 hover:border-[#00D2FF] hover:shadow-[0_0_40px_-12px_rgba(0,210,255,0.5)]'
                  : 'border-white/10 hover:border-[#00D2FF]/40 hover:shadow-[0_0_40px_-16px_rgba(0,210,255,0.35)]'
              }`}
            >
              <div className="flex w-full items-center justify-between">
                <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${c.primary ? 'bg-[#00D2FF]/15 text-[#00D2FF]' : 'bg-white/5 text-neutral-300 group-hover:text-[#00D2FF]'}`}>
                  {c.icon}
                </span>
                <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">{c.tag}</span>
              </div>
              <div className="space-y-1">
                <h2 className="text-[15px] font-bold leading-tight text-white">{c.title}</h2>
                <p className="text-[12.5px] leading-snug text-neutral-500">{c.sub}</p>
              </div>
              <span className={`mt-auto inline-flex items-center gap-1 text-[12px] font-semibold ${c.primary ? 'text-[#00D2FF]' : 'text-neutral-400 group-hover:text-[#00D2FF]'}`}>
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
