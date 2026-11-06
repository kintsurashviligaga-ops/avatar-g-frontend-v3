'use client';

/**
 * components/agent/PlanStartCard.tsx — the Start card under an Agent G run (AgentTerminal) for a plan Agent G signed:
 * a browser task (lib/agent/browser/quote) or a program run (lib/agent/sandbox/codeQuote). Nothing runs until the user
 * presses Start; Stop aborts the request (the server stops the sandbox and settles its spend). What the run saved in the
 * user's workspace is listed with a download button each, so the next step can name those files.
 */
import { useRef, useState } from 'react';

type Lang = 'ka' | 'en' | 'ru';
interface WsFile { path: string; v: number; bytes: number }
interface RunWorkspace { id: string; written: WsFile[]; skipped?: string[]; folder?: string; error?: string }
interface StepView { op: string; ok: boolean; url?: string; title?: string; text?: string; error?: string }

export type PlanKind = 'browser' | 'code';
export interface SignedPlan { quote: Record<string, unknown>; request: unknown; token: string }

const ROUTE: Record<PlanKind, string> = { browser: '/api/agent/browser/run', code: '/api/agent/sandbox/run' };

const T = {
  ka: {
    browser: 'ბრაუზერის გეგმა', code: 'პროგრამის გეგმა', start: 'დაწყება', stop: 'შეჩერება', again: 'ხელახლა',
    running: 'მიმდინარეობს…', sites: 'საიტები', steps: 'ნაბიჯი', shots: 'სქრინშოტი', free: 'უფასო', saved: 'workspace-ში შეინახა:',
    none: 'ახალი ფაილი არ შეინახა.', failed: 'ვერ შესრულდა', exit: 'დასრულდა კოდით', lang: 'ენა', seconds: 'წმ',
  },
  en: {
    browser: 'Browser plan', code: 'Program plan', start: 'Start', stop: 'Stop', again: 'Try again',
    running: 'Running…', sites: 'Sites', steps: 'steps', shots: 'screenshots', free: 'free', saved: 'Saved in the workspace:',
    none: 'No new file was saved.', failed: 'Failed', exit: 'Exited with code', lang: 'Language', seconds: 's',
  },
  ru: {
    browser: 'План браузера', code: 'План программы', start: 'Старт', stop: 'Стоп', again: 'Ещё раз',
    running: 'Выполняется…', sites: 'Сайты', steps: 'шагов', shots: 'скриншотов', free: 'бесплатно', saved: 'Сохранено в workspace:',
    none: 'Новых файлов нет.', failed: 'Не удалось', exit: 'Код выхода', lang: 'Язык', seconds: 'с',
  },
} as const;

const card: React.CSSProperties = { border: '1px solid rgba(56,189,248,0.3)', background: 'rgba(56,189,248,0.05)', borderRadius: 14, padding: 16 };
const mono = 'ui-monospace, SFMono-Regular, Menlo, monospace';
const btn = (primary: boolean): React.CSSProperties => ({
  padding: '8px 18px', borderRadius: 999, border: primary ? 'none' : '1px solid rgba(255,255,255,0.15)', fontSize: 13, fontWeight: 600,
  color: '#fff', cursor: 'pointer', background: primary ? 'linear-gradient(135deg,#0ea5e9,#7c3aed)' : 'transparent',
});

async function openWorkspaceFile(workspaceId: string, path: string): Promise<void> {
  const r = await fetch('/api/agent/workspace', {
    method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'link', workspaceId, path }),
  }).catch(() => null);
  const j = (await r?.json().catch(() => null)) as { url?: unknown } | null;
  if (typeof j?.url === 'string' && /^https:\/\//.test(j.url)) window.open(j.url, '_blank', 'noopener,noreferrer');
}

type Phase =
  | { phase: 'quoted' }
  | { phase: 'running'; t0: number }
  | { phase: 'done'; steps?: StepView[]; stdout?: string; stderr?: string; exitCode?: number; wallMs?: number; workspace?: RunWorkspace }
  | { phase: 'failed'; message: string };

export function PlanStartCard({ kind, plan, locale }: { kind: PlanKind; plan: SignedPlan; locale: string }) {
  const lang: Lang = locale === 'en' || locale === 'ru' ? locale : 'ka';
  const t = T[lang];
  const [state, setState] = useState<Phase>({ phase: 'quoted' });
  const abort = useRef<AbortController | null>(null);
  const q = plan.quote;

  async function start() {
    if (state.phase === 'running') return;
    const ac = new AbortController();
    abort.current = ac;
    setState({ phase: 'running', t0: Date.now() });
    try {
      const res = await fetch(ROUTE[kind], {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, signal: ac.signal,
        body: JSON.stringify({ action: 'run', request: plan.request, token: plan.token, locale: lang }),
      });
      const j = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (!j || j.ok !== true) {
        setState({ phase: 'failed', message: typeof j?.message === 'string' ? j.message : `${t.failed} (${res.status})` });
        return;
      }
      setState({
        phase: 'done',
        ...(Array.isArray(j.steps) ? { steps: j.steps as StepView[] } : {}),
        ...(typeof j.stdout === 'string' ? { stdout: j.stdout } : {}),
        ...(typeof j.stderr === 'string' ? { stderr: j.stderr } : {}),
        ...(typeof j.exitCode === 'number' ? { exitCode: j.exitCode } : {}),
        ...(typeof j.wallMs === 'number' ? { wallMs: j.wallMs } : {}),
        ...(j.workspace && typeof j.workspace === 'object' ? { workspace: j.workspace as RunWorkspace } : {}),
      });
    } catch {
      setState({ phase: 'failed', message: ac.signal.aborted ? t.stop : t.failed });
    } finally {
      abort.current = null;
    }
  }

  const hosts = Array.isArray(q.hosts) ? (q.hosts as string[]) : [];
  return (
    <div style={card} data-plan-card={kind}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: '#38bdf8', letterSpacing: '0.04em', marginBottom: 8 }}>
        {kind === 'browser' ? t.browser : t.code}
      </div>
      <div style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.8)', lineHeight: 1.6 }}>
        {kind === 'browser'
          ? <>{t.sites}: <b>{hosts.join(', ')}</b> · {String(q.steps)} {t.steps} · {String(q.screenshots)} {t.shots} · ≤ {String(q.wallSec)} {t.seconds} · {t.free}</>
          : <>{t.lang}: <b>{String(q.language)}</b> · ≤ {String(q.wallSec)} {t.seconds} · {q.workspaceId ? 'workspace' : 'no network'} · {t.free}</>}
      </div>
      {kind === 'code' && typeof (plan.request as { code?: unknown })?.code === 'string' && (
        <pre style={{ margin: '10px 0 0', fontFamily: mono, fontSize: 12, color: '#93c5fd', background: 'rgba(0,0,0,0.25)', padding: 10, borderRadius: 8, overflow: 'auto', maxHeight: 220 }}>
          {(plan.request as { code: string }).code}
        </pre>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        {state.phase === 'quoted' && <button type="button" style={btn(true)} onClick={() => void start()}>{t.start}</button>}
        {state.phase === 'running' && <>
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', alignSelf: 'center' }}>{t.running}</span>
          <button type="button" style={btn(false)} onClick={() => abort.current?.abort()}>{t.stop}</button>
        </>}
      </div>
      {state.phase === 'failed' && <p style={{ color: '#fca5a5', fontSize: 13, marginTop: 10 }}>{t.failed}: {state.message}</p>}
      {state.phase === 'done' && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {state.steps?.map((s, i) => (
            <div key={i} style={{ fontFamily: mono, fontSize: 12, color: s.ok ? 'rgba(255,255,255,0.7)' : '#fca5a5' }}>
              {s.ok ? '✓' : '✗'} {s.op}{s.url ? ` ${s.url}` : ''}{s.title ? ` — ${s.title}` : ''}{s.error ? ` — ${s.error}` : ''}
              {s.text && <pre style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap', maxHeight: 160, overflow: 'auto', background: 'rgba(0,0,0,0.25)', padding: 8, borderRadius: 6 }}>{s.text}</pre>}
            </div>
          ))}
          {typeof state.exitCode === 'number' && <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.5)' }}>{t.exit} {state.exitCode}</div>}
          {state.stdout && <pre style={{ margin: 0, fontFamily: mono, fontSize: 12, color: 'rgba(255,255,255,0.8)', background: 'rgba(0,0,0,0.25)', padding: 10, borderRadius: 8, maxHeight: 220, overflow: 'auto' }}>{state.stdout}</pre>}
          {state.stderr && <pre style={{ margin: 0, fontFamily: mono, fontSize: 12, color: '#fca5a5', background: 'rgba(0,0,0,0.25)', padding: 10, borderRadius: 8, maxHeight: 160, overflow: 'auto' }}>{state.stderr}</pre>}
          {state.workspace && (
            <div style={{ fontSize: 12.5 }}>
              {state.workspace.error
                ? <p style={{ color: '#fca5a5' }}>{state.workspace.error}</p>
                : <p style={{ color: 'rgba(255,255,255,0.5)' }}>{state.workspace.written.length ? t.saved : t.none}</p>}
              {state.workspace.written.map((f) => (
                <button key={f.path} type="button" onClick={() => void openWorkspaceFile(state.workspace!.id, f.path)}
                  style={{ display: 'block', marginTop: 4, background: 'rgba(0,0,0,0.2)', border: 'none', color: '#e2e8f0', borderRadius: 8, padding: '5px 10px', fontFamily: mono, fontSize: 12, cursor: 'pointer', textAlign: 'left' }}>
                  ⬇ {f.path} · v{f.v} · {f.bytes < 1024 ? `${f.bytes} B` : `${Math.round(f.bytes / 1024)} KB`}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
