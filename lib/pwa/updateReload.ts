/**
 * The reload that swaps an open tab onto a new deploy — never under the user's hands.
 *
 * Every deploy stamps its commit into /sw.js (scripts/stamp-sw.mjs), so every deploy installs a new service worker,
 * which skipWaiting()s and clients.claim()s every open tab. AppShell then reloaded the tab at once. On 2026-10-16 a
 * Production deploy landed while the Video panel was being filled for a paid ad test: the page reloaded mid-form, the
 * panel and the typed brief were gone. The same reload hits a storyboard still drawing, a film still rendering (its
 * client loses the job it paid for) and a live voice call.
 *
 * So the takeover reload waits for a quiet moment:
 *   · nothing in progress → reload now, as before (a stale shell on an idle tab or a resumed PWA is still swapped at once);
 *   · work in progress → wait, and reload the next time the tab is hidden with no work left. A tab the user is looking
 *     at is never reloaded once it has work, even after the work ends: the result they are reading stays put.
 *
 * "Work" is: a studio generation, storyboard or queue job (<html data-studio-work>, set by OmniStudio), a live call
 * (<html data-live-call>, GeminiLiveConversation), or any text field holding typed text.
 */

const TEXT_FIELDS = 'textarea, input:not([type]), input[type="text"], input[type="search"], input[type="url"], input[type="email"]';

/** True while a reload would throw away something the user is doing. */
export function pageHasWork(doc: Document): boolean {
  const root = doc.documentElement;
  if (root.dataset.liveCall === '1' || root.dataset.studioWork === '1') return true;
  const fields = doc.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(TEXT_FIELDS);
  for (const field of Array.from(fields)) {
    if (!field.readOnly && !field.disabled && field.value.trim()) return true;
  }
  return false;
}

/** How often a waiting reload looks again while the tab is hidden (a render may finish in a background tab). */
export const RELOAD_RECHECK_MS = 15_000;

/**
 * Returns the controllerchange handler. `reload` runs at most once, when the page has no work: at once, or later
 * while the tab is hidden. The returned `dispose` removes the listeners a waiting reload added.
 */
export function createUpdateReloader(doc: Document, win: Pick<Window, 'setInterval' | 'clearInterval'>, reload: () => void) {
  let pending = false;
  let done = false;
  let timer: number | null = null;

  const stopWaiting = () => {
    doc.removeEventListener('visibilitychange', onQuietMoment);
    if (timer !== null) win.clearInterval(timer);
    timer = null;
  };
  const run = () => {
    done = true;
    pending = false;
    stopWaiting();
    reload();
  };
  function onQuietMoment() {
    if (!pending || done) return;
    if (doc.visibilityState === 'hidden' && !pageHasWork(doc)) run();
  }

  const onTakeover = () => {
    if (done || pending) return;
    if (!pageHasWork(doc)) { run(); return; }
    pending = true;
    doc.addEventListener('visibilitychange', onQuietMoment);
    timer = win.setInterval(onQuietMoment, RELOAD_RECHECK_MS);
  };

  return { onTakeover, dispose: stopWaiting, isPending: () => pending };
}
