'use client';

/**
 * ServiceHub — the post-auth landing (One Window architecture).
 *
 * Replaces the straight-to-chat landing with a clean, grid-based Service
 * Selection Hub of three product cards, each launching its own tailored studio
 * IN-WINDOW (no route change — the active service lives in a URL hash so refresh /
 * back behaves, but the frame never breaks):
 *
 *   A · 30-Second Cinematic Film Studio  → ConversationalFilmStudio (the flagship)
 *   B · Google Omni Multimodal Studio    → OmniStudio (Gemini: voice·text·image)
 *   C · AI Lipsync Studio                → LipsyncStudio (Wav2Lip on Replicate)
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
    filmTitle: '30-წამიანი კინო სტუდია', filmSub: 'ფოტო + დოკუმენტი + რეჟისორის პრომპტი → 30წ ფილმი', filmTag: 'მთავარი სერვისი',
    omniTitle: 'Google Omni სტუდია', omniSub: 'ხმა · ტექსტი · სურათი → ინტელექტუალური ანალიზი', omniTag: 'ასისტენტი',
    lipTitle: 'AI Lipsync სტუდია', lipSub: 'ვიდეო + აუდიო → ზუსტი ტუჩების სინქრონი', lipTag: 'მუსიკალური კლიპები',
    open: 'გახსნა',
  },
  en: {
    heading: 'Choose a service', sub: 'Three studios — one window',
    filmTitle: '30-Second Cinematic Film Studio', filmSub: 'Photos + documents + a director prompt → a 30s film', filmTag: 'Flagship',
    omniTitle: 'Google Omni Studio', omniSub: 'Voice · text · image → intelligent multimodal analysis', omniTag: 'Assistant',
    lipTitle: 'AI Lipsync Studio', lipSub: 'Video + audio → precise lip synchronization', lipTag: 'Music videos',
    open: 'Open',
  },
  ru: {
    heading: 'Выберите сервис', sub: 'Три студии — одно окно',
    filmTitle: '30-секундная кино-студия', filmSub: 'Фото + документы + промпт режиссёра → 30с фильм', filmTag: 'Флагман',
    omniTitle: 'Google Omni студия', omniSub: 'Голос · текст · изображение → умный мультимодальный анализ', omniTag: 'Ассистент',
    lipTitle: 'AI Lipsync студия', lipSub: 'Видео + аудио → точная синхронизация губ', lipTag: 'Клипы',
    open: 'Открыть',
  },
};

export function ServiceHub({ locale = 'ka', isAuthenticated = false }: { locale?: string; isAuthenticated?: boolean }) {
  const lang: Lang = locale === 'en' ? 'en' : locale === 'ru' ? 'ru' : 'ka';
  const t = COPY[lang];
  const [service, setService] = useState<Service>('hub');

  // The active service rides in the URL hash so refresh / back / share behave —
  // without ever leaving the page (One Window).
  useEffect(() => {
    const read = () => {
      const h = (typeof window !== 'undefined' ? window.location.hash : '').replace('#', '');
      setService(h === 'film' || h === 'omni' || h === 'lipsync' ? h : 'hub');
    };
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);

  const go = useCallback((s: Service) => {
    if (typeof window !== 'undefined') window.location.hash = s === 'hub' ? '' : s;
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
      <div className="flex h-full w-full flex-col bg-black text-white">
        <header className="sticky top-0 z-30 shrink-0 border-b border-white/10 bg-black/90 backdrop-blur-xl" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
          <div className="mx-auto flex h-14 w-full max-w-3xl items-center gap-2 px-4">
            <button type="button" onClick={() => go('hub')} aria-label="Services" className="-ml-1 flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-white/10 hover:text-[#00D2FF]">
              <ArrowLeft className="h-4 w-4" />
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
    <div className="h-full w-full overflow-y-auto bg-black text-white" style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:py-12">
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
