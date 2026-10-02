/**
 * components/studio/hub/store.ts — ONE module-level store for the Connectors · Plugins · Skills hub, read with
 * useSyncExternalStore (the pattern of components/studio/research/store.ts). The sidebar row and the hub sheet (ChatChrome),
 * the sidebar's tool list (ChatChrome) and the „+" sheet (OmniStudio) share no React provider, so they share this: whether the
 * hub is open and on which tab, the user's switched-off tools, and the messaging channels' runtime state.
 *
 * THE SERVER IS THE SOURCE OF TRUTH. Nothing is persisted in the browser: a reload re-reads GET /api/plugins. A switch flips
 * at once (optimistic), quick taps coalesce into one PUT, and a refused save puts the switch back and says so.
 *
 * ⚠️ `hiddenTools` hides MENU ROWS and nothing else — never read it to block a route, a deep link or a charge
 * (lib/plugins/catalog.ts says why).
 */
import { useMemo, useSyncExternalStore } from 'react';
import type { ToolId } from '@/lib/studio/tools';
import { normalizeDisabledTools } from '@/lib/plugins/catalog';
import { fetchChannels, fetchPlugins, savePlugins } from './api';

export type HubTab = 'connectors' | 'plugins' | 'skills';
export const HUB_TABS: readonly HubTab[] = ['connectors', 'plugins', 'skills'];
export const isHubTab = (v: unknown): v is HubTab => typeof v === 'string' && (HUB_TABS as readonly string[]).includes(v);

/**
 *   idle         nobody signed in (or not asked yet) — nothing hidden, the tab shows the sign-in prompt
 *   loading      asking the server
 *   ready        the list is the server's; switches work
 *   unavailable  the table is not migrated yet — switches disabled, "opening soon"
 *   failed       the read failed — a retry line, nothing hidden
 */
export type PluginStatus = 'idle' | 'loading' | 'ready' | 'unavailable' | 'failed';

export interface PluginState {
  /** Whose list this is (the signed-in account), so a sign-out or a switch of account never shows the previous one's. */
  owner: string | null;
  status: PluginStatus;
  /** What the switches show — the server's list plus any change still being saved. */
  disabled: ToolId[];
  /** The last list the server confirmed: what a refused save falls back to. */
  confirmed: ToolId[];
  saving: boolean;
  saveFailed: boolean;
  /** The last change landed (the tab says „Saved" until the next tap). */
  saved: boolean;
}

export interface ChannelsState {
  status: 'idle' | 'loading' | 'ready' | 'failed';
  telegramReady: boolean;
  whatsappReady: boolean;
}

export interface HubState {
  open: boolean;
  tab: HubTab;
  plugins: PluginState;
  channels: ChannelsState;
}

const INITIAL_PLUGINS: PluginState = { owner: null, status: 'idle', disabled: [], confirmed: [], saving: false, saveFailed: false, saved: false };
const INITIAL: HubState = {
  open: false,
  tab: 'connectors',
  plugins: INITIAL_PLUGINS,
  channels: { status: 'idle', telegramReady: false, whatsappReady: false },
};

let state: HubState = INITIAL;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
function set(patch: Partial<HubState>): void {
  state = { ...state, ...patch };
  emit();
}
function setPlugins(patch: Partial<PluginState>): void {
  set({ plugins: { ...state.plugins, ...patch } });
}

export const getHubState = (): HubState => state;
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
};

export function useHubSelector<T>(sel: (s: HubState) => T): T {
  return useSyncExternalStore(subscribe, () => sel(state), () => sel(INITIAL));
}
export const useHubState = (): HubState => useSyncExternalStore(subscribe, () => state, () => INITIAL);

const NOTHING_HIDDEN: ReadonlySet<ToolId> = new Set();

/**
 * The tools this user switched off — for the menus. Empty unless the server's list is loaded (`ready`): a guest, an unmigrated
 * table or a failed read hides nothing.
 */
export function useHiddenTools(): ReadonlySet<ToolId> {
  const list = useHubSelector((s) => (s.plugins.status === 'ready' ? s.plugins.disabled : null));
  return useMemo(() => (list && list.length > 0 ? new Set(list) : NOTHING_HIDDEN), [list]);
}

// ─── saving: optimistic, coalesced, last write wins ────────────────────────────────────────────────────────────────

/** Quick taps on several switches become one PUT. */
let saveDelayMs = 350;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let inflight = false;
let loadSeq = 0;

const same = (a: readonly ToolId[], b: readonly ToolId[]) => a.length === b.length && a.every((v, i) => v === b[i]);

async function flush(): Promise<void> {
  saveTimer = null;
  if (inflight) return; // the running save flushes again when it lands
  const owner = state.plugins.owner;
  const want = state.plugins.disabled;
  if (state.plugins.status !== 'ready' || same(want, state.plugins.confirmed)) {
    if (state.plugins.saving) setPlugins({ saving: false });
    return;
  }
  inflight = true;
  setPlugins({ saving: true, saveFailed: false });
  const r = await savePlugins(want);
  inflight = false;
  // Signed out (or another account) while the request was out: its answer belongs to nobody on screen.
  if (state.plugins.owner !== owner) return;
  if (r.ok) {
    const changedSince = !same(state.plugins.disabled, want);
    setPlugins({ confirmed: r.disabledTools, ...(changedSince ? {} : { disabled: r.disabledTools }) });
    if (changedSince) { void flush(); return; }
    setPlugins({ saving: false, saved: true });
    return;
  }
  // Refused: every switch goes back to what the server last confirmed, and the tab says so in one line.
  if (r.unavailable) setPlugins({ status: 'unavailable', disabled: state.plugins.confirmed, saving: false });
  else if (r.unauthorized) setPlugins({ ...INITIAL_PLUGINS, owner: null });
  else setPlugins({ disabled: state.plugins.confirmed, saving: false, saveFailed: true });
}

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { void flush(); }, saveDelayMs);
}

export const hubActions = {
  open(tab?: HubTab): void {
    set({ open: true, ...(tab ? { tab } : {}) });
  },
  close(): void {
    set({ open: false });
  },
  setTab(tab: HubTab): void {
    if (state.tab !== tab) set({ tab });
  },

  /**
   * Who is signed in now (null = nobody). A different account starts from an empty list — the previous one's choices must
   * never show, not even for a moment — and is read from the server.
   */
  syncUser(owner: string | null): void {
    if (owner === state.plugins.owner && state.plugins.status !== 'idle') return;
    if (owner === state.plugins.owner && !owner) return;
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    setPlugins({ ...INITIAL_PLUGINS, owner });
    if (owner) void hubActions.loadPlugins();
  },

  async loadPlugins(): Promise<void> {
    const owner = state.plugins.owner;
    if (!owner) return;
    const seq = ++loadSeq;
    setPlugins({ status: 'loading', saveFailed: false });
    const r = await fetchPlugins();
    if (seq !== loadSeq || state.plugins.owner !== owner) return;
    if (r.ok && r.available) setPlugins({ status: 'ready', disabled: r.disabledTools, confirmed: r.disabledTools });
    else if (r.ok) setPlugins({ status: 'unavailable', disabled: [], confirmed: [] });
    else if (r.unauthorized) setPlugins({ status: 'idle', disabled: [], confirmed: [] });
    else setPlugins({ status: 'failed', disabled: [], confirmed: [] });
  },

  /** Show (`on`) or hide one tool. Only while the server's list is loaded — otherwise there is nothing to change. */
  setPlugin(id: ToolId, on: boolean): void {
    const p = state.plugins;
    if (p.status !== 'ready') return;
    const next = normalizeDisabledTools(on ? p.disabled.filter((t) => t !== id) : [...p.disabled, id]);
    if (same(next, p.disabled)) return;
    setPlugins({ disabled: next, saving: true, saveFailed: false, saved: false });
    scheduleSave();
  },

  /** The messaging channels' runtime state — asked when the hub opens (cheap, public, no account data kept). */
  async loadChannels(force = false): Promise<void> {
    if (!force && (state.channels.status === 'loading' || state.channels.status === 'ready')) return;
    set({ channels: { ...state.channels, status: 'loading' } });
    const r = await fetchChannels();
    set({ channels: r.ok ? { status: 'ready', telegramReady: r.telegramReady, whatsappReady: r.whatsappReady } : { status: 'failed', telegramReady: false, whatsappReady: false } });
  },
};

/** Test hooks. */
export function resetHubStoreForTests(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  inflight = false;
  loadSeq = 0;
  saveDelayMs = 350;
  state = INITIAL;
  emit();
}
export function setPluginSaveDelayForTests(ms: number): void {
  saveDelayMs = ms;
}
