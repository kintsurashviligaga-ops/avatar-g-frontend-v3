/**
 * The plugin list IS the studio's tool list (minus the always-on chat), and the menus' hiding rule keeps the active tool.
 */
import { ALL_TOOLS, PRIMARY_TOOLS } from '@/lib/studio/tools';
import { toolGroups } from '@/lib/catalog/nav';
import { DISABLED_TOOLS_MAX, LOCKED_TOOLS, PLUGGABLE_TOOLS, PLUGIN_GROUPS, isPluggableTool, normalizeDisabledTools, visibleToolIds } from './catalog';

test('every studio tool is pluggable except the chat, in the product order', () => {
  expect(LOCKED_TOOLS).toEqual(['chat']);
  expect(PLUGGABLE_TOOLS).toEqual(ALL_TOOLS.filter((t) => t !== 'chat'));
  expect(DISABLED_TOOLS_MAX).toBe(ALL_TOOLS.length - 1);
  // The migration's cap (32) must stay above the real list.
  expect(DISABLED_TOOLS_MAX).toBeLessThanOrEqual(32);
  // The same groups as the sidebar and the „+" sheet: the service catalog's categories, every tool once.
  expect(PLUGIN_GROUPS.map((g) => g.tools)).toEqual(toolGroups().map((g) => g.tools));
  expect(PLUGIN_GROUPS.flatMap((g) => g.tools).sort()).toEqual([...ALL_TOOLS].sort());
  expect(isPluggableTool('music')).toBe(true);
  expect(isPluggableTool('chat')).toBe(false);
  expect(isPluggableTool('teleport')).toBe(false);
});

test('normalizeDisabledTools keeps known pluggable ids, once, in order — anything else drops out', () => {
  expect(normalizeDisabledTools(['remix', 'music', 'music', 'chat', 'nope', 7, null])).toEqual(['music', 'remix']);
  expect(normalizeDisabledTools('music')).toEqual([]);
  expect(normalizeDisabledTools(null)).toEqual([]);
});

test('visibleToolIds hides the switched-off tools but never the one the user is on', () => {
  const hidden = new Set(['music', 'remix'] as const);
  expect(visibleToolIds(PRIMARY_TOOLS, new Set())).toEqual([...PRIMARY_TOOLS]);
  expect(visibleToolIds(PRIMARY_TOOLS, hidden)).toEqual(PRIMARY_TOOLS.filter((t) => t !== 'music' && t !== 'remix'));
  expect(visibleToolIds(PRIMARY_TOOLS, hidden, 'music')).toEqual(PRIMARY_TOOLS.filter((t) => t !== 'remix'));
});
