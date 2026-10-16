/** @jest-environment node */
/**
 * Music on a phone (Production 2026-10-16): iOS drops the one long /api/ai/music request when the screen locks, while
 * the server keeps rendering and charging. The runner waits for the job's own row instead of failing.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const src = readFileSync(join(__dirname, 'OmniStudio.tsx'), 'utf8');
const run = src.slice(src.indexOf('const runMusicJob = useCallback'), src.indexOf('// Stream one chat turn from /api/chat/gemini'));

test('a dropped music request waits for its job row; anything else still fails as before', () => {
  expect(run).toMatch(/catch \(err\) \{\s*if \(!isDroppedConnection\(err, signal\)\) throw err;/);
  expect(run).toContain('await awaitDroppedJob(jobId, { signal })');
  expect(run).toContain("updateBubble(bubbleId, { text: '', audioUrl: late.url })");
});
