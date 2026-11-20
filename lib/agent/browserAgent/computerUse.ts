/**
 * lib/agent/browserAgent/computerUse.ts — turn what Gemini Computer Use proposes into the Browser Agent's own actions
 * (Phase 8.11, PREPARED, NOT WIRED; D-16: an admin-only pilot under $1, Playwright stays the executor). Pure.
 *
 * Computer Use looks at a screenshot and answers one of its predefined UI functions (click_at, type_text_at,
 * scroll_document, navigate, …). Its coordinates are on a 0-999 grid over the screenshot, not pixels, so they are
 * scaled to the 1280x800 viewport here. Every mapped action then goes through ./actions checkAgentAction and the loop's
 * "wait for the user" rules like any other: the model only proposes.
 *
 * The function names and the 0-999 grid are those of Google's Computer Use documentation as known when this was
 * written; the pilot (D-16) must confirm them against the live model before anything depends on it. A function this
 * file does not know is refused, never guessed (drag and drop included: it is not offered yet).
 */
import { checkAgentAction, VIEWPORT, type AgentAction } from './actions';

export const CU_GRID = 1000;

export interface ComputerUseCall { name: string; args?: Record<string, unknown> }

export type CuMapped = { ok: true; actions: AgentAction[] } | { ok: false; error: string };

const KEY_ALIASES: Record<string, string> = {
  enter: 'Enter', return: 'Enter', tab: 'Tab', escape: 'Escape', esc: 'Escape', backspace: 'Backspace', space: 'Space',
  arrowdown: 'ArrowDown', arrowup: 'ArrowUp', arrowleft: 'ArrowLeft', arrowright: 'ArrowRight', down: 'ArrowDown', up: 'ArrowUp',
  pagedown: 'PageDown', pageup: 'PageUp', home: 'Home', end: 'End',
};

/** A 0-999 grid point → a viewport pixel. Null when it is not a point on the grid. */
export function gridToPixel(x: unknown, y: unknown): { x: number; y: number } | null {
  const gx = Number(x); const gy = Number(y);
  if (!Number.isFinite(gx) || !Number.isFinite(gy) || gx < 0 || gy < 0 || gx >= CU_GRID || gy >= CU_GRID) return null;
  return { x: Math.min(VIEWPORT.width - 1, Math.round((gx / CU_GRID) * VIEWPORT.width)), y: Math.min(VIEWPORT.height - 1, Math.round((gy / CU_GRID) * VIEWPORT.height)) };
}

function checked(raw: unknown[]): CuMapped {
  const actions: AgentAction[] = [];
  for (const r of raw) {
    const c = checkAgentAction(r);
    if (!c.ok) return { ok: false, error: c.error };
    actions.push(c.action);
  }
  return { ok: true, actions };
}

export function mapComputerUseCall(call: ComputerUseCall): CuMapped {
  const a = call.args ?? {};
  switch (call.name) {
    case 'navigate': return checked([{ op: 'goto', url: a.url }]);
    case 'search': return checked([{ op: 'goto', url: 'https://www.google.com/' }]);
    case 'go_back': return checked([{ op: 'back' }]);
    case 'wait_5_seconds': return checked([{ op: 'wait', ms: 5_000 }]);
    case 'open_web_browser': return { ok: true, actions: [] }; // the browser is already open
    case 'click_at': case 'hover_at': {
      const p = gridToPixel(a.x, a.y);
      if (!p) return { ok: false, error: `${call.name}: x and y on the 0-${CU_GRID - 1} grid` };
      return checked([{ op: call.name === 'click_at' ? 'click_at' : 'move_to', ...p }]);
    }
    case 'type_text_at': {
      const p = gridToPixel(a.x, a.y);
      if (!p) return { ok: false, error: 'type_text_at: x and y on the 0-999 grid' };
      // clear_before_typing (Google's default is true): what the field holds is replaced, not added to.
      return checked([{ op: 'click_at', ...p }, { op: 'type_focused', text: a.text, enter: a.press_enter === true, clear: a.clear_before_typing !== false }]);
    }
    case 'key_combination': {
      const keys = String(a.keys ?? '').split('+').map((k) => k.trim().toLowerCase()).filter(Boolean);
      // Only single keys: a combination (Ctrl+…) can copy, paste, close or select everything, which the agent never does alone.
      if (keys.length !== 1 || !KEY_ALIASES[keys[0]!]) return { ok: false, error: `key_combination: only one of ${Object.keys(KEY_ALIASES).join(', ')}` };
      return checked([{ op: 'press', key: KEY_ALIASES[keys[0]!] }]);
    }
    case 'scroll_document': {
      const d = String(a.direction ?? '').toLowerCase();
      if (d !== 'down' && d !== 'up') return { ok: false, error: 'scroll_document: up or down (sideways is not offered)' };
      return checked([{ op: 'scroll', direction: d, pixels: 600 }]);
    }
    case 'scroll_at': {
      const p = gridToPixel(a.x, a.y);
      const d = String(a.direction ?? '').toLowerCase();
      if (!p || (d !== 'down' && d !== 'up')) return { ok: false, error: 'scroll_at: a point and up or down' };
      const magnitude = Number(a.magnitude);
      const px = Number.isFinite(magnitude) && magnitude > 0 ? Math.min(2_400, Math.round((magnitude / CU_GRID) * VIEWPORT.height)) : 600;
      // The wheel scrolls what is under the cursor, so the cursor goes there first; scrolling never clicks.
      return checked([{ op: 'move_to', ...p }, { op: 'scroll', direction: d, pixels: px }]);
    }
    default:
      return { ok: false, error: `${call.name || 'this action'} is not offered to the agent` };
  }
}
