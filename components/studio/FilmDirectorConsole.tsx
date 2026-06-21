'use client';

/**
 * FilmDirectorConsole — the Master-Prompt "Director's Console" rendered INLINE in
 * the chatbot's video bubble. It visualizes the 9-agent roster while a 30-second
 * film renders, driven by the *real* pipeline matrix (via `deriveFilmRoster`), not
 * a fake timer. The active production chain (director → storyboard →
 * cinematographer → narrator/sound → editor) lights up from real per-leg status;
 * the dormant specialists (lip-sync, graphics, remix-AI) sit in standby and glow
 * only in their own flows.
 */
import {
  Clapperboard,
  Film,
  Video,
  Mic,
  Music,
  Scissors,
  Waves,
  Layers,
  Wand2,
  Loader2,
  Check,
  AlertTriangle,
} from 'lucide-react';
import { useEffect, useRef } from 'react';
import {
  deriveFilmRoster,
  overallFilmPct,
  type FilmAgentVM,
  type FilmAgentId,
  type FilmAgentStatus,
  type FilmLogLine,
} from '@/lib/chat/filmAgentRoster';
import type { FilmStudioProgress } from '@/lib/chat/filmStudioClient';

type Loc = 'en' | 'ru' | 'ka';
const asLoc = (l: string): Loc => (l === 'ru' || l === 'ka' ? l : 'en');

const ICONS: Record<FilmAgentId, typeof Clapperboard> = {
  director: Clapperboard,
  storyboard: Film,
  video: Video,
  voice: Mic,
  sfx: Music,
  montage: Scissors,
  lipsync: Waves,
  overlay: Layers,
  remix: Wand2,
};

const LABELS: Record<FilmAgentId, Record<Loc, string>> = {
  director: { en: 'Director', ru: 'Режиссёр', ka: 'რეჟისორი' },
  storyboard: { en: 'Storyboard', ru: 'Раскадровка', ka: 'სცენარი' },
  video: { en: 'Cinematographer', ru: 'Оператор', ka: 'ოპერატორი' },
  voice: { en: 'Narrator', ru: 'Диктор', ka: 'ნარაცია' },
  sfx: { en: 'Sound Design', ru: 'Звук', ka: 'ხმა' },
  montage: { en: 'Editor', ru: 'Монтаж', ka: 'მონტაჟი' },
  lipsync: { en: 'Lip-Sync', ru: 'Липсинк', ka: 'ლიპსინკი' },
  overlay: { en: 'Graphics', ru: 'Графика', ka: 'გრაფიკა' },
  remix: { en: 'Remix AI', ru: 'Ремикс ИИ', ka: 'რემიქს AI' },
};

const STATUS_LABEL: Record<FilmAgentStatus, Record<Loc, string>> = {
  idle: { en: 'Standby', ru: 'Ожидание', ka: 'მზადყოფნა' },
  queued: { en: 'Queued', ru: 'В очереди', ka: 'რიგში' },
  processing: { en: 'Working', ru: 'В работе', ka: 'მუშაობს' },
  completed: { en: 'Done', ru: 'Готово', ka: 'მზადაა' },
  error: { en: 'Error', ru: 'Ошибка', ka: 'შეცდომა' },
};

// Adaptive per-agent micro-step text (Master-Prompt §P6) — what the agent is
// actually doing right now, not just its status. Falls back to the status label.
const MICRO: Partial<Record<FilmAgentId, { processing: Record<Loc, string>; completed: Record<Loc, string> }>> = {
  director: { processing: { en: 'Planning…', ru: 'Планирует…', ka: 'გეგმავს…' }, completed: { en: 'Scenes planned', ru: 'Сцены готовы', ka: 'სცენები მზადაა' } },
  storyboard: { processing: { en: 'Drawing frames…', ru: 'Кадры…', ka: 'კადრები…' }, completed: { en: 'Shot list locked', ru: 'Кадры готовы', ka: 'კადრები ჩაიკეტა' } },
  voice: { processing: { en: 'Recording VO…', ru: 'Озвучка…', ka: 'გახმოვანება…' }, completed: { en: 'Voiceover ready', ru: 'Озвучка готова', ka: 'გახმოვანება მზადაა' } },
  sfx: { processing: { en: 'Scoring…', ru: 'Музыка…', ka: 'მუსიკა…' }, completed: { en: 'Music + SFX', ru: 'Музыка и SFX', ka: 'მუსიკა + SFX' } },
  montage: { processing: { en: 'Stitching…', ru: 'Склейка…', ka: 'მონტაჟი…' }, completed: { en: 'Final cut', ru: 'Финал готов', ka: 'საბოლოო კადრი' } },
};

const TITLE: Record<Loc, string> = { en: "Director's Console", ru: 'Пульт режиссёра', ka: 'რეჟისორის პულტი' };
const SUBTITLE: Record<Loc, string> = {
  en: 'AI crew · live',
  ru: 'ИИ-команда · в эфире',
  ka: 'AI გუნდი · ლაივი',
};
const SCENES: Record<Loc, string> = { en: 'scenes', ru: 'сцен', ka: 'სცენა' };

// Per-status accent classes (kept inside the app-token palette so theming holds).
const STATUS_STYLE: Record<FilmAgentStatus, { card: string; pill: string; bar: string }> = {
  idle: {
    card: 'border-app-border/12 bg-app-elevated/30 opacity-55',
    pill: 'bg-app-border/15 text-app-muted/70',
    bar: 'bg-app-muted/30',
  },
  queued: {
    card: 'border-app-border/15 bg-app-elevated/40',
    pill: 'bg-amber-400/15 text-amber-500',
    bar: 'bg-amber-400/60',
  },
  processing: {
    card: 'border-app-accent/40 bg-app-accent/[0.06] shadow-[0_0_0_1px_rgba(99,102,241,0.10)]',
    pill: 'bg-app-accent/15 text-app-accent',
    bar: 'bg-gradient-to-r from-app-accent/70 to-app-accent',
  },
  completed: {
    card: 'border-emerald-500/30 bg-emerald-500/[0.06]',
    pill: 'bg-emerald-500/15 text-emerald-500',
    bar: 'bg-emerald-500/80',
  },
  error: {
    card: 'border-red-500/30 bg-red-500/[0.06]',
    pill: 'bg-red-500/15 text-red-500',
    bar: 'bg-red-500/70',
  },
};

function StatusIcon({ status }: { status: FilmAgentStatus }) {
  if (status === 'completed') return <Check size={11} className="text-emerald-500" />;
  if (status === 'error') return <AlertTriangle size={11} className="text-red-500" />;
  if (status === 'processing') return <Loader2 size={11} className="animate-spin text-app-accent" />;
  return <span className="h-[7px] w-[7px] rounded-full border border-app-muted/40" />;
}

function AgentCard({ agent, loc }: { agent: FilmAgentVM; loc: Loc }) {
  const Icon = ICONS[agent.id];
  const s = STATUS_STYLE[agent.status];
  const micro = MICRO[agent.id];
  const detail =
    agent.id === 'video' && (agent.status === 'processing' || agent.status === 'completed') && agent.total
      ? `${agent.ready ?? 0}/${agent.total} ${SCENES[loc]}`
      : micro && agent.status === 'processing'
        ? micro.processing[loc]
        : micro && agent.status === 'completed'
          ? micro.completed[loc]
          : STATUS_LABEL[agent.status][loc];
  const barWidth = agent.status === 'idle' ? 0 : Math.max(agent.status === 'queued' ? 0 : 8, agent.pct);
  return (
    <div className={`flex flex-col gap-1.5 rounded-xl border p-2.5 transition-colors duration-500 ${s.card}`}>
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-app-border/15">
          <Icon size={14} className={agent.status === 'idle' ? 'text-app-muted/60' : 'text-app-text'} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11.5px] font-semibold leading-tight text-app-text">{LABELS[agent.id][loc]}</p>
          <p className="truncate text-[10px] leading-tight text-app-muted">{detail}</p>
        </div>
        <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${s.pill}`}>
          <StatusIcon status={agent.status} />
        </span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-app-border/12">
        <div
          className={`h-full rounded-full transition-[width] duration-700 ease-out ${s.bar}`}
          style={{ width: `${barWidth}%` }}
        />
      </div>
    </div>
  );
}

const FEED: Record<Loc, string> = { en: 'Live feed', ru: 'Лента', ka: 'ლაივ ფიდი' };

/** Master-Prompt §P4 — the streaming activity log terminal. Auto-scrolls to newest. */
function LogTerminal({ log, loc }: { log: FilmLogLine[]; loc: Loc }) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [log.length]);
  if (!log.length) return null;
  return (
    <div>
      <p className="mb-1 flex items-center gap-1.5 text-[9.5px] font-semibold uppercase tracking-wider text-app-muted/70">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
        {FEED[loc]}
      </p>
      <div className="max-h-[120px] overflow-y-auto rounded-lg border border-app-border/12 bg-black/25 p-2">
        <div className="space-y-0.5 font-mono">
          {log.map((l) => (
            <div key={l.key} className="flex items-start gap-1.5 text-[10.5px] leading-snug">
              <span className="shrink-0">{l.icon}</span>
              <span className="text-app-text/85">{l.text}</span>
            </div>
          ))}
          <div ref={endRef} className="flex items-center pt-0.5">
            <span className="inline-block h-2.5 w-1.5 animate-pulse bg-app-accent/70" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function FilmDirectorConsole({
  roster,
  progress,
  log,
  statusText,
  locale,
}: {
  /** Pre-derived roster from the live message; falls back to deriving from `progress`. */
  roster?: FilmAgentVM[];
  progress?: FilmStudioProgress | null;
  /** Accumulated activity-log lines (Master-Prompt §P4). */
  log?: FilmLogLine[];
  statusText?: string;
  locale: string;
}) {
  const loc = asLoc(locale);
  const list = roster && roster.length ? roster : deriveFilmRoster(progress ?? null);
  const pct = overallFilmPct(list);
  const anyWorking = list.some((a) => a.status === 'processing');

  return (
    <div className="w-[min(88vw,460px)] space-y-3 rounded-2xl border border-app-border/15 bg-app-elevated/55 p-4 shadow-[0_12px_40px_rgba(0,0,0,0.24)]">
      {/* Header — REC pulse + title + big live overall % */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2.5 w-2.5">
            {anyWorking && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500/70" />}
            <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${anyWorking ? 'bg-red-500' : 'bg-app-muted/50'}`} />
          </span>
          <div className="min-w-0">
            <p className="text-[13px] font-bold leading-tight text-app-text">{TITLE[loc]}</p>
            <p className="text-[10px] font-medium uppercase tracking-wider text-app-muted/70">{SUBTITLE[loc]}</p>
          </div>
        </div>
        <div className="flex items-baseline gap-0.5">
          <span className="text-[26px] font-bold leading-none tabular-nums text-app-text">{pct}</span>
          <span className="text-[13px] font-semibold text-app-muted">%</span>
        </div>
      </div>

      {/* Overall progress bar */}
      <div className="h-2 w-full overflow-hidden rounded-full bg-app-border/12">
        <div
          className="h-full rounded-full bg-gradient-to-r from-app-accent/70 to-app-accent transition-[width] duration-700 ease-out"
          style={{ width: `${Math.max(4, pct)}%` }}
        />
      </div>

      {/* 9-agent crew grid */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {list.map((agent) => (
          <AgentCard key={agent.id} agent={agent} loc={loc} />
        ))}
      </div>

      {/* Live status line (the pipeline's streamed headline) */}
      {statusText && statusText.trim() ? (
        <div className="flex items-center gap-2 rounded-lg bg-app-border/10 px-2.5 py-1.5">
          <Loader2 size={12} className="shrink-0 animate-spin text-app-accent" />
          <span className="truncate text-[11.5px] font-medium text-app-text">{statusText.trim()}</span>
        </div>
      ) : null}

      {/* Streaming activity log — the crew narrates its work in real time */}
      {log && log.length ? <LogTerminal log={log} loc={loc} /> : null}
    </div>
  );
}
