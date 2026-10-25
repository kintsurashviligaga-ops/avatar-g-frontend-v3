import { ALL_TOOLS, type ToolId } from '@/lib/studio/tools';
import { SERVICE_CATEGORIES, usableServices, type L10n, type ServiceCategory } from './services';

export type NavGroup = 'agent' | 'create' | 'work';

export const NAV_GROUP_LABEL: Readonly<Record<NavGroup, L10n>> = {
  agent: { ka: 'Agent G', en: 'Agent G', ru: 'Agent G' },
  create: { ka: 'შექმნა', en: 'Create', ru: 'Создание' },
  work: { ka: 'სამუშაო', en: 'Work', ru: 'Работа' },
};

export interface ToolGroup {
  id: ServiceCategory | 'agent-g';
  group: NavGroup;
  label: L10n;
  tools: ToolId[];
  modeServices: string[];
}

const AGENT_TOOL: ToolId = 'chat';
/** Tools GG took out of every menu (2026-10-21). They stay ToolIds, but no picker, sidebar or sheet lists them. */
export const HIDDEN_TOOLS: ReadonlySet<ToolId> = new Set<ToolId>(['swap', 'photo', 'photoshoot', 'motion', 'dubbing', 'presentation']);
const HIDE = HIDDEN_TOOLS;

export function toolGroups(): ToolGroup[] {
  const ownerOf = new Map<ToolId, ServiceCategory>();
  for (const s of usableServices()) {
    if (s.tool && s.tool !== AGENT_TOOL && !HIDE.has(s.tool) && !ownerOf.has(s.tool)) {
      ownerOf.set(s.tool, s.category);
    }
  }
  const groups: ToolGroup[] = [{ id: 'agent-g', group: 'agent', label: NAV_GROUP_LABEL.agent, tools: [AGENT_TOOL], modeServices: [] }];
  for (const c of SERVICE_CATEGORIES) {
    const tools = [...ownerOf].filter(([, cat]) => cat === c.id).map(([tool]) => tool).filter((t) => !HIDE.has(t));
    if (tools.length === 0) continue;
    groups.push({ id: c.id, group: c.group === 'agent' ? 'work' : c.group, label: c.label, tools, modeServices: [] });
  }
  const placed = new Set(groups.flatMap((g) => g.tools));
  const orphans = ALL_TOOLS.filter((t) => !placed.has(t) && !HIDE.has(t));
  if (orphans.length > 0) groups[0] = { ...groups[0]!, tools: [...groups[0]!.tools, ...orphans] };
  return groups;
}

export function groupOfTool(tool: ToolId): ToolGroup | undefined {
  return toolGroups().find((g) => g.tools.includes(tool));
}

/** The composer's „+" (GG's unified composer, 2026-10-25): the same usable tools as toolGroups(), in three groups. */
export type ComposerGroup = 'main' | 'create' | 'extra';

export const COMPOSER_GROUP_LABEL: Readonly<Record<ComposerGroup, L10n>> = {
  main: { ka: 'მთავარი', en: 'Main', ru: 'Главное' },
  create: { ka: 'შექმნა', en: 'Create', ru: 'Создание' },
  extra: { ka: 'დამატებითი', en: 'More', ru: 'Дополнительно' },
};

/** შექმნა, in GG's order; every other usable tool but the chat is დამატებითი. */
const CREATE_TOOLS: readonly ToolId[] = ['video', 'image', 'music', 'avatar', 'interior'];

export function composerToolGroups(): { id: ComposerGroup; label: L10n; tools: ToolId[] }[] {
  const usable = toolGroups().flatMap((g) => g.tools);
  const create = CREATE_TOOLS.filter((t) => usable.includes(t));
  return [
    { id: 'main', label: COMPOSER_GROUP_LABEL.main, tools: usable.includes(AGENT_TOOL) ? [AGENT_TOOL] : [] },
    { id: 'create', label: COMPOSER_GROUP_LABEL.create, tools: create },
    { id: 'extra', label: COMPOSER_GROUP_LABEL.extra, tools: usable.filter((t) => t !== AGENT_TOOL && !create.includes(t)) },
  ];
}

/** A tool whose every usable service is still beta (3D today): the picker tags it instead of drawing it as finished. */
export function toolIsBeta(tool: ToolId): boolean {
  const own = usableServices().filter((s) => s.tool === tool);
  return own.length > 0 && own.every((s) => s.status === 'beta');
}
