/**
 * lib/agent/site/dom.ts — the page side of the site agent: read what the user can see and use (snapshot), and act on it
 * with a cursor the user watches move (GG 2026-11-07 09:36Z). Browser only. Agent G's own panel, its cursor and anything
 * marked data-agent-ignore are never listed; password fields are never listed.
 */
import type { SiteAction, SiteElement, SiteSnapshot } from './actions';

const REF = 'data-agent-ref';
const IGNORE = '[data-agent-ignore]';
const TEXT_MAX = 1500;
const ELS_MAX = 90;
const SELECTOR = 'a[href], button, input, textarea, select, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="option"], [role="checkbox"], [role="switch"], [contenteditable="true"], summary';

function visible(el: Element, win: Window): boolean {
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  const cs = win.getComputedStyle(el);
  return cs.visibility !== 'hidden' && cs.display !== 'none' && (cs.opacity === '' || Number(cs.opacity) > 0.05);
}

function kindOf(el: Element): string {
  const tag = el.tagName.toLowerCase();
  if (tag === 'a') return 'link';
  if (tag === 'select') return 'select';
  if (tag === 'textarea') return 'textarea';
  if (tag === 'input') {
    const t = ((el as HTMLInputElement).type || 'text').toLowerCase();
    if (t === 'checkbox' || t === 'radio' || t === 'file') return t;
    if (t === 'submit' || t === 'button' || t === 'reset' || t === 'image') return 'button';
    return 'input';
  }
  if ((el as HTMLElement).isContentEditable) return 'editable';
  const role = el.getAttribute('role');
  if (role === 'link') return 'link';
  if (role === 'tab' || role === 'option' || role === 'checkbox' || role === 'switch') return role;
  return 'button';
}

function labelOf(el: Element, doc: Document): string {
  const h = el as HTMLElement;
  const aria = el.getAttribute('aria-label') || el.getAttribute('title');
  const by = el.getAttribute('aria-labelledby');
  const byText = by ? by.split(/\s+/).map((id) => doc.getElementById(id)?.textContent ?? '').join(' ') : '';
  let own = '';
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') {
    const id = el.getAttribute('id');
    const lab = id ? doc.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent : '';
    own = lab || el.getAttribute('placeholder') || el.getAttribute('name') || '';
  } else {
    own = h.innerText || h.textContent || '';
  }
  const alt = el.querySelector('img[alt]')?.getAttribute('alt') ?? '';
  return (aria || byText || own || alt).replace(/\s+/g, ' ').trim().slice(0, 120);
}

/** What the user sees: the address, the title, the visible words, and every usable element numbered. */
export function snapshotPage(doc: Document = document, win: Window = window): SiteSnapshot {
  doc.querySelectorAll(`[${REF}]`).forEach((e) => e.removeAttribute(REF));
  const els: SiteElement[] = [];
  let ref = 1;
  for (const el of Array.from(doc.querySelectorAll(SELECTOR))) {
    if (els.length >= ELS_MAX) break;
    if (el.closest(IGNORE)) continue;
    if (el.tagName === 'INPUT' && (el as HTMLInputElement).type === 'password') continue;
    if (el.tagName === 'INPUT' && (el as HTMLInputElement).type === 'hidden') continue;
    if (!visible(el, win)) continue;
    const label = labelOf(el, doc);
    const kind = kindOf(el);
    if (!label && !['input', 'textarea', 'editable', 'select'].includes(kind)) continue;
    el.setAttribute(REF, String(ref));
    const e: SiteElement = { ref, kind, label: label || '(empty field)' };
    if (kind === 'input' || kind === 'textarea' || kind === 'select') {
      const v = (el as HTMLInputElement).value;
      if (v) e.value = v.slice(0, 120);
    }
    if (kind === 'checkbox' || kind === 'radio') e.value = (el as HTMLInputElement).checked ? 'checked' : 'unchecked';
    if (kind === 'link') {
      const href = el.getAttribute('href') ?? '';
      if (href.startsWith('/') && !href.startsWith('//')) e.href = href.slice(0, 200);
    }
    if ((el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true') e.disabled = true;
    els.push(e);
    ref++;
  }
  const main = (doc.querySelector('main') ?? doc.body) as HTMLElement | null;
  const raw = main ? (main.innerText || main.textContent || '') : '';
  return { url: win.location.pathname + win.location.search, title: doc.title.slice(0, 200), text: raw.replace(/\n{3,}/g, '\n\n').trim().slice(0, TEXT_MAX), els };
}

// ── the cursor the user watches ──────────────────────────────────────────────────────────────────────────────────────
const CURSOR_ID = 'agent-g-cursor';
const ARROW = '<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 2l15 9-7 1.6L8.6 20z" fill="#38bdf8" stroke="#0b0f17" stroke-width="1.5" stroke-linejoin="round"/></svg>';

function cursor(doc: Document): HTMLElement {
  let c = doc.getElementById(CURSOR_ID);
  if (!c) {
    c = doc.createElement('div');
    c.id = CURSOR_ID;
    c.setAttribute('data-agent-ignore', '');
    c.setAttribute('aria-hidden', 'true');
    c.innerHTML = `${ARROW}<span style="position:absolute;left:18px;top:16px;padding:1px 6px;border-radius:6px;background:#38bdf8;color:#0b0f17;font:600 11px system-ui;white-space:nowrap">Agent G</span>`;
    Object.assign(c.style, { position: 'fixed', left: '0px', top: '0px', zIndex: '2147483646', pointerEvents: 'none', transform: 'translate(40vw, 40vh)', transition: 'transform 450ms cubic-bezier(.2,.8,.2,1)' });
    doc.body.appendChild(c);
  }
  return c;
}

export function removeCursor(doc: Document = document): void {
  doc.getElementById(CURSOR_ID)?.remove();
}

function ripple(doc: Document, x: number, y: number) {
  const r = doc.createElement('div');
  r.setAttribute('data-agent-ignore', '');
  Object.assign(r.style, { position: 'fixed', left: `${x - 14}px`, top: `${y - 14}px`, width: '28px', height: '28px', borderRadius: '999px', border: '2px solid #38bdf8', zIndex: '2147483645', pointerEvents: 'none', transition: 'transform 400ms ease-out, opacity 400ms ease-out' });
  doc.body.appendChild(r);
  requestAnimationFrame(() => { r.style.transform = 'scale(2)'; r.style.opacity = '0'; });
  setTimeout(() => r.remove(), 450);
}

const pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function pointAt(el: Element, doc: Document): Promise<{ x: number; y: number }> {
  el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
  await pause(350);
  const r = el.getBoundingClientRect();
  const x = Math.round(r.left + Math.min(r.width / 2, 40));
  const y = Math.round(r.top + r.height / 2);
  cursor(doc).style.transform = `translate(${x}px, ${y}px)`;
  await pause(480);
  return { x, y };
}

/** Set a field's value so React sees it (its value setter is wrapped; the native one is not). */
function setValue(el: HTMLInputElement | HTMLTextAreaElement, text: string) {
  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, text);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

/** Do one action on the page with the cursor. `go` is the app's own navigation (the router). */
export async function actOnPage(a: SiteAction, go: (path: string) => void, doc: Document = document, win: Window = window): Promise<boolean> {
  const find = (ref: number) => doc.querySelector(`[${REF}="${ref}"]`);
  switch (a.op) {
    case 'click': {
      const el = find(a.ref) as HTMLElement | null;
      if (!el || !el.isConnected) return false;
      const { x, y } = await pointAt(el, doc);
      ripple(doc, x, y);
      el.focus?.();
      el.click();
      return true;
    }
    case 'type': {
      const el = find(a.ref) as HTMLElement | null;
      if (!el) return false;
      await pointAt(el, doc);
      el.focus();
      if (el.isContentEditable) {
        el.textContent = a.text;
        el.dispatchEvent(new InputEvent('input', { bubbles: true }));
      } else if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        if (el instanceof HTMLInputElement && el.type === 'password') return false;
        // Typed in a few strokes, so the user sees the words appear.
        const parts = Math.min(6, Math.max(1, Math.ceil(a.text.length / 12)));
        for (let i = 1; i <= parts; i++) { setValue(el, a.text.slice(0, Math.ceil((a.text.length * i) / parts))); await pause(60); }
      } else return false;
      if (a.submit) {
        const key = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
        const go2 = el.dispatchEvent(new KeyboardEvent('keydown', key));
        el.dispatchEvent(new KeyboardEvent('keyup', key));
        if (go2) (el.closest('form') as HTMLFormElement | null)?.requestSubmit?.();
      }
      return true;
    }
    case 'select': {
      const el = find(a.ref) as HTMLSelectElement | null;
      if (!el || el.tagName !== 'SELECT') return false;
      await pointAt(el, doc);
      const opt = Array.from(el.options).find((o) => o.value === a.value || o.text.trim() === a.value);
      if (!opt) return false;
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(el, opt.value);
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    case 'scroll':
      win.scrollBy({ top: (a.dir === 'down' ? 1 : -1) * Math.round(win.innerHeight * 0.75), behavior: 'smooth' });
      return true;
    case 'go':
      go(a.path);
      return true;
    case 'wait':
      await pause(a.ms);
      return true;
    default:
      return false;
  }
}
