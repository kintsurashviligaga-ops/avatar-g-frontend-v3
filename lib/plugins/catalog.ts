/**
 * lib/plugins/catalog.ts — which studio tools a user may switch off („Plugins" in the Connectors · Plugins · Skills hub), and
 * the one rule every menu uses to hide them. Isomorphic: constants and pure functions only (the route validates against the
 * same list the browser draws, so a stored id can never be one the studio does not know).
 *
 * THE LIST IS lib/studio/tools.ts — the sidebar's „სერვისები", the composer's „+" sheet and the collapsed rail all read it, so
 * a plugin is simply a tool id. Nothing new is invented here: no plugin store, no third-party code, no per-tool settings.
 *
 * ⚠️ A SWITCHED-OFF PLUGIN ONLY HIDES A MENU ROW. It is NOT a security boundary and NOT a billing control: the tool's routes,
 * the `?tool=` deep link, the `omni:set-tool` event and Agent G in the chat all still work, and nothing server-side reads this
 * list before generating or charging. Never gate access, spend or a price on it — that would be a check the user can undo
 * with one tap, and a check that silently fails open when the table is missing.
 */
import { ALL_TOOLS, MORE_TOOLS, PRIMARY_TOOLS, isToolId, type ToolId } from '@/lib/studio/tools';

/**
 * Tools that are always on. The chat is the home page and the hub every other tool (and this switch board) is reached from
 * (docs/DESIGN.md §13) — hiding it would hide the way back.
 */
export const LOCKED_TOOLS: readonly ToolId[] = ['chat'];

/** Every tool a user may hide, in the product's order. */
export const PLUGGABLE_TOOLS: readonly ToolId[] = ALL_TOOLS.filter((id) => !LOCKED_TOOLS.includes(id));

/** The list can never be longer than the tools that exist (the database caps it again, at 32). */
export const DISABLED_TOOLS_MAX = PLUGGABLE_TOOLS.length;

export const isPluggableTool = (v: unknown): v is ToolId => isToolId(v) && !LOCKED_TOOLS.includes(v);

/**
 * Whatever came in (a stored row, a request body) → known, pluggable, unique ids in the product's order. A tool removed from
 * the studio later simply drops out of a stored list instead of breaking it.
 */
export function normalizeDisabledTools(input: unknown): ToolId[] {
  if (!Array.isArray(input)) return [];
  const wanted = new Set(input.filter(isPluggableTool));
  return PLUGGABLE_TOOLS.filter((id) => wanted.has(id));
}

/**
 * The tools a menu draws: `ids` minus the hidden ones — EXCEPT the tool the user is on right now, which stays visible so the
 * menu never loses track of where they are (switching away is what hides it).
 */
export function visibleToolIds(ids: readonly ToolId[], hidden: ReadonlySet<ToolId>, activeId?: ToolId | null): ToolId[] {
  if (hidden.size === 0) return [...ids];
  return ids.filter((id) => !hidden.has(id) || id === activeId);
}

/** The two groups the Plugins tab shows, the same split as the sidebar and the „+" sheet. */
export const PLUGIN_GROUPS: ReadonlyArray<{ id: 'primary' | 'more'; tools: readonly ToolId[] }> = [
  { id: 'primary', tools: PRIMARY_TOOLS },
  { id: 'more', tools: MORE_TOOLS },
];
