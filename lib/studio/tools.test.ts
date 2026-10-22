/**
 * The studio's one tool list (docs/DESIGN.md §8) — the sidebar, the „+" sheet and the settings' service card all
 * read it, so a service can never be reachable from one door and missing from another.
 */
import { ALL_TOOLS, MORE_TOOLS, PRIMARY_TOOLS, TOOL_META, isToolId, toolName, toolSub } from './tools';

describe('studio tools', () => {
  it('chat first (the hub), video leading the generators, and exactly the services GG kept in the menu', () => {
    expect(PRIMARY_TOOLS[0]).toBe('chat');
    expect(PRIMARY_TOOLS[1]).toBe('video');
    expect([...ALL_TOOLS].sort()).toEqual(['avatar', 'chat', 'image', 'interior', 'model3d', 'montage', 'music', 'product', 'vfx', 'video'].sort());
    expect(isToolId('remix')).toBe(false); // retired from every menu (GG 2026-10-18); the chat's touch-up lane keeps the id
    // GG's menu clean-up (2026-10-21): these left every menu, deep link and panel command; their ids and lines stay.
    for (const id of ['photoshoot', 'swap', 'motion', 'dubbing', 'presentation', 'photo'] as const) {
      expect(isToolId(id)).toBe(false);
      expect(TOOL_META[id]).toBeDefined();
    }
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
    expect(MORE_TOOLS.indexOf('vfx')).toBe(MORE_TOOLS.indexOf('product') + 1); // next to product ad, the other video tab
    expect(isToolId('vfx')).toBe(true);
    expect(toolName('vfx', 'en')).toBe('VFX');
    for (const l of ['ka', 'en', 'ru'] as const) expect(toolSub('vfx', l)).not.toMatch(/motion transfer|მოძრაობის გადატანა|перенос движения/i);
  });

  it('photo culling left the menus, and its line still says, in every language, that the photos stay on the device', () => {
    expect(ALL_TOOLS).not.toContain('photo');
    expect(toolName('photo', 'en')).toBe('Photo culling');
    expect(toolSub('photo', 'en')).toBe('Photos never leave your device');
    expect(toolSub('photo', 'ru')).toBe('Фото не покидают ваше устройство');
    expect(toolSub('photo', 'ka')).toBe('ფოტოები შენს მოწყობილობას არ ტოვებს');
  });

  it('the interior designer is a PRIMARY tool — an agent that was lost must be one tap away, not behind „More"', () => {
    expect(PRIMARY_TOOLS).toContain('interior');
    expect(MORE_TOOLS).not.toContain('interior');
    expect(isToolId('interior')).toBe(true); // …so ?tool=interior / omni:set-tool reach it
    // It sits beside Image (the tool it specialises), and chat + video still lead the list.
    expect(PRIMARY_TOOLS).toEqual(['chat', 'video', 'image', 'interior', 'music', 'avatar']);
    expect(toolName('interior', 'en')).toBe('Interior');
    expect(toolName('interior', 'ka')).toBe('ინტერიერი');
    expect(toolName('interior', 'ru')).toBe('Интерьер');
    expect(toolName('photoshoot', 'en')).toBe('Photographer');
  });

  it('`photoshoot` is NOT `photo`: culling stays on the device and untouched, the photographer makes new pictures', () => {
    expect(TOOL_META.photoshoot.Icon).not.toBe(TOOL_META.photo.Icon);
    expect(toolName('photoshoot', 'en')).not.toBe(toolName('photo', 'en'));
    expect(toolSub('photo', 'en')).toBe('Photos never leave your device'); // the culling promise is unchanged
    expect(toolSub('photoshoot', 'en')).not.toMatch(/never leave your device/i);
  });

  it('isToolId accepts the ids and nothing else (it guards window events and ?tool=)', () => {
    expect(isToolId('product')).toBe(true);
    expect(isToolId('surgical')).toBe(false);
    expect(isToolId(null)).toBe(false);
    expect(isToolId({})).toBe(false);
  });
});
