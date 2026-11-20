import { gridToPixel, mapComputerUseCall } from './computerUse';

describe('Computer Use proposals → Browser Agent actions (Phase 8.11)', () => {
  it('scales the 0-999 grid to the 1280x800 viewport', () => {
    expect(gridToPixel(0, 0)).toEqual({ x: 0, y: 0 });
    expect(gridToPixel(500, 500)).toEqual({ x: 640, y: 400 });
    expect(gridToPixel(999, 999)).toEqual({ x: 1279, y: 799 });
    expect(gridToPixel(1000, 10)).toBeNull();
    expect(gridToPixel('a', 10)).toBeNull();
  });

  it('maps clicks, hovers, typing, keys, scrolling and navigation', () => {
    expect(mapComputerUseCall({ name: 'click_at', args: { x: 500, y: 250 } })).toEqual({ ok: true, actions: [{ op: 'click_at', x: 640, y: 200 }] });
    expect(mapComputerUseCall({ name: 'hover_at', args: { x: 100, y: 100 } })).toEqual({ ok: true, actions: [{ op: 'move_to', x: 128, y: 80 }] });
    expect(mapComputerUseCall({ name: 'type_text_at', args: { x: 500, y: 100, text: 'თბილისი', press_enter: true } })).toEqual({
      ok: true, actions: [{ op: 'click_at', x: 640, y: 80 }, { op: 'type_focused', text: 'თბილისი', enter: true, clear: true }],
    });
    expect(mapComputerUseCall({ name: 'type_text_at', args: { x: 1, y: 1, text: 'a', clear_before_typing: false } }).ok).toBe(true);
    expect(mapComputerUseCall({ name: 'key_combination', args: { keys: 'enter' } })).toEqual({ ok: true, actions: [{ op: 'press', key: 'Enter' }] });
    expect(mapComputerUseCall({ name: 'scroll_document', args: { direction: 'down' } })).toEqual({ ok: true, actions: [{ op: 'scroll', direction: 'down', pixels: 600 }] });
    expect(mapComputerUseCall({ name: 'scroll_at', args: { x: 500, y: 500, direction: 'up', magnitude: 500 } })).toEqual({
      ok: true, actions: [{ op: 'move_to', x: 640, y: 400 }, { op: 'scroll', direction: 'up', pixels: 400 }],
    });
    expect(mapComputerUseCall({ name: 'navigate', args: { url: 'https://my.gov.ge/' } })).toEqual({ ok: true, actions: [{ op: 'goto', url: 'https://my.gov.ge/' }] });
    expect(mapComputerUseCall({ name: 'go_back' })).toEqual({ ok: true, actions: [{ op: 'back' }] });
    expect(mapComputerUseCall({ name: 'wait_5_seconds' })).toEqual({ ok: true, actions: [{ op: 'wait', ms: 5000 }] });
    expect(mapComputerUseCall({ name: 'open_web_browser' })).toEqual({ ok: true, actions: [] });
  });

  it('refuses what the agent is not offered, and what breaks the rules', () => {
    expect(mapComputerUseCall({ name: 'drag_and_drop', args: { x: 1, y: 1, destination_x: 2, destination_y: 2 } }).ok).toBe(false);
    expect(mapComputerUseCall({ name: 'key_combination', args: { keys: 'control+a' } }).ok).toBe(false);
    expect(mapComputerUseCall({ name: 'navigate', args: { url: 'http://169.254.169.254/' } }).ok).toBe(false);
    expect(mapComputerUseCall({ name: 'navigate', args: { url: 'file:///etc/passwd' } }).ok).toBe(false);
    expect(mapComputerUseCall({ name: 'click_at', args: { x: 1200, y: 1 } }).ok).toBe(false);
    expect(mapComputerUseCall({ name: 'scroll_document', args: { direction: 'left' } }).ok).toBe(false);
    expect(mapComputerUseCall({ name: 'type_text_at', args: { x: 1, y: 1, text: 'x'.repeat(501) } }).ok).toBe(false);
    expect(mapComputerUseCall({ name: '' }).ok).toBe(false);
  });
});
