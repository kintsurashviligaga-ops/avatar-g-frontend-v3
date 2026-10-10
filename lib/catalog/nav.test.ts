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
      ['video', ['video', 'product', 'swap', 'motion', 'vfx', 'remix', 'montage']],
      ['image-photo', ['image', 'photoshoot', 'interior', 'photo']],
      ['avatar', ['avatar']],
      ['music', ['music']],
      ['voice-audio', ['dubbing']],
      ['design', ['presentation', 'model3d']],
    ]);
    const order = groups.map((g) => g.group);
    expect(order.lastIndexOf('create')).toBeLessThan(order.indexOf('work'));
  });

  it('never draws a category whose only runtime is the chat', () => {
    for (const id of ['text-content', 'code', 'web-research']) expect(groups.some((g) => g.id === id)).toBe(false);
  });

  it('finds the group of a tool', () => {
    expect(groupOfTool('dubbing')?.id).toBe('voice-audio');
    expect(groupOfTool('model3d')?.id).toBe('design');
    expect(groupOfTool('chat')?.id).toBe('agent-g');
  });

  it('gives „Music video" a row of its own under Video (a mode found only inside the panel was not found), and nothing else', () => {
    const video = groups.find((g) => g.id === 'video');
    expect(video?.tools[0]).toBe('video');
    expect(video?.modeServices).toEqual(['video.music-video']);
    expect(groups.filter((g) => g.id !== 'video').flatMap((g) => g.modeServices)).toEqual([]);
  });

  it('labels every group in ka, en and ru', () => {
    for (const g of groups) for (const t of [g.label.ka, g.label.en, g.label.ru]) expect(t.trim()).not.toBe('');
    for (const t of Object.values(NAV_GROUP_LABEL)) expect(t.ka && t.en && t.ru).toBeTruthy();
  });
});
