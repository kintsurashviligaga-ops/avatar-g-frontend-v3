/**
 * lib/catalog/nav.ts — how the studio's menus group its tools: the sidebar, the composer's „+" sheet and the collapsed
 * rail. All three read THIS, and this reads the service catalog, so a tool sits under the category its
 * catalog services belong to — never a second, hand-kept split (the old PRIMARY / MORE halves were exactly that).
 *
 * Master Task §21–§22: no wall of 17 equal-weight rows. Agent G (the chat) comes first and on its own — writing, code and
 * web search are its capabilities, not separate apps — then the CREATE categories, then WORK.
 *
 * Pure and client-safe.
 */
import { ALL_TOOLS, type ToolId } from '@/lib/studio/tools';
import { SERVICE_CATEGORIES, usableServices, type L10n, type ServiceCategory } from './services';

export type NavGroup = 'agent' | 'create' | 'work';

export const NAV_GROUP_LABEL: Readonly<Record<NavGroup, L10n>> = {
  agent: { ka: 'Agent G', en: 'Agent G', ru: 'Agent G' },
  create: { ka: 'შექმნა', en: 'Create', ru: 'Создание' },
  work: { ka: 'სამუშაო', en: 'Work', ru: 'Работа' },
};

export interface ToolGroup {
  /** A catalog category, or `agent-g` for the chat. */
  id: ServiceCategory | 'agent-g';
  group: NavGroup;
  label: L10n;
  /** The category's studio tools in catalog order; the first is the one its sidebar row opens. */
  tools: ToolId[];
  /**
   * Catalog services that open the lead tool in another MODE and are marked `visibleInSidebar` — „Music video" is the
   * Video tool in music-video mode. Each gets a sidebar row of its own under the lead, because a mode reachable only from
   * inside the panel was not found (the owner, 2026-10-09 18:25Z).
   */
  modeServices: string[];
}

/** The chat is Agent G: every chat-backed service (writing, code, web search) is reached through it. */
const AGENT_TOOL: ToolId = 'chat';

/**
 * Every studio tool exactly once, under the category of the first usable catalog service that runs on it.
 * Categories whose only runtime is the chat fold into Agent G, so they never draw a row that just reopens the chat.
 */
export function toolGroups(): ToolGroup[] {
  const ownerOf = new Map<ToolId, ServiceCategory>();
  for (const s of usableServices()) {
    if (s.tool && s.tool !== AGENT_TOOL && !ownerOf.has(s.tool)) ownerOf.set(s.tool, s.category);
  }
  const groups: ToolGroup[] = [{ id: 'agent-g', group: 'agent', label: NAV_GROUP_LABEL.agent, tools: [AGENT_TOOL], modeServices: [] }];
  for (const c of SERVICE_CATEGORIES) {
    const tools = [...ownerOf].filter(([, cat]) => cat === c.id).map(([tool]) => tool);
    if (tools.length === 0) continue;
    const lead = tools[0]!;
    const onLead = usableServices().filter((s) => s.tool === lead && s.category === c.id);
    const modeServices = onLead.slice(1)
      .filter((s) => s.visibleInSidebar && s.modes.some((m) => m.query))
      .map((s) => s.id);
    groups.push({ id: c.id, group: c.group === 'agent' ? 'work' : c.group, label: c.label, tools, modeServices });
  }
  // A studio tool no usable service runs on would vanish from every menu — the catalog test forbids it; this keeps it
  // reachable anyway (under Agent G) rather than silently orphaned.
  const placed = new Set(groups.flatMap((g) => g.tools));
  const orphans = ALL_TOOLS.filter((t) => !placed.has(t));
  if (orphans.length > 0) groups[0] = { ...groups[0]!, tools: [...groups[0]!.tools, ...orphans] };
  return groups;
}

/** The category a tool is listed under (for marking the active row and opening its section). */
export function groupOfTool(tool: ToolId): ToolGroup | undefined {
  return toolGroups().find((g) => g.tools.includes(tool));
}
