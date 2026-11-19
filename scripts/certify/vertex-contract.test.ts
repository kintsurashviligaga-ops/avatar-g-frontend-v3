/** @jest-environment node */
/**
 * scripts/certify/vertex-contract.mjs spends the owner's money (one paid call per model, $5 at most, owner card
 * 2026-11-05 20:15Z), so what it may do is pinned here against a fake network and a fake token:
 *  · nothing is sent without --confirm paid-certification, and a dry run asks for no token;
 *  · a plan over its cap, over $5, or naming a host outside Vertex / Cloud speech is refused before any call;
 *  · no call is ever sent twice: no retry on an error or no answer, a ledger written before each call, a second run
 *    refused, and --resume sends only what was never sent;
 *  · a call whose input never came (an earlier call failed) is skipped, not sent;
 *  · the written fixtures hold no token, no media bytes and no project id.
 */
import { mkdtempSync, readdirSync, readFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  CONFIRM_WORD,
  findMedia,
  mediaFacts,
  mp3Facts,
  mp4Facts,
  parseArgs,
  pcmRate,
  pollUrlFor,
  projectNumberIn,
  run,
  sanitize,
  substitute,
  validatePlan,
  wavFromPcm16,
} from './vertex-contract.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const PROJECT = 'certify-project';
const TOKEN = 'ya29.fake-access-token-for-the-runner-test';
const IMAGE_B64 = Buffer.alloc(3000, 7).toString('base64');
const VIDEO_B64 = Buffer.alloc(3000, 9).toString('base64');

type Call = Record<string, unknown>;
const plan = (calls: Call[], capUsd = 5) => ({ version: 1, capUsd, calls });
const imageCall: Call = {
  id: 'image', model: 'gemini-3.1-flash-image', kind: 'sync', estimateUsd: 0.07,
  url: 'https://aiplatform.googleapis.com/v1/projects/{project}/locations/global/publishers/google/models/gemini-3.1-flash-image:generateContent',
  body: { contents: [{ role: 'user', parts: [{ text: 'a lantern' }] }] },
};
const veoCall: Call = {
  id: 'veo-fast', model: 'veo-3.1-fast-generate-001', kind: 'lro', estimateUsd: 0.4, requires: ['image'],
  url: 'https://us-central1-aiplatform.googleapis.com/v1/projects/{project}/locations/us-central1/publishers/google/models/veo-3.1-fast-generate-001:predictLongRunning',
  body: { instances: [{ prompt: 'sways', image: { bytesBase64Encoded: '{{image.base64}}', mimeType: '{{image.mimeType}}' } }], parameters: { durationSeconds: 4 } },
};
const OP = 'projects/123456789012/locations/us-central1/publishers/google/models/veo-3.1-fast-generate-001/operations/abc-123';

function tmp(): string {
  return mkdtempSync(path.join(os.tmpdir(), 'vertex-contract-'));
}
function writePlan(dir: string, p: unknown): string {
  const f = path.join(dir, 'plan.json');
  writeFileSync(f, JSON.stringify(p));
  return f;
}
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

type Sent = { url: string; init: RequestInit };
function fakeNetwork(script: Array<(s: Sent) => Response | Promise<Response>>) {
  const sent: Sent[] = [];
  const fetch = jest.fn(async (url: string, init: RequestInit) => {
    const s = { url, init };
    sent.push(s);
    const next = script.shift();
    if (!next) throw new Error(`unexpected request ${url}`);
    return next(s);
  });
  return { sent, fetch };
}
const quiet = { log: () => undefined, pollEveryMs: 1, pollForMs: 2_000 };

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...filesUnder(p));
    else out.push(p);
  }
  return out;
}

describe('arguments and the plan', () => {
  test('a project is required, and a paid run needs the confirm word', () => {
    expect(() => parseArgs([])).toThrow(/--project/);
    expect(() => parseArgs(['--project', 'Bad_Project'])).toThrow(/--project/);
    expect(() => parseArgs(['--project', PROJECT])).toThrow(new RegExp(CONFIRM_WORD));
    expect(() => parseArgs(['--project', PROJECT, '--confirm', 'yes'])).toThrow(new RegExp(CONFIRM_WORD));
    expect(parseArgs(['--project', PROJECT, '--dry-run'])).toMatchObject({ project: PROJECT, dryRun: true });
    expect(parseArgs(['--project', PROJECT, '--confirm', CONFIRM_WORD])).toMatchObject({ dryRun: false, confirm: CONFIRM_WORD });
    expect(() => parseArgs(['--project', PROJECT, '--dry-run', '--retry'])).toThrow(/unknown argument/);
  });

  test('the cap: estimates over the plan cap, or a cap over the owner\'s $5, are refused', () => {
    expect(validatePlan(plan([imageCall, veoCall]))).toEqual({ total: 0.47, cap: 5 });
    expect(() => validatePlan(plan([imageCall, veoCall], 0.4))).toThrow(/exceed its cap/);
    expect(() => validatePlan(plan([imageCall], 6))).toThrow(/capUsd/);
    expect(() => validatePlan(plan([{ ...veoCall, estimateUsd: 5.5 }]))).toThrow();
  });

  test('only Vertex and Cloud speech hosts; never the Developer API; ids unique; dependencies earlier', () => {
    const bad = (c: Call) => () => validatePlan(plan([c]));
    expect(bad({ ...imageCall, url: 'https://generativelanguage.googleapis.com/v1beta/models/x:generateContent?project={project}' })).toThrow();
    expect(bad({ ...imageCall, url: 'https://example.com/{project}' })).toThrow(/not a Vertex/);
    expect(bad({ ...imageCall, url: 'http://aiplatform.googleapis.com/v1/projects/{project}/x' })).toThrow(/not a Vertex/);
    expect(bad({ ...imageCall, estimateUsd: -1 })).toThrow(/estimateUsd/);
    expect(() => validatePlan(plan([imageCall, imageCall]))).toThrow(/duplicate/);
    expect(() => validatePlan(plan([veoCall, imageCall]))).toThrow(/requires image/);
    expect(bad({ id: 'list', kind: 'get', url: 'https://texttospeech.googleapis.com/v1/voices', estimateUsd: 0.01 })).toThrow(/free/);
  });

  test('the committed plan passes, at about $2.20 of $5', () => {
    const committed = JSON.parse(readFileSync(path.join(__dirname, 'vertex-contract-plan.json'), 'utf8'));
    expect(validatePlan(committed)).toEqual({ total: 2.2, cap: 5 });
  });

  test('the second plan (owner card 2026-11-06) passes: three calls, $0.03 of $0.10, and both runs together stay under $5', () => {
    const first = JSON.parse(readFileSync(path.join(__dirname, 'vertex-contract-plan.json'), 'utf8'));
    const second = JSON.parse(readFileSync(path.join(__dirname, 'vertex-contract-plan-2.json'), 'utf8'));
    expect(validatePlan(second)).toEqual({ total: 0.03, cap: 0.1 });
    expect(second.calls.map((c: Call) => c.id)).toEqual(['gemini-tts-2', 'chirp-listed', 'chirp-ka']);
    expect(validatePlan(first).total + validatePlan(second).cap).toBeLessThanOrEqual(5);
  });

  test('inputs: a plain relative path inside the plan folder, a mime type and a sha256 pin', () => {
    const chirp: Call = {
      id: 'chirp', kind: 'sync', estimateUsd: 0.01, requires: ['ka'],
      url: 'https://us-speech.googleapis.com/v2/projects/{project}/locations/us/recognizers/_:recognize', body: { content: '{{ka.base64}}' },
    };
    const sha256 = 'a'.repeat(64);
    const withInput = (input: unknown) => () => validatePlan({ ...plan([chirp]), inputs: { ka: input } });
    expect(withInput({ file: 'out/media/ka.mp3', mimeType: 'audio/mpeg', sha256 })()).toEqual({ total: 0.01, cap: 5 });
    expect(withInput({ file: '../secrets/ka.mp3', mimeType: 'audio/mpeg', sha256 })).toThrow(/plain relative path/);
    expect(withInput({ file: '/etc/passwd', mimeType: 'audio/mpeg', sha256 })).toThrow(/plain relative path/);
    expect(withInput({ file: 'out/./ka.mp3', mimeType: 'audio/mpeg', sha256 })).toThrow(/plain relative path/);
    expect(withInput({ file: 'out/ka.mp3', sha256 })).toThrow(/mimeType/);
    expect(withInput({ file: 'out/ka.mp3', mimeType: 'audio/mpeg' })).toThrow(/sha256/);
    expect(() => validatePlan(plan([chirp]))).toThrow(/requires ka/);
  });
});

describe('pure helpers', () => {
  test('substitute fills {{id.field}} from earlier answers, and names what is missing', () => {
    const refs = { image: { base64: 'QUJD', mimeType: 'image/png' }, 'gemini-tts': { wavBase64: 'UklG' } };
    expect(substitute({ a: ['{{image.base64}}', { m: '{{image.mimeType}}' }], w: '{{gemini-tts.wavBase64}}', n: 4 }, refs))
      .toEqual({ a: ['QUJD', { m: 'image/png' }], w: 'UklG', n: 4 });
    expect(() => substitute({ x: '{{veo.base64}}' }, refs)).toThrow('missing:veo.base64');
    expect(substitute('plain {{text}}', refs)).toBe('plain {{text}}');
  });

  test('sanitize: media becomes size and hash, the project id and number become {project}', () => {
    const out = sanitize({ name: OP, url: `https://x/projects/${PROJECT}/y`, data: IMAGE_B64, text: 'hello' }, PROJECT, '123456789012');
    expect(out.name).toBe('projects/{project}/locations/us-central1/publishers/google/models/veo-3.1-fast-generate-001/operations/abc-123');
    expect(out.url).toBe('https://x/projects/{project}/y');
    expect(out.data).toMatch(/^<media bytes=3000 sha256=[0-9a-f]{64}>$/);
    expect(out.text).toBe('hello');
    expect(projectNumberIn(OP)).toBe('123456789012');
  });

  test('findMedia finds Gemini parts, Cloud TTS audioContent and Veo videos, largest first', () => {
    expect(findMedia({ candidates: [{ content: { parts: [{ text: 'hi' }, { inlineData: { mimeType: 'image/png', data: IMAGE_B64 } }] } }] }))
      .toEqual([{ field: 'data', base64: IMAGE_B64, mimeType: 'image/png' }]);
    expect(findMedia({ audioContent: IMAGE_B64 })[0]).toMatchObject({ mimeType: 'audio/mpeg' });
    expect(findMedia({ response: { videos: [{ bytesBase64Encoded: VIDEO_B64, mimeType: 'video/mp4' }] } })[0]).toMatchObject({ mimeType: 'video/mp4' });
    expect(findMedia({ text: 'a'.repeat(100) })).toEqual([]);
  });

  test('pcmRate, WAV wrapping and media facts (WAV, PNG, MP4, MP3)', () => {
    expect(pcmRate('audio/L16;codec=pcm;rate=24000')).toBe(24000);
    expect(pcmRate('audio/mpeg')).toBeNull();
    const wav = wavFromPcm16(Buffer.alloc(48_000), 24_000);
    expect(mediaFacts(wav, 'audio/wav')).toMatchObject({ bytes: 48_044, sampleRate: 24_000, durationSec: 1 });

    const png = Buffer.alloc(33);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png, 0);
    png.writeUInt32BE(1376, 16);
    png.writeUInt32BE(768, 20);
    expect(mediaFacts(png, 'image/png')).toMatchObject({ width: 1376, height: 768 });

    // A minimal MP4: ftyp, then moov with mvhd (4 s) and one video track (1280×720) and one sound track.
    const box = (type: string, body: Buffer) => {
      const h = Buffer.alloc(8);
      h.writeUInt32BE(8 + body.length, 0);
      h.write(type, 4, 'ascii');
      return Buffer.concat([h, body]);
    };
    const mvhd = Buffer.alloc(100);
    mvhd.writeUInt32BE(1000, 12);
    mvhd.writeUInt32BE(4000, 16);
    const tkhd = Buffer.alloc(84);
    tkhd.writeUInt32BE(1280 * 65536, 76);
    tkhd.writeUInt32BE(720 * 65536, 80);
    const videoTrak = box('trak', Buffer.concat([box('tkhd', tkhd), box('mdia', box('minf', box('vmhd', Buffer.alloc(12))))]));
    const soundTrak = box('trak', Buffer.concat([box('tkhd', Buffer.alloc(84)), box('mdia', box('minf', box('smhd', Buffer.alloc(8))))]));
    const mp4 = Buffer.concat([box('ftyp', Buffer.from('isom0000')), box('moov', Buffer.concat([box('mvhd', mvhd), videoTrak, soundTrak]))]);
    expect(mp4Facts(mp4)).toEqual({ durationSec: 4, width: 1280, height: 720, hasVideoTrack: true, hasAudioTrack: true });
    expect(mediaFacts(mp4, 'video/mp4')).toMatchObject({ durationSec: 4, hasAudioTrack: true });

    // MPEG-1 Layer III, 128 kbps, 44.1 kHz: 417-byte frames of 1152 samples. 100 frames ≈ 2.612 s.
    const frame = Buffer.alloc(417);
    Buffer.from([0xff, 0xfb, 0x90, 0x00]).copy(frame, 0);
    const mp3 = Buffer.concat(Array.from({ length: 100 }, () => frame));
    expect(mp3Facts(mp3)).toEqual({ durationSec: 2.612, frames: 100, sampleRate: 44100 });
  });

  test('the poll URL is read from the operation name (its own project, region and model)', () => {
    expect(pollUrlFor(OP)).toBe('https://us-central1-aiplatform.googleapis.com/v1/projects/123456789012/locations/us-central1/publishers/google/models/veo-3.1-fast-generate-001:fetchPredictOperation');
    expect(pollUrlFor('operations/x')).toBeNull();
  });
});

describe('the run', () => {
  test('a dry run asks for no token and sends nothing', async () => {
    const dir = tmp();
    const net = fakeNetwork([]);
    const token = jest.fn(() => TOKEN);
    await run({ project: PROJECT, plan: writePlan(dir, plan([imageCall, veoCall])), out: path.join(dir, 'out'), dryRun: true }, { ...quiet, fetch: net.fetch, token });
    expect(token).not.toHaveBeenCalled();
    expect(net.fetch).not.toHaveBeenCalled();
    expect(existsSync(path.join(dir, 'out'))).toBe(false);
  });

  test('each call once, the photo feeds Veo, the job is polled to its video, and the files hold no token, bytes or project', async () => {
    const dir = tmp();
    const out = path.join(dir, 'out');
    const net = fakeNetwork([
      () => reply({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: IMAGE_B64 } }] } }], usageMetadata: { totalTokenCount: 1300 } }),
      () => reply({ name: OP }),
      () => reply({ name: OP, done: false }),
      () => reply({ name: OP, done: true, response: { videos: [{ bytesBase64Encoded: VIDEO_B64, mimeType: 'video/mp4' }] } }),
    ]);
    const summary = await run({ project: PROJECT, plan: writePlan(dir, plan([imageCall, veoCall])), out, dryRun: false, resume: false }, { ...quiet, fetch: net.fetch, token: () => TOKEN });

    expect(net.sent.map((s) => s.url)).toEqual([
      `https://aiplatform.googleapis.com/v1/projects/${PROJECT}/locations/global/publishers/google/models/gemini-3.1-flash-image:generateContent`,
      `https://us-central1-aiplatform.googleapis.com/v1/projects/${PROJECT}/locations/us-central1/publishers/google/models/veo-3.1-fast-generate-001:predictLongRunning`,
      pollUrlFor(OP),
      pollUrlFor(OP),
    ]);
    for (const s of net.sent) {
      const h = s.init.headers as Record<string, string>;
      expect(h.Authorization).toBe(`Bearer ${TOKEN}`);
      expect(h['x-goog-user-project']).toBe(PROJECT);
      expect(s.init.redirect).toBe('manual');
    }
    // The Veo submit carried the photo the image call returned.
    const veoBody = JSON.parse(String(net.sent[1]!.init.body));
    expect(veoBody.instances[0].image).toEqual({ bytesBase64Encoded: IMAGE_B64, mimeType: 'image/png' });

    expect(summary.estimateSentUsd).toBe(0.47);
    expect(summary.results.map((r: { id: string }) => r.id)).toEqual(['image', 'veo-fast']);
    expect(summary.results[1]).toMatchObject({ done: true, media: { bytes: 3000, mimeType: 'video/mp4' } });

    const files = filesUnder(out);
    expect(files.map((f) => path.relative(out, f)).sort()).toEqual([
      'fixtures/image/meta.json', 'fixtures/image/request.json', 'fixtures/image/response.json',
      'fixtures/veo-fast/meta.json', 'fixtures/veo-fast/operation.json', 'fixtures/veo-fast/request.json', 'fixtures/veo-fast/response.json',
      'ledger.json', 'media/image.png', 'media/veo-fast.mp4', 'summary.json',
    ]);
    for (const f of files.filter((x) => x.endsWith('.json'))) {
      const text = readFileSync(f, 'utf8');
      expect(text).not.toContain(TOKEN);
      expect(text).not.toContain(IMAGE_B64.slice(0, 200));
      expect(text).not.toContain(VIDEO_B64.slice(0, 200));
      if (!f.endsWith('ledger.json')) expect(text).not.toContain(PROJECT);
    }
    const op = JSON.parse(readFileSync(path.join(out, 'fixtures/veo-fast/operation.json'), 'utf8'));
    expect(op.body.name).toBe('projects/{project}/locations/us-central1/publishers/google/models/veo-3.1-fast-generate-001/operations/abc-123');
    expect(op.body.response.videos[0].bytesBase64Encoded).toMatch(/^<media bytes=3000 sha256=/);
  });

  test('never twice: an error answer is not retried, a dependent call is skipped, and a second run is refused', async () => {
    const dir = tmp();
    const out = path.join(dir, 'out');
    const p = writePlan(dir, plan([imageCall, veoCall]));
    const net = fakeNetwork([() => reply({ error: { code: 429, message: 'Resource exhausted' } }, 429)]);
    const summary = await run({ project: PROJECT, plan: p, out, dryRun: false, resume: false }, { ...quiet, fetch: net.fetch, token: () => TOKEN });
    expect(net.fetch).toHaveBeenCalledTimes(1);
    expect(summary.results).toEqual([
      expect.objectContaining({ id: 'image', status: 429 }),
      { id: 'veo-fast', skipped: 'missing:image.base64' },
    ]);
    expect(summary.estimateSentUsd).toBe(0.07);

    const again = fakeNetwork([]);
    await expect(run({ project: PROJECT, plan: p, out, dryRun: false, resume: false }, { ...quiet, fetch: again.fetch, token: () => TOKEN }))
      .rejects.toThrow(/already ran/);
    expect(again.fetch).not.toHaveBeenCalled();
  });

  test('no answer is not retried either, and --resume sends only the calls the ledger never sent', async () => {
    const dir = tmp();
    const out = path.join(dir, 'out');
    const list: Call = { id: 'voices-ru', model: 'list', kind: 'get', estimateUsd: 0, url: 'https://texttospeech.googleapis.com/v1/voices?languageCode=ru-RU', pick: { languageCode: 'ru-RU', gender: 'FEMALE' } };
    const p = writePlan(dir, plan([imageCall, list]));
    let calls = 0;
    const first = jest.fn(async () => {
      calls += 1;
      if (calls === 1) throw Object.assign(new Error('timed out'), { name: 'TimeoutError' });
      throw new Error('stop');
    });
    // Neither call gets an answer (a timeout, then a network error): each is recorded once and not tried again.
    const summary = await run({ project: PROJECT, plan: p, out, dryRun: false, resume: false }, { ...quiet, fetch: first, token: () => TOKEN });
    expect(first).toHaveBeenCalledTimes(2);
    expect(summary.results[0]).toMatchObject({ id: 'image', status: 0, error: 'TimeoutError' });
    const ledger = JSON.parse(readFileSync(path.join(out, 'ledger.json'), 'utf8'));
    expect(Object.keys(ledger.sent)).toEqual(['image', 'voices-ru']);

    // Resume: both were sent once already, so nothing goes out again.
    const net = fakeNetwork([]);
    const resumed = await run({ project: PROJECT, plan: p, out, dryRun: false, resume: true }, { ...quiet, fetch: net.fetch, token: () => TOKEN });
    expect(net.fetch).not.toHaveBeenCalled();
    expect(resumed.results).toEqual([]);
  });

  test('read-aloud PCM parts are joined in order into one WAV, and that WAV is what Chirp is sent', async () => {
    const dir = tmp();
    const out = path.join(dir, 'out');
    const tts: Call = {
      id: 'gemini-tts', model: 'gemini-2.5-flash-preview-tts', kind: 'sync', estimateUsd: 0.01,
      url: 'https://aiplatform.googleapis.com/v1/projects/{project}/locations/global/publishers/google/models/gemini-2.5-flash-preview-tts:generateContent',
      body: { contents: [{ role: 'user', parts: [{ text: 'Read aloud verbatim: გამარჯობა' }] }] },
    };
    const chirp: Call = {
      id: 'chirp-ka', model: 'chirp_3', kind: 'sync', estimateUsd: 0.01, requires: ['gemini-tts'],
      url: 'https://us-speech.googleapis.com/v2/projects/{project}/locations/us/recognizers/_:recognize',
      body: { config: { autoDecodingConfig: {}, model: 'chirp_3', languageCodes: ['ka-GE'] }, content: '{{gemini-tts.wavBase64}}' },
    };
    const first = Buffer.alloc(24_000, 1);
    const second = Buffer.alloc(24_000, 2);
    const mime = 'audio/L16;codec=pcm;rate=24000';
    const net = fakeNetwork([
      () => reply({ candidates: [{ content: { parts: [{ inlineData: { mimeType: mime, data: first.toString('base64') } }, { inlineData: { mimeType: mime, data: second.toString('base64') } }] } }] }),
      () => reply({ results: [{ alternatives: [{ transcript: 'გამარჯობა' }], languageCode: 'ka-ge' }], metadata: { totalBilledDuration: '1s' } }),
    ]);
    const summary = await run({ project: PROJECT, plan: writePlan(dir, plan([tts, chirp])), out, dryRun: false, resume: false }, { ...quiet, fetch: net.fetch, token: () => TOKEN });
    const sentWav = Buffer.from(JSON.parse(String(net.sent[1]!.init.body)).content, 'base64');
    expect(sentWav.equals(wavFromPcm16(Buffer.concat([first, second]), 24_000))).toBe(true);
    expect(summary.results[0]).toMatchObject({ id: 'gemini-tts', media: { mimeType: 'audio/wav', durationSec: 1, sampleRate: 24_000 } });
    expect(summary.results[1]).toMatchObject({ id: 'chirp-ka', transcript: 'გამარჯობა' });
    expect(readFileSync(path.join(out, 'media/gemini-tts.wav')).equals(sentWav)).toBe(true);
  });

  test('a TTS model that answers in a WAV container (gemini-3.8-flash-tts) still feeds Chirp that WAV', async () => {
    const dir = tmp();
    const out = path.join(dir, 'out');
    const tts: Call = {
      id: 'tts-38-ka', model: 'gemini-3.8-flash-tts', kind: 'sync', estimateUsd: 0.01,
      url: 'https://aiplatform.googleapis.com/v1/projects/{project}/locations/global/publishers/google/models/gemini-3.8-flash-tts:generateContent',
      body: { contents: [{ role: 'user', parts: [{ text: 'გამარჯობა' }] }] },
    };
    const chirp: Call = {
      id: 'chirp-ka-38', model: 'chirp_3', kind: 'sync', estimateUsd: 0.01, requires: ['tts-38-ka'],
      url: 'https://us-speech.googleapis.com/v2/projects/{project}/locations/us/recognizers/_:recognize',
      body: { config: { autoDecodingConfig: {}, model: 'chirp_3', languageCodes: ['ka-GE'] }, content: '{{tts-38-ka.wavBase64}}' },
    };
    const wav = wavFromPcm16(Buffer.alloc(48_000, 5), 24_000);
    const net = fakeNetwork([
      () => reply({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/wav', data: wav.toString('base64') } }] } }] }),
      () => reply({ results: [{ alternatives: [{ transcript: 'გამარჯობა' }], languageCode: 'ka-ge' }], metadata: { totalBilledDuration: '1s' } }),
    ]);
    const summary = await run({ project: PROJECT, plan: writePlan(dir, plan([tts, chirp])), out, dryRun: false, resume: false }, { ...quiet, fetch: net.fetch, token: () => TOKEN });
    expect(net.sent).toHaveLength(2);
    expect(Buffer.from(JSON.parse(String(net.sent[1]!.init.body)).content, 'base64').equals(wav)).toBe(true);
    expect(summary.results[0]).toMatchObject({ id: 'tts-38-ka', media: { mimeType: 'audio/wav', sampleRate: 24_000, durationSec: 1 } });
    expect(summary.results[1]).toMatchObject({ id: 'chirp-ka-38', transcript: 'გამარჯობა' });
  });

  test('the voices list picks the voice the synthesis uses, and the fixture keeps only that language', async () => {
    const dir = tmp();
    const out = path.join(dir, 'out');
    const list: Call = { id: 'voices-ru', model: 'list', kind: 'get', estimateUsd: 0, url: 'https://texttospeech.googleapis.com/v1/voices?languageCode=ru-RU', pick: { languageCode: 'ru-RU', gender: 'FEMALE' } };
    const synth: Call = {
      id: 'cloud-tts-ru', model: 'tts', kind: 'sync', estimateUsd: 0.01, requires: ['voices-ru'], url: 'https://texttospeech.googleapis.com/v1/text:synthesize',
      body: { input: { text: 'Это' }, voice: { languageCode: 'ru-RU', name: '{{voices-ru.pick}}' } },
    };
    const net = fakeNetwork([
      () => reply({ voices: [
        { name: 'ru-RU-Standard-A', ssmlGender: 'FEMALE', languageCodes: ['ru-RU'] },
        { name: 'ru-RU-Chirp3-HD-Aoede', ssmlGender: 'FEMALE', languageCodes: ['ru-RU'] },
        { name: 'en-US-Chirp3-HD-Kore', ssmlGender: 'FEMALE', languageCodes: ['en-US'] },
      ] }),
      () => reply({ audioContent: Buffer.alloc(2000, 3).toString('base64') }),
    ]);
    await run({ project: PROJECT, plan: writePlan(dir, plan([list, synth])), out, dryRun: false, resume: false }, { ...quiet, fetch: net.fetch, token: () => TOKEN });
    expect(net.sent[0]!.init.method).toBe('GET');
    expect(JSON.parse(String(net.sent[1]!.init.body)).voice.name).toBe('ru-RU-Chirp3-HD-Aoede');
    const fixture = JSON.parse(readFileSync(path.join(out, 'fixtures/voices-ru/response.json'), 'utf8'));
    expect(fixture.body.voices.map((v: { name: string }) => v.name)).toEqual(['ru-RU-Standard-A', 'ru-RU-Chirp3-HD-Aoede']);
  });

  const chirpOnFile: Call = {
    id: 'chirp-ka', model: 'chirp_3', kind: 'sync', estimateUsd: 0.01, requires: ['ka-mp3'],
    url: 'https://us-speech.googleapis.com/v2/projects/{project}/locations/us/recognizers/_:recognize',
    body: { config: { autoDecodingConfig: {}, model: 'chirp_3', languageCodes: ['ka-GE'] }, content: '{{ka-mp3.base64}}' },
  };
  const recorded = Buffer.alloc(5000, 5);
  const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
  const withRecording = (dir: string, bytes: Buffer) => {
    const media = path.join(dir, 'out', 'media');
    mkdirSync(media, { recursive: true });
    writeFileSync(path.join(media, 'cloud-tts-ka.mp3'), bytes);
  };
  const filePlan = () => ({ ...plan([chirpOnFile], 0.1), inputs: { 'ka-mp3': { file: 'out/media/cloud-tts-ka.mp3', mimeType: 'audio/mpeg', sha256: sha(recorded) } } });

  test('an input: the recorded file is sent as the content, and the summary names it (bytes and sha256, no bytes in files)', async () => {
    const dir = tmp();
    withRecording(dir, recorded);
    const out = path.join(dir, 'out2');
    const net = fakeNetwork([() => reply({ results: [{ alternatives: [{ transcript: 'ეს არის ქართული ხმის შემოწმება' }], languageCode: 'ka-ge' }] })]);
    const summary = await run({ project: PROJECT, plan: writePlan(dir, filePlan()), out, dryRun: false, resume: false }, { ...quiet, fetch: net.fetch, token: () => TOKEN });
    expect(JSON.parse(String(net.sent[0]!.init.body)).content).toBe(recorded.toString('base64'));
    expect(summary.inputs).toEqual({ 'ka-mp3': { file: 'out/media/cloud-tts-ka.mp3', bytes: 5000, sha256: sha(recorded), mimeType: 'audio/mpeg' } });
    expect(summary.results[0]).toMatchObject({ id: 'chirp-ka', status: 200, transcript: 'ეს არის ქართული ხმის შემოწმება' });
    for (const f of filesUnder(out)) expect(readFileSync(f, 'utf8')).not.toContain(recorded.toString('base64'));
  });

  test('an input that is missing or not the recorded file stops the run before any call, the dry run too', async () => {
    for (const bytes of [null, Buffer.alloc(5000, 6)]) {
      const dir = tmp();
      if (bytes) withRecording(dir, bytes);
      const out = path.join(dir, 'out2');
      const net = fakeNetwork([]);
      const token = jest.fn(() => TOKEN);
      const p = writePlan(dir, filePlan());
      await expect(run({ project: PROJECT, plan: p, out, dryRun: true, resume: false }, { ...quiet, fetch: net.fetch, token })).rejects.toThrow(/input ka-mp3/);
      await expect(run({ project: PROJECT, plan: p, out, dryRun: false, resume: false }, { ...quiet, fetch: net.fetch, token })).rejects.toThrow(/nothing was sent/);
      expect(net.fetch).not.toHaveBeenCalled();
      expect(token).not.toHaveBeenCalled();
      expect(existsSync(path.join(out, 'ledger.json'))).toBe(false);
    }
  });
});
