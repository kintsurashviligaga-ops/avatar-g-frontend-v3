/**
 * lib/models/catalog.ts — the ModelCatalog data (PROJECT_MASTER.md Section D, Part 2 objective D1).
 *
 * Every Google model id the runtime code calls, with what it is for and what is known about it. It is an ALLOWLIST, not
 * the truth about Google: lib/models/verify.ts asks the runtime which ids exist for this project and switches off any it
 * does not have (D2). The contract (lib/contracts/modelCatalog.ts) validates it in a jest test (D5) and decides what a
 * selector may show: enabled AND `verifiedAt`.
 *
 * ⚠️ `verifiedAt` IS EVIDENCE, NOT A WISH. It is set only where a real call answered for that id, with the date and the
 * place of the record in `notes`. A model that is only LISTED by `models.list` does not count: on 2026-10-02 the new
 * project's key still listed gemini-2.5-flash / -pro / -flash-lite while every generateContent call to them answered
 * 404 "no longer available to new users" (lib/ai/google/models.ts), so those three are deliberately NOT here (a saved
 * choice of one resolves to `not_in_catalog`, and the runtime check lists them for review). Veo has no verifiedAt until
 * Part 0 T1 produces a clip on Vertex.
 *
 * `transport` follows D8 and today's code: `either` = the model is served by both and GEMINI_TRANSPORT picks (never a
 * fallback); `gemini_api` = only the API key serves it here (Imagen 4 is 404 on Vertex for this project; Live has no
 * server relay; Deep Research is an Interactions agent); `vertex` = only Vertex (the Veo -001 ids, VEO_TRANSPORT=vertex).
 *
 * Pure data: no env, no I/O, safe on the client.
 */
import type { ModelCatalog, ModelCatalogEntry } from '@/lib/contracts/modelCatalog';

/** Dated runtime evidence. Each string is cited in the notes of the entries that use it. */
const NEW_KEY_2026_10_02 = '2026-10-02T00:00:00Z'; // d1d9a6d7: the new project's key answered 200 (lib/ai/google/models.ts header)
const VERTEX_T2_2026_10_08 = '2026-10-08T11:53:00Z'; // GCP Part 0 T2 on Vertex global, from the owner's Mac (test plan §8)

const NEW_KEY = 'Answered 200 on the new project\'s API key, 2026-10-02 (lib/ai/google/models.ts, commit d1d9a6d7).';
const VERTEX_T2 = 'Answered on Vertex AI (global) in the GCP Part 0 T2 test, 2026-10-08 (docs/handoffs/2026-10-08-gcp-part0-test-plan.md §8).';
const VERTEX_ALIAS_404 = 'Vertex AI (global) answered countTokens 404 for it from the Preview runtime, 2026-10-08T18:13Z (/api/preview/google-check).';

const text = (
  id: string,
  label: string,
  extra: Partial<ModelCatalogEntry> & Pick<ModelCatalogEntry, 'enabled'>,
): ModelCatalogEntry => ({
  id,
  label,
  provider: 'google',
  family: 'gemini',
  capabilities: ['text', 'code', 'reasoning'],
  focusModes: ['code', 'search', 'files'],
  transport: 'either',
  ...extra,
});

export const MODEL_CATALOG: ModelCatalog = {
  version: '2026-10-08.2',
  updatedAt: '2026-10-08T18:20:00Z',
  entries: [
    // ── Gemini text (chat chains, REST tiers, llmText, STT) ────────────────────────────────────────────────────
    text('gemini-3.8-flash', 'Gemini 3.8 Flash', {
      enabled: true,
      capabilities: ['text', 'code', 'reasoning', 'agent', 'transcribe'],
      focusModes: ['code', 'search', 'files', 'stt'],
      verifiedAt: VERTEX_T2_2026_10_08,
      notes: `Chat Fast / Thinking primary, REST flash tier, STT default. ${NEW_KEY} ${VERTEX_T2}`,
    }),
    text('gemini-3.7-flash', 'Gemini 3.7 Flash', {
      enabled: true,
      capabilities: ['text', 'code', 'reasoning', 'transcribe'],
      focusModes: ['code', 'search', 'files', 'stt'],
      verifiedAt: NEW_KEY_2026_10_02,
      notes: `STT step-down. ${NEW_KEY}`,
    }),
    text('gemini-3.6-flash', 'Gemini 3.6 Flash', {
      enabled: true,
      capabilities: ['text', 'code', 'reasoning', 'transcribe'],
      focusModes: ['code', 'search', 'files', 'stt'],
      verifiedAt: NEW_KEY_2026_10_02,
      notes: `Chat Fast chain, second. ${NEW_KEY}`,
    }),
    text('gemini-3.5-flash', 'Gemini 3.5 Flash', {
      enabled: true,
      capabilities: ['text', 'code', 'reasoning', 'transcribe'],
      focusModes: ['code', 'search', 'files', 'stt'],
      verifiedAt: NEW_KEY_2026_10_02,
      notes: `Chat Fast chain, third. ${NEW_KEY}`,
    }),
    text('gemini-3.1-pro-preview', 'Gemini 3.1 Pro Preview', {
      enabled: true,
      capabilities: ['text', 'code', 'reasoning', 'agent', 'transcribe'],
      focusModes: ['code', 'search', 'files', 'terminal', 'browser', 'stt'],
      verifiedAt: NEW_KEY_2026_10_02,
      notes: `Chat Pro, REST pro tier. ${NEW_KEY}`,
    }),
    text('gemini-3.1-flash-lite', 'Gemini 3.1 Flash-Lite', {
      enabled: true,
      verifiedAt: NEW_KEY_2026_10_02,
      notes: `Chat Lite primary. ${NEW_KEY}`,
    }),
    text('gemini-3.5-flash-lite', 'Gemini 3.5 Flash-Lite', {
      enabled: true,
      verifiedAt: NEW_KEY_2026_10_02,
      notes: `Chat Lite second. ${NEW_KEY}`,
    }),
    text('gemini-flash-latest', 'Gemini Flash (latest alias)', {
      enabled: true,
      transport: 'gemini_api',
      capabilities: ['text', 'code', 'reasoning', 'transcribe'],
      focusModes: ['code', 'search', 'files', 'stt'],
      notes:
        'Google alias; last STT step-down. Points at whichever Flash Google chooses, so no verifiedAt of its own. ' +
        `Gemini API only: ${VERTEX_ALIAS_404}`,
    }),
    text('gemini-pro-latest', 'Gemini Pro (latest alias)', {
      enabled: true,
      transport: 'gemini_api',
      capabilities: ['text', 'code', 'reasoning', 'transcribe'],
      focusModes: ['code', 'search', 'files', 'stt'],
      notes:
        'Google alias; observed answering as gemini-3.1-pro (lib/ai/google/models.ts). Allowed for STT only. ' +
        `Gemini API only: ${VERTEX_ALIAS_404}`,
    }),

    // ── Image ───────────────────────────────────────────────────────────────────────────────────────────────────
    {
      id: 'gemini-3.1-flash-image',
      label: 'Nano Banana 2 (Gemini 3.1 Flash Image)',
      provider: 'google',
      family: 'nano_banana',
      capabilities: ['image'],
      focusModes: ['media', 'video_storyboard'],
      transport: 'either',
      enabled: true,
      verifiedAt: VERTEX_T2_2026_10_08,
      notes: `Storyboard frames (lib/ai/geminiImage geminiFrameModel). ${VERTEX_T2} The studio's "Nano Banana" rows are a different provider (api.nanobananaapi.ai).`,
    },
    {
      id: 'imagen-4.0-generate-001',
      label: 'Imagen 4',
      provider: 'google',
      family: 'imagen',
      capabilities: ['image'],
      focusModes: ['media'],
      transport: 'gemini_api',
      enabled: true,
      notes: 'lib/ai/geminiImagen (opt-in GEMINI_IMAGEN_ENABLED). 404 on Vertex AI for this project (Part 0, 2026-10-08), so API key only. No runtime record here.',
    },

    // ── Video (Veo; VEO_TRANSPORT picks the id set, lib/veo/capabilities DEFAULT_MODEL_IDS) ───────────────────────
    ...(
      [
        ['veo-3.1-generate-001', 'Veo 3.1', 'vertex'],
        ['veo-3.1-fast-generate-001', 'Veo 3.1 Fast', 'vertex'],
        ['veo-3.1-lite-generate-001', 'Veo 3.1 Lite', 'vertex'],
        ['veo-3.1-generate-preview', 'Veo 3.1 Preview', 'gemini_api'],
        ['veo-3.1-fast-generate-preview', 'Veo 3.1 Fast Preview', 'gemini_api'],
        ['veo-3.1-lite-generate-preview', 'Veo 3.1 Lite Preview', 'gemini_api'],
      ] as const
    ).map(([id, label, transport]): ModelCatalogEntry => ({
      id,
      label,
      provider: 'google',
      family: 'veo',
      capabilities: ['video'],
      focusModes: ['video_storyboard', 'media'],
      transport,
      enabled: true,
      notes:
        transport === 'vertex'
          ? 'Vertex id (retirement listed "November 17, 2026 or later"). Not verified until Part 0 T1 returns a clip; the 2026-10-08 14:45Z submit was accepted, the operation failed on our payload (enhancePrompt).'
          : 'Gemini API id (VEO_TRANSPORT unset). Facts from Google docs 2026-09-29 (docs/VEO_ENGINE.md §1); no runtime record here.',
    })),

    // ── Music ───────────────────────────────────────────────────────────────────────────────────────────────────
    {
      id: 'lyria-3-clip-preview',
      label: 'Lyria 3 Clip Preview',
      provider: 'google',
      family: 'lyria',
      capabilities: ['music'],
      focusModes: ['media'],
      transport: 'either',
      enabled: true,
      verifiedAt: VERTEX_T2_2026_10_08,
      notes: `Music default (lib/ai/lyriaMusic). Interactions API answered on the earlier project's key, 2026-07-25 (its header). ${VERTEX_T2}`,
    },
    {
      id: 'lyria-3-pro-preview',
      label: 'Lyria 3 Pro Preview',
      provider: 'google',
      family: 'lyria',
      capabilities: ['music'],
      focusModes: ['media'],
      transport: 'either',
      enabled: false,
      notes: 'Full-length arrangements, but it answered 500 "high demand" when tried (lib/ai/lyriaMusic). Off until it is stable.',
    },

    // ── Speech: TTS, Live (native audio), embeddings ──────────────────────────────────────────────────────────
    {
      id: 'gemini-2.5-flash-preview-tts',
      label: 'Gemini 2.5 Flash TTS Preview',
      provider: 'google',
      family: 'gemini',
      capabilities: ['tts'],
      focusModes: ['voice'],
      transport: 'either',
      enabled: true,
      verifiedAt: NEW_KEY_2026_10_02,
      notes: `Read-aloud default, verified in Georgian (/api/tts/gemini). ${NEW_KEY} Not yet tried on Vertex AI.`,
    },
    ...(
      [
        ['gemini-3.8-flash-tts', 'Gemini 3.8 Flash TTS'],
        ['gemini-3.1-flash-tts-preview', 'Gemini 3.1 Flash TTS Preview'],
      ] as const
    ).map(([id, label]): ModelCatalogEntry => ({
      id,
      label,
      provider: 'google',
      family: 'gemini',
      capabilities: ['tts'],
      focusModes: ['voice'],
      transport: 'either',
      enabled: true,
      verifiedAt: NEW_KEY_2026_10_02,
      notes: `Allowlisted by GEMINI_TTS_MODEL. ${NEW_KEY} Georgian not checked.`,
    })),
    {
      id: 'gemini-2.5-flash-native-audio-latest',
      label: 'Gemini 2.5 Flash Native Audio (Live)',
      provider: 'google',
      family: 'gemini',
      capabilities: ['live', 'dialog'],
      focusModes: ['voice', 'avatar'],
      transport: 'gemini_api',
      enabled: true,
      verifiedAt: NEW_KEY_2026_10_02,
      notes: `Live default, verified in Georgian with Aoede / Charon. ${NEW_KEY} API key only: no server relay for Vertex Live (A3).`,
    },
    ...(
      [
        ['gemini-3.8-live', 'Gemini 3.8 Live'],
        ['gemini-3.1-flash-live-preview', 'Gemini 3.1 Flash Live Preview'],
        ['gemini-2.5-flash-native-audio-preview-12-2025', 'Gemini 2.5 Flash Native Audio Preview (12-2025)'],
      ] as const
    ).map(([id, label]): ModelCatalogEntry => ({
      id,
      label,
      provider: 'google',
      family: 'gemini',
      capabilities: ['live', 'dialog'],
      focusModes: ['voice', 'avatar'],
      transport: 'gemini_api',
      enabled: true,
      notes: 'Allowlisted Live id (lib/ai/google/models LIVE_MODELS); present on the key, no Georgian check and no runtime record here.',
    })),
    {
      id: 'gemini-embedding-001',
      label: 'Gemini Embedding 1',
      provider: 'google',
      family: 'embedding',
      capabilities: ['embedding'],
      focusModes: [],
      transport: 'either',
      enabled: true,
      verifiedAt: NEW_KEY_2026_10_02,
      notes: `Memory embeddings, 1536 dimensions (lib/memory/embed). ${NEW_KEY} Vertex :predict not yet tried.`,
    },

    // ── Agents ──────────────────────────────────────────────────────────────────────────────────────────────────
    {
      id: 'deep-research-preview-04-2026',
      label: 'Deep Research Preview',
      provider: 'google',
      family: 'specialty',
      capabilities: ['agent'],
      focusModes: ['search'],
      transport: 'gemini_api',
      enabled: true,
      notes: 'Interactions API agent (lib/research), Gemini API only. Pricing read 2026-09-23 (lib/research/pricing); no runtime record here.',
    },
  ],
};

/** The catalog entry for a runtime id, or undefined. */
export function catalogEntry(id: string, catalog: ModelCatalog = MODEL_CATALOG): ModelCatalogEntry | undefined {
  return catalog.entries.find((e) => e.id === id);
}
