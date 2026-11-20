/**
 * lib/clipboard/copyText.ts — a clipboard write that also works where the async Clipboard API is missing or refused
 * (insecure origins, in-app webviews, a denied permission). true only when the text really went to the clipboard.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (_err) {
    /* denied: try the legacy path */
  }
  // Insecure origins and some in-app webviews have no async clipboard.
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch (_err) {
    return false;
  }
}

