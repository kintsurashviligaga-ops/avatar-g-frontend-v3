/** Current-page recovery links never carry an auth query, a fragment or URL credentials. */
export function liveRecoveryLink(href: string): string {
  try {
    const source = new URL(href);
    if (!['http:', 'https:'].includes(source.protocol) || source.username || source.password) return '';
    const link = new URL(source.origin);
    link.pathname = source.pathname;
    link.searchParams.set('voice', '1');
    return link.toString();
  } catch {
    return '';
  }
}

/** Chrome's Android handoff is offered only for an HTTPS page and only on an explicit link tap. */
export function liveBrowserIntent(link: string, userAgent: string): string | null {
  if (!/Android/i.test(userAgent)) return null;
  try {
    const url = new URL(liveRecoveryLink(link));
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=https;package=com.android.chrome;end`;
  } catch {
    return null;
  }
}

/** WebViews may refuse the async clipboard. Both paths must confirm success; the manual URL stays available. */
export async function copyLiveText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* Try the browser's supported user-gesture copy fallback. */ }
  if (typeof document === 'undefined' || typeof document.execCommand !== 'function') return false;
  const active = document.activeElement;
  const field = document.createElement('textarea');
  field.value = text;
  field.readOnly = true;
  field.tabIndex = -1;
  field.setAttribute('aria-hidden', 'true');
  field.style.position = 'fixed';
  field.style.opacity = '0';
  try {
    document.body.appendChild(field);
    field.select();
    return document.execCommand('copy') === true;
  } catch {
    return false;
  } finally {
    field.remove();
    try {
      if (active instanceof HTMLElement && active.isConnected) active.focus({ preventScroll: true });
    } catch { /* A focus restriction must not change the confirmed clipboard result. */ }
  }
}
