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
import { Wand2, Loader2, Check, Upload, Paintbrush, Type, Music, Gauge, Scissors, Mic, Waves, UserCog, Film } from 'lucide-react';
import { GenerationProgress } from './ui/GenerationProgress';

type Loc = 'en' | 'ru' | 'ka';
const asLoc = (l: string): Loc => (l === 'ru' || l === 'ka' ? l : 'en');

type Stage = { icon: typeof Wand2; weight: number; label: Record<Loc, string> };
type OpPlan = { targetSec: number; title: Record<Loc, string>; stages: Stage[] };

const PREP: Stage = { icon: Upload, weight: 0.15, label: { en: 'Preparing clip', ru: 'Подготовка', ka: 'მომზადება' } };
const ENCODE: Stage = { icon: Film, weight: 0.2, label: { en: 'Encoding', ru: 'Кодирование', ka: 'კოდირება' } };

// Per-op estimate (s) + weighted stages; ops not listed fall back to a generic 45s plan so every remix
// shows a real timeline.
//
// ⚠️ THE PROVIDER-BACKED ESTIMATES WERE 3–9× SHORT. The corrected numbers come from the code's own
// budgets rather than from a guess:
//   · redub     → runLipsync polls for 240s, and the engine is the one LipsyncStudio measured in
//                 production at ~6 min. 90s was not an estimate of that, it was a wish.
//   · character → roopFaceSwapVideo carries a 540_000ms (nine-minute) budget, and on a miss the fallback
//                 runs an image model plus Kling i2v (KLING_BUDGET_MS = 240_000). 60s covered neither leg.
//   · restyle   → image model + Kling i2v, the same 240s budget.
// Erring long is safe and erring short is not: the bar eases toward 95% and never completes early, so an
// over-estimate merely arrives sooner than promised, while an under-estimate parks the user in front of a
// full bar and a zeroed countdown — which is precisely what "it's frozen, I'll reload" is made of.
// The ffmpeg-only ops (trim / speed / color_grade / music / stabilize) run locally and were already right.
const OP_PLANS: Record<string, OpPlan> = {
  color_grade: { targetSec: 45, title: { en: 'Color grade', ru: 'Цветокоррекция', ka: 'ფერის გრადაცია' }, stages: [PREP, { icon: Paintbrush, weight: 0.65, label: { en: 'Applying color grade', ru: 'Цветокоррекция', ka: 'ფერის გრადაცია' } }, ENCODE] },
  captions: { targetSec: 60, title: { en: 'Subtitles', ru: 'Субтитры', ka: 'სუბტიტრები' }, stages: [PREP, { icon: Type, weight: 0.4, label: { en: 'Rendering captions', ru: 'Рендер субтитров', ka: 'სუბტიტრების რენდერი' } }, { icon: Film, weight: 0.45, label: { en: 'Burning in', ru: 'Впекание', ka: 'ჩაწვა + კოდირება' } }] },
  music: { targetSec: 30, title: { en: 'Add music', ru: 'Добавить музыку', ka: 'მუსიკის დამატება' }, stages: [PREP, { icon: Music, weight: 0.6, label: { en: 'Mixing audio', ru: 'Сведение звука', ka: 'ხმის მიქსი' } }, ENCODE] },
  speed_change: { targetSec: 20, title: { en: 'Speed change', ru: 'Изменение скорости', ka: 'სიჩქარის ცვლა' }, stages: [PREP, { icon: Gauge, weight: 0.6, label: { en: 'Retiming', ru: 'Перерасчёт', ka: 'დროის გადათვლა' } }, ENCODE] },
  trim: { targetSec: 15, title: { en: 'Trim', ru: 'Обрезка', ka: 'მოჭრა' }, stages: [PREP, { icon: Scissors, weight: 0.6, label: { en: 'Cutting', ru: 'Обрезка', ka: 'ჭრა' } }, ENCODE] },
  voiceover: { targetSec: 40, title: { en: 'Voiceover', ru: 'Озвучка', ka: 'ვოისოვერი' }, stages: [PREP, { icon: Mic, weight: 0.5, label: { en: 'Synthesizing voice', ru: 'Синтез голоса', ka: 'ხმის სინთეზი' } }, { icon: Music, weight: 0.35, label: { en: 'Mixing + encoding', ru: 'Сведение', ka: 'მიქსი + კოდირება' } }] },
  redub: { targetSec: 300, title: { en: 'Redub (lip-sync)', ru: 'Переозвучка', ka: 'ხელახალი გახმოვანება' }, stages: [PREP, { icon: Mic, weight: 0.3, label: { en: 'Synthesizing voice', ru: 'Синтез голоса', ka: 'ხმის სინთეზი' } }, { icon: Waves, weight: 0.45, label: { en: 'Lip-syncing', ru: 'Синхрон губ', ka: 'ლიპსინკი' } }, ENCODE] },
  restyle: { targetSec: 200, title: { en: 'Restyle', ru: 'Рестайл', ka: 'რესტაილი' }, stages: [PREP, { icon: Paintbrush, weight: 0.4, label: { en: 'Restyling keyframe', ru: 'Рестайл кадра', ka: 'კადრის რესტაილი' } }, { icon: Film, weight: 0.45, label: { en: 'Re-animating', ru: 'Анимация', ka: 'ანიმაცია' } }] },
  character: { targetSec: 260, title: { en: 'Change character', ru: 'Смена персонажа', ka: 'პერსონაჟის შეცვლა' }, stages: [PREP, { icon: UserCog, weight: 0.4, label: { en: 'Swapping character', ru: 'Замена персонажа', ka: 'პერსონაჟის ცვლა' } }, { icon: Film, weight: 0.45, label: { en: 'Re-animating', ru: 'Анимация', ka: 'ანიმაცია' } }] },
};
// Chat-intent aliases → the same plans.
const OP_ALIASES: Record<string, string> = { add_music: 'music', add_subtitles: 'captions', add_text_overlay: 'captions', face_swap: 'character' };

const GENERIC: OpPlan = { targetSec: 45, title: { en: 'Remix', ru: 'Ремикс', ka: 'რემიქსი' }, stages: [PREP, { icon: Wand2, weight: 0.65, label: { en: 'Processing', ru: 'Обработка', ka: 'დამუშავება' } }, ENCODE] };

const TITLE: Record<Loc, string> = { en: 'Remix Studio', ru: 'Студия ремикса', ka: 'რემიქს სტუდია' };
const SUBTITLE: Record<Loc, string> = { en: 'AI editor · live', ru: 'ИИ-монтаж · в эфире', ka: 'AI მონტაჟი · ლაივი' };

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
    // ⚠️ THIS USED TO BE ITS OWN CARD — same idea as every other service's progress panel, but a different
    // shell, a different type scale and a different bar. Each service owning a private "a job is running"
    // design is precisely how a phone and a desktop ended up looking like two separate products.
    // The SHELL is shared now (chrome, live %, bar, clock, cancel); the weighted stage list below stays,
    // because it is what THIS console actually knows and a generic checklist does not.
    <GenerationProgress
      kind="remix"
      locale={loc}
      elapsed={elapsed}
      pct={pct}
      // ⚠️ PASS THE OP'S OWN TARGET. The card would otherwise fall back to the generic remix estimate,
      // discarding the per-op numbers this file documents at length (redub 300s because runLipsync polls
      // for 240s; character 260s because roopFaceSwapVideo carries a nine-minute budget). Erring long is
      // safe here and erring short is not — a zeroed countdown under a full bar is what "it's frozen,
      // I'll reload" is made of.
      targetSec={target}
      title={TITLE[loc]}
      subtitle={`${SUBTITLE[loc]} · ${plan.title[loc]}`}
      {...(onCancel ? { onCancel } : {})}
      {...(stopLabel ? { cancelLabel: stopLabel } : {})}
    >

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
    </GenerationProgress>
  );
}
