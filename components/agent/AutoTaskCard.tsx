'use client';

/**
 * components/agent/AutoTaskCard.tsx — an Agent G task started ONCE (GG 2026-11-07 07:53Z, „ავტონომია + Google"): the card
 * names the goal, the first steps and the most it may do (rounds, minutes, spend); after Start, Agent G runs, looks at
 * what it found and plans the next steps by itself (lib/agent/task/autoTask), every round drawn as it happens — a
 * spinner on what runs, ✓ on what is done, the screenshots as they are saved. Stop ends it before the next step.
 */
import { useRef, useState } from 'react';
import { Check, Loader2, X } from 'lucide-react';
import { browserStepLabel, type PlannedStep } from '@/lib/agent/browser/stepLabel';
import {
  AUTO_TASK_LIMITS, envelopeUsd, runAutoTask,
  type AutoTaskEvent, type AutoTaskIO, type BrowserOut, type CodeOut, type PlanOut, type SignedPlanLike,
} from '@/lib/agent/task/autoTask';
import { ShotImage } from './PlanStartCard';

type Lang = 'ka' | 'en' | 'ru';
const T = {
  ka: { title: 'Agent G-ის დავალება', start: 'დაწყება', stop: 'შეჩერება', limits: (r: number, m: number, usd: number) => `მაქს. ${r} რაუნდი · ${m} წთ · ≤ $${usd.toFixed(2)} · Agent G თავად გააგრძელებს`, round: 'რაუნდი', browser: 'ბრაუზერი', code: 'პროგრამა', thinking: 'Agent G ნახულს აანალიზებს და შემდეგ ნაბიჯს გეგმავს…', done: 'დასრულდა', stopped: 'შეჩერდა', failed: 'ვერ შესრულდა', time: 'დრო ამოიწურა', rounds: 'რაუნდები ამოიწურა', running: 'მიმდინარეობს' },
  en: { title: 'Agent G task', start: 'Start', stop: 'Stop', limits: (r: number, m: number, usd: number) => `Up to ${r} rounds · ${m} min · ≤ $${usd.toFixed(2)} · Agent G carries on by itself`, round: 'Round', browser: 'Browser', code: 'Program', thinking: 'Agent G is looking at what it found and planning the next step…', done: 'Done', stopped: 'Stopped', failed: 'Failed', time: 'Out of time', rounds: 'Out of rounds', running: 'Running' },
  ru: { title: 'Задача Agent G', start: 'Старт', stop: 'Стоп', limits: (r: number, m: number, usd: number) => `До ${r} раундов · ${m} мин · ≤ $${usd.toFixed(2)} · Agent G продолжит сам`, round: 'Раунд', browser: 'Браузер', code: 'Программа', thinking: 'Agent G смотрит, что нашёл, и планирует следующий шаг…', done: 'Готово', stopped: 'Остановлено', failed: 'Не удалось', time: 'Время вышло', rounds: 'Раунды закончились', running: 'Выполняется' },
} as const;

interface RoundView { round: number; kind: 'browser' | 'code'; plan: SignedPlanLike; result?: BrowserOut | CodeOut }
type Phase = 'quoted' | 'running' | 'done' | 'stopped';

async function post(url: string, body: unknown, signal: AbortSignal): Promise<Record<string, unknown> | null> {
  const r = await fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, signal, body: JSON.stringify(body) });
  const j = (await r.json().catch(() => null)) as Record<string, unknown> | null;
  return j ? { ...j, __status: r.status } : { __status: r.status };
}
const signed = (x: unknown): SignedPlanLike | undefined =>
  x && typeof x === 'object' && typeof (x as SignedPlanLike).token === 'string' && (x as SignedPlanLike).quote && typeof (x as SignedPlanLike).quote === 'object' ? (x as SignedPlanLike) : undefined;

export const fetchAutoTaskIO: AutoTaskIO = {
  async runBrowser(plan, signal) {
    const j = await post('/api/agent/browser/run', { action: 'run', request: plan.request, token: plan.token }, signal);
    if (j?.ok !== true) return { ok: false, message: typeof j?.message === 'string' ? j.message : `HTTP ${String(j?.__status)}` };
    return j as unknown as BrowserOut;
  },
  async runCode(plan, signal) {
    const j = await post('/api/agent/sandbox/run', { action: 'run', request: plan.request, token: plan.token }, signal);
    if (j?.ok !== true) return { ok: false, message: typeof j?.message === 'string' ? j.message : `HTTP ${String(j?.__status)}` };
    return j as unknown as CodeOut;
  },
  async plan(goal, signal): Promise<PlanOut> {
    const j = await post('/api/agent/run', { goal, maxSteps: 6 }, signal);
    const answer = typeof j?.answer === 'string' && j.answer.trim() ? j.answer.trim() : null;
    const browser = signed(j?.browserQuote);
    const code = signed(j?.codeQuote);
    return { ok: j?.__status === 200, answer, ...(browser ? { browser } : {}), ...(code ? { code } : {}), ...(typeof j?.stopReason === 'string' ? { message: j.stopReason } : {}) };
  },
  now: () => Date.now(),
};

export function AutoTaskCard({ goal, first, locale, io = fetchAutoTaskIO, onFinish }: {
  goal: string;
  first: { kind: 'browser' | 'code'; plan: SignedPlanLike };
  locale: string;
  io?: AutoTaskIO;
  /** The answer (or why it stopped) and the page it ended on, for the chat. */
  onFinish?: (r: { answer?: string; lastUrl?: string }) => void;
}) {
  const lang: Lang = locale === 'en' || locale === 'ru' ? locale : 'ka';
  const t = T[lang];
  const [phase, setPhase] = useState<Phase>('quoted');
  const [rounds, setRounds] = useState<RoundView[]>([]);
  const [thinking, setThinking] = useState(false);
  const [end, setEnd] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const firstSteps: PlannedStep[] = first.kind === 'browser' && Array.isArray((first.plan.request as { steps?: unknown })?.steps)
    ? (first.plan.request as { steps: PlannedStep[] }).steps : [];

  function onEvent(e: AutoTaskEvent) {
    if (e.type === 'round') { setThinking(false); setRounds((r) => [...r, { round: e.round, kind: e.kind, plan: e.plan }]); }
    else if (e.type === 'browser_done' || e.type === 'code_done') setRounds((r) => r.map((x) => (x.round === e.round ? { ...x, result: e.result } : x)));
    else if (e.type === 'thinking') setThinking(true);
    else if (e.type === 'done') {
      setThinking(false); setPhase('done'); setEnd(t.done);
      try { onFinish?.({ answer: e.answer, ...(e.lastUrl ? { lastUrl: e.lastUrl } : {}) }); } catch { /* the card goes on */ }
    } else {
      setThinking(false); setPhase('stopped');
      setEnd(e.reason === 'user' ? t.stopped : e.reason === 'time' ? t.time : e.reason === 'rounds' ? t.rounds : `${t.failed}${e.message ? `: ${e.message}` : ''}`);
      try { onFinish?.({ ...(e.lastUrl ? { lastUrl: e.lastUrl } : {}) }); } catch { /* the card goes on */ }
    }
  }

  async function start() {
    if (phase !== 'quoted') return;
    const ac = new AbortController();
    abort.current = ac;
    setPhase('running');
    await runAutoTask(io, { goal, first }, ac.signal, onEvent);
    abort.current = null;
  }

  const usd = envelopeUsd(first.plan);
  return (
    <div data-testid="auto-task-card" style={{ border: '1px solid rgba(56,189,248,0.3)', background: 'rgba(56,189,248,0.05)', borderRadius: 14, padding: 16 }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: '#38bdf8', letterSpacing: '0.04em', marginBottom: 6 }}>{t.title}</div>
      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>{t.limits(AUTO_TASK_LIMITS.rounds, AUTO_TASK_LIMITS.wallMs / 60_000, usd)}</div>
      {phase === 'quoted' && firstSteps.length > 0 && (
        <ol data-testid="auto-task-first-steps" style={{ margin: '10px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {firstSteps.map((st, i) => <li key={i} style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.7)' }}>{i + 1}. {browserStepLabel(st, lang)}</li>)}
        </ol>
      )}
      {rounds.length > 0 && (
        <ol data-testid="auto-task-rounds" style={{ margin: '12px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rounds.map((r) => {
            const steps: PlannedStep[] = r.kind === 'browser' && Array.isArray((r.plan.request as { steps?: unknown })?.steps) ? (r.plan.request as { steps: PlannedStep[] }).steps : [];
            const res = r.result;
            const icon = !res ? <Loader2 size={14} className="animate-spin" aria-label={t.running} /> : res.ok ? <Check size={14} color="#38bdf8" aria-hidden /> : <X size={14} color="#fca5a5" aria-hidden />;
            const ws = res && res.ok ? (res as { workspace?: { id: string; written: Array<{ path: string }>; error?: string } }).workspace : undefined;
            return (
              <li key={r.round} data-testid="auto-task-round" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'rgba(255,255,255,0.85)', fontWeight: 600 }}>
                  {icon}{t.round} {r.round} · {r.kind === 'browser' ? t.browser : t.code}
                  {res && res.ok && r.kind === 'browser' && (res as { finalUrl?: string }).finalUrl && <span style={{ fontWeight: 400, color: 'rgba(255,255,255,0.5)' }}> · {new URL((res as { finalUrl: string }).finalUrl).host}</span>}
                </div>
                {steps.length > 0 && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', paddingLeft: 20 }}>{steps.map((s) => browserStepLabel(s, lang)).join(' → ')}</div>}
                {res && !res.ok && <div style={{ fontSize: 12.5, color: '#fca5a5', paddingLeft: 20 }}>{res.message}</div>}
                {res && res.ok && r.kind === 'code' && (res as { stdout?: string }).stdout && (
                  <pre style={{ margin: '0 0 0 20px', fontSize: 12, whiteSpace: 'pre-wrap', maxHeight: 160, overflow: 'auto', background: 'rgba(0,0,0,0.25)', padding: 8, borderRadius: 6 }}>{(res as { stdout: string }).stdout}</pre>
                )}
                {ws && !ws.error && ws.written.filter((f) => /\.png$/i.test(f.path)).map((f) => <ShotImage key={f.path} workspaceId={ws.id} path={f.path} />)}
              </li>
            );
          })}
        </ol>
      )}
      {thinking && phase === 'running' && (
        <div data-testid="auto-task-thinking" style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>
          <Loader2 size={14} className="animate-spin" aria-hidden />{t.thinking}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
        {phase === 'quoted' && (
          <button type="button" onClick={() => void start()} style={{ padding: '8px 18px', borderRadius: 999, border: 'none', fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer', background: 'linear-gradient(135deg,#0ea5e9,#7c3aed)' }}>{t.start}</button>
        )}
        {phase === 'running' && (
          <button type="button" onClick={() => abort.current?.abort()} style={{ padding: '8px 18px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.15)', fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer', background: 'transparent' }}>{t.stop}</button>
        )}
        {end && <span data-testid="auto-task-end" style={{ fontSize: 13, color: phase === 'done' ? '#38bdf8' : 'rgba(255,255,255,0.6)' }}>{end}</span>}
      </div>
    </div>
  );
}
