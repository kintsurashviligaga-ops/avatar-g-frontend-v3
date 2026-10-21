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
export const REMOVED_MENU_TOOLS = new Set<ToolId>([
  'swap',
  'photo',
  'photoshoot',
  'motion',
  'dubbing',
  'presentation',
]);

export function toolGroups(): ToolGroup[] {
  const ownerOf = new Map<ToolId, ServiceCategory>();
  for (const s of usableServices()) {
    if (s.tool && s.tool !== AGENT_TOOL && !REMOVED_MENU_TOOLS.has(s.tool) && !ownerOf.has(s.tool)) {
      ownerOf.set(s.tool, s.category);
    }
  }
  const groups: ToolGroup[] = [{ id: 'agent-g', group: 'agent', label: NAV_GROUP_LABEL.agent, tools: [AGENT_TOOL], modeServices: [] }];
  for (const c of SERVICE_CATEGORIES) {
    const tools = [...ownerOf]
      .filter(([, cat]) => cat === c.id)
      .map(([tool]) => tool)
      .filter((t) => !REMOVED_MENU_TOOLS.has(t));
    if (tools.length === 0) continue;
    groups.push({ id: c.id, group: c.group === 'agent' ? 'work' : c.group, label: c.label, tools, modeServices: [] });
  }
  const placed = new Set(groups.flatMap((g) => g.tools));
  const orphans = ALL_TOOLS.filter((t) => !placed.has(t) && !REMOVED_MENU_TOOLS.has(t));
  if (orphans.length > 0) groups[0] = { ...groups[0]!, tools: [...groups[0]!.tools, ...orphans] };
  return groups;
}

export function groupOfTool(tool: ToolId): ToolGroup | undefined {
  return toolGroups().find((g) => g.tools.includes(tool));
}
