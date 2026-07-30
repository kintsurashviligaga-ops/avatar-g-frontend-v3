'use client';

/**
 * components/studio/DubbingStudio.tsx — the user-facing surface for /api/v2/dubbing/start.
 *
 * The request runs SYNCHRONOUSLY (Vercel has no daemon to hand a dub to), so a submit here holds an open
 * fetch for as long as the dub takes — up to the route's 600s ceiling. The UI is built around that fact:
 * an explicit "this takes a few minutes, keep the tab open" warning rather than a spinner that looks stuck.
 *
 * i18n follows the studio-tree convention — a module-level COPY table, not a translation hook.
 */
import { useState } from 'react';
import { DUBBING_LANGUAGES, type DubbingLanguage } from '@/lib/services/dubbing/dubbingPlan';

type Lang = 'ka' | 'en' | 'ru';

// `satisfies` rather than a type annotation: it checks the shape while KEEPING the literal keys, so
// `t.tooLong` is a string. Annotating as Record<string, string> would make every lookup `string | undefined`.
const COPY = {
  ka: {
    title: 'დუბლაჟის სტუდია',
    subtitle: 'თარგმნე და გაახმოვანე ვიდეო სხვა ენაზე — ორიგინალის ტაიმინგით',
    source: 'ვიდეოს ბმული',
    sourcePlaceholder: 'https://…/video.mp4',
    from: 'ორიგინალის ენა',
    to: 'სამიზნე ენა',
    auto: 'ავტომატური ამოცნობა',
    keepBg: 'ფონური ხმის შენარჩუნება',
    subs: 'სუბტიტრების ფაილი',
    submit: 'დუბლაჟის დაწყება',
    working: 'მიმდინარეობს…',
    warn: 'დამუშავებას რამდენიმე წუთი სჭირდება. არ დახუროთ ეს გვერდი.',
    done: 'მზადაა',
    subsLink: 'სუბტიტრები (SRT)',
    audioLink: 'მხოლოდ აუდიო',
    speakers: 'მოლაპარაკე',
    dropped: 'ვერ გახმოვანდა ხაზი',
    untranslated: 'ვერ ითარგმნა ხაზი',
    tooLong: 'ვიდეო ძალიან გრძელია — მაქსიმუმ 5 წუთი.',
    failed: 'დუბლაჟი ვერ შესრულდა',
  },
  en: {
    title: 'Dubbing Studio',
    subtitle: 'Translate and re-voice a video in another language, on the original timing',
    source: 'Video URL',
    sourcePlaceholder: 'https://…/video.mp4',
    from: 'Source language',
    to: 'Target language',
    auto: 'Auto-detect',
    keepBg: 'Keep background audio',
    subs: 'Subtitle file',
    submit: 'Start dubbing',
    working: 'Dubbing…',
    warn: 'This takes a few minutes. Keep this tab open.',
    done: 'Ready',
    subsLink: 'Subtitles (SRT)',
    audioLink: 'Audio only',
    speakers: 'speakers',
    dropped: 'lines could not be voiced',
    untranslated: 'lines stayed in the source language',
    tooLong: 'That video is too long — 5 minutes maximum.',
    failed: 'Dubbing failed',
  },
  ru: {
    title: 'Студия дубляжа',
    subtitle: 'Переведите и озвучьте видео на другом языке — с таймингом оригинала',
    source: 'Ссылка на видео',
    sourcePlaceholder: 'https://…/video.mp4',
    from: 'Язык оригинала',
    to: 'Целевой язык',
    auto: 'Автоопределение',
    keepBg: 'Сохранить фоновый звук',
    subs: 'Файл субтитров',
    submit: 'Начать дубляж',
    working: 'Дублируем…',
    warn: 'Это займёт несколько минут. Не закрывайте вкладку.',
    done: 'Готово',
    subsLink: 'Субтитры (SRT)',
    audioLink: 'Только звук',
    speakers: 'говорящих',
    dropped: 'реплик не озвучено',
    untranslated: 'реплик осталось на исходном языке',
    tooLong: 'Видео слишком длинное — максимум 5 минут.',
    failed: 'Дубляж не удался',
  },
} satisfies Record<Lang, Record<string, string>>;

const LANGUAGE_LABEL: Record<DubbingLanguage, string> = {
  ka: 'ქართული', en: 'English', ru: 'Русский', de: 'Deutsch', fr: 'Français', es: 'Español',
  it: 'Italiano', tr: 'Türkçe', ar: 'العربية', zh: '中文', ja: '日本語', ko: '한국어',
};

interface DubResult {
  videoUrl: string;
  audioUrl: string;
  subtitlesUrl: string | null;
  speakers: number;
  segments: number;
  warnings: { droppedLines: number; untranslatedLines: number };
}

export function DubbingStudio({ locale }: { locale: string }) {
  const lang: Lang = locale === 'en' ? 'en' : locale === 'ru' ? 'ru' : 'ka';
  const t = COPY[lang];

  const [sourceVideoUrl, setSourceVideoUrl] = useState('');
  const [sourceLanguage, setSourceLanguage] = useState<string>('auto');
  const [targetLanguage, setTargetLanguage] = useState<DubbingLanguage>(lang === 'ka' ? 'en' : 'ka');
  const [preserveBackgroundAudio, setPreserveBg] = useState(true);
  const [subtitles, setSubtitles] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DubResult | null>(null);

  async function submit() {
    if (busy || !sourceVideoUrl.trim()) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/v2/dubbing/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceVideoUrl: sourceVideoUrl.trim(), sourceLanguage, targetLanguage, preserveBackgroundAudio, subtitles }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        // The route names the leg that failed — showing it beats a generic "something went wrong".
        setError(res.status === 413 ? t.tooLong : [t.failed, j?.step, j?.message].filter(Boolean).join(' · '));
        return;
      }
      setResult(j as DubResult);
    } catch {
      setError(t.failed);
    } finally {
      setBusy(false);
    }
  }

  const field = 'w-full rounded-xl bg-app-elevated border border-app-border/15 px-3 py-2.5 !text-app-text outline-none focus:border-app-accent/50 transition-colors';

  return (
    <div className="min-h-screen bg-app-surface px-4 py-10">
      <div className="mx-auto w-full max-w-2xl">
        <h1 className="text-2xl font-semibold text-app-text">{t.title}</h1>
        <p className="mt-1 text-sm text-app-muted">{t.subtitle}</p>

        <div className="mt-8 space-y-5 rounded-2xl border border-app-border/15 bg-app-elevated/40 p-5">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-app-muted">{t.source}</span>
            <input
              type="url"
              value={sourceVideoUrl}
              onChange={(e) => setSourceVideoUrl(e.target.value)}
              placeholder={t.sourcePlaceholder}
              className={field}
            />
          </label>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-app-muted">{t.from}</span>
              <select value={sourceLanguage} onChange={(e) => setSourceLanguage(e.target.value)} className={field}>
                <option value="auto">{t.auto}</option>
                {DUBBING_LANGUAGES.map((l) => (
                  <option key={l} value={l}>{LANGUAGE_LABEL[l]}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-app-muted">{t.to}</span>
              <select
                value={targetLanguage}
                onChange={(e) => setTargetLanguage(e.target.value as DubbingLanguage)}
                className={field}
              >
                {DUBBING_LANGUAGES.map((l) => (
                  <option key={l} value={l}>{LANGUAGE_LABEL[l]}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex flex-wrap gap-5">
            <label className="flex items-center gap-2 text-sm text-app-text">
              <input type="checkbox" checked={preserveBackgroundAudio} onChange={(e) => setPreserveBg(e.target.checked)} />
              {t.keepBg}
            </label>
            <label className="flex items-center gap-2 text-sm text-app-text">
              <input type="checkbox" checked={subtitles} onChange={(e) => setSubtitles(e.target.checked)} />
              {t.subs}
            </label>
          </div>

          <button
            type="button"
            onClick={submit}
            disabled={busy || !sourceVideoUrl.trim() || sourceLanguage === targetLanguage}
            className="w-full rounded-xl bg-app-accent px-4 py-3 text-sm font-semibold text-app-bg transition-opacity disabled:opacity-40"
          >
            {busy ? t.working : t.submit}
          </button>

          {busy && <p className="text-center text-xs text-app-muted">{t.warn}</p>}
          {error && <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>}
        </div>

        {result && (
          <div className="mt-6 space-y-3 rounded-2xl border border-app-border/15 bg-app-elevated/40 p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-app-text">{t.done}</span>
              <span className="text-xs text-app-muted">
                {result.segments} · {result.speakers} {t.speakers}
              </span>
            </div>
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video src={result.videoUrl} controls className="w-full rounded-xl" />
            <div className="flex flex-wrap gap-4 text-xs">
              <a href={result.videoUrl} download className="text-app-accent hover:underline">MP4</a>
              <a href={result.audioUrl} download className="text-app-accent hover:underline">{t.audioLink}</a>
              {result.subtitlesUrl && (
                <a href={result.subtitlesUrl} download className="text-app-accent hover:underline">{t.subsLink}</a>
              )}
            </div>
            {/* Partial results are stated, never presented as clean. */}
            {result.warnings.droppedLines > 0 && (
              <p className="text-xs text-amber-400">{result.warnings.droppedLines} {t.dropped}</p>
            )}
            {result.warnings.untranslatedLines > 0 && (
              <p className="text-xs text-amber-400">{result.warnings.untranslatedLines} {t.untranslated}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
