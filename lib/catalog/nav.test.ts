import { toolGroups, groupOfTool, NAV_GROUP_LABEL } from './nav';
import { ALL_TOOLS } from '@/lib/studio/tools';

describe('toolGroups — the studio menus come from the catalog', () => {
  const groups = toolGroups();

  it('lists every studio tool exactly once', () => {
    const all = groups.flatMap((g) => g.tools);
    expect(new Set(all).size).toBe(all.length);
    expect([...all].sort()).toEqual([...ALL_TOOLS].sort());
  });

  it('puts Agent G (the chat) first and alone', () => {
    expect(groups[0]).toMatchObject({ id: 'agent-g', group: 'agent', tools: ['chat'] });
  });

  it('groups the tools by catalog category, CREATE before WORK', () => {
    expect(groups.map((g) => [g.id, g.tools])).toEqual([
      ['agent-g', ['chat']],
      ['video', ['video', 'product', 'vfx', 'montage']],
      ['image-photo', ['image', 'interior', 'model3d']],
      ['avatar', ['avatar']],
      ['music', ['music']],
    ]);
    const order = groups.map((g) => ({ agent: 0, create: 1, work: 2 })[g.group]);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('never draws a category whose only runtime is the chat', () => {
    for (const id of ['text-content', 'code', 'web-research']) expect(groups.some((g) => g.id === id)).toBe(false);
  });

  it('finds the group of a tool', () => {
    expect(groupOfTool('model3d')?.id).toBe('image-photo');
    expect(groupOfTool('chat')?.id).toBe('agent-g');
  });

  it('keeps Video first without advertising removed standalone mode rows', () => {
    const video = groups.find((g) => g.id === 'video');
    expect(video?.tools[0]).toBe('video');
    expect(groups.flatMap((g) => g.modeServices)).toEqual([]);
  });

  it('labels every group in ka, en and ru', () => {
    for (const g of groups) for (const t of [g.label.ka, g.label.en, g.label.ru]) expect(t.trim()).not.toBe('');
    for (const t of Object.values(NAV_GROUP_LABEL)) expect(t.ka && t.en && t.ru).toBeTruthy();
  });

  it('keeps withdrawn tools out of every group and group lookup', () => {
    for (const tool of ['swap', 'motion', 'photoshoot', 'photo', 'dubbing', 'presentation', 'remix'] as const) {
      expect(groups.flatMap((g) => g.tools)).not.toContain(tool);
      expect(groupOfTool(tool)).toBeUndefined();
    }
  });
});
