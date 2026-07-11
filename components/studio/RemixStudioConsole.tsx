'use client';

/**
 * RemixStudioConsole — the "Remix Studio" progress panel, a sibling of the
 * FilmDirectorConsole rendered INLINE in the chatbot's remix bubble.
 *
 * Remix ops are ATOMIC fetches (POST /api/video/remix → one URL back), so there is
 * no real per-stage stream to subscribe to. Instead this is a CLIENT STAGED TIMER:
 * each op has a wall-clock estimate (color_grade ~45s · add_subtitles ~60s ·
 * add_music ~30s · speed_change ~20s …) split into weighted stages. As `elapsed`
 * grows the stages light up in turn and an eased overall bar climbs toward — but
 * never reaches — 100% until the real result lands (the bubble then swaps to the
 * video). Pure app-token palette so the dark theme + theming hold; sized
 * w-[min(88vw,460px)] so it never overflows a 375px phone.
 */
import { Wand2, Loader2, Check, Clock, Square, Upload, Paintbrush, Type, Music, Gauge, Scissors, Mic, Waves, UserCog, Film } from 'lucide-react';

type Loc = 'en' | 'ru' | 'ka';
const asLoc = (l: string): Loc => (l === 'ru' || l === 'ka' ? l : 'en');

const fmtClock = (sec: number): string => {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

type Stage = { icon: typeof Wand2; weight: number; label: Record<Loc, string> };
type OpPlan = { targetSec: number; title: Record<Loc, string>; stages: Stage[] };

const PREP: Stage = { icon: Upload, weight: 0.15, label: { en: 'Preparing clip', ru: 'Подготовка', ka: 'მომზადება' } };
const ENCODE: Stage = { icon: Film, weight: 0.2, label: { en: 'Encoding', ru: 'Кодирование', ka: 'კოდირება' } };

// Per-op estimate (s) + weighted stages. Estimates match the FIX 6 spec; ops not
// listed fall back to a generic 45s plan so every remix shows a real timeline.
const OP_PLANS: Record<string, OpPlan> = {
  color_grade: { targetSec: 45, title: { en: 'Color grade', ru: 'Цветокоррекция', ka: 'ფერის გრადაცია' }, stages: [PREP, { icon: Paintbrush, weight: 0.65, label: { en: 'Applying color grade', ru: 'Цветокоррекция', ka: 'ფერის გრადაცია' } }, ENCODE] },
  captions: { targetSec: 60, title: { en: 'Subtitles', ru: 'Субтитры', ka: 'სუბტიტრები' }, stages: [PREP, { icon: Type, weight: 0.4, label: { en: 'Rendering captions', ru: 'Рендер субтитров', ka: 'სუბტიტრების რენდერი' } }, { icon: Film, weight: 0.45, label: { en: 'Burning in', ru: 'Впекание', ka: 'ჩაწვა + კოდირება' } }] },
  music: { targetSec: 30, title: { en: 'Add music', ru: 'Добавить музыку', ka: 'მუსიკის დამატება' }, stages: [PREP, { icon: Music, weight: 0.6, label: { en: 'Mixing audio', ru: 'Сведение звука', ka: 'ხმის მიქსი' } }, ENCODE] },
  speed_change: { targetSec: 20, title: { en: 'Speed change', ru: 'Изменение скорости', ka: 'სიჩქარის ცვლა' }, stages: [PREP, { icon: Gauge, weight: 0.6, label: { en: 'Retiming', ru: 'Перерасчёт', ka: 'დროის გადათვლა' } }, ENCODE] },
  trim: { targetSec: 15, title: { en: 'Trim', ru: 'Обрезка', ka: 'მოჭრა' }, stages: [PREP, { icon: Scissors, weight: 0.6, label: { en: 'Cutting', ru: 'Обрезка', ka: 'ჭრა' } }, ENCODE] },
  voiceover: { targetSec: 40, title: { en: 'Voiceover', ru: 'Озвучка', ka: 'ვოისოვერი' }, stages: [PREP, { icon: Mic, weight: 0.5, label: { en: 'Synthesizing voice', ru: 'Синтез голоса', ka: 'ხმის სინთეზი' } }, { icon: Music, weight: 0.35, label: { en: 'Mixing + encoding', ru: 'Сведение', ka: 'მიქსი + კოდირება' } }] },
  redub: { targetSec: 90, title: { en: 'Redub (lip-sync)', ru: 'Переозвучка', ka: 'ხელახალი გახმოვანება' }, stages: [PREP, { icon: Mic, weight: 0.3, label: { en: 'Synthesizing voice', ru: 'Синтез голоса', ka: 'ხმის სინთეზი' } }, { icon: Waves, weight: 0.45, label: { en: 'Lip-syncing', ru: 'Синхрон губ', ka: 'ლიპსინკი' } }, ENCODE] },
  restyle: { targetSec: 60, title: { en: 'Restyle', ru: 'Рестайл', ka: 'რესტაილი' }, stages: [PREP, { icon: Paintbrush, weight: 0.4, label: { en: 'Restyling keyframe', ru: 'Рестайл кадра', ka: 'კადრის რესტაილი' } }, { icon: Film, weight: 0.45, label: { en: 'Re-animating', ru: 'Анимация', ka: 'ანიმაცია' } }] },
  character: { targetSec: 60, title: { en: 'Change character', ru: 'Смена персонажа', ka: 'პერსონაჟის შეცვლა' }, stages: [PREP, { icon: UserCog, weight: 0.4, label: { en: 'Swapping character', ru: 'Замена персонажа', ka: 'პერსონაჟის ცვლა' } }, { icon: Film, weight: 0.45, label: { en: 'Re-animating', ru: 'Анимация', ka: 'ანიმაცია' } }] },
};
// Chat-intent aliases → the same plans.
const OP_ALIASES: Record<string, string> = { add_music: 'music', add_subtitles: 'captions', add_text_overlay: 'captions', face_swap: 'character' };

const GENERIC: OpPlan = { targetSec: 45, title: { en: 'Remix', ru: 'Ремикс', ka: 'რემიქსი' }, stages: [PREP, { icon: Wand2, weight: 0.65, label: { en: 'Processing', ru: 'Обработка', ka: 'დამუშავება' } }, ENCODE] };

const TITLE: Record<Loc, string> = { en: 'Remix Studio', ru: 'Студия ремикса', ka: 'რემიქს სტუდია' };
const SUBTITLE: Record<Loc, string> = { en: 'AI editor · live', ru: 'ИИ-монтаж · в эфире', ka: 'AI მონტაჟი · ლაივი' };
const ELAPSED: Record<Loc, string> = { en: 'elapsed', ru: 'прошло', ka: 'გავიდა' };
const LEFT: Record<Loc, string> = { en: 'left', ru: 'осталось', ka: 'დარჩა' };

export default function RemixStudioConsole({
  op,
  elapsed = 0,
  locale,
  onCancel,
  stopLabel,
}: {
  /** The remix op being run (panel op name or a chat-intent alias). */
  op: string;
  /** Seconds since the op started — drives the staged timer + MM:SS clock. */
  elapsed?: number;
  locale: string;
  onCancel?: () => void;
  stopLabel?: string;
}) {
  const loc = asLoc(locale);
  const plan = OP_PLANS[OP_ALIASES[op] ?? op] ?? OP_PLANS[op] ?? GENERIC;
  const target = plan.targetSec;

  // Eased overall %: asymptotic toward 96 so it climbs fast then settles — it never
  // hits 100 until the real result lands and the bubble swaps to the video.
  const pct = Math.min(96, Math.round((1 - Math.exp((-1.8 * elapsed) / target)) * 100));
  const remaining = Math.max(0, Math.round(target - elapsed));

  // Which stage is active: walk the cumulative weights against progress fraction.
  const frac = Math.min(0.999, elapsed / target);
  let acc = 0;
  let activeIdx = 0;
  for (let i = 0; i < plan.stages.length; i += 1) {
    acc += plan.stages[i]!.weight;
    if (frac <= acc) { activeIdx = i; break; }
    activeIdx = i; // past the last threshold → stay on the last stage
  }

  return (
    <div className="w-[min(88vw,460px)] space-y-3 rounded-2xl border border-app-border/15 bg-app-elevated/55 p-4 shadow-[0_12px_40px_rgba(0,0,0,0.24)]">
      {/* Header — REC pulse + title + live clock + big % */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500/70" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
          </span>
          <div className="min-w-0">
            <p className="text-[13px] font-bold leading-tight text-app-text">{TITLE[loc]}</p>
            <p className="text-[10px] font-medium uppercase tracking-wider text-app-muted/70">{SUBTITLE[loc]} · {plan.title[loc]}</p>
          </div>
        </div>
        <div className="flex items-end gap-3">
          <div className="text-right leading-tight">
            <p className="flex items-center justify-end gap-1 text-[13px] font-semibold tabular-nums text-app-text">
              <Clock size={11} className="text-app-muted" />
              {fmtClock(elapsed)}
            </p>
            <p className="text-[9px] uppercase tracking-wider text-app-muted/60">
              {remaining > 0 ? `~${fmtClock(remaining)} ${LEFT[loc]}` : ELAPSED[loc]}
            </p>
          </div>
          <div className="flex items-baseline gap-0.5">
            <span className="text-[26px] font-bold leading-none tabular-nums text-app-text">{pct}</span>
            <span className="text-[13px] font-semibold text-app-muted">%</span>
          </div>
        </div>
      </div>

      {/* Overall progress bar + Cancel */}
      <div className="flex items-center gap-2">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-app-border/15">
          <div
            className="h-full rounded-full bg-gradient-to-r from-app-accent/70 to-app-accent transition-[width] duration-700 ease-out"
            style={{ width: `${Math.max(4, pct)}%` }}
          />
        </div>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            aria-label={stopLabel || 'Stop'}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-[11px] font-semibold text-red-400 transition-colors hover:bg-red-500/20 active:scale-[0.98] touch-manipulation"
          >
            <Square size={10} className="fill-current" /> {stopLabel || 'Stop'}
          </button>
        ) : null}
      </div>

      {/* Stage list — completed / processing / upcoming */}
      <div className="space-y-1.5">
        {plan.stages.map((stage, i) => {
          const done = i < activeIdx;
          const active = i === activeIdx;
          const Icon = stage.icon;
          const card = done
            ? 'border-emerald-500/30 bg-emerald-500/[0.06]'
            : active
              ? 'border-app-accent/40 bg-app-accent/[0.06] shadow-[0_0_0_1px_rgba(99,102,241,0.10)]'
              : 'border-app-border/15 bg-app-elevated/30 opacity-55';
          return (
            <div key={i} className={`flex items-center gap-2.5 rounded-xl border p-2.5 transition-colors duration-500 ${card}`}>
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-app-border/15">
                <Icon size={14} className={done || active ? 'text-app-text' : 'text-app-muted/60'} />
              </span>
              <p className="min-w-0 flex-1 truncate text-[11.5px] font-semibold text-app-text">{stage.label[loc]}</p>
              <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                {done ? <Check size={12} className="text-emerald-500" /> : active ? <Loader2 size={12} className="animate-spin text-app-accent" /> : <span className="h-[7px] w-[7px] rounded-full border border-app-muted/40" />}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
