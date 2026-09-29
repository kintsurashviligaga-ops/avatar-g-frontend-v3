/**
 * The studio's one tool list (docs/DESIGN.md §8) — the sidebar, the „+" sheet and the settings' service card all
 * read it, so a service can never be reachable from one door and missing from another.
 */
import { ALL_TOOLS, MORE_TOOLS, PRIMARY_TOOLS, TOOL_META, isToolId, toolName, toolSub } from './tools';

describe('studio tools', () => {
  it('video first, chat last, and every service the studio had is still here', () => {
    expect(PRIMARY_TOOLS[0]).toBe('video');
    expect(PRIMARY_TOOLS[PRIMARY_TOOLS.length - 1]).toBe('chat');
    expect([...ALL_TOOLS].sort()).toEqual(['avatar', 'chat', 'dubbing', 'image', 'model3d', 'montage', 'motion', 'music', 'presentation', 'product', 'remix', 'swap', 'video'].sort());
    expect(new Set(ALL_TOOLS).size).toBe(PRIMARY_TOOLS.length + MORE_TOOLS.length); // no tool in both lists
  });

  it('every tool has an icon and a name and a line in all three languages', () => {
    for (const id of ALL_TOOLS) {
      expect(TOOL_META[id].Icon).toBeTruthy();
      for (const l of ['ka', 'en', 'ru'] as const) {
        expect(toolName(id, l).trim().length).toBeGreaterThan(0);
        expect(toolSub(id, l).trim().length).toBeGreaterThan(0);
      }
    }
    expect(toolName('video', 'de')).toBe('ვიდეო'); // an unshipped locale falls back to Georgian
  });

  it('isToolId accepts the ids and nothing else (it guards window events and ?tool=)', () => {
    expect(isToolId('product')).toBe(true);
    expect(isToolId('surgical')).toBe(false);
    expect(isToolId(null)).toBe(false);
    expect(isToolId({})).toBe(false);
  });
});
