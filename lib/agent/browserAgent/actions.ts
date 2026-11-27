/**
 * lib/agent/browserAgent/actions.ts — what the Browser Agent may do in ONE step (Phase 8.11, PREPARED, NOT WIRED). Pure.
 *
 * Today's planned browser task (lib/agent/browser/policy) knows goto, click, type, press, wait, text, links and
 * screenshot. A person on a web page also scrolls, picks from a list, ticks a box, points at a menu, clicks where they
 * see something, and fills a whole form. The loop (./loop) decides one of these at a time, from what the page shows now:
 *
 *   scroll        {direction: down|up, pixels?}  or {selector}   move the page, or bring one element into view
 *   select        {selector, value}               pick an option of a <select> (by value or by its visible label)
 *   check         {selector, on}                  tick or untick a checkbox / radio
 *   hover         {selector}                      point at an element (menus that open on hover)
 *   click_at      {x, y}                          click a point of the 1280x800 viewport (what Computer Use answers)
 *   move_to       {x, y}                          move the cursor there without clicking (hover a point)
 *   type_focused  {text, enter?, clear?}          type into the field that has the focus (after a click_at)
 *   fill_form     {fields: [{selector, value}]}   fill several fields in one step, each like `type`
 *   elements      {}                              list the page's visible controls, each with its own selector
 *   back          {}                              the browser's Back button
 *
 * The planned-task rules hold for every action (they are checked by the same function): public http(s) hosts only,
 * short waits, short typing, no password or card field ever typed into (the driver refuses it too). This file adds the
 * limits of the new actions; ./loop adds the "wait for the user" rules on top.
 */
import { checkBrowserTask, type BrowserStep } from '@/lib/agent/browser/policy';

export const VIEWPORT = { width: 1280, height: 800 } as const;
export const SCROLL_MAX_PX = 2_400;
export const FORM_FIELDS_MAX = 12;
const SELECTOR_MAX = 300;
const VALUE_MAX = 500;

export type AgentAction =
  | BrowserStep
  | { op: 'scroll'; direction: 'down' | 'up'; pixels: number }
  | { op: 'scroll'; selector: string }
  | { op: 'select'; selector: string; value: string }
  | { op: 'check'; selector: string; on: boolean }
  | { op: 'hover'; selector: string }
  | { op: 'click_at'; x: number; y: number }
  | { op: 'move_to'; x: number; y: number }
  | { op: 'type_focused'; text: string; enter: boolean; clear: boolean }
  | { op: 'fill_form'; fields: Array<{ selector: string; value: string }> }
  | { op: 'elements' }
  | { op: 'back' };

export type AgentActionOp = AgentAction['op'];
export const AGENT_ACTION_OPS: readonly AgentActionOp[] = [
  'goto', 'click', 'type', 'press', 'wait', 'text', 'links', 'screenshot',
  'scroll', 'select', 'check', 'hover', 'click_at', 'move_to', 'type_focused', 'fill_form', 'elements', 'back',
];

export type ActionCheck = { ok: true; action: AgentAction } | { ok: false; error: string };

const sel = (v: unknown): string | null => (typeof v === 'string' && v.trim() && v.length <= SELECTOR_MAX ? v : null);
const val = (v: unknown): string | null => (typeof v === 'string' && v.length <= VALUE_MAX ? v : null);
const coord = (v: unknown, max: number): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n < max ? Math.round(n) : null;
};

/** Check one action the agent proposes. Never throws; an action it cannot read is refused, never guessed. */
export function checkAgentAction(raw: unknown): ActionCheck {
  const r = (raw ?? {}) as Record<string, unknown>;
  switch (r.op) {
    case 'goto': case 'click': case 'type': case 'press': case 'wait': case 'text': case 'links': case 'screenshot': {
      // The planned-task rules, unchanged: a fixed public page stands in for "the page we are on", since a plan must
      // open a page first.
      const c = checkBrowserTask({ steps: r.op === 'goto' ? [r] : [{ op: 'goto', url: 'https://example.com/' }, r] });
      if (!c.ok) return { ok: false, error: c.error.replace(/^step \d+: /, '') };
      return { ok: true, action: c.plan.steps[c.plan.steps.length - 1]! };
    }
    case 'scroll': {
      if (r.selector !== undefined) {
        const s = sel(r.selector);
        return s ? { ok: true, action: { op: 'scroll', selector: s } } : { ok: false, error: 'scroll: selector' };
      }
      if (r.direction !== 'down' && r.direction !== 'up') return { ok: false, error: 'scroll: direction down or up' };
      const px = r.pixels === undefined ? 600 : Number(r.pixels);
      if (!Number.isFinite(px) || px <= 0 || px > SCROLL_MAX_PX) return { ok: false, error: `scroll: pixels (≤ ${SCROLL_MAX_PX})` };
      return { ok: true, action: { op: 'scroll', direction: r.direction, pixels: Math.round(px) } };
    }
    case 'select': {
      const s = sel(r.selector); const v = val(r.value);
      return s && v !== null && v.trim() ? { ok: true, action: { op: 'select', selector: s, value: v } } : { ok: false, error: 'select: selector and value' };
    }
    case 'check': {
      const s = sel(r.selector);
      if (!s || typeof r.on !== 'boolean') return { ok: false, error: 'check: selector and on (true / false)' };
      return { ok: true, action: { op: 'check', selector: s, on: r.on } };
    }
    case 'hover': {
      const s = sel(r.selector);
      return s ? { ok: true, action: { op: 'hover', selector: s } } : { ok: false, error: 'hover: selector' };
    }
    case 'click_at': case 'move_to': {
      const x = coord(r.x, VIEWPORT.width); const y = coord(r.y, VIEWPORT.height);
      if (x === null || y === null) return { ok: false, error: `${r.op}: x (0-${VIEWPORT.width - 1}) and y (0-${VIEWPORT.height - 1})` };
      return { ok: true, action: { op: r.op, x, y } };
    }
    case 'type_focused': {
      const t = val(r.text);
      if (t === null || !t) return { ok: false, error: `type_focused: text (≤ ${VALUE_MAX})` };
      return { ok: true, action: { op: 'type_focused', text: t, enter: r.enter === true, clear: r.clear === true } };
    }
    case 'fill_form': {
      if (!Array.isArray(r.fields) || r.fields.length === 0 || r.fields.length > FORM_FIELDS_MAX) {
        return { ok: false, error: `fill_form: 1-${FORM_FIELDS_MAX} fields` };
      }
      const fields: Array<{ selector: string; value: string }> = [];
      for (const [i, f] of r.fields.entries()) {
        const ff = (f ?? {}) as Record<string, unknown>;
        const s = sel(ff.selector); const v = val(ff.value);
        if (!s || v === null) return { ok: false, error: `fill_form: field ${i + 1} needs a selector and a value (≤ ${VALUE_MAX})` };
        fields.push({ selector: s, value: v });
      }
      return { ok: true, action: { op: 'fill_form', fields } };
    }
    case 'elements': return { ok: true, action: { op: 'elements' } };
    case 'back': return { ok: true, action: { op: 'back' } };
    default:
      return { ok: false, error: `op must be one of ${AGENT_ACTION_OPS.join(', ')}` };
  }
}

/** The selectors an action writes into (what the "never type a secret" rule looks at). */
export function writtenSelectors(a: AgentAction): string[] {
  if (a.op === 'type' || a.op === 'select') return [a.selector];
  if (a.op === 'fill_form') return a.fields.map((f) => f.selector);
  return [];
}

/** Does this action touch the page (could submit, buy or send something)? Reading and scrolling do not. */
export function touchesPage(a: AgentAction): boolean {
  return ['click', 'type', 'press', 'select', 'check', 'click_at', 'type_focused', 'fill_form'].includes(a.op);
}

/** One line a person reads in the run card, in Georgian / English / Russian. */
export function actionLabel(a: AgentAction, locale: string): string {
  const L = locale === 'en' ? 0 : locale === 'ru' ? 2 : 1;
  const pick = (en: string, ka: string, ru: string) => [en, ka, ru][L]!;
  switch (a.op) {
    case 'goto': { let h = a.url; try { h = new URL(a.url).hostname; } catch { /* keep */ } return pick(`Opening ${h}`, `ვხსნი ${h}-ს`, `Открываю ${h}`); }
    case 'click': case 'click_at': return pick('Clicking', 'ვაჭერ', 'Нажимаю');
    case 'type': case 'type_focused': return pick('Typing', 'ვწერ', 'Печатаю');
    case 'fill_form': return pick(`Filling ${a.fields.length} fields`, `ვავსებ ${a.fields.length} ველს`, `Заполняю полей: ${a.fields.length}`);
    case 'select': return pick('Choosing from a list', 'ვირჩევ სიიდან', 'Выбираю из списка');
    case 'check': return a.on ? pick('Ticking a box', 'ვნიშნავ', 'Ставлю отметку') : pick('Unticking a box', 'ვხსნი მონიშვნას', 'Снимаю отметку');
    case 'hover': case 'move_to': return pick('Pointing at a menu', 'მაუსს ვაჩერებ', 'Навожу курсор');
    case 'scroll': return pick('Scrolling', 'ვსქროლავ', 'Прокручиваю');
    case 'press': return pick(`Pressing ${a.key}`, `ვაჭერ ${a.key}-ს`, `Нажимаю ${a.key}`);
    case 'wait': return pick('Waiting for the page', 'ველოდები გვერდს', 'Жду страницу');
    case 'text': case 'links': case 'elements': return pick('Reading the page', 'ვკითხულობ გვერდს', 'Читаю страницу');
    case 'screenshot': return pick('Taking a picture', 'ვიღებ სურათს', 'Делаю снимок');
    case 'back': return pick('Going back', 'ვბრუნდები უკან', 'Возвращаюсь назад');
  }
}
