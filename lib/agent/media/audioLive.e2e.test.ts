/** @jest-environment node */
/**
 * OPT-IN, over the real internet (AGENT_G_AUDIO_E2E=1; skipped otherwise, so CI never depends on a third party):
 * Agent G's audio extraction end to end on the live fetch rules (lib/web/publicFetch, pinned DNS) and the bundled
 * ffmpeg, against media whose use is allowed:
 *   flower.mp4 from MDN's shared-assets (github.com/mdn/shared-assets: media published for reuse in samples; its README
 *   admits only assets that are "CC0 or under a permissive license") → quote → queue → worker → QC → the MP3 a user
 *   would get. Only storage and the database are local.
 * And the refusal: a YouTube link is refused by name before any request is made.
 * AGENT_G_AUDIO_E2E_OUT=<dir> also keeps the MP3 and an evidence.json there.
 */
jest.mock('server-only', () => ({}));
jest.mock('./montageLive', () => ({ audit: async () => {}, quoteKey: () => 'k', every: () => () => {} }));
jest.mock('../../security/callerMedia', () => ({ resolveCallerMedia: async () => ({ ok: false, reason: 'unreadable' }) }));
jest.mock('../../orchestrator/storage-adapter', () => ({ uploadBufferAndSign: async () => null, reSignIfInternal: async (u: string) => u }));
jest.mock('../../supabase/server', () => ({ createServiceRoleClient: () => null }));
jest.mock('../../observability/report-error', () => ({ reportError: () => {} }));

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { memoryLeaseStore } from '../../orchestrator/testing/memoryLeaseStore';
import { enqueueAudioJob, quoteAudioExtract, type AudioExecDeps } from './audioExtract';
import { extractMp3, inspectLink } from './audioLive';
import { workAudioJob } from './audioWorker';

const ON = process.env.AGENT_G_AUDIO_E2E === '1';
const SOURCE = 'https://raw.githubusercontent.com/mdn/shared-assets/main/videos/flower.mp4';
jest.setTimeout(180_000);

(ON ? describe : describe.skip)('real internet: a reusable video → MP3, and a platform refused', () => {
  test('flower.mp4 (MDN shared-assets, published for reuse) → a QC’d MP3 in the row', async () => {
    const store = memoryLeaseStore();
    const stored = new Map<string, Buffer>();
    const audits: unknown[] = [];
    let ids = 0;
    const deps: AudioExecDeps = {
      resolveFile: async () => ({ ok: false, reason: 'unreadable' }),
      inspect: (url) => inspectLink(url),
      extract: (url, o) => extractMp3(url, o),
      upload: async (jobId, mp3) => { stored.set(jobId, mp3); return `https://storage.test/audio/extract-${jobId}.mp3`; },
      resign: async (u) => u,
      store,
      audit: async (ev) => { audits.push(ev); },
      key: () => 'e2e-key',
      now: () => Date.now(),
      newId: () => `e2e-${(ids += 1)}`,
      every: () => () => {},
    };
    const t0 = Date.now();
    const q = await quoteAudioExtract(deps, { userId: 'e2e-user', url: SOURCE });
    if (!q.ok) throw new Error(`${q.error}: ${q.message}`);
    expect(q.quote).toMatchObject({ host: 'raw.githubusercontent.com', name: 'flower.mp3', credits: 0, rights: { status: 'unverified' } });
    const run = await enqueueAudioJob(deps, { userId: 'e2e-user', request: q.request, token: q.token });
    expect(run).toMatchObject({ ok: true, status: 'queued', replay: false });
    const worked = await workAudioJob(deps, { jobId: q.quote.jobId, worker: 'e2e-worker' });
    expect(worked).toMatchObject({ ran: true, outcome: 'delivered' });
    const row = store.rows.get(q.quote.jobId)!;
    const mp3 = stored.get(q.quote.jobId)!;
    expect(row).toMatchObject({ status: 'completed', result: { codec: 'mp3', name: 'flower.mp3', bitrateKbps: 192 } });
    const evidence = {
      at: new Date().toISOString(),
      source: SOURCE,
      sourceLicense: 'github.com/mdn/shared-assets: published for reuse; README admits only "CC0 or under a permissive license" assets (LICENSE.md)',
      quote: q.quote,
      row: { id: row.id, status: row.status, stage: row.stage, pct: row.pct, error: row.error, result: row.result, attempt: row.exec?.attempt },
      mp3: { bytes: mp3.byteLength, sha256: createHash('sha256').update(mp3).digest('hex') },
      elapsedMs: Date.now() - t0,
      audits,
    };
    const out = process.env.AGENT_G_AUDIO_E2E_OUT;
    if (out) {
      mkdirSync(out, { recursive: true });
      writeFileSync(join(out, 'flower.mp3'), mp3);
      writeFileSync(join(out, 'evidence.json'), JSON.stringify(evidence, null, 2));
    }
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(evidence, null, 2));
  });

  test('a YouTube link is refused by name, before any request', async () => {
    const inspect = jest.fn();
    const deps = { inspect, key: () => 'k', audit: async () => {} } as unknown as AudioExecDeps;
    const r = await quoteAudioExtract(deps, { userId: 'e2e-user', url: 'https://youtu.be/dQw4w9WgXcQ' });
    expect(r).toMatchObject({ ok: false, error: 'platform', platform: 'YouTube' });
    expect(inspect).not.toHaveBeenCalled();
  });
});
