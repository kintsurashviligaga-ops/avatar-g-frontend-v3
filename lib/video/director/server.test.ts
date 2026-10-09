/** @jest-environment node */
/**
 * server.ts — the live engine port, with every server module mocked (no Veo, no ledger, no storage, no network).
 * Rules under test: the submit runs inside the budget guard, priced at the clip the engine will render, and hands the
 * engine the provider's request untouched; a budget refusal is a `quota` outcome with nothing submitted; no transport
 * means the engine's own not_configured answer (no guard, no spend); delivery hosts each operation at one stable path;
 * the port's wire check is lib/veo/payload's. The default Gemini planner is never invoked here.
 */
jest.mock('server-only', () => ({}));
jest.mock('../../ai/llmText', () => ({
  llmText: jest.fn(() => {
    throw new Error('the default Gemini planner must never be called in tests');
  }),
}));
jest.mock('../../orchestrator/storage-adapter', () => ({ uploadBufferAndSign: jest.fn() }));
jest.mock('../../services/billing/guardedCall', () => {
  class BudgetExceededError extends Error {
    readonly reason: string;
    constructor(reason: string) {
      super(`budget_exceeded:${reason}`);
      this.reason = reason;
    }
  }
  return { BudgetExceededError, guardedCall: jest.fn() };
});
jest.mock('../../veo/engine', () => ({ createVeoClip: jest.fn(), pollVeoClip: jest.fn(), veoTransport: jest.fn() }));
jest.mock('../../veo/deliver', () => ({ hostGcsVideo: jest.fn() }));
jest.mock('../../veo/geminiTransport', () => ({ downloadGeminiVideo: jest.fn() }));

import { llmText } from '../../ai/llmText';
import { uploadBufferAndSign } from '../../orchestrator/storage-adapter';
import { BudgetExceededError, guardedCall } from '../../services/billing/guardedCall';
import { costPerSecondUsd } from '../../veo/capabilities';
import { hostGcsVideo } from '../../veo/deliver';
import { createVeoClip, veoTransport, type CreateVeoClipInput, type CreateVeoClipResult } from '../../veo/engine';
import { downloadGeminiVideo } from '../../veo/geminiTransport';
import { veoWireFields } from './googleVeoProvider';
import { createGoogleVideoDirector, liveVeoEngine } from './server';

const guardedMock = guardedCall as jest.MockedFunction<typeof guardedCall>;
const createMock = createVeoClip as jest.MockedFunction<typeof createVeoClip>;
const transportMock = veoTransport as jest.MockedFunction<typeof veoTransport>;
const hostMock = hostGcsVideo as jest.MockedFunction<typeof hostGcsVideo>;
const downloadMock = downloadGeminiVideo as jest.MockedFunction<typeof downloadGeminiVideo>;
const uploadMock = uploadBufferAndSign as jest.MockedFunction<typeof uploadBufferAndSign>;

const INPUT: CreateVeoClipInput = {
  request: { prompt: 'ფარნის შუქი ზღვაზე.', aspect: '16:9', durationSec: 8, tier: 'fast', enhancePrompt: false, seed: 42 },
  tier: 'fast',
  sessionId: 'director-sb-1',
  ordinal: 1,
};
const OK: CreateVeoClipResult = {
  outcome: { ok: true, operation: { transport: 'gemini', name: 'models/veo-3.1-fast-generate-preview/operations/op-1', model: 'veo-3.1-fast-generate-preview' } },
  request: { prompt: INPUT.request.prompt, aspect: '16:9', durationSec: 8, resolution: '1080p', tier: 'fast', generateAudio: true, seed: 42, enhancePrompt: false },
  adjustments: [],
  model: 'veo-3.1-fast-generate-preview',
  transport: 'gemini',
};

beforeEach(() => {
  jest.clearAllMocks();
  transportMock.mockReturnValue('gemini');
  createMock.mockResolvedValue(OK);
});

afterAll(() => {
  expect(llmText).not.toHaveBeenCalled();
});

describe('liveVeoEngine.createClip', () => {
  it('submits inside the budget guard, priced as rendered, with the request untouched', async () => {
    guardedMock.mockImplementationOnce(async (_opts, fn) => fn());
    const result = await liveVeoEngine.createClip(INPUT, { userId: 'user-1' });
    expect(result).toBe(OK);
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(createMock.mock.calls[0]![0]).toBe(INPUT);
    expect(guardedMock.mock.calls[0]![0]).toMatchObject({
      service: 'video',
      model: 'veo-3.1-fast-generate-preview',
      units: 8,
      unitCostUsd: costPerSecondUsd('veo-3.1-fast-generate-preview', '1080p', true, 'gemini'),
      userId: 'user-1',
    });
  });

  it('turns a budget refusal into a non-retryable quota outcome and submits nothing', async () => {
    guardedMock.mockRejectedValueOnce(new (BudgetExceededError as unknown as new (reason: string) => Error)('daily_cap'));
    const result = await liveVeoEngine.createClip(INPUT, {});
    expect(result.outcome).toMatchObject({ ok: false, reason: 'quota', retryable: false });
    expect(createMock).not.toHaveBeenCalled();
  });

  it('without a transport lets the engine answer not_configured itself — no guard, no spend', async () => {
    transportMock.mockReturnValue(null);
    await liveVeoEngine.createClip(INPUT, {});
    expect(guardedMock).not.toHaveBeenCalled();
    expect(createMock).toHaveBeenCalledWith(INPUT);
  });
});

describe('liveVeoEngine.deliver', () => {
  const ctx = { storyboardId: 'sb/1?', shotId: 'a', order: 2, operationName: 'models/m/operations/op-1', aspect: '16:9' as const };

  it('hosts a Vertex clip once, at a stable per-operation path', async () => {
    hostMock.mockResolvedValueOnce('https://storage.example.com/a.mp4');
    const url = await liveVeoEngine.deliver({ kind: 'gcs', gcsUri: 'gs://b/o.mp4', mimeType: 'video/mp4' }, ctx);
    expect(url).toBe('https://storage.example.com/a.mp4');
    const path = hostMock.mock.calls[0]![1];
    expect(path).toMatch(/^video-director\/sb1\/2-[0-9a-f]{24}\.mp4$/);
    await liveVeoEngine.deliver({ kind: 'gcs', gcsUri: 'gs://b/o.mp4', mimeType: 'video/mp4' }, ctx);
    expect(hostMock.mock.calls[1]![1]).toBe(path);
  });

  it('downloads a Gemini clip server-side and hosts it as rendered; a stub file is not a clip', async () => {
    downloadMock.mockResolvedValueOnce(Buffer.alloc(4_096, 1));
    uploadMock.mockResolvedValueOnce('https://storage.example.com/g.mp4');
    expect(await liveVeoEngine.deliver({ kind: 'gemini-file', uri: 'https://generativelanguage.googleapis.com/v1beta/files/x', mimeType: 'video/mp4' }, ctx)).toBe('https://storage.example.com/g.mp4');
    expect(uploadMock.mock.calls[0]![0]).toBe('renders');

    downloadMock.mockResolvedValueOnce(Buffer.alloc(10));
    expect(await liveVeoEngine.deliver({ kind: 'gemini-file', uri: 'https://generativelanguage.googleapis.com/v1beta/files/y', mimeType: 'video/mp4' }, ctx)).toBeNull();
  });

  it('never throws: a hosting failure is a null', async () => {
    hostMock.mockRejectedValueOnce(new Error('storage down'));
    await expect(liveVeoEngine.deliver({ kind: 'gcs', gcsUri: 'gs://b/o.mp4', mimeType: 'video/mp4' }, ctx)).resolves.toBeNull();
  });
});

describe('wiring', () => {
  it('checks the wire with lib/veo/payload\'s builders', () => {
    expect(liveVeoEngine.wire).toBe(veoWireFields);
  });

  it('builds a director on GoogleVeoProvider without calling the planner', () => {
    expect(createGoogleVideoDirector().provider.providerName).toBe('google_veo');
  });
});
