/** @jest-environment node */
/**
 * D-C3 (Video Core certification, 2026-10-15): the film's tray row stayed "running" after delivery. The durable row was
 * completed only when the whole job returned — after the post-delivery lip-sync / graphics upgrades — so a page closed in
 * that window left it `processing` for 30 minutes. Pinned on OmniStudio's source (its render path sits behind providers).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, 'OmniStudio.tsx'), 'utf8');
const film = src.slice(src.indexOf('const renderFilm = useCallback(async'), src.indexOf('const startFilmRender = useCallback(('));

test('a queued film completes its durable row with the master the moment it is delivered', () => {
  const delivered = film.indexOf('if (jobCtx) { deliveredUrl = res.masterUrl; trackJobComplete(jobCtx.jobId, res.masterUrl); }');
  expect(delivered).toBeGreaterThan(0);
  // before any post-delivery step (the graphics agent; the lip-sync pass was removed in v5.1 M-14) can hold the job open
  expect(film).not.toContain("fetch('/api/video/lipsync");
  expect(delivered).toBeLessThan(film.indexOf("fetch('/api/video/graphics'"));
  // only on a delivered master, never on a failure
  expect(film.slice(film.lastIndexOf('if (mine() && res.ok && res.masterUrl) {', delivered), delivered)).toMatch(/finalUrl = res\.masterUrl;/);
});

test('an upgrade that lands after delivery is filed in the Library on its own', () => {
  expect(film).toMatch(/if \(finalUrl && deliveredUrl && finalUrl !== deliveredUrl\) autoSaveToLibrary\(finalUrl, 'film', filmPrompt\);\s*return finalUrl \?\? undefined;/);
});
