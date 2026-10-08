/** @jest-environment node */
/**
 * The ModelCatalog data (Section D, Part 2 objective D1 / D3 / D5).
 *
 * Pinned: it passes the contract's build-time validation; no forbidden or retired name anywhere in it; every Google
 * model id the runtime code calls by default is in it (D3 — a new hard-coded id fails here until it is catalogued);
 * `verifiedAt` is only ever dated evidence that is cited in the entry's notes; Veo stays unverified until T1.
 */
jest.mock('server-only', () => ({}));

import { isForbiddenModelName, resolveModelPreference, uiModelEntries, validateModelCatalog } from '@/lib/contracts/modelCatalog';
import { MODEL_CATALOG, catalogEntry } from './catalog';
import {
  DEFAULT_CHAT_MODELS,
  DEFAULT_LIVE_MODEL,
  DEFAULT_REST_TIER_MODELS,
  DEFAULT_STT_MODEL,
  DEFAULT_TTS_MODEL,
  LIVE_MODELS,
  STT_MODELS,
  TTS_MODELS,
} from '@/lib/ai/google/models';
import { DEFAULT_MODEL_IDS } from '@/lib/veo/capabilities';
import { RESEARCH_AGENT_ID } from '@/lib/research/pricing';
import { geminiFrameModel } from '@/lib/ai/geminiImage';
import { geminiImagenModel } from '@/lib/ai/geminiImagen';
import { lyriaModel } from '@/lib/ai/lyriaMusic';
import { GEMINI_EMBED_MODEL } from '@/lib/memory/embed';

const ENV = { ...process.env };
beforeEach(() => {
  for (const k of ['GEMINI_FRAME_MODEL', 'GEMINI_IMAGEN_MODEL', 'LYRIA_MODEL']) delete process.env[k];
});
afterAll(() => {
  process.env = { ...ENV };
});

test('passes the contract validation (D5 build-time)', () => {
  expect(validateModelCatalog(MODEL_CATALOG)).toEqual([]);
});

test('no forbidden or retired model name in any id or label, and Google only (D3 / D7)', () => {
  for (const e of MODEL_CATALOG.entries) {
    expect(isForbiddenModelName(e.id)).toBe(false);
    expect(isForbiddenModelName(e.label)).toBe(false);
    expect(e.provider).toBe('google');
  }
});

test('every Google model the code calls by default is catalogued and enabled (D3)', () => {
  const defaults = [
    ...DEFAULT_CHAT_MODELS.standard,
    ...DEFAULT_CHAT_MODELS.pro,
    ...DEFAULT_CHAT_MODELS.lite,
    DEFAULT_REST_TIER_MODELS.pro,
    DEFAULT_REST_TIER_MODELS.flash,
    DEFAULT_STT_MODEL,
    DEFAULT_TTS_MODEL,
    DEFAULT_LIVE_MODEL,
    geminiFrameModel(),
    lyriaModel(),
    GEMINI_EMBED_MODEL,
    RESEARCH_AGENT_ID,
  ];
  for (const id of defaults) expect([id, catalogEntry(id)?.enabled]).toEqual([id, true]);
  // Opt-in / env-allowlisted ids must be catalogued too, so a saved or configured choice gets an explicit answer.
  for (const id of [...STT_MODELS, ...TTS_MODELS, ...LIVE_MODELS, geminiImagenModel()]) expect([id, !!catalogEntry(id)]).toEqual([id, true]);
});

test('Veo ids match lib/veo/capabilities per transport, and none is verified before Part 0 T1', () => {
  for (const [transport, tiers] of Object.entries(DEFAULT_MODEL_IDS)) {
    for (const id of Object.values(tiers)) {
      const e = catalogEntry(id);
      expect(e?.family).toBe('veo');
      expect(e?.transport).toBe(transport === 'vertex' ? 'vertex' : 'gemini_api');
      expect(e?.verifiedAt).toBeUndefined();
    }
  }
});

test('verifiedAt is dated evidence: not after updatedAt, and the notes say where it was recorded', () => {
  for (const e of MODEL_CATALOG.entries.filter((x) => x.verifiedAt)) {
    expect(Date.parse(e.verifiedAt!)).toBeLessThanOrEqual(Date.parse(MODEL_CATALOG.updatedAt));
    expect(e.notes).toMatch(/2026-\d\d-\d\d/);
  }
  // A listing is not a call: the Gemini 2.5 text models are listed but refused for new projects, so they are absent.
  for (const id of ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.5-flash-lite']) {
    expect(resolveModelPreference(MODEL_CATALOG, id)).toEqual({ ok: false, reason: 'not_in_catalog' });
  }
  expect(resolveModelPreference(MODEL_CATALOG, 'lyria-3-pro-preview')).toEqual({ ok: false, reason: 'disabled' });
});

test('a selector shows only enabled, verified entries; Imagen 4 and Veo wait for a runtime record', () => {
  const shown = uiModelEntries(MODEL_CATALOG).map((e) => e.id);
  expect(shown).toEqual(expect.arrayContaining(['gemini-3.8-flash', 'gemini-3.1-flash-image', 'lyria-3-clip-preview']));
  for (const id of ['imagen-4.0-generate-001', 'veo-3.1-fast-generate-001', 'lyria-3-pro-preview']) {
    expect(shown).not.toContain(id);
  }
  expect(resolveModelPreference(MODEL_CATALOG, 'veo-3.1-fast-generate-001')).toEqual({ ok: false, reason: 'not_verified' });
  expect(resolveModelPreference(MODEL_CATALOG, 'gpt-5')).toEqual({ ok: false, reason: 'not_in_catalog' });
});
