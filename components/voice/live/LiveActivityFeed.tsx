'use client';

/**
 * LiveActivityFeed — the call screen's "what Agent G is doing" strip, between the status line and the captions:
 *
 *   · a web search: "Searching the web · ‘weather in Tbilisi’" with a spinner, then "Searched" and the pages the
 *     answer stands on as small chips (they open in a new tab — the call keeps running);
 *   · each tool step (prepare a studio, put code on screen, open a studio, end the call): running → ✓ / failed;
 *   · generations still rendering (the job tray, which the full-screen call covers): label + a progress bar.
 *
 * Newest first, at most three rows of steps plus two jobs, so it never pushes the captions off a phone screen. The
 * newest row is the step the agent is on NOW: it is lifted (the accent ring, full opacity, a running bar under it while
 * it runs) and the older ones step back, so "what is it doing" reads at a glance. Pure presentation; the data comes from
 * useGeminiLiveSession().activity and the job queue (GeminiLiveConversation). Georgian keeps the product's 16 px floor.
 *
 * liveCurrentStep() is the same "now" for the docked call (LiveDock's line): the running step, else the newest one with
 * how it ended — so the dock can show a spinner, then a check.
 */
import {
  AlertCircle, ArrowUpDown, Check, Clapperboard, Code2, Cpu, Eye, Globe, Loader2, MessageSquare, Monitor, PanelRight, PhoneOff, Play,
  MessageSquarePlus, Search, SlidersHorizontal, Sparkles, Square, Wand2, X,
} from 'lucide-react';
import type { ReactNode } from 'react';

import { newestFirst, sourceLabel, type LiveActivityItem, type LiveActivityState } from './liveActivity';

type Locale = 'ka' | 'en' | 'ru';

/** A generation in flight, as the job tray knows it. */
export interface LiveJobLine {
  id: string;
  label: string;
  /** 0–100, or null while queued. */
  pct: number | null;
  stage?: string | null;
}

interface Strings {
  region: string;
  searching: string;
  searched: string;
  tools: Record<string, { running: string; done: string }>;
  tool: { running: string; done: string };
  failed: string;
  cancelled: string;
  jobs: string;
  queued: string;
}

const S: Record<Locale, Strings> = {
  ka: {
    region: 'აგენტის მოქმედებები',
    searching: 'ვეძებ ინტერნეტში',
    searched: 'მოვიძიე ინტერნეტში',
    tools: {
      prepare_generation: { running: 'სტუდიას ვამზადებ', done: 'სტუდია მზადაა' },
      show_code: { running: 'კოდს ეკრანზე ვწერ', done: 'კოდი ეკრანზეა' },
      open_studio: { running: 'სტუდიას ვხსნი', done: 'სტუდია გახსნილია' },
      end_call: { running: 'ზარს ვასრულებ', done: 'ზარი სრულდება' },
      get_screen_state: { running: 'ეკრანს ვკითხულობ', done: 'ეკრანი წავიკითხე' },
      update_settings: { running: 'პარამეტრებს ვცვლი', done: 'პარამეტრები შეიცვალა' },
      start_generation: { running: 'გენერაციას ვიწყებ', done: 'გენერაცია იწყება' },
      chat_send: { running: 'ჩატში ვწერ', done: 'ჩატში დაიწერა' },
      new_chat: { running: 'ახალ ჩატს ვხსნი', done: 'ახალი ჩატი' },
      set_chat_model: { running: 'მოდელს ვცვლი', done: 'მოდელი შეიცვალა' },
      stop: { running: 'ვაჩერებ', done: 'შეჩერდა' },
      scroll_chat: { running: 'ჩატს ვაგორებ', done: 'ჩატი გადავაგორე' },
      open_panel: { running: 'პანელს ვხსნი', done: 'პანელი გაიხსნა' },
      call_view: { running: 'ხედს ვცვლი', done: 'ხედი შეიცვალა' },
      open_url: { running: 'ბმულს ვამზადებ', done: 'ბმული ეკრანზეა — შეეხე' },
    },
    tool: { running: 'ვასრულებ', done: 'შესრულდა' },
    failed: 'ვერ შესრულდა',
    cancelled: 'გაუქმდა',
    jobs: 'მზადდება',
    queued: 'რიგში',
  },
  en: {
    region: 'What the agent is doing',
    searching: 'Searching the web',
    searched: 'Searched the web',
    tools: {
      prepare_generation: { running: 'Preparing the studio', done: 'Studio prepared' },
      show_code: { running: 'Putting code on screen', done: 'Code on screen' },
      open_studio: { running: 'Opening the studio', done: 'Studio opened' },
      end_call: { running: 'Ending the call', done: 'Ending the call' },
      get_screen_state: { running: 'Reading the screen', done: 'Read the screen' },
      update_settings: { running: 'Changing settings', done: 'Settings changed' },
      start_generation: { running: 'Starting the generation', done: 'Generation starting' },
      chat_send: { running: 'Writing in the chat', done: 'Written in the chat' },
      new_chat: { running: 'Opening a new chat', done: 'New chat' },
      set_chat_model: { running: 'Switching the model', done: 'Model switched' },
      stop: { running: 'Stopping', done: 'Stopped' },
      scroll_chat: { running: 'Scrolling the chat', done: 'Scrolled' },
      open_panel: { running: 'Opening a panel', done: 'Panel open' },
      call_view: { running: 'Changing the view', done: 'View changed' },
      open_url: { running: 'Getting the link ready', done: 'Link on screen — tap it' },
    },
    tool: { running: 'Working', done: 'Done' },
    failed: 'Didn’t work',
    cancelled: 'Cancelled',
    jobs: 'In progress',
    queued: 'Queued',
  },
  ru: {
    region: 'Что делает агент',
    searching: 'Ищу в интернете',
    searched: 'Нашёл в интернете',
    tools: {
      prepare_generation: { running: 'Готовлю студию', done: 'Студия готова' },
      show_code: { running: 'Вывожу код на экран', done: 'Код на экране' },
      open_studio: { running: 'Открываю студию', done: 'Студия открыта' },
      end_call: { running: 'Завершаю звонок', done: 'Завершаю звонок' },
      get_screen_state: { running: 'Смотрю на экран', done: 'Экран прочитан' },
      update_settings: { running: 'Меняю настройки', done: 'Настройки изменены' },
      start_generation: { running: 'Запускаю генерацию', done: 'Генерация запускается' },
      chat_send: { running: 'Пишу в чат', done: 'Написано в чате' },
      new_chat: { running: 'Открываю новый чат', done: 'Новый чат' },
      set_chat_model: { running: 'Меняю модель', done: 'Модель изменена' },
      stop: { running: 'Останавливаю', done: 'Остановлено' },
      scroll_chat: { running: 'Прокручиваю чат', done: 'Прокручено' },
      open_panel: { running: 'Открываю панель', done: 'Панель открыта' },
      call_view: { running: 'Меняю вид', done: 'Вид изменён' },
      open_url: { running: 'Готовлю ссылку', done: 'Ссылка на экране — нажмите' },
    },
    tool: { running: 'Выполняю', done: 'Готово' },
    failed: 'Не получилось',
    cancelled: 'Отменено',
    jobs: 'В работе',
    queued: 'В очереди',
  },
};

const TOOL_ICON: Record<string, ReactNode> = {
  prepare_generation: <Wand2 size={16} aria-hidden />,
  show_code: <Code2 size={16} aria-hidden />,
  open_studio: <Sparkles size={16} aria-hidden />,
  end_call: <PhoneOff size={16} aria-hidden />,
  get_screen_state: <Eye size={16} aria-hidden />,
  update_settings: <SlidersHorizontal size={16} aria-hidden />,
  start_generation: <Play size={16} aria-hidden />,
  chat_send: <MessageSquare size={16} aria-hidden />,
  new_chat: <MessageSquarePlus size={16} aria-hidden />,
  set_chat_model: <Cpu size={16} aria-hidden />,
  stop: <Square size={16} aria-hidden />,
  scroll_chat: <ArrowUpDown size={16} aria-hidden />,
  open_panel: <PanelRight size={16} aria-hidden />,
  call_view: <Monitor size={16} aria-hidden />,
  open_url: <Globe size={16} aria-hidden />,
};

/**
 * One line for the docked call: the step running now („ეკრანს ვკითხულობ“, „ვეძებ ინტერნეტში: …“), or null when the agent
 * is not in the middle of anything.
 */
export function liveActivityLine(activity: readonly LiveActivityItem[], locale: Locale = 'ka'): string | null {
  const t = S[locale] ?? S.ka;
  const running = newestFirst(activity).find((it) => it.state === 'running');
  if (!running) return null;
  if (running.kind === 'search') {
    const q = running.queries?.[0];
    return q ? `${t.searching}: ${q}` : t.searching;
  }
  return (running.name && t.tools[running.name]?.running) || t.tool.running;
}

/** The words for one step: running ("Preparing the studio…"), done, failed or cancelled — in plain language. */
function stepWords(it: LiveActivityItem, t: Strings): string {
  if (it.kind === 'search') return it.state === 'running' ? t.searching : t.searched;
  const copy = (it.name && t.tools[it.name]) || t.tool;
  if (it.state === 'failed') return `${copy.running} — ${t.failed}`;
  if (it.state === 'cancelled') return `${copy.running} — ${t.cancelled}`;
  return it.state === 'running' ? `${copy.running}…` : copy.done;
}

/** The step the agent is on, for one line: what it is, how it stands, and the words to show. */
export interface LiveStep {
  id: string;
  kind: LiveActivityItem['kind'];
  name?: string;
  state: LiveActivityState;
  text: string;
}

/**
 * The agent's step NOW: the newest running one („სტუდიას ვამზადებ…“, „ვეძებ ინტერნეტში: ‘…’“), else the newest step with
 * how it ended („სტუდია მზადაა“ ✓) — or null before the first one.
 */
export function liveCurrentStep(activity: readonly LiveActivityItem[], locale: Locale = 'ka'): LiveStep | null {
  const t = S[locale] ?? S.ka;
  const ordered = newestFirst(activity);
  const it = ordered.find((x) => x.state === 'running') ?? ordered[0];
  if (!it) return null;
  const q = it.kind === 'search' ? it.queries?.[0] : undefined;
  const words = stepWords(it, t);
  return { id: it.id, kind: it.kind, ...(it.name ? { name: it.name } : {}), state: it.state, text: q ? `${words}: ‘${q}’` : words };
}

/** The 16 px icon for a step (a search, or the function it ran). */
export function liveStepIcon(step: Pick<LiveStep, 'kind' | 'name'>): ReactNode {
  if (step.kind === 'search') return <Search size={16} aria-hidden />;
  return (step.name && TOOL_ICON[step.name]) || <Sparkles size={16} aria-hidden />;
}

/** Running → a spinner (still under reduced motion); done → a check; failed → a warning; cancelled → ✕. */
export function LiveStepMark({ state, size = 16 }: { state: LiveActivityState; size?: number }) {
  if (state === 'running') return <Loader2 size={size} data-mark="running" className="shrink-0 animate-spin text-app-accent motion-reduce:animate-none" aria-hidden />;
  if (state === 'done') return <Check size={size} data-mark="done" className="shrink-0 text-emerald-400" aria-hidden />;
  if (state === 'failed') return <AlertCircle size={size} data-mark="failed" className="shrink-0 text-amber-400" aria-hidden />;
  return <X size={size} data-mark="cancelled" className="shrink-0 text-app-muted" aria-hidden />;
}

export interface LiveActivityFeedProps {
  activity: readonly LiveActivityItem[];
  jobs?: readonly LiveJobLine[];
  locale?: Locale;
  /** Step rows shown (newest first). */
  maxItems?: number;
  className?: string;
}

export default function LiveActivityFeed({ activity, jobs = [], locale = 'ka', maxItems = 3, className = '' }: LiveActivityFeedProps) {
  const t = S[locale] ?? S.ka;
  const rows = newestFirst(activity).slice(0, Math.max(1, maxItems));
  const jobRows = jobs.slice(0, 2);
  if (!rows.length && !jobRows.length) return null;
  const text = locale === 'ka' ? 'text-[16px]' : 'text-[14px]';
  const small = locale === 'ka' ? 'text-[16px]' : 'text-[13px]';

  return (
    <div role="group" aria-live="polite" aria-label={t.region} className={`flex w-full max-w-md flex-col gap-1.5 px-4 ${className}`}>
      {rows.map((it, i) => {
        const search = it.kind === 'search';
        const words = stepWords(it, t);
        const query = search && it.queries?.length ? it.queries.slice(0, 2).map((q) => `‘${q}’`).join(', ') : '';
        // The newest row is the step the agent is on now; the older ones step back.
        const now = i === 0;
        const running = it.state === 'running';
        return (
          <div
            key={it.id}
            data-kind={it.kind}
            data-state={it.state}
            data-now={now ? 'true' : undefined}
            className={`relative rounded-2xl px-3 py-2 backdrop-blur-sm transition-opacity duration-300 ${now
              ? `bg-white/[0.08] ring-1 ${running ? 'ring-app-accent/45' : 'ring-white/15'}`
              : 'bg-white/[0.04] opacity-70 ring-1 ring-white/[0.08]'}`}
          >
            <div className={`flex items-center gap-2 ${text} leading-[1.6] text-app-text`}>
              <span className={`shrink-0 ${now && running ? 'text-app-accent' : 'text-app-muted'}`}>
                {liveStepIcon(it)}
              </span>
              <span className="min-w-0 flex-1 truncate">
                <span className={now ? 'font-semibold' : 'font-medium'}>{words}</span>
                {query && <span className="text-app-muted"> · {query}</span>}
              </span>
              <LiveStepMark state={it.state} />
            </div>
            {now && running && (
              // An indeterminate bar under the running step — the "it is working" cue. Gone under reduced motion,
              // where the spinner (which stops) and the words still say it.
              <span aria-hidden data-testid="live-step-progress" className="absolute inset-x-4 bottom-[3px] h-0.5 overflow-hidden rounded-full motion-reduce:hidden">
                <span className="absolute inset-y-0 left-0 w-1/4 rounded-full bg-app-accent/80" style={{ animation: 'mya-loadbar 1.2s ease-in-out infinite' }} />
              </span>
            )}
            {search && it.sources && it.sources.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {it.sources.slice(0, 4).map((src) => (
                  <a
                    key={src.uri}
                    href={src.uri}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    title={src.title || src.uri}
                    className={`inline-flex max-w-[11rem] items-center gap-1 rounded-full bg-white/[0.08] px-2.5 py-0.5 ${small} leading-[1.6] text-app-muted transition-colors hover:bg-white/[0.14] hover:text-app-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60`}
                  >
                    <Globe size={12} className="shrink-0" aria-hidden />
                    <span className="truncate">{sourceLabel(src)}</span>
                  </a>
                ))}
              </div>
            )}
          </div>
        );
      })}
      {jobRows.length > 0 && (
        <div data-kind="jobs" className="rounded-2xl bg-white/[0.06] px-3 py-2 ring-1 ring-white/10 backdrop-blur-sm">
          <div className={`mb-1 flex items-center gap-2 ${small} leading-[1.6] text-app-muted`}>
            <Clapperboard size={14} aria-hidden />
            {t.jobs}
          </div>
          {jobRows.map((j) => (
            <div key={j.id} className="py-0.5">
              <div className={`flex items-center justify-between gap-2 ${text} leading-[1.6] text-app-text`}>
                <span className="min-w-0 truncate">{j.label}</span>
                <span className="shrink-0 tabular-nums text-app-muted">{j.pct === null ? t.queued : `${Math.round(j.pct)}%`}</span>
              </div>
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/10" aria-hidden>
                <div
                  className={`h-full rounded-full bg-app-accent transition-[width] duration-500 ${j.pct === null ? 'w-1/4 animate-pulse motion-reduce:animate-none' : ''}`}
                  style={j.pct === null ? undefined : { width: `${Math.max(4, Math.min(100, j.pct))}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
