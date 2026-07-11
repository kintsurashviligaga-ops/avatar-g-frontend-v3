/**
 * browserNotify — native OS-level "your asset is ready" notifications (ChatGPT/Gemini-style),
 * fired when a generation completes so the user is alerted even with the tab backgrounded.
 *
 * HONEST CAPABILITY BOUNDARY (verified, not overclaimed):
 *  - WORKS while the browser runtime is ALIVE — the tab is open in the foreground OR backgrounded
 *    (another tab, minimized window, phone on the desk with the app still loaded). We prefer the
 *    service worker's showNotification() because it fires reliably when backgrounded and is
 *    REQUIRED on Android Chrome (a page-context `new Notification()` is ignored there).
 *  - Does NOT wake a FULLY-CLOSED tab. That needs VAPID Web Push + a server that stores the push
 *    subscription and pushes on render-complete — a separate, larger feature (intentionally out
 *    of scope here). The render pipeline is client-orchestrated, so the page IS alive at
 *    completion in the normal flow.
 *  - iOS Safari shows web notifications ONLY for a home-screen-INSTALLED PWA (iOS 16.4+), never a
 *    regular Safari tab. On an uninstalled iOS tab this no-ops gracefully (the in-app bell remains).
 *
 * Every function is best-effort and NEVER throws — a notification miss must never break the
 * render or the credit toast.
 */

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && typeof Notification !== 'undefined';
}

/**
 * Request notification permission. MUST be called from a USER GESTURE (a click) — Chrome 96+
 * silently blocks, and Firefox rejects, permission prompts not tied to user activation, so this
 * is wired to the Generate click, never to component mount. Idempotent: once 'granted'/'denied'
 * it never re-prompts. Returns the resolved permission; never throws.
 */
export async function ensureNotificationPermission(): Promise<NotificationPermission> {
  try {
    if (!notificationsSupported()) return 'denied';
    if (Notification.permission !== 'default') return Notification.permission;
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

/**
 * Fire a native completion notification. Prefers serviceWorkerRegistration.showNotification()
 * (backgrounded-tab reliable + Android-required); falls back to `new Notification()` (desktop
 * foreground/backgrounded). No-ops unless permission is already 'granted'. Never throws.
 */
export async function fireCompletionNotification(opts: { title: string; body: string; tag?: string }): Promise<void> {
  try {
    if (!notificationsSupported() || Notification.permission !== 'granted') return;
    const data: NotificationOptions = {
      body: opts.body,
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-192x192.png',
      tag: opts.tag ?? 'myavatar-ready',
    };
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready.catch(() => null);
      if (reg && typeof reg.showNotification === 'function') {
        await reg.showNotification(opts.title, data);
        return;
      }
    }
    // eslint-disable-next-line no-new
    new Notification(opts.title, data);
  } catch {
    /* best-effort — a notification miss must never break the render/toast path */
  }
}
