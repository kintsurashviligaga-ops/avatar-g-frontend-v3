/**
 * The culling worker: decodes, measures and grades photos off the main thread, so the grid stays responsive while
 * hundreds of frames are analysed. Created by ./cullClient.ts as `new Worker(new URL('./cull.worker.ts',
 * import.meta.url))` — webpack emits it as a same-origin chunk, which the CSP's `worker-src 'self'` already allows
 * (lib/security/csp.js): no blob: worker, no CSP change.
 *
 * It only ever talks to the page that created it. No fetch, no upload: a photo goes in as a File and comes back as
 * numbers, a thumbnail and (for an export) a graded copy.
 */
import { analyzePhoto, offscreenCanvas, renderGraded } from './pipeline';
import type { CullRequest, CullResponse } from './protocol';

// The DOM lib types `self` as a Window; this file runs as a DedicatedWorkerGlobalScope. Only these two members are used.
const scope = self as unknown as {
  onmessage: ((e: MessageEvent<CullRequest>) => void) | null;
  postMessage: (msg: CullResponse) => void;
};

const errorCode = (e: unknown) => (e instanceof Error && e.message ? e.message.slice(0, 80) : 'failed');

scope.onmessage = (e: MessageEvent<CullRequest>) => {
  const req = e.data;
  void (async () => {
    if (req?.type === 'analyze') {
      try {
        const r = await analyzePhoto(req.file, offscreenCanvas);
        scope.postMessage({ type: 'analyzed', seq: req.seq, ok: true, result: r });
      } catch (err) {
        scope.postMessage({ type: 'analyzed', seq: req.seq, ok: false, error: errorCode(err) });
      }
    } else if (req?.type === 'render') {
      try {
        const r = await renderGraded(req.file, req.grade, req.mime, offscreenCanvas);
        scope.postMessage({ type: 'rendered', seq: req.seq, ok: true, result: r });
      } catch (err) {
        scope.postMessage({ type: 'rendered', seq: req.seq, ok: false, error: errorCode(err) });
      }
    }
  })();
};
