'use client';

/**
 * components/studio/SlidesStudio.tsx — the Presentation surface.
 *
 * DELIVERABLE STRATEGY: the server returns rendered PNG slides (guaranteed Georgian — resvg with the
 * bundled FiraGO, since Vercel's container has no system fonts) and this component provides the two
 * exports that need no server infrastructure at all:
 *   · PDF  — `window.print()` over a print stylesheet, one slide per page. The user's own renderer makes
 *            the PDF. Server-side pdfkit is avoided deliberately: it is absent from
 *            serverComponentsExternalPackages and from file tracing, and reads .afm metrics off disk.
 *   · ZIP  — jszip (already a prod dependency), dynamically imported so it never enters the main bundle.
 *
 * i18n follows the studio-tree convention: a module-level COPY table, not a translation hook.
 */
import { useCallback, useEffect, useState } from 'react';
import { MAX_SLIDES, MIN_SLIDES, DEFAULT_SLIDES, type DeckLanguage, type DeckTheme } from '@/lib/services/presentation/deckPlan';

type Lang = 'ka' | 'en' | 'ru';

const COPY = {
  ka: {
    title: 'პრეზენტაციის სტუდია',
    subtitle: 'თემიდან — მზა სლაიდებამდე',
    topic: 'თემა',
    topicPlaceholder: 'მაგ. ხელოვნური ინტელექტი ქართულ ბიზნესში',
    audience: 'აუდიტორია (არჩევითი)',
    count: 'სლაიდების რაოდენობა',
    language: 'ენა',
    theme: 'თემა',
    dark: 'მუქი',
    light: 'ღია',
    images: 'სურათების გენერაცია',
    submit: 'პრეზენტაციის შექმნა',
    working: 'იქმნება…',
    warn: 'რამდენიმე წუთი სჭირდება. არ დახუროთ ეს გვერდი.',
    failed: 'პრეზენტაცია ვერ შეიქმნა',
    print: 'PDF / ბეჭდვა',
    zip: 'ZIP ჩამოტვირთვა',
    notes: 'დიქტორის ჩანაწერები',
    prev: 'წინა',
    next: 'შემდეგი',
    fallbackWarn: 'მოდელმა ვერ დააგენერირა გეგმა — გამოყენებულია ჩონჩხი, რომელიც შეგიძლიათ შეასწოროთ.',
    imagesWarn: 'სურათები ვერ დაგენერირდა — პრეზენტაცია ტექსტურია.',
  },
  en: {
    title: 'Presentation Studio',
    subtitle: 'From a topic to finished slides',
    topic: 'Topic',
    topicPlaceholder: 'e.g. Artificial intelligence in Georgian business',
    audience: 'Audience (optional)',
    count: 'Slides',
    language: 'Language',
    theme: 'Theme',
    dark: 'Dark',
    light: 'Light',
    images: 'Generate images',
    submit: 'Build presentation',
    working: 'Building…',
    warn: 'This takes a few minutes. Keep this tab open.',
    failed: 'The presentation could not be built',
    print: 'PDF / Print',
    zip: 'Download ZIP',
    notes: 'Speaker notes',
    prev: 'Previous',
    next: 'Next',
    fallbackWarn: 'The model returned no outline — a skeleton was used instead. You can edit it.',
    imagesWarn: 'Images could not be generated — the deck is text-only.',
  },
  ru: {
    title: 'Студия презентаций',
    subtitle: 'От темы до готовых слайдов',
    topic: 'Тема',
    topicPlaceholder: 'напр. Искусственный интеллект в грузинском бизнесе',
    audience: 'Аудитория (необязательно)',
    count: 'Слайдов',
    language: 'Язык',
    theme: 'Тема',
    dark: 'Тёмная',
    light: 'Светлая',
    images: 'Генерировать изображения',
    submit: 'Создать презентацию',
    working: 'Создаём…',
    warn: 'Это займёт несколько минут. Не закрывайте вкладку.',
    failed: 'Не удалось создать презентацию',
    print: 'PDF / Печать',
    zip: 'Скачать ZIP',
    notes: 'Заметки докладчика',
    prev: 'Назад',
    next: 'Вперёд',
    fallbackWarn: 'Модель не вернула план — использован каркас, его можно отредактировать.',
    imagesWarn: 'Изображения не сгенерированы — презентация текстовая.',
  },
} satisfies Record<Lang, Record<string, string>>;

interface RenderedSlide {
  index: number;
  title: string;
  bullets: string[];
  notes?: string;
  pngUrl: string;
}

interface DeckResponse {
  title: string;
  coverUrl: string | null;
  slides: RenderedSlide[];
  warnings?: { usedFallbackOutline?: boolean; imagesMissing?: number; imagesRequested?: boolean };
}

export function SlidesStudio({ locale }: { locale: string }) {
  const lang: Lang = locale === 'en' ? 'en' : locale === 'ru' ? 'ru' : 'ka';
  const t = COPY[lang];

  const [topic, setTopic] = useState('');
  const [audience, setAudience] = useState('');
  const [slideCount, setSlideCount] = useState(DEFAULT_SLIDES);
  const [language, setLanguage] = useState<DeckLanguage>(lang);
  const [theme, setTheme] = useState<DeckTheme>('dark');
  const [withImages, setWithImages] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deck, setDeck] = useState<DeckResponse | null>(null);
  const [current, setCurrent] = useState(0);
  const [zipping, setZipping] = useState(false);

  const slides = deck?.slides ?? [];

  const go = useCallback((delta: number) => {
    setCurrent((c) => Math.max(0, Math.min(slides.length - 1, c + delta)));
  }, [slides.length]);

  // Keyboard paging — a deck that cannot be advanced with the arrow keys is not a deck.
  useEffect(() => {
    if (!slides.length) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'PageDown') go(1);
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [slides.length, go]);

  async function submit() {
    if (busy || topic.trim().length < 3) return;
    setBusy(true);
    setError(null);
    setDeck(null);
    setCurrent(0);
    try {
      const res = await fetch('/api/v2/presentation/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: topic.trim(), audience: audience.trim(), slideCount, language, theme, withImages }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        setError([t.failed, j?.step, j?.message].filter(Boolean).join(' · '));
        return;
      }
      setDeck(j as DeckResponse);
    } catch {
      setError(t.failed);
    } finally {
      setBusy(false);
    }
  }

  async function downloadZip() {
    if (!deck || zipping) return;
    setZipping(true);
    try {
      // Dynamic import keeps jszip out of the main bundle — it is only ever needed after a build.
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      if (deck.coverUrl) {
        const cover = await fetch(deck.coverUrl).then((r) => r.blob());
        zip.file('00-cover.png', cover);
      }
      for (const s of deck.slides) {
        const blob = await fetch(s.pngUrl).then((r) => r.blob());
        zip.file(`${String(s.index).padStart(2, '0')}-slide.png`, blob);
      }
      const out = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(out);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(deck.title || 'deck').slice(0, 40).replace(/[^\p{L}\p{N}]+/gu, '-')}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError(t.failed);
    } finally {
      setZipping(false);
    }
  }

  const field = 'w-full rounded-xl bg-app-elevated border border-app-border/15 px-3 py-2.5 text-sm !text-app-text outline-none focus:border-app-accent/50 transition-colors';
  const active = slides[current];

  return (
    <div className="min-h-screen bg-app-surface px-4 py-10">
      {/* One slide per page when printing; everything else is hidden. This IS the PDF export. */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .deck-print, .deck-print * { visibility: visible; }
          .deck-print { position: absolute; inset: 0; }
          .deck-print-slide { page-break-after: always; width: 100%; }
          .deck-noprint { display: none !important; }
        }
      `}</style>

      <div className="mx-auto w-full max-w-4xl">
        <div className="deck-noprint">
          <h1 className="text-2xl font-semibold text-app-text">{t.title}</h1>
          <p className="mt-1 text-sm text-app-muted">{t.subtitle}</p>

          <div className="mt-8 space-y-4 rounded-2xl border border-app-border/15 bg-app-elevated/40 p-5">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-app-muted">{t.topic}</span>
              <textarea rows={2} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder={t.topicPlaceholder} className={field} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-app-muted">{t.audience}</span>
              <input type="text" value={audience} onChange={(e) => setAudience(e.target.value)} className={field} />
            </label>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-app-muted">{t.count}</span>
                <input
                  type="number" min={MIN_SLIDES} max={MAX_SLIDES} value={slideCount}
                  onChange={(e) => setSlideCount(Math.max(MIN_SLIDES, Math.min(MAX_SLIDES, Number(e.target.value) || DEFAULT_SLIDES)))}
                  className={field}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-app-muted">{t.language}</span>
                <select value={language} onChange={(e) => setLanguage(e.target.value as DeckLanguage)} className={field}>
                  <option value="ka">ქართული</option>
                  <option value="en">English</option>
                  <option value="ru">Русский</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-app-muted">{t.theme}</span>
                <select value={theme} onChange={(e) => setTheme(e.target.value as DeckTheme)} className={field}>
                  <option value="dark">{t.dark}</option>
                  <option value="light">{t.light}</option>
                </select>
              </label>
            </div>

            <label className="flex items-center gap-2 text-sm text-app-text">
              <input type="checkbox" checked={withImages} onChange={(e) => setWithImages(e.target.checked)} />
              {t.images}
            </label>

            <button
              type="button" onClick={submit} disabled={busy || topic.trim().length < 3}
              className="w-full rounded-xl bg-app-accent px-4 py-3 text-sm font-semibold text-app-bg transition-opacity disabled:opacity-40"
            >
              {busy ? t.working : t.submit}
            </button>
            {busy && <p className="text-center text-xs text-app-muted">{t.warn}</p>}
            {error && <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>}
          </div>
        </div>

        {deck && slides.length > 0 && (
          <>
            <div className="deck-noprint mt-6 flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => window.print()} className="rounded-xl bg-app-accent px-4 py-2 text-sm font-semibold text-app-bg">
                {t.print}
              </button>
              <button type="button" onClick={downloadZip} disabled={zipping} className="rounded-xl border border-app-border/15 px-4 py-2 text-sm text-app-text disabled:opacity-40">
                {zipping ? '…' : t.zip}
              </button>
              <div className="ml-auto flex items-center gap-2 text-sm text-app-muted">
                <button type="button" onClick={() => go(-1)} disabled={current === 0} className="rounded-lg border border-app-border/15 px-3 py-1.5 disabled:opacity-30">←</button>
                <span>{current + 1} / {slides.length}</span>
                <button type="button" onClick={() => go(1)} disabled={current === slides.length - 1} className="rounded-lg border border-app-border/15 px-3 py-1.5 disabled:opacity-30">→</button>
              </div>
            </div>

            {deck.warnings?.usedFallbackOutline && (
              <p className="deck-noprint mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">{t.fallbackWarn}</p>
            )}
            {deck.warnings?.imagesRequested && (deck.warnings.imagesMissing ?? 0) > 0 && (
              <p className="deck-noprint mt-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">{t.imagesWarn}</p>
            )}

            {/* The on-screen viewer: one slide at a time. */}
            {active && (
              <div className="deck-noprint mt-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={active.pngUrl} alt={active.title} className="w-full rounded-xl border border-app-border/15" />
                {active.notes && (
                  <div className="mt-3 rounded-xl border border-app-border/15 bg-app-elevated/40 p-4">
                    <p className="mb-1 text-[11px] uppercase tracking-wide text-app-muted">{t.notes}</p>
                    <p className="text-sm text-app-text">{active.notes}</p>
                  </div>
                )}
              </div>
            )}

            {/* Print-only: every slide, one per page. Hidden on screen. */}
            <div className="deck-print hidden print:block">
              {deck.coverUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={deck.coverUrl} alt="" className="deck-print-slide" />
              )}
              {slides.map((s) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={s.index} src={s.pngUrl} alt={s.title} className="deck-print-slide" />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
