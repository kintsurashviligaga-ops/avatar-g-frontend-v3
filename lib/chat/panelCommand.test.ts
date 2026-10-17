/**
 * lib/chat/panelCommand — the studio's own controls by text and voice, in any tool (GG's plan 2026-10-17 11:28Z, item 1).
 * GG's own three examples are pinned verbatim; every tool is reachable by its own name in all three languages; and a
 * message that asks for more than a panel is never taken for one.
 */
import { ALL_TOOLS, TOOL_META, toolName, type ToolId } from '@/lib/studio/tools';
import { decidePanelCommand, panelCommand, panelCommandReply, type PanelCommand } from './panelCommand';

describe('GG’s examples (2026-10-17 11:28Z)', () => {
  test('„გახსენი ვიდეო" opens Video', () => {
    expect(panelCommand('გახსენი ვიდეო')).toEqual({ kind: 'open', tool: 'video', via: 'open' });
  });
  test('„გავაკეთოთ ავატარი" opens the Avatar tool and asks for the rest (no avatar is ordered from those two words)', () => {
    expect(panelCommand('გავაკეთოთ ავატარი')).toEqual({ kind: 'open', tool: 'avatar', via: 'make' });
  });
  test('„ჩაკეტე პანელი" closes the panel', () => {
    expect(panelCommand('ჩაკეტე პანელი')).toEqual({ kind: 'close', what: 'panel' });
  });
});

describe('commands, ka · en · ru', () => {
  const cases: Array<[string, PanelCommand]> = [
    ['გამიხსენი სურათი', { kind: 'open', tool: 'image', via: 'open' }],
    ['ვიდეოს მონტაჟი გამიხსენი', { kind: 'open', tool: 'montage', via: 'open' }],
    ['გადადი მუსიკაზე', { kind: 'open', tool: 'music', via: 'open' }],
    ['გთხოვ, გახსენი პრეზენტაცია.', { kind: 'open', tool: 'presentation', via: 'open' }],
    ['მოდი ავატარი გავაკეთოთ', { kind: 'open', tool: 'avatar', via: 'make' }],
    ['დახურე პარამეტრები', { kind: 'close', what: 'settings' }],
    ['დახურე ვიდეო', { kind: 'close', what: 'tool', tool: 'video' }],
    ['გამოდი ვიდეოდან', { kind: 'close', what: 'tool', tool: 'video' }],
    ['დახურე', { kind: 'close', what: 'panel' }],
    ['დაბრუნდი ჩატში', { kind: 'close', what: 'tool' }],
    ['გახსენი ჩატი', { kind: 'open', tool: 'chat', via: 'open' }],
    ['გახსენი პარამეტრები', { kind: 'panel', panel: 'settings' }],
    ['გახსენი პანელი', { kind: 'panel', panel: 'settings' }],
    ['გახსენი კრედიტები', { kind: 'panel', panel: 'credits' }],
    ['გახსენი ისტორია', { kind: 'panel', panel: 'history' }],
    ['Open video', { kind: 'open', tool: 'video', via: 'open' }],
    ['please open the image tool', { kind: 'open', tool: 'image', via: 'open' }],
    ['switch to music', { kind: 'open', tool: 'music', via: 'open' }],
    ['go to the video editor', { kind: 'open', tool: 'montage', via: 'open' }],
    ["let's make an avatar", { kind: 'open', tool: 'avatar', via: 'make' }],
    ['close the panel', { kind: 'close', what: 'panel' }],
    ['hide settings', { kind: 'close', what: 'settings' }],
    ['close the tool', { kind: 'close', what: 'tool' }],
    ['go back to the chat', { kind: 'close', what: 'tool' }],
    ['open credits', { kind: 'panel', panel: 'credits' }],
    ['открой видео', { kind: 'open', tool: 'video', via: 'open' }],
    ['давай сделаем аватар', { kind: 'open', tool: 'avatar', via: 'make' }],
    ['закрой панель', { kind: 'close', what: 'panel' }],
    ['вернись в чат', { kind: 'close', what: 'tool' }],
    ['перейди в музыку', { kind: 'open', tool: 'music', via: 'open' }],
  ];
  test.each(cases)('%s', (text, want) => {
    expect(panelCommand(text)).toEqual(want);
  });
});

test('every tool opens by its own name, in every language the studio speaks', () => {
  for (const id of ALL_TOOLS) {
    for (const [verb, l] of [['გახსენი', 'ka'], ['open', 'en'], ['открой', 'ru']] as const) {
      const name = TOOL_META[id].name[l];
      expect([name, panelCommand(`${verb} ${name}`)]).toEqual([name, { kind: 'open', tool: id, via: 'open' }]);
    }
  }
});

describe('not a command: it goes on to the routers as before', () => {
  test.each([
    'გახსენი ვიდეო და დაამატე მუსიკა',
    'გავაკეთოთ ვიდეო ზღვაზე',
    'open a video of a cat',
    'make a song about the sea',
    'როგორ გავხსნა ვიდეო?',
    'how do I open video',
    'open video?',
    'არ დახურო',
    'ვიდეო',
    'გახსენი ვიდეო და მუსიკა',
    'open and close video',
    'გავაკეთოთ ისტორია',
    'დახურე ჩატი',
    'go back',
    'დამიხატე კატა',
    'შეცვალე მე-2 სცენა',
    'კი',
    '',
  ])('%s', (text) => {
    expect(panelCommand(text)).toBeNull();
  });

  test('a long message is never a command', () => {
    expect(panelCommand(`გახსენი ვიდეო ${'გთხოვ '.repeat(20)}`)).toBeNull();
  });
});

describe('what the studio does', () => {
  const screen = (tool: ToolId, settingsOpen = false) => ({ tool, settingsOpen });

  test('open another tool: it switches (in the same conversation; the act names only the tool)', () => {
    expect(decidePanelCommand({ kind: 'open', tool: 'avatar', via: 'make' }, screen('video', true)))
      .toEqual({ act: { tool: 'avatar' }, outcome: { did: 'opened', tool: 'avatar' } });
  });

  test('open the tool already open: its settings come up', () => {
    expect(decidePanelCommand({ kind: 'open', tool: 'video', via: 'open' }, screen('video', false)))
      .toEqual({ act: { settings: 'open' }, outcome: { did: 'already', tool: 'video' } });
    expect(decidePanelCommand({ kind: 'open', tool: 'video', via: 'open' }, screen('video', true)).act).toEqual({});
  });

  test('„close the panel": the settings first, then the tool', () => {
    expect(decidePanelCommand({ kind: 'close', what: 'panel' }, screen('video', true)))
      .toEqual({ act: { settings: 'close' }, outcome: { did: 'closed-settings' } });
    expect(decidePanelCommand({ kind: 'close', what: 'panel' }, screen('video', false)))
      .toEqual({ act: { tool: 'chat' }, outcome: { did: 'closed-tool', tool: 'video' } });
  });

  test('a studio that is its panel closes as a whole (dubbing, the editor)', () => {
    expect(decidePanelCommand({ kind: 'close', what: 'settings' }, screen('dubbing', true)))
      .toEqual({ act: { tool: 'chat' }, outcome: { did: 'closed-tool', tool: 'dubbing' } });
    expect(decidePanelCommand({ kind: 'close', what: 'panel' }, screen('montage', false)).act).toEqual({ tool: 'chat' });
  });

  test('close a tool that is not open, or anything in the chat: nothing changes, and Agent G says so', () => {
    expect(decidePanelCommand({ kind: 'close', what: 'tool', tool: 'music' }, screen('video', true)))
      .toEqual({ act: {}, outcome: { did: 'not-open', tool: 'music' } });
    expect(decidePanelCommand({ kind: 'close', what: 'panel' }, screen('chat')))
      .toEqual({ act: {}, outcome: { did: 'nothing' } });
    expect(decidePanelCommand({ kind: 'close', what: 'settings' }, screen('image', false)))
      .toEqual({ act: {}, outcome: { did: 'settings-closed' } });
  });

  test('the chat has no settings; the other panels open anywhere', () => {
    expect(decidePanelCommand({ kind: 'panel', panel: 'settings' }, screen('chat')).outcome).toEqual({ did: 'no-settings' });
    expect(decidePanelCommand({ kind: 'panel', panel: 'credits' }, screen('chat')).act).toEqual({ panel: 'credits' });
  });

  test('back to the chat from a tool', () => {
    expect(decidePanelCommand({ kind: 'close', what: 'tool' }, screen('avatar', true)))
      .toEqual({ act: { tool: 'chat' }, outcome: { did: 'closed-tool', tool: 'avatar' } });
  });
});

describe('what Agent G says', () => {
  const name = (t: ToolId) => toolName(t, 'ka');
  test('opened, in the UI language, with the next step for a generator', () => {
    expect(panelCommandReply({ did: 'opened', tool: 'video' }, 'ka', name)).toBe('გავხსენი **ვიდეო**. მითხარი, რაზე იყოს ფილმი.');
    expect(panelCommandReply({ did: 'opened', tool: 'avatar' }, 'en', (t) => toolName(t, 'en'))).toBe('Opened **Avatar**. Write what the avatar says, or attach a photo.');
    expect(panelCommandReply({ did: 'opened', tool: 'dubbing' }, 'ru', (t) => toolName(t, 'ru'))).toBe('Открыл **Дубляж**.');
  });
  test('closed and nothing-to-close', () => {
    expect(panelCommandReply({ did: 'closed-tool', tool: 'video' }, 'ka', name)).toBe('დავხურე **ვიდეო**, ჩატში ვართ.');
    expect(panelCommandReply({ did: 'nothing' }, 'ka', name)).toBe('დასახური არაფერია: ჩატში ვართ.');
  });
});
