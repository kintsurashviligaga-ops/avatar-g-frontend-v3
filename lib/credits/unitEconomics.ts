/**
 * lib/credits/unitEconomics.ts — what each paid operation COSTS the platform, and the price the owner's margin rule gives it.
 *
 * The cost side of the price book (lib/credits/priceBook.ts holds the live prices; priceBook.test.ts holds every one of them
 * to the rule below). Pure and client-safe. An unknown cost is never 0: it is an estimate, marked so.
 *
 * THE RULE (owner, PRD v2 §1.1, 2026-10-18): every operation earns exactly 100 % profit over its FULL cost — the price at
 * least doubles the API cost (Google, ElevenLabs) plus the bank's fee. Full cost = provider list price, the expected paid
 * re-renders, compute, storage and transfer, the FX reserve, and the card fee on the price itself. So, per operation:
 *
 *     price ₾ ÷ (1 + VAT) − fee × price − cost  =  k − 1 times ( cost + fee × price ),   k = 1 + profitOverCost = 2
 *     price ₾ = k × cost ÷ ( 1 ÷ (1 + VAT) − k × fee )        credits = ⌈ price ₾ ÷ ₾ per credit ⌉
 *
 * The 2026-10-10 audit's rule (65 % target / 62 % floor of a VAT-inclusive price, ≈ 2.9× cost) is kept as ECON_2026_10_10
 * and AUDIT_2026_10_10, so the doc and the owner's card can show where the new rule lowers a price.
 */
import { GEL_PER_USD } from '@/lib/billing/fx';
import { CREDIT_VALUE_GEL } from './pricing';

/** The money side of every price. Change one number here and every rule price moves with it (priceBook.test re-checks). */
export const ECON = {
  /** What one credit sells for on a top-up (1 credit = 0.10 ₾). */
  creditGel: CREDIT_VALUE_GEL,
  /** lib/billing/fx — the display rate. */
  gelPerUsd: GEL_PER_USD,
  /** Headroom on the dollar: provider bills are in USD, credits are sold in lari. */
  fxReserve: 0.05,
  /**
   * Georgian VAT taken out of every lari paid. 0: the owner's rule counts API cost and bank fees, and the merchant is not
   * known to be VAT-registered. If it is (or becomes so), set 0.18 here and every price rises ~22 %; the tests re-check.
   */
  vatRate: 0,
  /** Card acquiring on a BOG payment. ESTIMATED: the merchant rate is in the bank contract; 3 % until its number is known. */
  paymentFeeRate: 0.03,
  /** Profit as a share of full cost: 1 = 100 % (PRD v2 §1.1). */
  profitOverCost: 1,
} as const;

export type Econ = { readonly [K in keyof typeof ECON]: number };

/** The 2026-10-10 audit's money side: VAT counted, 65 % target / 62 % floor gross margin. For comparison only. */
export const ECON_2026_10_10 = { ...ECON, vatRate: 0.18, targetMargin: 0.65, floorMargin: 0.62 } as const;
export type AuditEcon = Econ & { readonly targetMargin: number; readonly floorMargin: number };

/** USD → ₾ with the FX reserve. */
export function usdToCostGel(usd: number, econ: Econ = ECON): number {
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
  /** No Google / ElevenLabs / FFmpeg engine exists for it: it is always refused, so it gets no price. */
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

// Veo 3.1 with native audio, list rate per second (lib/veo/capabilities PRICE_WITH_AUDIO). 8 s renders at 1080p. A film scene
// under Georgian narration renders silent (filmComposite), which Vertex bills less; the price assumes sound, the higher rate.
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
// ElevenLabs API, USD at every plan (elevenlabs.io/pricing/api, read 2026-10-10 and again 2026-10-18: "API usage is billed in
// US dollars, not credits"; the plan only sets what is included): eleven_v3 / multilingual_v2 speech $0.08 per 1 000
// characters; music $0.15 a minute; Scribe $0.22 an hour of audio (v2, the listed successor of scribe_v1).
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
  // A film = video.film.base + per 8 s scene ( video.clip.<tier> + video.film.scene ) [+ video.music-video.song per scene].
  // One bare clip (a VFX scene, a chat or Agent G queue clip, a conversational remix's re-rendered scene) is video.clip alone.
  ...(['lite', 'fast', 'standard'] as const).map((tier): UnitOp => ({
    id: `video.clip.${tier}`,
    service: 'video.generate',
    unit: 'one 8 s Veo clip',
    provider: 'Google (Vertex; the Gemini API lists the same rate)',
    model: `veo-3.1-${tier === 'standard' ? '' : `${tier}-`}generate`,
    // Veo alone: a clip of any length pays its seconds' share of this (Veo bills by the second). Cropping and hosting are
    // per clip, so they ride on video.film.scene (and on a bare clip's price, which rounds up past them).
    lines: [veoClip(tier)],
    retryShare: 0.1,
    status: tier === 'lite' ? 'ESTIMATED' : 'PROVEN',
    currentCredits: tier === 'lite' ? 15 : tier === 'fast' ? 25 : 83,
  })),
  {
    id: 'video.film.scene',
    service: 'video.generate',
    unit: 'what a film scene adds to its clip: the storyboard frame, its narration and music bed, cropping and hosting',
    provider: 'Google + ElevenLabs',
    model: 'gemini-3.1-flash-image · eleven_v3 · eleven music',
    // filmComposite draws one storyboard frame per scene (gemini-3.1-flash-image), narrates ~8 s (~120 characters), and the
    // assemble step lays an ElevenLabs bed as long as the film (8 s of it per scene).
    lines: [{ what: 'storyboard frame, 1K image', usd: 0.067, source: 'official' }, flash(300, 100, 'frame prompt to English'), tts(120), elevenMusic(8), compute(15, 'crop + host'), storage(12)],
    retryShare: 0.1,
    status: 'PROVEN',
    currentCredits: 0,
  },
  {
    id: 'video.film.base',
    service: 'video.generate',
    unit: 'one film, on top of its scenes (the plan, the assembly)',
    provider: 'Google + FFmpeg',
    model: 'gemini-3.8-flash · ffmpeg',
    lines: [flash(6000, 4000, 'film plan'), compute(90, 'assembly'), storage(40)],
    retryShare: 0.05,
    status: 'ESTIMATED',
    currentCredits: 0,
  },
  {
    id: 'video.music-video.song',
    service: 'video.music-video',
    unit: 'the sung song under a music video, per 8 s scene',
    provider: 'ElevenLabs / Google Lyria',
    model: 'eleven music · lyria-3',
    lines: [elevenMusic(8), storage(0.3)],
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
    unit: 'the user\'s own track laid under a clip',
    provider: 'FFmpeg',
    model: 'ffmpeg',
    // /api/video/remix `music` muxes the track the user brought (no generation); the 10-10 audit costed an ElevenLabs bed.
    lines: [compute(30, 'mix'), storage(15)],
    retryShare: 0.05,
    status: 'PROVEN',
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
  // Over 30 s is Lyria 3 Pro on Vertex (the agent live-chat branch, GG 2026-10-18): $0.08 a song whatever its length (Vertex
  // pricing lists "Lyria 3 Pro — Full song music generation — $0.08 / 1 count"; the 30 s clip is $0.04), so a 60 s, a 90 s
  // and a ~3-minute full song cost the same; only the hosted megabytes grow. ESTIMATED until Pro is verified live.
  ...([60, 90, 180] as const).map((sec): UnitOp => ({
    id: `music.track.${sec}`,
    service: 'music.generate',
    unit: sec === 180 ? 'one full song (up to ~3 min)' : `one ${sec} s track`,
    provider: 'Google Lyria',
    model: 'lyria-3-pro-preview',
    lines: [{ what: 'Lyria 3 Pro, one song', usd: 0.08, source: 'official' }, storage(sec / 30)],
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

export function opCostGel(op: UnitOp, econ: Econ = ECON): number {
  return usdToCostGel(opCostUsd(op), econ);
}

export function unitOp(id: string): UnitOp {
  const op = UNIT_OPS.find((o) => o.id === id);
  if (!op) throw new Error(`unknown unit op: ${id}`);
  return op;
}

// ── The owner's rule: 100 % profit over full cost ───────────────────────────────────────────────────────────────────────

/** Lari of price per credit, net of VAT, less `k` card fees — the denominator of the rule. */
function ruleDenominator(econ: Econ): number {
  return 1 / (1 + econ.vatRate) - (1 + econ.profitOverCost) * econ.paymentFeeRate;
}

/** The fewest credits whose price earns `profitOverCost` of a full cost of `costGel` ₾ (bank fee included). */
export function ruleCreditsForCost(costGel: number, econ: Econ = ECON): number {
  if (costGel <= 0) return 0;
  const k = 1 + econ.profitOverCost;
  // The 1e-9 absorbs float noise, so a cost that is exactly a whole number of credits is not rounded up to the next one.
  return Math.ceil((k * costGel) / (econ.creditGel * ruleDenominator(econ)) - 1e-9);
}

/** The rule's price of one unit of `op`. */
export const ruleCredits = (op: UnitOp, econ: Econ = ECON): number => ruleCreditsForCost(opCostGel(op, econ), econ);

/**
 * Profit over full cost when `credits` buy something costing `costGel` ₾: 1 = 100 % (the rule), 0 = break-even, negative
 * = sold at a loss. Full cost counts the card fee on the price; revenue is the price less VAT.
 */
export function profitOverCostOf(credits: number, costGel: number, econ: Econ = ECON): number {
  const price = credits * econ.creditGel;
  const fullCost = costGel + price * econ.paymentFeeRate;
  if (fullCost <= 0) return Infinity;
  return (price / (1 + econ.vatRate) - fullCost) / fullCost;
}

/** Full cost (₾) of one bare clip of `seconds` on `tier`: its Veo seconds, plus cropping and hosting. */
export function clipCostGel(seconds: number, tier: VideoTier, econ: Econ = ECON): number {
  const hosting = usdToCostGel((compute(15).usd + storage(12).usd) * 1.1, econ);
  return (opCostGel(unitOp(`video.clip.${tier}`), econ) * seconds) / 8 + hosting;
}

/**
 * Full cost (₾) of a film of `seconds` on `tier` in `scenes` scenes (one per started 8 s unless given): its base, its Veo
 * seconds, each scene's extras, and the song under a music video.
 */
export function videoCostGel(seconds: number, tier: VideoTier, musicVideo = false, econ: Econ = ECON, scenes?: number): number {
  const n = scenes ?? Math.max(1, Math.ceil(seconds / 8));
  return (
    opCostGel(unitOp('video.film.base'), econ) +
    (opCostGel(unitOp(`video.clip.${tier}`), econ) * seconds) / 8 +
    n * opCostGel(unitOp('video.film.scene'), econ) +
    (musicVideo ? n * opCostGel(unitOp('video.music-video.song'), econ) : 0)
  );
}

export type VideoTier = 'lite' | 'fast' | 'standard';

/** Full cost (₾) of a deck: the 12-slide op scaled — the outline and render share, plus each slide's picture. */
export function deckCostGel(slides: number, illustrated = true, econ: Econ = ECON): number {
  const op = unitOp('design.presentation.deck');
  const pictures = op.lines.filter((l) => l.what.includes('Imagen') || l.what.includes('to English'));
  const fixed = op.lines.filter((l) => !pictures.includes(l));
  const sum = (ls: readonly CostLine[]) => ls.reduce((s, l) => s + l.usd, 0);
  const usd = (sum(fixed) + (illustrated ? (sum(pictures) / 12) * Math.max(1, slides) : 0)) * (1 + op.retryShare);
  return usdToCostGel(usd, econ);
}

// ── The 2026-10-10 audit (for comparison; it never charged anyone) ─────────────────────────────────────────────────────

/** Lari one credit leaves after VAT and the card fee. */
export function netGelPerCredit(econ: Econ = ECON): number {
  return (econ.creditGel / (1 + econ.vatRate)) * (1 - econ.paymentFeeRate);
}

/** The fewest credits that reach gross `margin` (the audit's rule). */
export function creditsForMargin(op: UnitOp, margin: number, econ: Econ = ECON_2026_10_10): number {
  const cost = opCostGel(op, econ);
  if (cost <= 0) return 0;
  return Math.ceil(cost / (netGelPerCredit(econ) * (1 - margin)) - 1e-9);
}

/** Gross margin of a price against a cost, both in the units above (credits, ₾). */
export function marginOf(credits: number, costGel: number, econ: Econ = ECON_2026_10_10): number {
  return credits > 0 ? 1 - costGel / (credits * netGelPerCredit(econ)) : -Infinity;
}

/**
 * The audit's proposed prices (docs/handoffs/pricing/SERVICE_UNIT_ECONOMICS.md, card 2026-10-10): round numbers at or above
 * its 65 % target. Superseded by the price book; kept so the doc and the owner's card show the two side by side.
 */
export const AUDIT_2026_10_10 = {
  videoBase: 25,
  videoPerSec: { lite: 9, fast: 14, standard: 44 },
  musicVideoSong: 20,
  deck: { base: 4, perIllustratedSlide: 5 },
  ops: {
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
    'chat.pro.message': 5,
    'agent-g.analyze': 8,
    'agent-g.live.minute': 8,
    'agent-g.whatsapp-call.minute': 12,
  } as Readonly<Record<string, number>>,
} as const;

/** The audit's price for a video of `seconds` on `tier` (8 s scenes), base included. */
export function auditVideoCredits(seconds: number, tier: VideoTier, musicVideo = false): number {
  const s = Math.max(8, Math.ceil(seconds / 8) * 8);
  return AUDIT_2026_10_10.videoBase + s * AUDIT_2026_10_10.videoPerSec[tier] + (musicVideo ? AUDIT_2026_10_10.musicVideoSong : 0);
}

/** Free, inside these daily caps (per signed-in account; guests keep the existing per-IP caps). The audit's proposal. */
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
