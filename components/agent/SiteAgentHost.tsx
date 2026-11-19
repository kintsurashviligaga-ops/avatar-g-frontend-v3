'use client';

/**
 * components/agent/SiteAgentHost.tsx — Agent G working on myavatar.ge in this very tab (GG 2026-11-07 09:36Z). Mounted
 * once in the locale layout, so a task goes on when Agent G moves to another page of the site. A task starts with
 * `startSiteTask(goal)` (the chat does it for an ask like „გადადი ბიბლიოთეკაში და გადმოწერე ბოლო ვიდეო"); the steps go
 * to Agent G's computer (lib/agent/screen/store, source 'site'), the cursor moves on the page, and a click that costs or
 * cannot be taken back waits here for the user's „Allow". Stop ends it at once.
 */
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { agentScreen, type ScreenStep } from '@/lib/agent/screen/store';
import { runSiteTask, type SiteIO } from '@/lib/agent/site/loop';
import { actOnPage, removeCursor, snapshotPage } from '@/lib/agent/site/dom';

type Lang = 'ka' | 'en' | 'ru';
const T = {
  ka: { allow: 'ნება მიეცი', deny: 'არა', stop: 'Agent G-ის შეჩერება', confirm: 'Agent G-ს სურს:', why: 'ეს ქმედება შეიძლება ღირდეს კრედიტი ან ვერ დაბრუნდეს.', thinking: 'Agent G გვერდს ათვალიერებს…', ends: { done: 'დასრულდა', user: 'შეჩერდა', steps: 'ნაბიჯები ამოიწურა', time: 'დრო ამოიწურა', ask: 'თქვენი პასუხი სჭირდება', failed: 'ვერ გაიგო, რა გააკეთოს ამ გვერდზე' } },
  en: { allow: 'Allow', deny: 'No', stop: 'Stop Agent G', confirm: 'Agent G wants to:', why: 'This may cost credits or cannot be undone.', thinking: 'Agent G is looking at the page…', ends: { done: 'Done', user: 'Stopped', steps: 'Out of steps', time: 'Out of time', ask: 'Needs your answer', failed: 'Could not tell what to do on this page' } },
  ru: { allow: 'Разрешить', deny: 'Нет', stop: 'Остановить Agent G', confirm: 'Agent G хочет:', why: 'Это может стоить кредиты или необратимо.', thinking: 'Agent G смотрит на страницу…', ends: { done: 'Готово', user: 'Остановлено', steps: 'Шаги закончились', time: 'Время вышло', ask: 'Нужен ваш ответ', failed: 'Не понял, что делать на этой странице' } },
} as const;

const EVENT = 'agent:site-task';
const RESULT = 'agent:site-result';
export interface SiteTaskResult { goal: string; answer?: string; reason: string }

/** Start Agent G on this site. The answer comes back as a window event (onSiteTaskResult). */
export function startSiteTask(goal: string): void {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { goal } }));
}
export function onSiteTaskResult(fn: (r: SiteTaskResult) => void): () => void {
  const h = (e: Event) => fn((e as CustomEvent<SiteTaskResult>).detail);
  window.addEventListener(RESULT, h);
  return () => window.removeEventListener(RESULT, h);
}

export const fetchNext: SiteIO['next'] = async (goal, history, snap, signal) => {
  const lang = document.documentElement.lang?.slice(0, 2);
  const r = await fetch('/api/agent/site/step', {
    method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, signal,
    body: JSON.stringify({ goal, history, snapshot: snap, lang }),
  });
  const j = (await r.json().catch(() => null)) as { ok?: boolean; action?: unknown } | null;
  return j?.ok ? j.action : null;
};

export function SiteAgentHost({ locale }: { locale: string }) {
  const lang: Lang = locale === 'en' || locale === 'ru' ? locale : 'ka';
  const t = T[lang];
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [ask, setAsk] = useState<string | null>(null);
  const answer = useRef<((ok: boolean) => void) | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    const h = (e: Event) => {
      const goal = String((e as CustomEvent<{ goal?: string }>).detail?.goal ?? '').trim();
      if (!goal || abort.current) return;
      void run(goal);
    };
    window.addEventListener(EVENT, h);
    return () => window.removeEventListener(EVENT, h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run(goal: string) {
    const ac = new AbortController();
    abort.current = ac;
    setRunning(true);
    const key = `site-${Date.now()}`;
    const steps: ScreenStep[] = [];
    const startedAt = Date.now();
    const url = () => `myavatar.ge${window.location.pathname}`;
    agentScreen.publish({ key, source: 'site', goal, phase: 'running', startedAt, steps: [], url: url() });
    const io: SiteIO = {
      snapshot: () => snapshotPage(),
      next: fetchNext,
      act: (a) => actOnPage(a, (p) => router.push(p)),
      confirm: (label) => new Promise<boolean>((res) => {
        answer.current = (ok) => { answer.current = null; setAsk(null); res(ok); };
        setAsk(label);
        ac.signal.addEventListener('abort', () => answer.current?.(false), { once: true });
      }),
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      now: () => Date.now(),
    };
    let thinkingShown = false;
    await runSiteTask(io, goal, lang, ac.signal, (e) => {
      if (e.type === 'thinking') {
        if (!thinkingShown) { steps.push({ label: t.thinking, state: 'run' }); thinkingShown = true; }
      } else if (e.type === 'step') {
        if (thinkingShown) { steps.pop(); thinkingShown = false; }
        const last = steps[steps.length - 1];
        if (last && last.label === e.label && last.state === 'run') last.state = e.state;
        else steps.push({ label: e.label, state: e.state });
      } else {
        if (thinkingShown) { steps.pop(); thinkingShown = false; }
        agentScreen.publish({ key, phase: e.reason === 'done' ? 'done' : 'stopped', endedAt: Date.now(), steps: [...steps], url: url(), note: e.reason === 'done' ? e.answer : `${t.ends[e.reason]}${e.answer ? `: ${e.answer}` : ''}` });
        window.dispatchEvent(new CustomEvent<SiteTaskResult>(RESULT, { detail: { goal, reason: e.reason, ...(e.answer ? { answer: e.answer } : {}) } }));
        return;
      }
      agentScreen.publish({ key, steps: [...steps], url: url() });
    });
    removeCursor();
    abort.current = null;
    setRunning(false);
  }

  if (!running) return null;
  return (
    <div data-agent-ignore="" style={{ position: 'fixed', left: '50%', transform: 'translateX(-50%)', bottom: 20, zIndex: 2147483647, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, maxWidth: 'calc(100vw - 24px)' }}>
      {ask && (
        <div role="alertdialog" aria-label={t.confirm} data-testid="site-agent-confirm"
          style={{ background: '#0b0f17', border: '1px solid rgba(56,189,248,0.5)', borderRadius: 14, padding: 14, color: '#fff', boxShadow: '0 10px 40px rgba(0,0,0,0.5)', maxWidth: 420 }}>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>{t.confirm}</div>
          <div style={{ fontSize: 14, fontWeight: 600, margin: '4px 0 6px' }}>{ask}</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginBottom: 10 }}>{t.why}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" data-testid="site-agent-allow" onClick={() => answer.current?.(true)} style={{ padding: '7px 16px', borderRadius: 999, border: 'none', background: 'linear-gradient(135deg,#0ea5e9,#7c3aed)', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>{t.allow}</button>
            <button type="button" data-testid="site-agent-deny" onClick={() => answer.current?.(false)} style={{ padding: '7px 16px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: '#fff', fontSize: 13, cursor: 'pointer' }}>{t.deny}</button>
          </div>
        </div>
      )}
      <button type="button" data-testid="site-agent-stop" onClick={() => abort.current?.abort()}
        style={{ padding: '8px 16px', borderRadius: 999, border: '1px solid rgba(239,68,68,0.6)', background: 'rgba(11,15,23,0.95)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 8, height: 8, borderRadius: 2, background: '#ef4444' }} aria-hidden />{t.stop}
      </button>
    </div>
  );
}
