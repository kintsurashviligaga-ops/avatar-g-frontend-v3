/**
 * lib/voice/liveUi.ts — the call's hands on the screen: what the voice agent may see and press (owner, 2026-10-03:
 * „დააკლიკე, გახსენი, გადმოტვირთე" — click, open, download — must simply work).
 *
 *   snapshotControls()  the visible controls the user could tap right now — buttons, links, tabs, switches, menu items and
 *                       fields — each with a short id (`c12`, stamped on the element as data-live-id so it survives the
 *                       next snapshot), its role, its accessible name and its state. get_screen_state hands them to the
 *                       model, which then clicks or types BY ID.
 *   findControl()       an id from the snapshot, or failing that the control whose name matches what the model said.
 *   guardOf()           why a control must NOT be pressed by voice (below).
 *   pressControl()      the tap: focus + click (React handles it like a real one).
 *   typeInto()          sets a field's value the way React notices (the native setter + an `input` event), and optionally
 *                       submits it.
 *
 * ⚠️ THE GUARDS ARE THE POINT. A voice can be misheard and a model can be wrong, so nothing here can spend, pay or
 * destroy:
 *   spend        a control that starts a paid generation (`data-live-guard="spend"`, a `data-price`, or a name that shows a
 *                credit price „✦ 25" / „25 კრედიტი") — generating goes through prepare_generation + start_generation,
 *                with the price said aloud, a yes and a cancelable countdown;
 *   pay          anything inside `data-live-guard="pay"` (the credits / checkout sheet) or named Pay / Buy / Checkout;
 *   destructive  delete, remove the account, sign out;
 *   file         a file picker: the browser opens one only from the user's own tap;
 *   call         the call's own screen (the dock / the full call: `data-live-status`) — hanging up and docking have their
 *                own functions;
 *   password     a password field never receives text from the call.
 * A link to another site is not pressed either: it becomes a link the user taps (open_url), and a link to another page of
 * this app would end the call (the call lives on this page), so the model is told to ask the user.
 *
 * Browser-only at call time; pure functions of the DOM it is given, so jsdom tests drive it.
 */

export type LiveControlRole = 'button' | 'link' | 'tab' | 'switch' | 'checkbox' | 'radio' | 'menuitem' | 'option' | 'textbox' | 'select';

export interface LiveControl {
  id: string;
  role: LiveControlRole;
  name: string;
  /** pressed / checked / selected / expanded / disabled / the field's current value (short). */
  state?: string;
  /** spend / pay / destructive / file — told up front so the model does not try. */
  guard?: LiveGuard;
}

export type LiveGuard = 'spend' | 'pay' | 'destructive' | 'file' | 'call' | 'password';

export const LIVE_CONTROLS_MAX = 45;
const NAME_MAX = 60;
const ID_ATTR = 'data-live-id';
/** The call's own screen — the dock and the full call both carry data-live-status (components/voice/live). */
const CALL_UI = '[data-live-call-ui],[data-live-status]';

const INTERACTIVE = [
  'button', 'a[href]', 'input:not([type="hidden"])', 'textarea', 'select', '[contenteditable="true"]',
  '[role="button"]', '[role="link"]', '[role="tab"]', '[role="switch"]', '[role="checkbox"]', '[role="radio"]',
  '[role="menuitem"]', '[role="menuitemradio"]', '[role="option"]', '[role="combobox"]', '[role="textbox"]',
].join(',');

const clip = (s: string, max = NAME_MAX): string => {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

/** The accessible name, roughly as a screen reader would say it: aria-label, labelledby, label, text, title, placeholder. */
export function controlName(el: Element): string {
  const aria = el.getAttribute('aria-label');
  if (aria && aria.trim()) return clip(aria);
  const by = el.getAttribute('aria-labelledby');
  if (by) {
    const doc = el.ownerDocument;
    const txt = by.split(/\s+/).map((id) => doc.getElementById(id)?.textContent ?? '').join(' ');
    if (txt.trim()) return clip(txt);
  }
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
    const id = el.id;
    const esc = typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(id) : id.replace(/["\\]/g, '\\$&');
    const label = (id && el.ownerDocument.querySelector(`label[for="${esc}"]`)) || el.closest('label');
    if (label?.textContent?.trim()) return clip(label.textContent);
    const ph = el.getAttribute('placeholder');
    if (ph && ph.trim()) return clip(ph);
  }
  const text = (el as HTMLElement).innerText ?? el.textContent ?? '';
  if (text.trim()) return clip(text);
  const title = el.getAttribute('title');
  if (title && title.trim()) return clip(title);
  return '';
}

function roleOf(el: Element): LiveControlRole {
  const r = (el.getAttribute('role') || '').toLowerCase();
  if (r === 'tab' || r === 'switch' || r === 'checkbox' || r === 'radio' || r === 'option' || r === 'link' || r === 'textbox') return r;
  if (r === 'menuitem' || r === 'menuitemradio') return 'menuitem';
  if (r === 'combobox') return 'select';
  const tag = el.tagName.toLowerCase();
  if (tag === 'a') return 'link';
  if (tag === 'select') return 'select';
  if (tag === 'textarea' || el.getAttribute('contenteditable') === 'true') return 'textbox';
  if (tag === 'input') {
    const type = ((el as HTMLInputElement).type || 'text').toLowerCase();
    if (type === 'checkbox') return 'checkbox';
    if (type === 'radio') return 'radio';
    if (type === 'button' || type === 'submit' || type === 'reset' || type === 'image' || type === 'file') return 'button';
    return 'textbox';
  }
  return 'button';
}

function stateOf(el: Element, role: LiveControlRole): string | undefined {
  const parts: string[] = [];
  if ((el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true') parts.push('disabled');
  const pressed = el.getAttribute('aria-pressed');
  if (pressed === 'true') parts.push('pressed');
  const checked = el.getAttribute('aria-checked') ?? ((el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) ? String(el.checked) : null);
  if (checked === 'true') parts.push(role === 'switch' ? 'on' : 'checked');
  if (el.getAttribute('aria-selected') === 'true') parts.push('selected');
  const expanded = el.getAttribute('aria-expanded');
  if (expanded === 'true') parts.push('open');
  if (role === 'textbox' && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
    const v = el.value.trim();
    parts.push(v ? `text: "${clip(v, 40)}"` : 'empty');
  }
  return parts.length ? parts.join(', ') : undefined;
}

const PRICE_RE = /✦\s*\d|\d+\s*(კრედიტ|credit|кредит)/i;
// „Top up" / „შევსება" only OPENS the credits sheet (open_panel does the same); what pays inside it is guarded by the
// sheet's own data-live-guard="pay".
const PAY_RE = /(^|\s)(pay|buy|purchase|checkout|subscribe|გადახდა|შეძენა|ყიდვა|გამოწერა|оплат|купить|подписк)/i;
const DESTRUCTIVE_RE = /(^|\s)(delete|remove account|sign out|log out|წაშლა|გასვლა|ანგარიშის წაშლა|удалить|выйти)/i;
const CLOSE_RE = /^(close|დახურვა|закрыть|✕|×|cancel|გაუქმება|отмена|back|უკან|назад)$/i;

/** Why this control must not be pressed by voice, or null. */
export function guardOf(el: Element): LiveGuard | null {
  if (el.closest(CALL_UI)) return 'call';
  if (el instanceof HTMLInputElement && el.type === 'password') return 'password';
  const marked = el.closest('[data-live-guard]')?.getAttribute('data-live-guard');
  const name = controlName(el);
  if (marked === 'pay' && !CLOSE_RE.test(name)) return 'pay';
  if (marked === 'spend' || marked === 'destructive' || marked === 'file') return marked;
  // Money first: „Buy 500 credits" names credits, but it is a payment, not a generation.
  if (PAY_RE.test(name)) return 'pay';
  const price = el.getAttribute('data-price');
  if ((price && price !== 'free' && price !== '0') || PRICE_RE.test(name)) return 'spend';
  if (DESTRUCTIVE_RE.test(name)) return 'destructive';
  if (el instanceof HTMLInputElement && el.type === 'file') return 'file';
  if (el.querySelector?.('input[type="file"]') || (el.closest('label') && el.closest('label')!.querySelector('input[type="file"]'))) return 'file';
  if (el.getAttribute('data-testid') === 'composer-attach') return 'file';
  return null;
}

function isVisible(el: Element): boolean {
  const h = el as HTMLElement;
  if (h.hidden || el.closest('[hidden],[aria-hidden="true"],[inert]')) return false;
  const style = el.ownerDocument.defaultView?.getComputedStyle(h);
  if (style && (style.display === 'none' || style.visibility === 'hidden' || (style.opacity !== '' && Number(style.opacity) === 0))) return false;
  const r = h.getBoundingClientRect?.();
  // jsdom lays nothing out (all zeros): trust the style checks there.
  if (r && (r.width || r.height)) {
    const vw = el.ownerDocument.defaultView?.innerWidth ?? 0;
    const vh = el.ownerDocument.defaultView?.innerHeight ?? 0;
    if (r.bottom < 0 || r.right < 0 || (vw && r.left > vw) || (vh && r.top > vh)) return false;
  }
  // Visually hidden (the skip link, screen-reader-only helpers): not something a person sees to tap.
  if (el.closest('.sr-only')) return false;
  return true;
}

/** The open modal dialog on top (an open sheet takes the screen — what is behind it cannot be tapped), or null. */
function topModal(doc: Document): Element | null {
  const modals = Array.from(doc.querySelectorAll('[role="dialog"][aria-modal="true"],dialog[open]'))
    .filter((d) => !d.closest(CALL_UI) && isVisible(d));
  return modals.length ? modals[modals.length - 1]! : null;
}

let seq = 0;

/**
 * The controls a person could tap right now, in reading order — inside the open sheet only, when one is open. Each gets
 * a stable id (an element keeps its id across snapshots). At most LIVE_CONTROLS_MAX; nameless controls are skipped (the
 * model could not say what they are).
 */
export function snapshotControls(doc: Document = document, max = LIVE_CONTROLS_MAX): { controls: LiveControl[]; sheet?: string } {
  const modal = topModal(doc);
  const root: ParentNode = modal ?? doc;
  const out: LiveControl[] = [];
  for (const el of Array.from(root.querySelectorAll(INTERACTIVE))) {
    if (out.length >= max) break;
    if (el.closest(CALL_UI)) continue;
    if (!isVisible(el)) continue;
    const name = controlName(el);
    if (!name) continue;
    let id = el.getAttribute(ID_ATTR);
    if (!id) { seq += 1; id = `c${seq}`; el.setAttribute(ID_ATTR, id); }
    const role = roleOf(el);
    const state = stateOf(el, role);
    const guard = guardOf(el);
    out.push({ id, role, name, ...(state ? { state } : {}), ...(guard && guard !== 'call' ? { guard } : {}) });
  }
  return { controls: out, ...(modal ? { sheet: controlName(modal) || 'a dialog' } : {}) };
}

const norm = (s: string) => s.toLowerCase().replace(/[„"“”«»'’.,:;!?…]/g, '').replace(/\s+/g, ' ').trim();

/**
 * An id from the snapshot (`c12`), or the visible control whose name matches: exact first, then starts-with, then
 * contains. Only what a person could tap now (the open sheet's controls when one is open). Null when nothing matches.
 */
export function findControl(target: string, doc: Document = document): HTMLElement | null {
  const t = target.trim();
  if (!t) return null;
  if (/^c\d{1,6}$/i.test(t)) {
    const el = doc.querySelector(`[${ID_ATTR}="${t.toLowerCase()}"]`);
    if (el && isVisible(el) && !el.closest(CALL_UI)) return el as HTMLElement;
  }
  const want = norm(t);
  if (!want) return null;
  const modal = topModal(doc);
  const candidates = Array.from((modal ?? doc).querySelectorAll(INTERACTIVE))
    .filter((el) => !el.closest(CALL_UI) && isVisible(el))
    .map((el) => ({ el, name: norm(controlName(el)) }))
    .filter((c) => c.name);
  return (candidates.find((c) => c.name === want)
    ?? candidates.find((c) => c.name.startsWith(want))
    ?? candidates.find((c) => c.name.includes(want)))?.el as HTMLElement | undefined ?? null;
}

export type LinkKind = 'external' | 'other_page' | 'same_page' | null;

/** A link that leaves this site, a link to another page of it (which would end the call), or one that stays here. */
export function linkKind(el: Element, loc: Location = window.location): LinkKind {
  const a = el.closest('a[href]') as HTMLAnchorElement | null;
  if (!a) return null;
  let u: URL;
  try { u = new URL(a.getAttribute('href') ?? '', loc.href); } catch { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (u.origin !== loc.origin) return 'external';
  if (a.target === '_blank') return 'external';
  return u.pathname === loc.pathname ? 'same_page' : 'other_page';
}

/** The tap. React listens at the root, so a dispatched click reaches its handler like a real one. */
export function pressControl(el: HTMLElement): void {
  try { el.focus({ preventScroll: true }); } catch { /* not focusable */ }
  el.scrollIntoView?.({ block: 'nearest' });
  el.click();
}

/**
 * Set a field's text so React sees it: the NATIVE value setter (React tracks the last value it set; assigning `.value`
 * directly is invisible to it) and an `input` event. A contenteditable gets its text and an `input` event too.
 */
export function typeInto(el: HTMLElement, text: string): boolean {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    try { el.focus({ preventScroll: true }); } catch { /* */ }
    if (setter) setter.call(el, text); else el.value = text;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  if (el.getAttribute('contenteditable') === 'true') {
    el.focus();
    el.textContent = text;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }
  return false;
}

/** Is this a field text can go into? */
export function isTextField(el: Element): boolean {
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLInputElement) return !['checkbox', 'radio', 'button', 'submit', 'reset', 'image', 'file', 'range', 'color', 'hidden'].includes((el.type || 'text').toLowerCase());
  return el.getAttribute('contenteditable') === 'true';
}

/** Enter in that field (a search box, the chat composer), or its form's submit. */
export function submitField(el: HTMLElement): void {
  const form = (el as HTMLInputElement).form ?? el.closest('form');
  if (form && typeof (form as HTMLFormElement).requestSubmit === 'function') {
    (form as HTMLFormElement).requestSubmit();
    return;
  }
  el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
}
