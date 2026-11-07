'use client';

/**
 * components/agent/AgentScreenPanel.tsx — Agent G's computer on the right, like Manus (GG 2026-11-07 09:36Z): while a task
 * runs, a panel beside the chat shows the page the browser is on (its address and its live picture), the clock and every
 * step with a spinner or ✓. On a wide screen the page moves left to make room; on a phone a LIVE pill opens it full
 * screen. Draws lib/agent/screen/store; mounted once in the locale layout, so it stays while the user moves around.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Check, Loader2, Monitor, X } from 'lucide-react';
import { agentScreen, type AgentScreen } from '@/lib/agent/screen/store';

type Lang = 'ka' | 'en' | 'ru';
const T = {
  ka: { title: 'Agent G-ის კომპიუტერი', browser: 'ღრუბლოვანი ბრაუზერი', site: 'myavatar.ge — ეს გვერდი', working: 'მუშაობს', done: (c: string) => `დასრულდა ${c}-ში`, stopped: 'შეჩერდა', waiting: 'ბრაუზერი იხსნება…', site_hint: 'Agent G ამ გვერდზე მუშაობს — კურსორს ხედავთ მარცხნივ.', close: 'დახურვა', open: 'Agent G-ის კომპიუტერი' },
  en: { title: "Agent G's computer", browser: 'Cloud browser', site: 'myavatar.ge — this page', working: 'Working', done: (c: string) => `Done in ${c}`, stopped: 'Stopped', waiting: 'Opening the browser…', site_hint: 'Agent G is working on this page — watch the cursor on the left.', close: 'Close', open: "Agent G's computer" },
  ru: { title: 'Компьютер Agent G', browser: 'Облачный браузер', site: 'myavatar.ge — эта страница', working: 'Работает', done: (c: string) => `Готово за ${c}`, stopped: 'Остановлено', waiting: 'Открываю браузер…', site_hint: 'Agent G работает на этой странице — курсор слева.', close: 'Закрыть', open: 'Компьютер Agent G' },
} as const;

const clock = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
/** Wide enough to put the panel beside the page instead of over it. */
export const SIDE_MEDIA = '(min-width: 1024px)';
const HTML_CLASS = 'agent-screen-open';

function useScreen(): { s: AgentScreen | null; hidden: boolean } {
  const s = useSyncExternalStore(agentScreen.subscribe, agentScreen.get, () => null);
  const hidden = useSyncExternalStore(agentScreen.subscribe, agentScreen.hidden, () => false);
  return { s, hidden };
}

function useWide(): boolean {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const m = window.matchMedia(SIDE_MEDIA);
    const on = () => setWide(m.matches);
    on();
    m.addEventListener?.('change', on);
    return () => m.removeEventListener?.('change', on);
  }, []);
  return wide;
}

export function AgentScreenPanel({ locale }: { locale: string }) {
  const lang: Lang = locale === 'en' || locale === 'ru' ? locale : 'ka';
  const t = T[lang];
  const { s, hidden } = useScreen();
  const wide = useWide();
  const [sheet, setSheet] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (s?.phase !== 'running') return;
    const h = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(h);
  }, [s?.phase]);
  const side = !!s && !hidden && wide;
  useEffect(() => {
    const el = document.documentElement;
    if (side) el.classList.add(HTML_CLASS); else el.classList.remove(HTML_CLASS);
    return () => el.classList.remove(HTML_CLASS);
  }, [side]);
  useEffect(() => { if (s?.phase === 'running' && !wide) setSheet(false); }, [s?.key, s?.phase, wide]);

  if (!s) return null;
  if (hidden) {
    return (
      <button type="button" data-testid="agent-screen-reopen" onClick={() => { agentScreen.show(); setSheet(true); }}
        style={{ position: 'fixed', right: 16, bottom: 96, zIndex: 85, display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 999, border: '1px solid rgba(56,189,248,0.4)', background: 'rgba(11,15,23,0.95)', color: '#fff', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
        <Monitor size={14} aria-hidden />{t.open}{s.phase === 'running' && <Loader2 size={13} className="animate-spin" aria-hidden />}
      </button>
    );
  }
  if (!wide && !sheet) {
    return (
      <button type="button" data-testid="agent-screen-pill" onClick={() => setSheet(true)}
        style={{ position: 'fixed', right: 12, bottom: 96, zIndex: 85, display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 999, border: '1px solid rgba(56,189,248,0.4)', background: 'rgba(11,15,23,0.95)', color: '#fff', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', boxShadow: '0 6px 24px rgba(0,0,0,0.4)' }}>
        {s.phase === 'running' ? <span style={{ width: 7, height: 7, borderRadius: 999, background: '#ef4444' }} aria-hidden /> : <Check size={13} color="#38bdf8" aria-hidden />}
        {s.phase === 'running' ? `LIVE · ${clock(now - s.startedAt)}` : t.title}
      </button>
    );
  }

  const status = s.phase === 'running' ? `${t.working} ${clock(now - s.startedAt)}` : s.phase === 'done' ? t.done(clock((s.endedAt ?? now) - s.startedAt)) : t.stopped;
  return (
    <aside data-testid="agent-screen" aria-label={t.title}
      style={wide
        ? { position: 'fixed', top: 0, right: 0, bottom: 0, width: 'var(--agent-screen-w)', zIndex: 80, display: 'flex', flexDirection: 'column', background: '#0b0f17', borderLeft: '1px solid rgba(255,255,255,0.1)', color: '#fff' }
        : { position: 'fixed', inset: 0, zIndex: 120, display: 'flex', flexDirection: 'column', background: '#0b0f17', color: '#fff', paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <Monitor size={16} color="#38bdf8" aria-hidden />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700 }}>{t.title}</div>
          <div data-testid="agent-screen-status" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: s.phase === 'done' ? '#38bdf8' : 'rgba(255,255,255,0.6)' }}>
            {s.phase === 'running' ? <Loader2 size={12} className="animate-spin" aria-hidden /> : s.phase === 'done' ? <Check size={12} aria-hidden /> : null}{status}
          </div>
        </div>
        <button type="button" aria-label={t.close} data-testid="agent-screen-close" onClick={() => { if (wide) agentScreen.hide(); else setSheet(false); }}
          style={{ border: 'none', background: 'transparent', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', padding: 6 }}><X size={18} /></button>
      </header>
      <div style={{ padding: '10px 14px 0', fontSize: 12.5, color: 'rgba(255,255,255,0.75)', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{s.goal}</div>
      <div style={{ margin: '10px 14px 0', borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.12)', background: '#05070b', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', fontSize: 11.5, color: 'rgba(255,255,255,0.6)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          {s.phase === 'running' && <span style={{ width: 7, height: 7, borderRadius: 999, background: '#ef4444', flexShrink: 0 }} aria-hidden />}
          <span style={{ fontWeight: 600, flexShrink: 0 }}>{s.source === 'site' ? t.site : t.browser}</span>
          <span data-testid="agent-screen-url" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.url}</span>
        </div>
        {s.picture
          // eslint-disable-next-line @next/next/no-img-element
          ? <img data-testid="agent-screen-picture" src={s.picture} alt="" style={{ display: 'block', width: '100%', height: 'auto' }} />
          : <div style={{ aspectRatio: '16 / 10', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 12.5, color: 'rgba(255,255,255,0.5)', padding: 16, textAlign: 'center' }}>
              {s.source === 'site' ? t.site_hint : <><Loader2 size={14} className="animate-spin" aria-hidden />{t.waiting}</>}
            </div>}
      </div>
      <ol data-testid="agent-screen-steps" style={{ flex: 1, overflow: 'auto', margin: 0, padding: '12px 14px 16px', listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {s.steps.map((st, i) => (
          <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: st.state === 'todo' ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.85)' }}>
            <span style={{ width: 14, flexShrink: 0, paddingTop: 2 }}>
              {st.state === 'run' ? <Loader2 size={13} className="animate-spin" aria-hidden /> : st.state === 'ok' ? <Check size={13} color="#38bdf8" aria-hidden /> : st.state === 'fail' ? <X size={13} color="#fca5a5" aria-hidden /> : null}
            </span>
            <span>{st.label}</span>
          </li>
        ))}
        {s.note && <li style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.6)', marginTop: 4 }}>{s.note}</li>}
      </ol>
    </aside>
  );
}
