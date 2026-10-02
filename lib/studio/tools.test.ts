/**
 * The studio's one tool list (docs/DESIGN.md §8) — the sidebar, the „+" sheet and the settings' service card all
 * read it, so a service can never be reachable from one door and missing from another.
 */
import { ALL_TOOLS, MORE_TOOLS, PRIMARY_TOOLS, TOOL_META, isToolId, toolName, toolSub } from './tools';

describe('studio tools', () => {
  it('chat first (the hub), video leading the generators, and every service the studio had is still here', () => {
    expect(PRIMARY_TOOLS[0]).toBe('chat');
    expect(PRIMARY_TOOLS[1]).toBe('video');
    expect([...ALL_TOOLS].sort()).toEqual(['avatar', 'chat', 'dubbing', 'image', 'interior', 'model3d', 'montage', 'motion', 'music', 'photo', 'photoshoot', 'presentation', 'product', 'remix', 'swap', 'video'].sort());
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

  it('photo culling sits one level down and says, in every language, that the photos stay on the device', () => {
    expect(MORE_TOOLS).toContain('photo');
    expect(PRIMARY_TOOLS).not.toContain('photo');
    expect(toolName('photo', 'en')).toBe('Photo culling');
    expect(toolSub('photo', 'en')).toBe('Photos never leave your device');
    expect(toolSub('photo', 'ru')).toBe('Фото не покидают ваше устройство');
    expect(toolSub('photo', 'ka')).toBe('ფოტოები შენს მოწყობილობას არ ტოვებს');
    expect(isToolId('photo')).toBe(true);
  });

  it('the interior designer and the photographer are PRIMARY tools — the two agents that were lost must be one tap away, not behind „More"', () => {
    for (const id of ['interior', 'photoshoot'] as const) {
      expect(PRIMARY_TOOLS).toContain(id);
      expect(MORE_TOOLS).not.toContain(id);
      expect(isToolId(id)).toBe(true); // …so ?tool=interior / omni:set-tool reach them
    }
    // They sit beside Image (the tool they specialise), and chat + video still lead the list.
    expect(PRIMARY_TOOLS.slice(0, 5)).toEqual(['chat', 'video', 'image', 'photoshoot', 'interior']);
    expect(toolName('interior', 'en')).toBe('Interior designer');
    expect(toolName('interior', 'ka')).toBe('ინტერიერის დიზაინერი');
    expect(toolName('interior', 'ru')).toBe('Дизайнер интерьеров');
    expect(toolName('photoshoot', 'en')).toBe('Photographer');
    expect(toolName('photoshoot', 'ka')).toBe('ფოტოგრაფი');
    expect(toolName('photoshoot', 'ru')).toBe('Фотограф');
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
