'use client';

/**
 * components/studio/PluginsList.tsx — Agent G's 10 plugins in the Connectors sheet, each with its REAL state from
 * GET /api/agent/plugins (lib/agent/plugins/catalog): working, partly, not connected, needs setup, waiting on approval,
 * or off — and why, in ka/en/ru. Notion and GitHub get Connect / Disconnect when they are connectable; nothing else is a
 * button, so there is no dead button. Shown only when NEXT_PUBLIC_AGENT_PLUGINS=1 (and the server's AGENT_PLUGINS
 * answers; a 404 hides the section).
 */
import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { PLUGINS, type PluginState } from '@/lib/agent/plugins/catalog';
import { BLOCKER_TEXT, STATUS_WORD, returnMessage, type Lang } from '@/lib/agent/plugins/messages';

const T = {
  ka: { title: 'Agent G-ის პლაგინები', connect: 'დაკავშირება', disconnect: 'გათიშვა', failed: 'სტატუსი ვერ ჩაიტვირთა.', retry: 'თავიდან ცდა', disconnected: 'გაითიშა.' },
  en: { title: 'Agent G plugins', connect: 'Connect', disconnect: 'Disconnect', failed: 'Could not load the status.', retry: 'Try again', disconnected: 'Disconnected.' },
  ru: { title: 'Плагины Agent G', connect: 'Подключить', disconnect: 'Отключить', failed: 'Не удалось загрузить статус.', retry: 'Повторить', disconnected: 'Отключено.' },
} as const;

export const pluginsUiOn = (): boolean => process.env.NEXT_PUBLIC_AGENT_PLUGINS === '1';

type Load = { kind: 'loading' } | { kind: 'hidden' } | { kind: 'failed' } | { kind: 'done'; plugins: PluginState[] };

export function PluginsList({ lang, open }: { lang: Lang; open: boolean }) {
  const t = T[lang];
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoad({ kind: 'loading' });
    try {
      const r = await fetch('/api/agent/plugins', { credentials: 'same-origin', cache: 'no-store' });
      if (r.status === 404) { setLoad({ kind: 'hidden' }); return; }
      const body = (await r.json().catch(() => null)) as { plugins?: PluginState[] } | null;
      setLoad(r.ok && Array.isArray(body?.plugins) ? { kind: 'done', plugins: body!.plugins } : { kind: 'failed' });
    } catch {
      setLoad({ kind: 'failed' });
    }
  }, []);

  useEffect(() => { if (open) void refresh(); }, [open, refresh]);

  // The provider's redirect back (?notion=linked | ?github=error&reason=…): said once, then dropped from the URL.
  useEffect(() => {
    try {
      const u = new URL(window.location.href);
      for (const p of ['notion', 'github'] as const) {
        const r = u.searchParams.get(p);
        if (!r) continue;
        setMessage(returnMessage(p, r, u.searchParams.get('reason'), lang));
        u.searchParams.delete(p);
        u.searchParams.delete('reason');
        window.history.replaceState(null, '', u.toString());
      }
    } catch { /* SSR */ }
  }, [lang]);

  const disconnect = async (id: 'notion' | 'github') => {
    setBusy(id);
    setMessage(null);
    try {
      const r = await fetch(`/api/connectors/${id}/disconnect`, { method: 'POST', credentials: 'same-origin' });
      setMessage(r.ok ? t.disconnected : returnMessage(id, 'error', 'failed', lang));
      if (r.ok) await refresh();
    } catch {
      setMessage(returnMessage(id, 'error', 'failed', lang));
    } finally {
      setBusy(null);
    }
  };

  if (load.kind === 'hidden') return null;
  return (
    <section aria-label={t.title} data-testid="plugins-list" className="mt-4">
      <h3 className="mb-2 text-[13px] font-semibold text-app-muted">{t.title}</h3>
      {load.kind === 'loading' && <Loader2 size={16} aria-hidden="true" className="text-app-muted motion-safe:animate-spin" />}
      {load.kind === 'failed' && (
        <div role="status" className="flex items-center gap-3 text-[13px] text-app-text">
          <span>{t.failed}</span>
          <button type="button" onClick={() => void refresh()} data-testid="plugins-retry" className="min-h-[44px] rounded-xl bg-app-elevated px-3">{t.retry}</button>
        </div>
      )}
      {load.kind === 'done' && (
        <ul className="flex flex-col divide-y divide-white/[0.06] rounded-2xl bg-app-surface/60">
          {load.plugins.map((s) => {
            const def = PLUGINS.find((p) => p.id === s.id);
            if (!def) return null;
            const link = s.id === 'notion' || s.id === 'github' ? s.id : null;
            return (
              <li key={s.id} data-testid={`plugin-row-${s.id}`} data-status={s.status} className="flex min-h-[56px] items-center gap-3 px-4 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[14.5px] text-app-text">{def.name[lang]}</p>
                  <p className="text-[12px] leading-snug text-app-muted">{def.does[lang]}</p>
                  {s.blockers.length > 0 && <p className="text-[12px] leading-snug text-app-muted">{s.blockers.map((b) => BLOCKER_TEXT[lang][b]).join(' ')}</p>}
                </div>
                {link && s.status === 'not_connected' ? (
                  <a href={`/api/connectors/${link}/connect?locale=${lang}`} data-testid={`plugin-connect-${link}`}
                    className="inline-flex min-h-[44px] items-center rounded-xl bg-app-accent px-3 text-[13px] font-semibold text-app-bg">{t.connect}</a>
                ) : link && s.status === 'ready' ? (
                  <button type="button" disabled={busy === link} onClick={() => void disconnect(link)} data-testid={`plugin-disconnect-${link}`}
                    className="inline-flex min-h-[44px] items-center gap-1 rounded-xl px-3 text-[13px] text-app-muted hover:bg-app-elevated disabled:opacity-50">
                    {busy === link && <Loader2 size={14} aria-hidden="true" className="motion-safe:animate-spin" />}{t.disconnect}
                  </button>
                ) : (
                  <span className={`text-[12.5px] ${s.status === 'ready' ? 'text-app-accent' : 'text-app-muted'}`}>{STATUS_WORD[lang][s.status]}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {message && <p role="status" className="mt-2 text-[12.5px] text-app-text">{message}</p>}
    </section>
  );
}
