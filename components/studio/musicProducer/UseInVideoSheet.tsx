'use client';

/**
 * "Use in Video" (Phase 8.5 PR C): pick where the track goes — a scene of a Director's Workflow film (trimmed to that
 * scene, or running to the end), the whole film, or the Montage editor. Shows exactly where it lands ("Scene 3 · 0:16 –
 * 0:24") and that placing it is free; the new film plays right here. The original film is kept.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { filmTargets, subscribeFilmTargets, type FilmTarget } from '@/lib/music/producer/videoTargets';
import { planCue, sceneWindow, montageHandoff, type CueSpan, type CueTarget } from '@/lib/music/producer/placement';
import { mmss } from '@/lib/music/producer/timeline';
import type { ProducerLang } from '@/lib/music/producer/spec';
import { chip } from './ProducerControls';
import type { MusicCardTrack } from './MusicCard';
import type { ProducerPost } from './MusicProducerPanel';

const T = {
  title: { ka: 'ვიდეოში გამოყენება', en: 'Use in Video', ru: 'Использовать в видео' },
  close: { ka: 'დახურვა', en: 'Close', ru: 'Закрыть' },
  noFilm: { ka: 'ჯერ ფილმი არ გაქვს. შექმენი ფილმი რეჟისორის რეჟიმში და აქ გამოჩნდება.', en: 'No film yet. Make one in Director\'s Workflow and it shows up here.', ru: 'Фильма пока нет. Создайте его в режиме режиссёра, и он появится здесь.' },
  scene: { ka: 'სცენა', en: 'Scene', ru: 'Сцена' },
  whole: { ka: 'მთელი ფილმი', en: 'Whole film', ru: 'Весь фильм' },
  onlyScene: { ka: 'მხოლოდ ამ სცენაში', en: 'This scene only', ru: 'Только эта сцена' },
  toEnd: { ka: 'ფილმის ბოლომდე', en: 'Until the end', ru: 'До конца фильма' },
  place: { ka: 'დადება · უფასოა', en: 'Place it · free', ru: 'Добавить · бесплатно' },
  placing: { ka: 'ემატება…', en: 'Mixing…', ru: 'Сведение…' },
  montage: { ka: 'მონტაჟში გახსნა', en: 'Open in Montage', ru: 'Открыть в монтаже' },
  mixNote: { ka: 'მუსიკა 6 dB-ით დაბლაა და საუბრისას კიდევ ჩუმდება. 0.5 წმ შესვლა/გასვლა.', en: 'Music sits 6 dB under the film and dips further while someone speaks. 0.5 s fade in and out.', ru: 'Музыка на 6 дБ тише фильма и ещё тише, когда говорят. Плавный вход и выход 0,5 с.' },
  trimmed: { ka: 'ტრეკი სცენაზე გრძელია: დანარჩენი ბიბლიოთეკაში რჩება.', en: 'The track is longer than the scene: it is trimmed, and the full track stays in your Library.', ru: 'Трек длиннее сцены: он обрезан, полный трек остаётся в библиотеке.' },
  shorter: { ka: 'ტრეკი ფილმზე მოკლეა: ერთხელ დაუკრავს და ჩაქრება.', en: 'The track is shorter than the film: it plays once and fades out.', ru: 'Трек короче фильма: играет один раз и затихает.' },
  done: { ka: 'მზადაა. ორიგინალი ფილმიც შენახულია.', en: 'Done. The original film is kept too.', ru: 'Готово. Исходный фильм тоже сохранён.' },
  failed: { ka: 'ვერ დაემატა. არაფერი ჩამოგეჭრა.', en: 'Could not place it. Nothing was charged.', ru: 'Не удалось добавить. Ничего не списано.' },
  noScene: { ka: 'ფილმში ეს სცენა არ არის.', en: 'That scene is not in the film.', ru: 'В фильме нет такой сцены.' },
} as const;

const empty: FilmTarget[] = [];
export function useFilmTargets(): FilmTarget[] {
  return useSyncExternalStore(subscribeFilmTargets, filmTargets, () => empty);
}

export function UseInVideoSheet({ track, lang, post, onClose, onOpenMontage, initial }: {
  track: MusicCardTrack;
  lang: ProducerLang;
  post: ProducerPost;
  onClose: () => void;
  onOpenMontage?: (handoff: ReturnType<typeof montageHandoff>) => void;
  initial?: { target: CueTarget; span?: CueSpan };
}) {
  const films = useFilmTargets();
  const [projectId, setProjectId] = useState<string | null>(films[0]?.projectId ?? null);
  const [target, setTarget] = useState<CueTarget>(initial?.target ?? { kind: 'scene', scene: 1 });
  const [span, setSpan] = useState<CueSpan>(initial?.span ?? 'scene');
  const [state, setState] = useState<{ kind: 'idle' } | { kind: 'busy' } | { kind: 'done'; url: string } | { kind: 'error'; text: string }>({ kind: 'idle' });
  useEffect(() => { if (!projectId && films[0]) setProjectId(films[0].projectId); }, [films, projectId]);
  const film = films.find((f) => f.projectId === projectId) ?? null;
  const cue = film ? planCue({ scenes: film.scenes, target, span, trackSec: track.meta.durationSec }) : null;

  const place = async () => {
    if (!film || !cue?.ok) return;
    setState({ kind: 'busy' });
    const r = await post('/api/music/producer/place', {
      trackId: track.id, target, span, film: { projectId: film.projectId, filmUrl: film.filmUrl, scenes: film.scenes },
    }).catch(() => null);
    const j = (r?.json ?? {}) as { ok?: boolean; url?: string; error?: string };
    if (r?.ok && j.ok && j.url) setState({ kind: 'done', url: j.url });
    else setState({ kind: 'error', text: j.error === 'no_scene' ? T.noScene[lang] : T.failed[lang] });
  };

  return (
    <div data-testid="mp-use-sheet" role="dialog" aria-label={T.title[lang]} className="space-y-3 rounded-xl border border-app-accent/25 bg-app-bg/60 p-3">
      <div className="flex items-center justify-between">
        <h4 className="text-[13px] font-semibold text-app-text">{T.title[lang]}</h4>
        <button type="button" onClick={onClose} aria-label={T.close[lang]} className="text-app-muted hover:text-app-text">×</button>
      </div>
      {!film && <p data-testid="mp-no-film" className="text-[13px] text-app-muted">{T.noFilm[lang]}</p>}
      {films.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {films.map((f) => <button key={f.projectId} type="button" aria-pressed={f.projectId === projectId} onClick={() => setProjectId(f.projectId)} className={chip(f.projectId === projectId)}>{f.title}</button>)}
        </div>
      )}
      {film && (
        <>
          <div className="flex flex-wrap gap-1.5">
            {[...film.scenes].sort((a, b) => a.order - b.order).map((_, i) => {
              const n = i + 1;
              const on = target.kind === 'scene' && target.scene === n;
              const w = sceneWindow(film.scenes, n);
              return (
                <button key={n} type="button" aria-pressed={on} data-testid={`mp-use-scene-${n}`} onClick={() => setTarget({ kind: 'scene', scene: n })} className={chip(on)}>
                  {T.scene[lang]} {n}{film.sceneTitles?.[i] ? ` · ${film.sceneTitles[i]}` : ''}{w ? <span className="tabular-nums text-app-muted"> {mmss(w.start)}</span> : null}
                </button>
              );
            })}
            <button type="button" aria-pressed={target.kind === 'film'} data-testid="mp-use-film" onClick={() => setTarget({ kind: 'film' })} className={chip(target.kind === 'film')}>{T.whole[lang]}</button>
          </div>
          {target.kind === 'scene' && (
            <div className="flex gap-1.5">
              <button type="button" aria-pressed={span === 'scene'} data-testid="mp-span-scene" onClick={() => setSpan('scene')} className={chip(span === 'scene')}>{T.onlyScene[lang]}</button>
              <button type="button" aria-pressed={span === 'to_end'} data-testid="mp-span-end" onClick={() => setSpan('to_end')} className={chip(span === 'to_end')}>{T.toEnd[lang]}</button>
            </div>
          )}
          {cue?.ok && (
            <div data-testid="mp-cue" className="space-y-1 text-[12px] text-app-muted">
              <p className="tabular-nums text-app-text">{mmss(cue.cue.startSec)} – {mmss(cue.cue.startSec + cue.cue.durSec)}</p>
              <p>{T.mixNote[lang]}</p>
              {cue.cue.notes.includes('trimmed_to_scene') && <p data-testid="mp-cue-trimmed">{T.trimmed[lang]}</p>}
              {cue.cue.notes.includes('track_shorter_than_film') && <p data-testid="mp-cue-shorter">{T.shorter[lang]}</p>}
            </div>
          )}
        </>
      )}
      <div className="flex flex-wrap gap-2">
        {film && (
          <button type="button" data-testid="mp-place" disabled={!cue?.ok || state.kind === 'busy'} onClick={place}
            className="rounded-full bg-app-accent px-4 py-2 text-[13px] font-medium text-white disabled:opacity-40">
            {state.kind === 'busy' ? T.placing[lang] : T.place[lang]}
          </button>
        )}
        {onOpenMontage && (
          <button type="button" data-testid="mp-open-montage" onClick={() => onOpenMontage(montageHandoff(track.url))} className={chip(false)}>{T.montage[lang]}</button>
        )}
      </div>
      {state.kind === 'done' && (
        <div data-testid="mp-placed" className="space-y-1">
          <video src={state.url} controls playsInline className="w-full rounded-lg" />
          <p className="text-[12px] text-app-muted">{T.done[lang]}</p>
        </div>
      )}
      {state.kind === 'error' && <p role="alert" data-testid="mp-place-error" className="text-[12px] text-red-300">{state.text}</p>}
    </div>
  );
}
