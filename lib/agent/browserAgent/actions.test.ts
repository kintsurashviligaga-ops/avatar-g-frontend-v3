import { actionLabel, checkAgentAction, touchesPage, writtenSelectors, FORM_FIELDS_MAX, SCROLL_MAX_PX } from './actions';

describe('Browser Agent actions (Phase 8.11)', () => {
  it('keeps the planned-task rules for the old steps', () => {
    expect(checkAgentAction({ op: 'goto', url: 'https://tbc.ge/' })).toEqual({ ok: true, action: { op: 'goto', url: 'https://tbc.ge/' } });
    expect(checkAgentAction({ op: 'goto', url: 'http://127.0.0.1/' }).ok).toBe(false);
    expect(checkAgentAction({ op: 'goto', url: 'http://localhost/' }).ok).toBe(false);
    expect(checkAgentAction({ op: 'click', selector: 'text=ძებნა' })).toEqual({ ok: true, action: { op: 'click', selector: 'text=ძებნა' } });
    expect(checkAgentAction({ op: 'wait', ms: 60_000 }).ok).toBe(false);
    expect(checkAgentAction({ op: 'press', key: 'Control+A' }).ok).toBe(false);
  });

  it('checks scroll, select, check, hover, click_at, move_to, type_focused, fill_form, elements and back', () => {
    expect(checkAgentAction({ op: 'scroll', direction: 'down' })).toEqual({ ok: true, action: { op: 'scroll', direction: 'down', pixels: 600 } });
    expect(checkAgentAction({ op: 'scroll', selector: '#footer' })).toEqual({ ok: true, action: { op: 'scroll', selector: '#footer' } });
    expect(checkAgentAction({ op: 'scroll', direction: 'left' }).ok).toBe(false);
    expect(checkAgentAction({ op: 'scroll', direction: 'down', pixels: SCROLL_MAX_PX + 1 }).ok).toBe(false);
    expect(checkAgentAction({ op: 'select', selector: '#city', value: 'Tbilisi' }).ok).toBe(true);
    expect(checkAgentAction({ op: 'select', selector: '#city', value: '' }).ok).toBe(false);
    expect(checkAgentAction({ op: 'check', selector: '#agree', on: true })).toEqual({ ok: true, action: { op: 'check', selector: '#agree', on: true } });
    expect(checkAgentAction({ op: 'check', selector: '#agree', on: 'yes' }).ok).toBe(false);
    expect(checkAgentAction({ op: 'hover', selector: 'nav >> text=Menu' }).ok).toBe(true);
    expect(checkAgentAction({ op: 'click_at', x: 640.4, y: 10 })).toEqual({ ok: true, action: { op: 'click_at', x: 640, y: 10 } });
    expect(checkAgentAction({ op: 'click_at', x: 1280, y: 10 }).ok).toBe(false);
    expect(checkAgentAction({ op: 'click_at', x: -1, y: 10 }).ok).toBe(false);
    expect(checkAgentAction({ op: 'move_to', x: 5, y: 799 })).toEqual({ ok: true, action: { op: 'move_to', x: 5, y: 799 } });
    expect(checkAgentAction({ op: 'type_focused', text: 'ხაჭაპური', enter: true })).toEqual({ ok: true, action: { op: 'type_focused', text: 'ხაჭაპური', enter: true, clear: false } });
    expect(checkAgentAction({ op: 'type_focused', text: '' }).ok).toBe(false);
    expect(checkAgentAction({ op: 'fill_form', fields: [{ selector: '#name', value: 'გიორგი' }, { selector: '#city', value: 'თბილისი' }] }).ok).toBe(true);
    expect(checkAgentAction({ op: 'fill_form', fields: [] }).ok).toBe(false);
    expect(checkAgentAction({ op: 'fill_form', fields: Array.from({ length: FORM_FIELDS_MAX + 1 }, (_, i) => ({ selector: `#f${i}`, value: 'x' })) }).ok).toBe(false);
    expect(checkAgentAction({ op: 'fill_form', fields: [{ selector: '#a' }] }).ok).toBe(false);
    expect(checkAgentAction({ op: 'elements' })).toEqual({ ok: true, action: { op: 'elements' } });
    expect(checkAgentAction({ op: 'back' })).toEqual({ ok: true, action: { op: 'back' } });
    expect(checkAgentAction({ op: 'drag' }).ok).toBe(false);
    expect(checkAgentAction(null).ok).toBe(false);
  });

  it('knows which actions write and which touch the page', () => {
    expect(writtenSelectors({ op: 'fill_form', fields: [{ selector: '#a', value: '1' }, { selector: '#b', value: '2' }] })).toEqual(['#a', '#b']);
    expect(writtenSelectors({ op: 'scroll', direction: 'down', pixels: 600 })).toEqual([]);
    expect(touchesPage({ op: 'check', selector: '#a', on: true })).toBe(true);
    expect(touchesPage({ op: 'scroll', direction: 'up', pixels: 100 })).toBe(false);
    expect(touchesPage({ op: 'move_to', x: 1, y: 1 })).toBe(false);
  });

  it('labels each action in Georgian by default', () => {
    expect(actionLabel({ op: 'fill_form', fields: [{ selector: '#a', value: '1' }] }, 'ka')).toBe('ვავსებ 1 ველს');
    expect(actionLabel({ op: 'goto', url: 'https://www.ss.ge/ka' }, 'ka')).toBe('ვხსნი www.ss.ge-ს');
    expect(actionLabel({ op: 'scroll', direction: 'down', pixels: 600 }, 'en')).toBe('Scrolling');
  });
});
