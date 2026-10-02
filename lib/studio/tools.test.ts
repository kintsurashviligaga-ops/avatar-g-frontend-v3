/**
 * The studio's one tool list (docs/DESIGN.md §8) — the sidebar, the „+" sheet and the settings' service card all
 * read it, so a service can never be reachable from one door and missing from another.
 */
import { ALL_TOOLS, MORE_TOOLS, PRIMARY_TOOLS, TOOL_META, isToolId, toolName, toolSub } from './tools';

describe('studio tools', () => {
  it('chat first (the hub), video leading the generators, and every service the studio had is still here', () => {
    expect(PRIMARY_TOOLS[0]).toBe('chat');
    expect(PRIMARY_TOOLS[1]).toBe('video');
    expect([...ALL_TOOLS].sort()).toEqual(['avatar', 'chat', 'dubbing', 'image', 'model3d', 'montage', 'motion', 'music', 'photo', 'presentation', 'product', 'remix', 'swap', 'vfx', 'video'].sort());
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

  it('VFX sits one level down beside the other video variants, in all three languages, and its line promises nothing that is not open', () => {
    expect(MORE_TOOLS).toContain('vfx');
    expect(PRIMARY_TOOLS).not.toContain('vfx');
    expect(MORE_TOOLS.indexOf('vfx')).toBe(MORE_TOOLS.indexOf('swap') + 1); // next to product ad and character swap, the other video tabs
    expect(isToolId('vfx')).toBe(true);
    expect(toolName('vfx', 'en')).toBe('VFX');
    for (const l of ['ka', 'en', 'ru'] as const) expect(toolSub('vfx', l)).not.toMatch(/motion transfer|მოძრაობის გადატანა|перенос движения/i);
  });

  it('photo culling sits one level down and says, in every language, that the photos stay on the device', () => {
    expect(MORE_TOOLS).toContain('photo');
    expect(PRIMARY_TOOLS).not.toContain('photo');
    expect(toolName('photo', 'en')).toBe('Photo culling');
    expect(toolSub('photo', 'en')).toBe('Photos never leave your device');
    expect(toolSub('photo', 'ru')).toBe('Фото не покидают ваше устройство');
    expect(toolSub('photo', 'ka')).toBe('ფოტოები შენს მოწყობილობას არ ტოვებს');
    expect(isToolId('photo')).toBe(true);
  });

  it('isToolId accepts the ids and nothing else (it guards window events and ?tool=)', () => {
    expect(isToolId('product')).toBe(true);
    expect(isToolId('surgical')).toBe(false);
    expect(isToolId(null)).toBe(false);
    expect(isToolId({})).toBe(false);
  });
});
