'use client';

/**
 * PluginsTab — the studio's tools (lib/studio/tools.ts, the list the sidebar and the „+" sheet draw) with an on/off switch each.
 * A switched-off tool leaves THIS user's menus — the sidebar, the collapsed rail and the „+" sheet — and comes back with one tap.
 *
 *   guest         the list, switches disabled, a sign-in prompt (a guest has no account to keep a choice in)
 *   unavailable   the table is not migrated: switches disabled and one "opening soon" line — never an error
 *   failed        the read failed: one line and a retry; nothing is hidden meanwhile
 *   ready         each switch flips at once and saves in the background; a refused save flips it back and says so
 *
 * The chat has no switch: it is the hub (and the way back here), so its row says „always on" instead of drawing a control
 * that could do nothing.
 *
 * ⚠️ The note under the list is part of the contract: switching a tool off hides a menu row. It does not change a price, a
 * permission or what a deep link opens (lib/plugins/catalog.ts).
 */
import { useId } from 'react';
import { Loader2 } from 'lucide-react';
import { LOCKED_TOOLS, PLUGIN_GROUPS } from '@/lib/plugins/catalog';
import { SERVICE_CATALOGUE } from '@/lib/services/serviceCatalogue';
import { TOOL_META, toolLang, type ToolId } from '@/lib/studio/tools';
import { hubCopy } from './copy';
import { StateTag } from './parts';
import { hubActions, useHubSelector } from './store';

/** The catalogue's „live" flag — the same rule the „+" sheet uses for its „მალე" tag (OmniStudio.liveTool). */
const liveTool = (id: ToolId) => SERVICE_CATALOGUE.find((s) => s.id === id && s.target.kind === 'path')?.live ?? true;

function PluginRow({ id, locale, on, interactive }: { id: ToolId; locale: string; on: boolean; interactive: boolean }) {
  const c = hubCopy(locale);
  const lang = toolLang(locale);
  const { Icon, name, sub } = TOOL_META[id];
  const subId = useId();
  const locked = LOCKED_TOOLS.includes(id);
  const body = (
    <>
      <Icon size={20} aria-hidden="true" className={`shrink-0 ${on ? 'text-app-text/80' : 'text-app-muted/60'}`} />
      <span className="min-w-0 flex-1">
        <span className={`block text-[15px] font-medium leading-tight ${on ? 'text-app-text' : 'text-app-muted'}`}>{name[lang]}</span>
        <span id={subId} className="mt-0.5 block truncate text-[12.5px] leading-tight text-app-muted">{sub[lang]}</span>
      </span>
      {!liveTool(id) && <StateTag label={c.soon} />}
    </>
  );
  if (locked) {
    return (
      <li data-testid={`plugin-row-${id}`} data-locked="true" className="flex min-h-[56px] items-center gap-3.5 rounded-2xl px-3">
        {body}
        <span className="shrink-0 text-[11.5px] font-medium text-app-muted">{c.plugAlwaysOn}</span>
      </li>
    );
  }
  return (
    <li data-testid={`plugin-row-${id}`}>
      <button type="button" role="switch" aria-checked={on} aria-label={name[lang]} aria-describedby={subId} disabled={!interactive}
        data-testid={`plugin-switch-${id}`} onClick={() => hubActions.setPlugin(id, !on)}
        className="flex min-h-[56px] w-full items-center gap-3.5 rounded-2xl px-3 text-left transition-colors hover:bg-app-elevated/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent">
        {body}
        {/* The track: accent when shown, a hairline grey when hidden. Decorative — the role and aria-checked carry the state. */}
        <span aria-hidden="true" className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors motion-reduce:transition-none ${on ? 'bg-app-accent' : 'bg-app-border/25'}`}>
          <span className={`absolute top-[3px] h-[18px] w-[18px] rounded-full bg-white shadow transition-[left] motion-reduce:transition-none ${on ? 'left-[23px]' : 'left-[3px]'}`} />
        </span>
      </button>
    </li>
  );
}

export function PluginsTab({ locale, authed }: { locale: string; authed: boolean }) {
  const c = hubCopy(locale);
  const p = useHubSelector((s) => s.plugins);
  const hidden = new Set(p.status === 'ready' ? p.disabled : []);
  const interactive = authed && p.status === 'ready';
  const headId = useId();

  return (
    <div className="space-y-3 px-2 pb-2 pt-1" data-testid="plugins-tab" data-status={authed ? p.status : 'guest'}>
      <p className="text-[13.5px] leading-relaxed text-app-muted">{c.plugLead}</p>

      {!authed ? (
        <div className="flex items-center justify-between gap-2 rounded-2xl bg-app-elevated/50 px-3 py-2 text-[12.5px] text-app-muted" data-testid="plugins-signin">
          <span>{c.plugSignIn}</span>
          <button type="button" onClick={() => { try { window.dispatchEvent(new CustomEvent('myavatar:auth-required')); } catch { /* SSR */ } }}
            className="inline-flex min-h-[44px] shrink-0 items-center rounded-full bg-app-accent px-4 font-semibold text-app-bg hover:opacity-90">{c.signIn}</button>
        </div>
      ) : p.status === 'unavailable' ? (
        <p className="rounded-2xl bg-app-elevated/50 px-3 py-2.5 text-[12.5px] text-app-muted" data-testid="plugins-soon">{c.plugSoon}</p>
      ) : p.status === 'failed' ? (
        <div className="flex items-center justify-between gap-2 rounded-2xl bg-app-elevated/50 px-3 py-1 text-[12.5px] text-app-text" role="alert" data-testid="plugins-failed">
          <span>{c.plugLoadFailed}</span>
          <button type="button" onClick={() => void hubActions.loadPlugins()} className="inline-flex min-h-[44px] shrink-0 items-center rounded-full px-3 font-semibold text-app-accent hover:bg-app-elevated">{c.retry}</button>
        </div>
      ) : p.status === 'loading' || p.status === 'idle' ? (
        <Loader2 size={16} className="text-app-muted motion-safe:animate-spin" aria-label={c.states.checking} />
      ) : null}

      {PLUGIN_GROUPS.map((g) => (
        <section key={g.id} aria-labelledby={`${headId}-${g.id}`}>
          <h3 id={`${headId}-${g.id}`} className="px-1 pb-1 pt-1 text-[12px] font-medium text-app-muted">{g.id === 'primary' ? c.plugPrimary : c.plugMore}</h3>
          <ul className="space-y-0.5">
            {g.tools.map((id) => <PluginRow key={id} id={id} locale={locale} on={!hidden.has(id)} interactive={interactive} />)}
          </ul>
        </section>
      ))}

      <p className="px-1 text-[12px] leading-snug text-app-muted">{c.plugNote}</p>
      {/* One polite line for the background save: „Saving…" then „Saved"; a refusal is an alert of its own. */}
      <p role="status" aria-live="polite" data-testid="plugins-save-status" className="min-h-[1.25rem] px-1 text-[12px] text-app-muted">
        {p.saving ? c.plugSaving : p.saved ? c.plugSaved : ''}
      </p>
      {p.saveFailed && <p role="alert" data-testid="plugins-save-failed" className="px-1 text-[12.5px] leading-snug text-app-text">{c.plugSaveFailed}</p>}
    </div>
  );
}
