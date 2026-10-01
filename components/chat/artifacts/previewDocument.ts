/**
 * components/chat/artifacts/previewDocument.ts — the document the Preview iframe renders, and its sandbox.
 *
 * Model-written HTML and SVG run here, so this file is the security boundary of the canvas. Two layers, each
 * sufficient on its own for the main threat (the page touching the app):
 *
 * 1. `sandbox="allow-scripts"` and NOTHING else. Without `allow-same-origin` the document gets an OPAQUE origin:
 *    scripts run, but they cannot read the app's cookies, localStorage, IndexedDB or DOM, cannot call our APIs with
 *    the user's session, and `window.parent` is a cross-origin WindowProxy. Without allow-top-navigation /
 *    allow-popups / allow-forms / allow-modals it cannot navigate the app, open windows, submit forms or block the
 *    tab with alert().
 *    ⚠️ The deleted `PreviewCanvas.tsx` had `allow-scripts allow-same-origin` on a srcDoc frame — the one pairing
 *    the sandbox spec warns about: an about:srcdoc document INHERITS the embedder's origin, so its script ran AS
 *    myavatar.ge and could simply remove its own sandbox attribute. Never add allow-same-origin here.
 *
 * 2. A Content-Security-Policy `<meta>` as the FIRST element of `<head>`: no network. `connect-src 'none'` stops
 *    fetch / XHR / WebSocket / EventSource / sendBeacon; `default-src 'none'` stops external scripts, styles,
 *    frames, objects, workers and manifests; inline script and style still run (that is what a generated page is).
 *    Images, fonts and media may come from https or data: so a page can show a picture — the spec'd trade-off.
 *    ⚠️ A CSP meta only binds what the parser meets AFTER it, and is ignored outside <head>. So it is emitted before
 *    any model text, with <head> left OPEN: a full model document that follows (`<!doctype html><html><head>…`) is
 *    folded into the same head by the HTML parser (a second doctype / <html> / <head> is a parse error that is
 *    ignored, its attributes merged), and a bare fragment simply implies </head><body>. A policy the model adds can
 *    only narrow ours — multiple policies are all enforced.
 *
 * What neither layer stops: the frame navigating ITSELF (a link click, `location = …`, meta refresh) — sandboxing
 * and CSP both allow that, and the new page is not bound by our meta. ArtifactCanvas treats any load after the first
 * as a navigation and puts the original document back (see `PreviewFrame`).
 */

import type { ArtifactLanguage } from './artifactSpec';

/** Exactly the sandbox tokens the preview gets. One token; tests pin it. */
export const PREVIEW_SANDBOX = 'allow-scripts';

/** The preview's Content-Security-Policy. Tests pin it verbatim. */
export const PREVIEW_CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: https:; font-src data: https:; media-src data: https:; connect-src 'none'";

const CSP_META = `<meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}">`;
const VIEWPORT_META = '<meta name="viewport" content="width=device-width, initial-scale=1">';

/** An SVG is centred on a white page and scaled down to fit. Inline style: allowed by `style-src 'unsafe-inline'`. */
const SVG_PAGE_STYLE =
  '<style>html,body{margin:0;height:100%}body{display:flex;align-items:center;justify-content:center;background:#fff}svg{max-width:100%;max-height:100%;height:auto}</style>';

/**
 * The `srcdoc` for a previewable artifact, or null for any other language (they have no Preview tab).
 * The model's markup is NOT parsed, escaped or rewritten here: it is the page, and the sandbox + CSP are the guard.
 */
export function buildPreviewDocument(language: ArtifactLanguage, code: string): string | null {
  if (language === 'html') return `<!doctype html><html><head>${CSP_META}${VIEWPORT_META}${code}`;
  if (language === 'svg') return `<!doctype html><html><head>${CSP_META}${VIEWPORT_META}${SVG_PAGE_STYLE}</head><body>${code}</body></html>`;
  return null;
}
