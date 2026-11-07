'use client';

/**
 * components/agent/AutoTaskCard.tsx — an Agent G task started ONCE (GG 2026-11-07 07:53Z, „ავტონომია + Google"): the card
 * names the goal, the first steps and the most it may do (rounds, minutes, spend); after Start, Agent G runs, looks at
 * what it found and plans the next steps by itself (lib/agent/task/autoTask), every round drawn as it happens — a
 * spinner on what runs, ✓ on what is done, the screenshots as they are saved. Stop ends it before the next step.
 */
import { useEffect, useRef, useState } from 'react';
import { Check, Loader2, X } from 'lucide-react';
import { browserStepLabel, type PlannedStep } from '@/lib/agent/browser/stepLabel';
import {
  AUTO_TASK_LIMITS, envelopeUsd, runAutoTask,
  type AutoTaskEvent, type AutoTaskIO, type BrowserOut, type CodeOut, type LiveOut, type PlanOut, type SignedPlanLike,
} from '@/lib/agent/task/autoTask';
import { ShotImage } from './PlanStartCard';

type Lang = 'ka' | 'en' | 'ru';
const T = {
  ka: { title: 'Agent G-ის დავალება', start: 'დაწყება', stop: 'შეჩერება', limits: (r: number, m: number, usd: number) => `მაქს. ${r} რაუნდი · ${m} წთ · ≤ $${usd.toFixed(2)} · Agent G თავად გააგრძელებს`, round: 'რაუნდი', browser: 'ბრაუზერი', code: 'პროგრამა', thinking: 'Agent G ნახულს აანალიზებს და შემდეგ ნაბიჯს გეგმავს…', done: 'დასრულდა', stopped: 'შეჩერდა', failed: 'ვერ შესრულდა', time: 'დრო ამოიწურა', rounds: 'რაუნდები ამოიწურა', running: 'მიმდინარეობს', working: 'მუშაობს', took: (c: string) => `დასრულდა ${c}-ში` },
  en: { title: 'Agent G task', start: 'Start', stop: 'Stop', limits: (r: number, m: number, usd: number) => `Up to ${r} rounds · ${m} min · ≤ $${usd.toFixed(2)} · Agent G carries on by itself`, round: 'Round', browser: 'Browser', code: 'Program', thinking: 'Agent G is looking at what it found and planning the next step…', done: 'Done', stopped: 'Stopped', failed: 'Failed', time: 'Out of time', rounds: 'Out of rounds', running: 'Running', working: 'Working for', took: (c: string) => `Done in ${c}` },
  ru: { title: 'Задача Agent G', start: 'Старт', stop: 'Стоп', limits: (r: number, m: number, usd: number) => `До ${r} раундов · ${m} мин · ≤ $${usd.toFixed(2)} · Agent G продолжит сам`, round: 'Раунд', browser: 'Браузер', code: 'Программа', thinking: 'Agent G смотрит, что нашёл, и планирует следующий шаг…', done: 'Готово', stopped: 'Остановлено', failed: 'Не удалось', time: 'Время вышло', rounds: 'Раунды закончились', running: 'Выполняется', working: 'Работает', took: (c: string) => `Готово за ${c}` },
} as const;

const clock = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
/** Tasks already started on this page, by plan token: a card mounted again (a re-render, a language switch) never runs it twice. */
const STARTED = new Set<string>();
/** A plan the user is charged nothing for (the browser: credits 0) starts by itself, like any agent the user just asked. */
export const startsByItself = (plan: SignedPlanLike) => Number(plan.quote.credits) === 0;

interface RoundView { round: number; kind: 'browser' | 'code'; plan: SignedPlanLike; result?: BrowserOut | CodeOut; live?: LiveOut }
type Phase = 'quoted' | 'running' | 'done' | 'stopped';

async function post(url: string, body: unknown, signal: AbortSignal): Promise<Record<string, unknown> | null> {
  const r = await fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, signal, body: JSON.stringify(body) });
  const j = (await r.json().catch(() => null)) as Record<string, unknown> | null;
  return j ? { ...j, __status: r.status } : { __status: r.status };
}
const signed = (x: unknown): SignedPlanLike | undefined =>
  x && typeof x === 'object' && typeof (x as SignedPlanLike).token === 'string' && (x as SignedPlanLike).quote && typeof (x as SignedPlanLike).quote === 'object' ? (x as SignedPlanLike) : undefined;

export const fetchAutoTaskIO: AutoTaskIO = {
  async runBrowser(plan, signal, onLive) {
    // Streamed: one JSON line per change while the browser works (the live view), the result last.
    const r = await fetch('/api/agent/browser/run', {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, signal,
      body: JSON.stringify({ action: 'run', request: plan.request, token: plan.token, stream: true }),
    });
    const fail = (j: Record<string, unknown> | null, status: number): BrowserOut => ({ ok: false, message: typeof j?.message === 'string' ? j.message : `HTTP ${status}` });
    if (!r.ok || !r.body || !(r.headers.get('content-type') ?? '').includes('ndjson')) {
      const j = (await r.json().catch(() => null)) as Record<string, unknown> | null;
      return j?.ok === true ? (j as unknown as BrowserOut) : fail(j, r.status);
    }
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    let result: Record<string, unknown> | null = null;
    for (;;) {
      const { value, done } = await reader.read();
      if (value) buf += dec.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const raw = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!raw) continue;
        let o: Record<string, unknown> | null = null;
        try { o = JSON.parse(raw) as Record<string, unknown>; } catch { continue; }
        if (o.type === 'live' && onLive) {
          onLive({
            steps: Array.isArray(o.steps) ? (o.steps as LiveOut['steps']) : [],
            url: typeof o.url === 'string' ? o.url : '',
            ...(typeof o.jpeg === 'string' ? { picture: `data:image/jpeg;base64,${o.jpeg}` } : {}),
          });
        } else if (o.type === 'result') result = (o.body as Record<string, unknown>) ?? null;
      }
      if (done) break;
    }
    return result?.ok === true ? (result as unknown as BrowserOut) : fail(result, r.status);
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

export function AutoTaskCard({ goal, first, locale, io = fetchAutoTaskIO, onFinish, autoStart = false }: {
  goal: string;
  /** Start on mount, once per plan (GG 2026-11-07 08:30Z: Manus starts as soon as it is asked). */
  autoStart?: boolean;
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
  const [t0, setT0] = useState<number | null>(null);
  const [t1, setT1] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (phase !== 'running') return;
    const h = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(h);
  }, [phase]);
  useEffect(() => {
    if (autoStart && !STARTED.has(first.plan.token)) void start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const firstSteps: PlannedStep[] = first.kind === 'browser' && Array.isArray((first.plan.request as { steps?: unknown })?.steps)
    ? (first.plan.request as { steps: PlannedStep[] }).steps : [];

  function onEvent(e: AutoTaskEvent) {
    if (e.type === 'round') { setThinking(false); setRounds((r) => [...r, { round: e.round, kind: e.kind, plan: e.plan }]); }
    else if (e.type === 'browser_done' || e.type === 'code_done') setRounds((r) => r.map((x) => (x.round === e.round ? { ...x, result: e.result } : x)));
    else if (e.type === 'live') setRounds((r) => r.map((x) => (x.round === e.round ? { ...x, live: e.live } : x)));
    else if (e.type === 'thinking') setThinking(true);
    else if (e.type === 'done') {
      setThinking(false); setPhase('done'); setEnd(null); setT1(Date.now());
      try { onFinish?.({ answer: e.answer, ...(e.lastUrl ? { lastUrl: e.lastUrl } : {}) }); } catch { /* the card goes on */ }
    } else {
      setThinking(false); setPhase('stopped'); setT1(Date.now());
      setEnd(e.reason === 'user' ? t.stopped : e.reason === 'time' ? t.time : e.reason === 'rounds' ? t.rounds : `${t.failed}${e.message ? `: ${e.message}` : ''}`);
      try { onFinish?.({ ...(e.lastUrl ? { lastUrl: e.lastUrl } : {}) }); } catch { /* the card goes on */ }
    }
  }

  async function start() {
    if (phase !== 'quoted' || STARTED.has(first.plan.token)) return;
    STARTED.add(first.plan.token);
    setT0(Date.now()); setNow(Date.now());
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
      {t0 !== null && (
        <div data-testid="auto-task-clock" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 600, color: phase === 'done' ? '#38bdf8' : 'rgba(255,255,255,0.85)', marginBottom: 4 }}>
          {phase === 'running' ? <Loader2 size={15} className="animate-spin" aria-hidden /> : phase === 'done' ? <Check size={15} aria-hidden /> : null}
          {phase === 'running' ? `${t.working} ${clock(now - t0)}` : phase === 'done' ? t.took(clock((t1 ?? now) - t0)) : clock((t1 ?? now) - t0)}
        </div>
      )}
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{t.limits(AUTO_TASK_LIMITS.rounds, AUTO_TASK_LIMITS.wallMs / 60_000, usd)}</div>
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
                {steps.length > 0 && (
                  <ul data-testid="auto-task-steps" style={{ margin: 0, padding: '0 0 0 20px', listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {steps.map((st, i) => {
                      const done = res && res.ok ? (res as BrowserOut & { ok: true }).steps?.[i] : !res ? r.live?.steps[i] : undefined;
                      return (
                        <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: done ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.5)' }}>
                          {done ? (done.ok ? <Check size={12} color="#38bdf8" aria-hidden /> : <X size={12} color="#fca5a5" aria-hidden />) : !res && i === (r.live?.steps.length ?? 0) ? <Loader2 size={12} className="animate-spin" aria-hidden /> : <span style={{ width: 12 }} />}
                          {browserStepLabel(st, lang)}
                        </li>
                      );
                    })}
                  </ul>
                )}
                {!res && r.live && (r.live.url || r.live.picture) && (
                  <div data-testid="auto-task-live" style={{ marginLeft: 20, borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.12)', background: '#0b0f17', maxWidth: 520 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', fontSize: 11.5, color: 'rgba(255,255,255,0.6)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                      <span style={{ width: 7, height: 7, borderRadius: 999, background: '#ef4444' }} aria-hidden />LIVE
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.live.url}</span>
                    </div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {r.live.picture && <img src={r.live.picture} alt="" style={{ display: 'block', width: '100%', height: 'auto' }} />}
                  </div>
                )}
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
