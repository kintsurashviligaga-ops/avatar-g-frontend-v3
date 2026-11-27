'use client';

/**
 * components/studio/director/FinalCutPanel.tsx — the final cut (Phase 8.3, PR D), shown once every scene is delivered.
 *
 * "Final cut · free" joins the clips in storyboard order (…/director-workflow/cut). The optional whole-film music bed is
 * one switch plus a style line ("cinematic", "soft piano", or a whole sentence like "add cinematic music to the whole
 * film"); its price comes from the server (quote: true, free) and is shown on the button before anything is charged.
 * The film plays here and is saved to the Library; after "re-do scene 3" the button cuts again and replaces it.
 */
import { useEffect, useMemo, useState } from 'react';
import { DW_DEFAULT_MUSIC, DW_MUSIC_PROMPT_MAX, wholeFilmMusicAsk, type DwCutClip, type DwProject } from '@/lib/video/directorsWorkflow';

type Lang = string;
const tr = (locale: Lang, ka: string, en: string, ru: string): string => (locale === 'en' ? en : locale === 'ru' ? ru : ka);
const json = async (res: Response): Promise<Record<string, unknown>> => ((await res.json().catch(() => null)) as Record<string, unknown> | null) ?? {};

/** What the bed is asked for: a whole-film sentence keeps its style words, a bare style is used as it is. */
export function musicPrompt(text: string): string {
  const t = text.trim();
  if (!t) return DW_DEFAULT_MUSIC;
  return (wholeFilmMusicAsk(t)?.prompt ?? t).slice(0, DW_MUSIC_PROMPT_MAX);
}

const post = (body: unknown) => fetch('/api/video/director-workflow/cut', {
  method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});

export function FinalCutPanel({ locale, project, clips }: { locale: Lang; project: DwProject; clips: DwCutClip[] }) {
  const [music, setMusic] = useState(false);
  const [style, setStyle] = useState('');
  const [price, setPrice] = useState<{ credits: number; available: boolean } | null>(null);
  const [cutting, setCutting] = useState(false);
  const [film, setFilm] = useState<{ url: string; saved: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const prompt = musicPrompt(style);
  const clipKey = useMemo(() => clips.map((c) => c.url).join('|'), [clips]);

  // A re-rendered scene makes the old film stale: offer the cut again.
  useEffect(() => { setFilm(null); }, [clipKey]);

  useEffect(() => {
    if (!music) { setPrice(null); return; }
    let live = true;
    void post({ project, music: { prompt }, quote: true }).then(json).then((j) => {
      if (live) setPrice({ credits: Number(j.musicCredits) || 0, available: j.musicAvailable !== false });
    }).catch(() => { if (live) setPrice(null); });
    return () => { live = false; };
  }, [music, prompt, project]);

  const cut = async () => {
    if (cutting) return;
    setCutting(true);
    setError(null);
    try {
      const res = await post({ project, clips, music: music ? { prompt } : null, ...(music ? { expectedCredits: price?.credits } : {}) });
      const j = await json(res);
      if (!res.ok || typeof j.url !== 'string') {
        setError(j.error === 'insufficient_credits'
          ? tr(locale, 'ბალანსი არ კმარა მუსიკისთვის.', 'Not enough credits for the music.', 'Недостаточно кредитов для музыки.')
          : j.error === 'music_unavailable'
            ? tr(locale, 'მუსიკა ახლა ვერ შეიქმნა. სცადე მის გარეშე.', 'The music could not be made now. Try without it.', 'Музыку сейчас не удалось создать. Попробуйте без неё.')
            : tr(locale, 'ფილმი ვერ აიწყო. სცადე თავიდან.', 'Could not put the film together. Try again.', 'Не удалось собрать фильм. Попробуйте снова.'));
        if (j.refunded === true) setError((e) => `${e ?? ''} ${tr(locale, 'კრედიტები დაგიბრუნდა.', 'Credits refunded.', 'Кредиты возвращены.')}`.trim());
        return;
      }
      setFilm({ url: j.url, saved: j.savedToLibrary === true });
    } catch {
      setError(tr(locale, 'კავშირი გაწყდა. სცადე თავიდან.', 'Connection lost. Try again.', 'Связь прервалась. Попробуйте снова.'));
    } finally {
      setCutting(false);
    }
  };

  const musicLabel = music && price ? ` + ${tr(locale, 'მუსიკა', 'music', 'музыка')} ✦${price.credits}` : '';
  const canCut = !cutting && (!music || (!!price && price.available));

  return (
    <section className="space-y-2 rounded-2xl bg-app-elevated p-3 ring-1 ring-app-border/15" data-testid="dw-final-cut" aria-label={tr(locale, 'საბოლოო მონტაჟი', 'Final cut', 'Финальный монтаж')}>
      <p className="text-[13px] font-semibold text-app-text">{tr(locale, 'ყველა სცენა მზადაა', 'Every scene is ready', 'Все сцены готовы')}</p>
      <label className="flex items-center gap-2 text-[12.5px] text-app-text">
        <input type="checkbox" checked={music} onChange={(e) => setMusic(e.target.checked)} data-testid="dw-music" />
        {tr(locale, 'მუსიკა მთელ ფილმზე (დიალოგის ქვეშ)', 'Music for the whole film (under the dialogue)', 'Музыка на весь фильм (под диалогом)')}
      </label>
      {music && (
        <input className="w-full rounded-xl bg-app-surface px-3 py-2 text-[13px] text-app-text ring-1 ring-app-border/20" value={style} maxLength={DW_MUSIC_PROMPT_MAX}
          placeholder={tr(locale, 'მაგ.: კინემატოგრაფიული, რბილი პიანინო', 'e.g. cinematic, soft piano', 'например: кинематографичная, мягкое пианино')}
          aria-label={tr(locale, 'მუსიკის სტილი', 'Music style', 'Стиль музыки')} data-testid="dw-music-style" onChange={(e) => setStyle(e.target.value)} />
      )}
      {music && price && !price.available && (
        <p className="text-[12px] text-amber-500">{tr(locale, 'მუსიკა ახლა მიუწვდომელია.', 'Music is not available right now.', 'Музыка сейчас недоступна.')}</p>
      )}
      <button type="button" disabled={!canCut} onClick={() => void cut()} data-testid="dw-cut"
        className="min-h-[44px] w-full rounded-full bg-app-accent px-4 text-[13.5px] font-semibold text-app-bg disabled:opacity-50">
        {cutting
          ? tr(locale, 'ფილმი იწყობა…', 'Putting the film together…', 'Собираем фильм…')
          : film
            ? `${tr(locale, 'თავიდან აწყობა', 'Cut again', 'Собрать заново')}${musicLabel}`
            : `${tr(locale, 'საბოლოო მონტაჟი · უფასო', 'Final cut · free', 'Финальный монтаж · бесплатно')}${musicLabel}`}
      </button>
      {error && <p className="text-[12.5px] text-amber-500" role="alert" data-testid="dw-cut-error">{error}</p>}
      {film && (
        <div className="space-y-1">
          <video src={film.url} controls playsInline className="w-full rounded-xl bg-black" data-testid="dw-film" />
          <p className="text-[12px] text-app-muted" data-testid="dw-film-saved">
            {film.saved
              ? tr(locale, 'შენახულია ბიბლიოთეკაში.', 'Saved to your Library.', 'Сохранено в библиотеке.')
              : tr(locale, 'ბიბლიოთეკაში ვერ შეინახა: ჩამოტვირთე აქედან.', 'Not saved to the Library: download it from here.', 'Не сохранено в библиотеке: скачайте отсюда.')}
          </p>
        </div>
      )}
    </section>
  );
}
