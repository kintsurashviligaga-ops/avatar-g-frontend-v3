'use client';

/**
 * Agent G's plan card for a music ask (Phase 8.5 PR C): "Create a sad piano track, 1 minute long, and add it to Scene 3
 * of my video." One price, two steps, nothing runs until Start:
 *   1. Make the track — the Music Producer price (charged only once the track arrived);
 *   2. Put it under Scene 3 (0:16 – 0:24) — free.
 * A place that does not exist (no film yet, scene 5 of a 3-scene film) is refused on the card, before any charge.
 * If step 2 misses after step 1, the track is kept (it was paid for) and the card says so plainly.
 */
import { useState } from 'react';
import { planAgentMusic, type AgentMusicPlan } from '@/lib/music/producer/agent';
import { specSummary } from '@/lib/music/producer/brief';
import { mmss } from '@/lib/music/producer/timeline';
import { LABELS } from '@/lib/music/producer/labels';
import type { ProducerBook } from '@/lib/music/producer/price';
import type { ProducerLang } from '@/lib/music/producer/spec';
import type { FilmTarget } from '@/lib/music/producer/videoTargets';
import { MusicCard, type MusicCardTrack } from './MusicCard';
import { lengthLabel } from './ProducerControls';
import { fetchPost, type ProducerPost } from './MusicProducerPanel';

const T = {
  plan: { ka: 'გეგმა', en: 'Plan', ru: 'План' },
  make: { ka: 'ტრეკის შექმნა', en: 'Make the track', ru: 'Создать трек' },
  placeScene: { ka: 'სცენა', en: 'Put it under Scene', ru: 'Поставить под сцену' },
  placeFilm: { ka: 'მთელ ფილმზე დადება', en: 'Put it under the whole film', ru: 'Поставить под весь фильм' },
  montage: { ka: 'მონტაჟში გახსნა', en: 'Open it in Montage', ru: 'Открыть в монтаже' },
  free: { ka: 'უფასო', en: 'free', ru: 'бесплатно' },
  start: { ka: 'დაწყება', en: 'Start', ru: 'Начать' },
  working: { ka: 'მუშავდება…', en: 'Working…', ru: 'В работе…' },
  noFilm: { ka: 'ფილმი ვერ ვიპოვე. ჯერ შექმენი ფილმი რეჟისორის რეჟიმში — არაფერი ჩამოგეჭრა.', en: 'I could not find a film yet. Make one in Director\'s Workflow first. Nothing was charged.', ru: 'Фильм не найден. Сначала создайте его в режиме режиссёра. Ничего не списано.' },
  noScene: { ka: 'შენს ფილმში მხოლოდ {n} სცენაა — არაფერი ჩამოგეჭრა.', en: 'Your film has only {n} scenes. Nothing was charged.', ru: 'В фильме только {n} сцен(ы). Ничего не списано.' },
  longer: { ka: 'სცენა უფრო მოკლეა: ტრეკი სცენაზე მოიჭრება, სრული ბიბლიოთეკაში დარჩება.', en: 'The scene is shorter: the track is trimmed to it, and the full track stays in your Library.', ru: 'Сцена короче: трек обрезается под неё, полный остаётся в библиотеке.' },
  cheaper: { ka: 'საკმარისია {len} · ✦{c}', en: '{len} is enough · ✦{c}', ru: 'Хватит {len} · ✦{c}' },
  placeMissed: { ka: 'ტრეკი მზადაა და ბიბლიოთეკაშია, მაგრამ ფილმში ვერ დაემატა. სცადე „ვიდეოში გამოყენება".', en: 'The track is ready and in your Library, but it could not be placed in the film. Try "Use in Video".', ru: 'Трек готов и в библиотеке, но не добавлен в фильм. Попробуйте «Использовать в видео».' },
  placed: { ka: 'ფილმი მზადაა. ორიგინალიც შენახულია.', en: 'The film is ready. The original is kept too.', ru: 'Фильм готов. Исходник тоже сохранён.' },
} as const;

type Run = { kind: 'idle' } | { kind: 'busy'; step: 1 | 2 } | { kind: 'done'; track: MusicCardTrack; filmUrl: string | null; placeMissed: boolean } | { kind: 'error'; text: string };

export function MusicPlanCard({ text, film, book, lang, post = fetchPost, onCharged, onOpenMontage }: {
  text: string;
  film: FilmTarget | null;
  book: ProducerBook;
  lang: ProducerLang;
  post?: ProducerPost;
  onCharged?: (credits: number) => void;
  onOpenMontage?: (musicUrl: string) => void;
}) {
  const [plan, setPlan] = useState<AgentMusicPlan>(() => planAgentMusic(text, { film, book }));
  const [run, setRun] = useState<Run>({ kind: 'idle' });

  if (!plan.ok) {
    if (plan.reason === 'not_music') return null;
    const msg = plan.reason === 'no_film' ? T.noFilm[lang] : T.noScene[lang].replace('{n}', String(plan.scenes ?? 0));
    return <div data-testid="mp-plan-refused" role="status" className="rounded-2xl border border-app-border/15 bg-app-elevated/45 p-4 text-[13px] text-app-muted">{msg}</div>;
  }

  const useCheaper = () => {
    if (!plan.ok || !('cheaper' in plan) || !plan.cheaper) return;
    const c = plan.cheaper;
    setPlan({ ...plan, spec: { ...plan.spec, lengthSec: c.lengthSec }, credits: c.credits, cheaper: null, notes: plan.notes.filter((n) => n !== 'longer_than_scene') });
  };

  const start = async () => {
    if (!plan.ok) return;
    setRun({ kind: 'busy', step: 1 });
    const r = await post('/api/music/producer', { action: 'generate', spec: plan.spec }).catch(() => null);
    const j = (r?.json ?? {}) as { ok?: boolean; id?: string; url?: string; meta?: MusicCardTrack['meta']; charged?: number; error?: string };
    if (!r?.ok || !j.ok || !j.id || !j.url || !j.meta) { setRun({ kind: 'error', text: LABELS.refunded[lang] }); return; }
    const track: MusicCardTrack = { id: j.id, url: j.url, meta: j.meta };
    if (j.charged) onCharged?.(j.charged);
    if (!plan.target || plan.target.kind === 'montage' || !plan.film) {
      setRun({ kind: 'done', track, filmUrl: null, placeMissed: false });
      if (plan.target?.kind === 'montage') onOpenMontage?.(track.url);
      return;
    }
    setRun({ kind: 'busy', step: 2 });
    const p = await post('/api/music/producer/place', {
      trackId: track.id, target: plan.target, span: plan.span,
      film: { projectId: plan.film.projectId, filmUrl: plan.film.filmUrl, scenes: plan.film.scenes },
    }).catch(() => null);
    const pj = (p?.json ?? {}) as { ok?: boolean; url?: string };
    setRun({ kind: 'done', track, filmUrl: p?.ok && pj.ok && pj.url ? pj.url : null, placeMissed: !(p?.ok && pj.ok && pj.url) });
  };

  const target = plan.target;
  const where = target && target.kind !== 'montage' && 'window' in plan && plan.window
    ? `${target.kind === 'scene' ? `${T.placeScene[lang]} ${target.scene}` : T.placeFilm[lang]} (${mmss(plan.window.start)} – ${mmss(plan.window.end)})`
    : target?.kind === 'montage' ? T.montage[lang] : null;
  const busy = run.kind === 'busy';
  return (
    <div data-testid="mp-plan" className="space-y-3 rounded-2xl border border-app-border/15 bg-app-elevated/60 p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-app-muted">{T.plan[lang]}</div>
      <ol className="space-y-1.5 text-[14px]">
        <li data-testid="mp-plan-step-1" className={`flex justify-between gap-2 ${run.kind === 'busy' && run.step === 1 ? 'text-app-text' : 'text-app-muted'}`}>
          <span>1. {T.make[lang]}: {specSummary(plan.spec, lang)}</span><span className="tabular-nums text-app-text">✦{plan.credits}</span>
        </li>
        {where && (
          <li data-testid="mp-plan-step-2" className={`flex justify-between gap-2 ${run.kind === 'busy' && run.step === 2 ? 'text-app-text' : 'text-app-muted'}`}>
            <span>2. {where}</span><span>{T.free[lang]}</span>
          </li>
        )}
      </ol>
      {'notes' in plan && plan.notes.includes('longer_than_scene') && <p data-testid="mp-plan-longer" className="text-[12px] text-app-muted">{T.longer[lang]}</p>}
      {'cheaper' in plan && plan.cheaper && run.kind === 'idle' && (
        <button type="button" data-testid="mp-plan-cheaper" onClick={useCheaper}
          className="rounded-full border border-app-border/25 px-3 py-1.5 text-[12px] text-app-muted hover:bg-app-border/10">
          {T.cheaper[lang].replace('{len}', lengthLabel(plan.cheaper.lengthSec, lang)).replace('{c}', String(plan.cheaper.credits))}
        </button>
      )}
      {run.kind !== 'done' && (
        <button type="button" data-testid="mp-plan-start" disabled={busy} onClick={start}
          className="rounded-full bg-app-accent px-5 py-2 text-[14px] font-semibold text-white disabled:opacity-40">
          {busy ? T.working[lang] : `${T.start[lang]} · ✦${plan.credits}`}
        </button>
      )}
      {run.kind === 'error' && <p role="alert" data-testid="mp-plan-error" className="text-[13px] text-red-300">{run.text}</p>}
      {run.kind === 'done' && (
        <div className="space-y-3">
          <MusicCard track={run.track} lang={lang} busy={false} extendCredits={0} restyleCredits={0} onExtend={() => undefined} onRestyle={() => undefined} actions={false} />
          {run.filmUrl && (
            <div data-testid="mp-plan-film" className="space-y-1">
              <video src={run.filmUrl} controls playsInline className="w-full rounded-xl" />
              <p className="text-[12px] text-app-muted">{T.placed[lang]}</p>
            </div>
          )}
          {run.placeMissed && <p role="status" data-testid="mp-plan-place-missed" className="text-[13px] text-amber-200">{T.placeMissed[lang]}</p>}
        </div>
      )}
    </div>
  );
}
