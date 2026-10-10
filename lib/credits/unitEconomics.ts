/**
 * lib/credits/unitEconomics.ts — what each paid operation COSTS the platform, and the price the owner's margin rule gives it.
 *
 * The pricing audit's engine (docs/handoffs/pricing/SERVICE_UNIT_ECONOMICS.md). Pure, client-safe, and NOT wired into any
 * charge: the live prices are still lib/credits/pricing.ts, videoPricing.ts and quote.ts. This module holds the cost side
 * and the PROPOSED price table, so the proposal and its arithmetic are one file that tests can hold to the rule, and the
 * rollout (after the owner's approval) moves the proposed numbers into the live quote functions.
 *
 * THE RULE (owner, 2026-10-10 12:42Z): cost-based prices, 65 % target gross margin, 62 % floor. Cost is the FULL variable
 * cost — provider list price, the expected paid re-renders, compute, storage and transfer, the FX reserve — and it is
 * measured against what a credit NETS after VAT and the card fee. An unknown cost is never 0: it is an estimate, marked so.
 *
 *     price in credits = ceil( full cost ₾ ÷ ( net ₾ per credit × (1 − target margin) ) )
 *
 * Every price in PROPOSED is checked by unitEconomics.test.ts: at or above the floor, and never a BLOCKED op.
 */
import { GEL_PER_USD } from '@/lib/billing/fx';
import { CREDIT_VALUE_GEL } from './pricing';

/** The money side of every price. Change one number here and every proposed price moves with it (the tests re-check). */
export const ECON = {
  /** What one credit sells for, VAT included (1 credit = 0.10 ₾; the owner keeps this unless the analysis needs a change). */
  creditGel: CREDIT_VALUE_GEL,
  /** lib/billing/fx — the display rate. */
  gelPerUsd: GEL_PER_USD,
  /** Headroom on the dollar: provider bills are in USD, credits are sold in lari. */
  fxReserve: 0.05,
  /**
   * Georgian VAT. A VAT payer's consumer price includes it, so 18 % of every lari paid is not revenue. ESTIMATED: whether the
   * business is VAT-registered is the owner's fact; until it is confirmed the price assumes it is (the safe direction).
   */
  vatRate: 0.18,
  /** Card acquiring on a BOG top-up. ESTIMATED: the merchant rate is not public; 3 % until the contract's number is known. */
  paymentFeeRate: 0.03,
  targetMargin: 0.65,
  floorMargin: 0.62,
} as const;

/** Lari one credit leaves after VAT and the card fee. */
export function netGelPerCredit(econ: typeof ECON = ECON): number {
  return (econ.creditGel / (1 + econ.vatRate)) * (1 - econ.paymentFeeRate);
}

/** USD → ₾ with the FX reserve. */
export function usdToCostGel(usd: number, econ: typeof ECON = ECON): number {
  return usd * econ.gelPerUsd * (1 + econ.fxReserve);
}

export type CostSource =
  /** A vendor's published list price. */
  | 'official'
  /** Read from Production (agent_evolution_traces, read only). */
  | 'measured'
  /** A number we had to assume; the doc says why. Never 0 for something that costs money. */
  | 'estimated';

export interface CostLine {
  what: string;
  usd: number;
  source: CostSource;
}

export type OpStatus =
  /** Runs today on an allowed engine, with a cost read from Production. */
  | 'PROVEN'
  /** Runs on an allowed engine; its cost is list price × an assumed size, not yet seen in Production. */
  | 'ESTIMATED'
  /** No Google / ElevenLabs / FFmpeg engine exists for it: under MEDIA_GOOGLE_ONLY it is refused, so it gets no price. */
  | 'BLOCKED'
  /** Free by design, inside daily caps. */
  | 'FREE_CAPPED';

export interface UnitOp {
  id: string;
  /** lib/catalog service id, or `agent-g.*` for Agent G's own operations. */
  service: string;
  /** One unit, as the user buys it. */
  unit: string;
  provider: string;
  model: string;
  lines: readonly CostLine[];
  /** Share of units the platform pays for twice (a re-render after a failure it refunds, a QC miss). */
  retryShare: number;
  status: OpStatus;
  /** What Production charges today, in credits (null = not sold, 0 = free). */
  currentCredits: number | null;
}

// ── Shared cost lines (USD) ───────────────────────────────────────────────────────────────────────────────────────────
// Storage and transfer: Supabase Storage $0.021 / GB-month, egress $0.09 / GB past the plan's allowance; a result is kept
// a month and downloaded about twice.
const PER_MB_STORED_AND_SERVED = 0.021 / 1024 + (2 * 0.09) / 1024;
const storage = (mb: number): CostLine => ({ what: `storage + transfer, ~${mb} MB`, usd: mb * PER_MB_STORED_AND_SERVED, source: 'estimated' });
// Vercel Functions: active CPU $0.128 / vCPU-hour, memory $0.0106 / GB-hour (2 GB here) while the function runs.
const compute = (seconds: number, label = 'function'): CostLine => ({
  what: `${label}, ~${seconds} s`,
  usd: seconds * (0.128 / 3600 + (2 * 0.0106) / 3600),
  source: 'estimated',
});

// Veo 3.1 with native audio, Gemini API list rate per second (lib/veo/capabilities PRICE_WITH_AUDIO). 8 s renders at 1080p.
export const VEO_USD_PER_SEC_1080P = { lite: 0.08, fast: 0.12, standard: 0.4 } as const;
const veoClip = (tier: keyof typeof VEO_USD_PER_SEC_1080P): CostLine => ({
  what: `Veo 3.1 ${tier}, 8 s 1080p with audio`,
  usd: 8 * VEO_USD_PER_SEC_1080P[tier],
  source: tier === 'lite' ? 'official' : 'measured',
});

// Gemini 3.6 / 3.8 Flash: $1.50 / 1M input, $7.50 / 1M output — the list price from 2027-01-01 (it is half that until
// 2026-12-31, an introductory rate a price set now must outlive).
const flash = (inTok: number, outTok: number, what: string): CostLine => ({
  what,
  usd: (inTok * 1.5 + outTok * 7.5) / 1e6,
  source: 'estimated',
});
// ElevenLabs API, USD at every plan (elevenlabs.io/pricing/api, read 2026-10-10): eleven_v3 / multilingual_v2 speech $0.08 per
// 1 000 characters; music $0.15 a minute; Scribe $0.22 an hour of audio (v2, the listed successor of scribe_v1).
export const ELEVEN_TTS_USD_PER_1K_CHARS = 0.08;
export const ELEVEN_MUSIC_USD_PER_MIN = 0.15;
const tts = (chars: number): CostLine => ({ what: `ElevenLabs speech, ~${chars} characters`, usd: (chars / 1000) * ELEVEN_TTS_USD_PER_1K_CHARS, source: 'official' });
const elevenMusic = (seconds: number): CostLine => ({ what: `ElevenLabs music, ${seconds} s`, usd: (seconds / 60) * ELEVEN_MUSIC_USD_PER_MIN, source: 'official' });

// ── WhatsApp calls: Meta Calling → our bridge VM → Gemini Live (docs/handoffs/omnichannel/COMMUNICATION_UNIT_ECONOMICS.md)
// The same model as docs/handoffs/omnichannel/research/wa_cost.py; unitEconomics.test.ts holds the two equal.
export const LIVE_CALL_MODEL = {
  /** Live audio tokens a second, in and out (Google, 2026-10-10). */
  tokPerSec: 25,
  audioIn: 3e-6,
  audioOut: 12e-6,
  /** gemini-2.5-flash-native-audio, the phone default (the Live model verified in Georgian): text in, text out. */
  textIn: 0.5e-6,
  textOut: 2e-6,
  /** The bridge streams the caller's audio for the whole call (silence too), so input is billed for all of it. */
  inShare: 1,
  userShare: 0.5,
  agentShare: 0.4,
  turnSec: 20,
  /** Instruction + phone tools + memory, re-billed every turn: ~2,600 measured, memory adds up to 1,200 (Georgian 1:1). */
  systemTokens: 4000,
  /** Transcription is always on (the caller's own words approve anything); Georgian text tokens ESTIMATED at 3× English. */
  transcriptTokensPerSpeechMin: 600,
} as const;

/**
 * Gemini's bill for one call of `minutes`: audio in and out, the context Live bills again every turn (sawtooth under the
 * compression cap; the instruction counted outside the cap, the conservative reading), the instruction itself, and the
 * transcription surcharge. `cap` null = Google's default, which a call never reaches (the context grows all call long).
 */
export function liveCallGeminiUsd(minutes: number, cap: { triggerTokens: number; targetTokens: number } | null, m = LIVE_CALL_MODEL): number {
  const seconds = minutes * 60;
  const base = m.inShare * seconds * m.tokPerSec * m.audioIn + m.agentShare * seconds * m.tokPerSec * m.audioOut;
  const turns = Math.floor(seconds / m.turnSec);
  const perTurn = (m.userShare + m.agentShare) * m.turnSec * m.tokPerSec;
  let context = 0;
  let rebilled = 0;
  for (let k = 0; k < turns; k += 1) {
    rebilled += context;
    context += perTurn;
    if (cap && context > cap.triggerTokens) context = cap.targetTokens;
  }
  const transcript = (m.userShare + m.agentShare) * minutes * m.transcriptTokensPerSpeechMin * m.textOut;
  return base + rebilled * m.audioIn + turns * m.systemTokens * m.textIn + transcript;
}

/** lib/calls/whatsapp/phoneSetup PHONE_COMPRESSION (the code today), and the fallback a funded call may call for. */
export const CALL_CAP = { triggerTokens: 8000, targetTokens: 4000 } as const;
export const CALL_CAP_FALLBACK = { triggerTokens: 12000, targetTokens: 6000 } as const;
/** Meta, Georgia: a business-initiated call minute (0–50k tier, 6 s pulses); user-initiated calls are free. */
export const META_GE_BUSINESS_CALL_USD_PER_MIN = 0.0095;
/** Meta, Georgia: a service message past the 1,000 free a month per number (counted on every call, the worst case). */
export const META_GE_SERVICE_MESSAGE_USD = 0.0212;
/** The bridge VM, europe-west3: e2-small $15.76 + static IPv4 $3.65 + 10 GB balanced disk $1.20 a month (SKU list). */
export const CALL_BRIDGE_VM_USD_PER_MONTH = 20.61;
/** Call-minutes a month the VM is spread over in the price (the doc shows 100 / 500 / 1,000 / 5,000). */
export const CALL_PLANNING_MINUTES_PER_MONTH = 1000;

export const UNIT_OPS: readonly UnitOp[] = [
  // ── Video ─────────────────────────────────────────────────────────────────────────────────────────────────────────
  ...(['lite', 'fast', 'standard'] as const).map((tier): UnitOp => ({
    id: `video.clip.${tier}`,
    service: 'video.generate',
    unit: 'one 8 s scene (film, product ad, VFX, chat video)',
    provider: 'Google (Gemini API; Vertex the same rate)',
    model: `veo-3.1-${tier === 'standard' ? '' : `${tier}-`}generate`,
    lines: [veoClip(tier), tts(120), compute(15, 'crop + host'), storage(12)],
    retryShare: 0.1,
    status: tier === 'lite' ? 'ESTIMATED' : 'PROVEN',
    currentCredits: tier === 'lite' ? 15 : tier === 'fast' ? 25 : 83,
  })),
  {
    id: 'video.film.base',
    service: 'video.generate',
    unit: 'one film, on top of its scenes (storyboard, music bed, assembly)',
    provider: 'Google + ElevenLabs + FFmpeg',
    model: 'gemini-3.8-flash · eleven music · ffmpeg',
    lines: [flash(6000, 4000, 'storyboard'), elevenMusic(60), compute(90, 'assembly'), storage(40)],
    retryShare: 0.05,
    status: 'ESTIMATED',
    currentCredits: 0,
  },
  {
    id: 'video.music-video.song',
    service: 'video.music-video',
    unit: 'the song under a music video (up to 48 s)',
    provider: 'ElevenLabs / Google Lyria',
    model: 'eleven music · lyria-3',
    lines: [elevenMusic(60), storage(2)],
    retryShare: 0.1,
    status: 'ESTIMATED',
    currentCredits: null,
  },
  {
    id: 'video.lipsync',
    service: 'video.music-video',
    unit: 'a lip-sync pass',
    provider: 'none allowed (HeyGen / Replicate / Sync are not)',
    model: '—',
    lines: [],
    retryShare: 0,
    status: 'BLOCKED',
    currentCredits: 20,
  },
  { id: 'video.character-swap', service: 'video.character-swap', unit: 'one swap', provider: 'none allowed (Replicate roop)', model: '—', lines: [], retryShare: 0, status: 'BLOCKED', currentCredits: 15 },
  { id: 'video.motion', service: 'video.motion', unit: 'one transfer', provider: 'none allowed (Kling)', model: '—', lines: [], retryShare: 0, status: 'BLOCKED', currentCredits: 15 },
  {
    id: 'video.remix.voiceover',
    service: 'video.remix',
    unit: 'a voice-over up to 60 s',
    provider: 'ElevenLabs + FFmpeg',
    model: 'eleven_multilingual_v2',
    lines: [tts(900), compute(30, 'mix'), storage(15)],
    retryShare: 0.05,
    status: 'ESTIMATED',
    currentCredits: 15,
  },
  {
    id: 'video.remix.music',
    service: 'video.remix',
    unit: 'a music bed under a clip',
    provider: 'ElevenLabs + FFmpeg',
    model: 'eleven music',
    lines: [elevenMusic(30), compute(30, 'mix'), storage(15)],
    retryShare: 0.05,
    status: 'ESTIMATED',
    currentCredits: 15,
  },
  {
    id: 'video.remix.ffmpeg',
    service: 'video.remix',
    unit: 'trim, captions, colour, speed, stabilise, watermark',
    provider: 'FFmpeg',
    model: 'ffmpeg',
    lines: [compute(60, 'encode'), storage(20)],
    retryShare: 0.05,
    status: 'FREE_CAPPED',
    currentCredits: 0,
  },
  // ── Image ─────────────────────────────────────────────────────────────────────────────────────────────────────────
  {
    id: 'image.one',
    service: 'image.generate',
    unit: 'one image (also each Photographer / Interior render)',
    provider: 'Google',
    model: 'gemini-3.1-flash-image (Nano Banana 2)',
    // $60 / 1M image tokens = $0.067 a 1K image (ai.google.dev pricing). Production books $0.03 — a third of that too low.
    lines: [{ what: 'image, 1K', usd: 0.067, source: 'official' }, flash(300, 100, 'prompt to English'), storage(2)],
    retryShare: 0.1,
    status: 'PROVEN',
    currentCredits: 2,
  },
  {
    id: 'image.interior.plan3d',
    service: 'image.interior',
    unit: 'one 3D floor plan',
    provider: 'Google',
    model: 'gemini-3.8-flash',
    lines: [flash(4000, 6000, 'plan'), compute(20, 'render'), storage(3)],
    retryShare: 0.1,
    status: 'ESTIMATED',
    currentCredits: 8,
  },
  { id: 'image.culling', service: 'image.culling', unit: 'sorting photos on the device', provider: 'the user\'s browser', model: '—', lines: [], retryShare: 0, status: 'FREE_CAPPED', currentCredits: 0 },
  // ── Avatar ────────────────────────────────────────────────────────────────────────────────────────────────────────
  { id: 'avatar.talking', service: 'avatar.talking', unit: 'one talking photo', provider: 'none allowed (HeyGen / SadTalker)', model: '—', lines: [], retryShare: 0, status: 'BLOCKED', currentCredits: 20 },
  // ── Music ─────────────────────────────────────────────────────────────────────────────────────────────────────────
  {
    id: 'music.track.30',
    service: 'music.generate',
    unit: 'one 30 s track',
    provider: 'Google Lyria',
    model: 'lyria-3-clip-preview',
    lines: [{ what: 'Lyria 3 clip', usd: 0.04, source: 'official' }, storage(1)],
    retryShare: 0.1,
    status: 'PROVEN',
    currentCredits: 5,
  },
  ...([60, 90, 180] as const).map((sec): UnitOp => ({
    id: `music.track.${sec}`,
    service: 'music.generate',
    unit: sec === 180 ? 'one full song (up to 3 min)' : `one ${sec} s track`,
    provider: 'ElevenLabs',
    model: 'music_v1',
    lines: [elevenMusic(sec), storage(sec / 30)],
    retryShare: 0.1,
    status: 'ESTIMATED',
    currentCredits: sec === 60 ? 8 : 12,
  })),
  // ── Voice ─────────────────────────────────────────────────────────────────────────────────────────────────────────
  {
    id: 'voice.dubbing.minute',
    service: 'voice.dubbing',
    unit: 'one minute of source video',
    provider: 'ElevenLabs + Google + FFmpeg',
    model: 'scribe_v1 · gemini-3.8-flash · eleven_multilingual_v2',
    lines: [
      { what: 'Scribe transcription, 1 min', usd: 0.22 / 60, source: 'official' },
      flash(1500, 1500, 'translation'),
      tts(900),
      compute(40, 'extract + mix'),
      storage(15),
    ],
    retryShare: 0.05,
    status: 'ESTIMATED',
    currentCredits: 0,
  },
  // ── Text, design, code, research ──────────────────────────────────────────────────────────────────────────────────
  {
    id: 'chat.message',
    service: 'text.write',
    unit: 'one chat answer (Fast), incl. search grounding when used',
    provider: 'Google',
    model: 'gemini-3.8-flash',
    // Production average 0.0277 ₾ (73 answers, 2026-09-29 → 10-09), p95 0.0896 ₾: priced at the p95.
    lines: [{ what: 'p95 answer, booked', usd: 0.0896 / 2.7, source: 'measured' }],
    retryShare: 0,
    status: 'FREE_CAPPED',
    currentCredits: 0,
  },
  {
    id: 'chat.pro.message',
    service: 'text.write',
    unit: 'one chat answer on the Pro model',
    provider: 'Google',
    model: 'gemini-3.1-pro-preview',
    // Production books no Pro answer apart from the rest (agent_evolution_traces, 2026-10-10): ~4 000 tokens in, ~2 000 out
    // with thinking at $2 / $12 per 1M, plus one search query at $14 per 1 000.
    lines: [{ what: 'Pro answer, ~4k in / ~2k out', usd: (4000 * 2 + 2000 * 12) / 1e6, source: 'estimated' }, { what: 'one search query', usd: 0.014, source: 'official' }],
    retryShare: 0,
    status: 'ESTIMATED',
    currentCredits: 0,
  },
  {
    id: 'design.presentation.deck',
    service: 'design.presentation',
    unit: 'one deck, up to 12 slides with an image each',
    provider: 'Google',
    model: 'gemini-3.8-flash · imagen-4.0-generate-001',
    // Imagen 4 is not on the Gemini API price page the app calls it through; Vertex lists it at $0.04 an image.
    lines: [flash(3000, 3000, 'outline'), { what: '12 Imagen 4 images (Vertex rate)', usd: 12 * 0.04, source: 'estimated' }, flash(3600, 600, 'image prompts to English'), compute(40, 'render'), storage(20)],
    retryShare: 0.05,
    status: 'ESTIMATED',
    currentCredits: 0,
  },
  { id: 'design.model3d', service: 'design.model3d', unit: 'one 3D model', provider: 'none allowed (Replicate TRELLIS)', model: '—', lines: [], retryShare: 0, status: 'BLOCKED', currentCredits: 5 },
  {
    id: 'research.deep',
    service: 'research.web-search',
    unit: 'one Deep Research report',
    provider: 'Google',
    model: 'deep-research-preview-04-2026',
    // Google's estimate is $1–$3 a task (lib/research/pricing.ts); the top of it, since a failed run is refunded in full
    // and still billed. Not a list price: a vendor estimate.
    lines: [{ what: 'research agent, top of Google\'s range', usd: 3, source: 'estimated' }],
    retryShare: 0.1,
    status: 'ESTIMATED',
    currentCredits: 120,
  },
  // ── Agent G ───────────────────────────────────────────────────────────────────────────────────────────────────────
  { id: 'agent-g.montage', service: 'video.editing', unit: 'one montage (clips + a track → MP4)', provider: 'FFmpeg', model: 'ffmpeg', lines: [compute(120, 'encode'), storage(60)], retryShare: 0.05, status: 'FREE_CAPPED', currentCredits: 0 },
  { id: 'agent-g.audio', service: 'agent-g', unit: 'one MP3 from a video or link', provider: 'FFmpeg', model: 'ffmpeg', lines: [compute(40, 'download + encode'), storage(10)], retryShare: 0.05, status: 'FREE_CAPPED', currentCredits: 0 },
  { id: 'agent-g.edit', service: 'agent-g', unit: 'one edit (cut, look, fades, captions)', provider: 'FFmpeg', model: 'ffmpeg', lines: [compute(90, 'encode'), storage(40)], retryShare: 0.05, status: 'FREE_CAPPED', currentCredits: 0 },
  {
    id: 'agent-g.analyze',
    service: 'agent-g',
    unit: 'one read of the user\'s file (a 2 min video at most)',
    provider: 'Google',
    model: 'gemini-3.8-flash',
    // ~300 tokens a second of video with its sound, 120 s, plus a structured answer.
    lines: [flash(36_000 + 2000, 1500, 'video read')],
    retryShare: 0.05,
    status: 'ESTIMATED',
    currentCredits: 0,
  },
  {
    id: 'agent-g.live.minute',
    service: 'agent-g',
    unit: 'one minute of a Live Voice call',
    provider: 'Google',
    model: 'gemini live (native audio)',
    // gemini-3.8-live audio in $3 / 1M, out $12 / 1M, 25 tokens a second; Live bills the whole context again every turn, so
    // ×3 on a minute of talk.
    lines: [{ what: 'live audio, ~1 min', usd: 3 * ((1500 * 3 + 1500 * 12) / 1e6), source: 'estimated' }],
    retryShare: 0,
    status: 'FREE_CAPPED',
    currentCredits: 0,
  },
  {
    // One price for both directions, per started minute: the worst minute of the code's setup (a 30-minute call, Agent G
    // calling back, the result message spread over a 5-minute call) with the bridge VM spread over the planning volume.
    // Not sold: no call starts until the owner approves this price (lib/calls/whatsapp/liveDeps APPROVED_…_PER_MINUTE).
    id: 'agent-g.whatsapp-call.minute',
    service: 'agent-g',
    unit: 'one started minute of a WhatsApp call with Agent G (either direction)',
    provider: 'Google + Meta + bridge VM',
    model: 'gemini-2.5-flash-native-audio (Live)',
    lines: [
      { what: 'Gemini Live, a minute of a 30-min call (context re-billed under the 8k → 4k cap, transcription on)', usd: liveCallGeminiUsd(30, CALL_CAP) / 30, source: 'estimated' },
      { what: 'Meta business-initiated call minute to Georgia (a user\'s own call is free)', usd: META_GE_BUSINESS_CALL_USD_PER_MIN, source: 'official' },
      { what: 'the result message after the call, spread over a 5-min call', usd: META_GE_SERVICE_MESSAGE_USD / 5, source: 'official' },
      { what: `call bridge VM, $${CALL_BRIDGE_VM_USD_PER_MONTH} a month over ${CALL_PLANNING_MINUTES_PER_MONTH} call-minutes`, usd: CALL_BRIDGE_VM_USD_PER_MONTH / CALL_PLANNING_MINUTES_PER_MONTH, source: 'estimated' },
      { what: 'bridge egress (Opus to Meta, PCM to Google)', usd: 0.34 / 1000, source: 'estimated' },
    ],
    // Minutes Google bills that the caller does not pay for (a call that drops before it is answered on both sides).
    retryShare: 0.05,
    status: 'ESTIMATED',
    currentCredits: null,
  },
];

export function opCostUsd(op: UnitOp): number {
  const sum = op.lines.reduce((s, l) => s + l.usd, 0);
  return sum * (1 + op.retryShare);
}

export function opCostGel(op: UnitOp, econ: typeof ECON = ECON): number {
  return usdToCostGel(opCostUsd(op), econ);
}

/** The fewest credits that reach `margin`. */
export function creditsForMargin(op: UnitOp, margin: number, econ: typeof ECON = ECON): number {
  const cost = opCostGel(op, econ);
  if (cost <= 0) return 0;
  return Math.ceil(cost / (netGelPerCredit(econ) * (1 - margin)) - 1e-9);
}

export const targetCredits = (op: UnitOp, econ: typeof ECON = ECON): number => creditsForMargin(op, econ.targetMargin, econ);
export const floorCredits = (op: UnitOp, econ: typeof ECON = ECON): number => creditsForMargin(op, econ.floorMargin, econ);

/** Gross margin of `credits` against the op's full cost (1 = free to make, negative = sold below cost). */
export function marginAt(op: UnitOp, credits: number, econ: typeof ECON = ECON): number {
  if (credits <= 0) return opCostGel(op, econ) > 0 ? -Infinity : 0;
  return 1 - opCostGel(op, econ) / (credits * netGelPerCredit(econ));
}

export function unitOp(id: string): UnitOp {
  const op = UNIT_OPS.find((o) => o.id === id);
  if (!op) throw new Error(`unknown unit op: ${id}`);
  return op;
}

// ── The proposed price model (for the owner's one approval) ─────────────────────────────────────────────────────────────
//
// Round numbers at or above the target-margin price of each op above. A video is one base price plus its seconds on the
// tier it renders on; a deck is a base plus its slides. Nothing here charges anyone until the rollout moves these numbers
// into lib/credits/quote.ts and the routes that charge through it.

/** Credits per video, on top of its seconds: the storyboard, the music bed, the narration's mix and the assembly. */
export const PROPOSED_VIDEO_BASE = 25;
/** Credits per second of video, by the Veo tier it renders on (8 s scenes at 1080p, sound included). */
export const PROPOSED_VIDEO_PER_SEC = { lite: 9, fast: 14, standard: 44 } as const;
/** The song under a music video. Lip-sync is not offered: no allowed engine does it (BLOCKED above). */
export const PROPOSED_MUSIC_VIDEO_SONG = 20;
/** A deck: a base plus each slide's illustration (a deck without pictures pays the base only). */
export const PROPOSED_DECK = { base: 4, perIllustratedSlide: 5 } as const;

/** Every other op's price, in credits per unit. */
export const PROPOSED: Readonly<Record<string, number>> = {
  'video.remix.voiceover': 10,
  'video.remix.music': 10,
  'image.one': 8,
  'image.interior.plan3d': 8,
  'music.track.30': 5,
  'music.track.60': 18,
  'music.track.90': 25,
  'music.track.180': 50,
  'voice.dubbing.minute': 10,
  'research.deep': 330,
  /** Fast answers stay free inside FREE_DAILY; the Pro model is paid, from the first answer. */
  'chat.pro.message': 5,
  'agent-g.analyze': 8,
  /** Past the free daily minutes (FREE_DAILY below). */
  'agent-g.live.minute': 8,
  /**
   * A WhatsApp call with Agent G, per started minute, either direction; no free minutes. Clears 62 % all-in (VM included)
   * from ~405 call-minutes a month on today's setup and from ~750 on the 12k → 6k fallback (COMMUNICATION_UNIT_ECONOMICS).
   */
  'agent-g.whatsapp-call.minute': 12,
};

/** Free, inside these daily caps (per signed-in account; guests keep the existing per-IP caps). */
export const FREE_DAILY = {
  /** Chat answers on the Fast model for an account that has never bought credits; 200 once it has. */
  chatAnswers: 30,
  chatAnswersAfterPurchase: 200,
  liveVoiceMinutes: 3,
  montages: 5,
  mp3Extracts: 5,
  agentEdits: 5,
  ffmpegRemixEdits: 10,
} as const;

/** Credits for a video of `seconds` on `tier` (8 s scenes), base included. */
export function proposedVideoCredits(seconds: number, tier: keyof typeof PROPOSED_VIDEO_PER_SEC, musicVideo = false): number {
  const s = Math.max(8, Math.ceil(seconds / 8) * 8);
  return PROPOSED_VIDEO_BASE + s * PROPOSED_VIDEO_PER_SEC[tier] + (musicVideo ? PROPOSED_MUSIC_VIDEO_SONG : 0);
}

/** Full cost (₾) of the same video: the base op, one clip per 8 s, the song for a music video. */
export function videoCostGel(seconds: number, tier: keyof typeof PROPOSED_VIDEO_PER_SEC, musicVideo = false, econ: typeof ECON = ECON): number {
  const clips = Math.max(1, Math.ceil(seconds / 8));
  return (
    opCostGel(unitOp('video.film.base'), econ) +
    clips * opCostGel(unitOp(`video.clip.${tier}`), econ) +
    (musicVideo ? opCostGel(unitOp('video.music-video.song'), econ) : 0)
  );
}

/** Credits for a deck of `slides`. */
export function proposedDeckCredits(slides: number, illustrated = true): number {
  return PROPOSED_DECK.base + (illustrated ? Math.max(1, slides) * PROPOSED_DECK.perIllustratedSlide : 0);
}

/** Full cost (₾) of a deck: the 12-slide op scaled — the outline and render share, plus each slide's picture. */
export function deckCostGel(slides: number, illustrated = true, econ: typeof ECON = ECON): number {
  const op = unitOp('design.presentation.deck');
  const pictures = op.lines.filter((l) => l.what.includes('Imagen') || l.what.includes('to English'));
  const fixed = op.lines.filter((l) => !pictures.includes(l));
  const sum = (ls: readonly CostLine[]) => ls.reduce((s, l) => s + l.usd, 0);
  const usd = (sum(fixed) + (illustrated ? (sum(pictures) / 12) * Math.max(1, slides) : 0)) * (1 + op.retryShare);
  return usdToCostGel(usd, econ);
}

/** Gross margin of a price against a cost, both in the units above (credits, ₾). */
export function marginOf(credits: number, costGel: number, econ: typeof ECON = ECON): number {
  return credits > 0 ? 1 - costGel / (credits * netGelPerCredit(econ)) : -Infinity;
}
