/**
 * lib/billing/margin/cogs.ts — the Master COGS matrix (Phase 8.1). Pure. What ONE standard action costs us, line by line,
 * from Google's public price pages (read 2026-11-14 ~06:50Z) plus our retry share and hosting.
 *
 * Every Google price is the FULL billed price. Where Google shows a lower "introductory" price paid back as 50 % credits
 * (Gemini 3.8 Flash, 3.8 Flash TTS until 2026-12-31), the invoice still carries the full price, so we cost at full price
 * and the credits-back is extra margin while it lasts. Same policy as #313's price drafts (GG confirmed 2026-11-13 13:44Z).
 *
 * Token conversions used below (Google's own figures):
 *   Omni 1.2 Flash video out: 720p ≈ 5,792 tokens/s, 1080p ≈ 8,688 tokens/s (Vertex probe 2026-10-25, matches the page).
 *   Gemini audio out: 25 tokens per second of audio (1 minute = 1,500 tokens).
 *   Live avatar video out: 6,192 tokens per second (the pricing page's own note).
 *   gemini-3.1-flash-image: 1K = 1,120 tokens ($0.067), 2K = 1,680 ($0.101), 4K = 2,520 ($0.15) (the page's table).
 */

export const SRC = {
  vertex: 'https://cloud.google.com/vertex-ai/generative-ai/pricing',
  tts: 'https://cloud.google.com/text-to-speech/pricing',
  stt: 'https://cloud.google.com/speech-to-text/pricing',
  supabase: 'https://supabase.com/pricing',
  vercel: 'https://vercel.com/pricing',
} as const;
export const PRICES_READ_AT = '2026-11-14T06:50:00Z';

export type CostSource = 'official' | 'measured' | 'estimated';
export interface CostLine {
  what: string;
  usd: number;
  source: CostSource;
  url: string;
}

export type ServiceId = 'video' | 'image' | 'music' | 'voice' | 'live' | 'chat';

export interface CogsAction {
  id: string;
  service: ServiceId;
  label: { ka: string; en: string };
  /** The unit the user buys, in words. */
  unit: { ka: string; en: string };
  model: string;
  lines: readonly CostLine[];
  /** Share of runs we pay for twice (a refunded failure re-run, a QC miss). */
  retryShare: number;
  /** Storage, transfer and function time for one unit, USD. */
  infraUsd: number;
  /** Shown on the user pricing page. Internal-only actions (e.g. one Omni second) are false. */
  userFacing: boolean;
}

const v = (what: string, usd: number, source: CostSource = 'official'): CostLine => ({ what, usd, source, url: SRC.vertex });
const tok = (tokens: number, usdPerM: number) => (tokens * usdPerM) / 1e6;

// Hosting: Supabase Storage $0.021/GB-month + $0.09/GB egress, a result kept a month and downloaded ~twice; Vercel
// functions $0.128/vCPU-h + 2 GB × $0.0106/GB-h. Small but never zero.
const PER_MB = 0.021 / 1024 + (2 * 0.09) / 1024;
const FN_PER_S = 0.128 / 3600 + (2 * 0.0106) / 3600;
const infra = (mb: number, fnSeconds: number) => mb * PER_MB + fnSeconds * FN_PER_S;

// Omni 1.2 Flash: $1.50/1M in, $9/1M text (thinking) out, $12/1M video out.
const OMNI_VIDEO_OUT = 12;
const omniOverheadPerClip = tok(1_500, 1.5) + tok(1_000, 9); // prompt + first-frame photo in, planning thoughts out
const omniSecond = (tokensPerSec: number, res: string): CogsAction => ({
  id: `video.omni.${res}.second`,
  service: 'video',
  label: { ka: `Omni ვიდეო ${res}, 1 წამი`, en: `Omni video ${res}, 1 second` },
  unit: { ka: '1 წამი', en: '1 second' },
  model: 'gemini-omni-1.2-flash',
  lines: [
    v(`video out ${tokensPerSec.toLocaleString('en-US')} tok × $12/1M`, tok(tokensPerSec, OMNI_VIDEO_OUT)),
    v('prompt + photo in, thinking out (one 8 s clip ÷ 8)', omniOverheadPerClip / 8, 'estimated'),
  ],
  retryShare: 0.1,
  infraUsd: infra(12, 60) / 8,
  userFacing: false,
});

const veo = (tier: string, res: string, usdPerSec: number): CogsAction => ({
  id: `video.veo.${tier}.${res}.8s`,
  service: 'video',
  label: { ka: `Veo 3.1 ${tier} ${res} ხმით, 8 წმ`, en: `Veo 3.1 ${tier} ${res} with sound, 8 s` },
  unit: { ka: '8 წამიანი კლიპი', en: '8-second clip' },
  model: tier === 'standard' ? 'veo-3.1-generate' : `veo-3.1-${tier}-generate`,
  lines: [v(`8 s × $${usdPerSec}/s (video + audio)`, 8 * usdPerSec)],
  retryShare: 0.1,
  infraUsd: infra(12, 60),
  userFacing: tier !== 'standard',
});

const image = (res: '1k' | '2k' | '4k', usd: number, tokens: number): CogsAction => ({
  id: `image.${res}`,
  service: 'image',
  label: { ka: `სურათი ${res.toUpperCase()}`, en: `Image ${res.toUpperCase()}` },
  unit: { ka: '1 სურათი', en: '1 image' },
  model: 'gemini-3.1-flash-image',
  lines: [v(`${tokens.toLocaleString('en-US')} image tokens (page table)`, usd), v('prompt in ~300 tok × $0.50/1M', tok(300, 0.5), 'estimated')],
  retryShare: 0.05,
  infraUsd: infra(res === '1k' ? 2 : res === '2k' ? 6 : 20, 15),
  userFacing: true,
});

export const COGS: readonly CogsAction[] = [
  // ── Video ──────────────────────────────────────────────────────────────────────────────────────────────────────────
  omniSecond(5_792, '720p'),
  omniSecond(8_688, '1080p'),
  {
    id: 'video.omni.edit.720p.second',
    service: 'video',
    label: { ka: 'ატვირთული ვიდეოს რედაქტირება/გაგრძელება 720p, 1 წამი', en: 'Edit / extend an uploaded video 720p, 1 second' },
    unit: { ka: '1 წამი', en: '1 second' },
    model: 'gemini-omni-1.2-flash',
    lines: [
      v('video out 5,792 tok × $12/1M', tok(5_792, OMNI_VIDEO_OUT)),
      v('source video in ~300 tok/s × $1.50/1M', tok(300, 1.5), 'estimated'),
      v('prompt in, thinking out (per 8 s ÷ 8)', omniOverheadPerClip / 8, 'estimated'),
    ],
    retryShare: 0.1,
    infraUsd: infra(24, 60) / 8,
    userFacing: false,
  },
  veo('lite', '720p', 0.05),
  veo('fast', '1080p', 0.12),
  veo('standard', '1080p', 0.4),
  // ── Image ──────────────────────────────────────────────────────────────────────────────────────────────────────────
  image('1k', 0.067, 1_120),
  image('2k', 0.101, 1_680),
  image('4k', 0.15, 2_520),
  {
    id: 'image.edit.1k',
    service: 'image',
    label: { ka: 'სურათის რედაქტირება 1K', en: 'Edit an image 1K' },
    unit: { ka: '1 სურათი', en: '1 image' },
    model: 'gemini-3.1-flash-image',
    lines: [v('1,120 image tokens out', 0.067), v('your photo in 1,120 tok + prompt 300 tok × $0.50/1M', tok(1_420, 0.5))],
    retryShare: 0.05,
    infraUsd: infra(4, 15),
    userFacing: true,
  },
  // ── Music ──────────────────────────────────────────────────────────────────────────────────────────────────────────
  {
    id: 'music.clip',
    service: 'music',
    label: { ka: 'მუსიკა, 30 წამი', en: 'Music, 30 seconds' },
    unit: { ka: '1 ტრეკი', en: '1 track' },
    model: 'lyria-3-clip-preview',
    lines: [v('Lyria 3, one clip', 0.04), v('lyrics + brief, 3.8 Flash ~1.5K in / 600 out', tok(1_500, 1.5) + tok(600, 7.5), 'estimated')],
    retryShare: 0.05,
    infraUsd: infra(1, 20),
    userFacing: true,
  },
  {
    id: 'music.song',
    service: 'music',
    label: { ka: 'სრული სიმღერა (≈3 წთ)', en: 'Full song (~3 min)' },
    unit: { ka: '1 სიმღერა', en: '1 song' },
    model: 'lyria-3-pro-preview',
    lines: [v('Lyria 3 Pro, one song', 0.08), v('lyrics + brief, 3.8 Flash ~2K in / 1K out', tok(2_000, 1.5) + tok(1_000, 7.5), 'estimated')],
    retryShare: 0.05,
    infraUsd: infra(5, 40),
    userFacing: true,
  },
  // ── Voice ──────────────────────────────────────────────────────────────────────────────────────────────────────────
  {
    id: 'voice.tts.minute',
    service: 'voice',
    label: { ka: 'ტექსტის ხმოვანება, 1 წუთი', en: 'Text to speech, 1 minute' },
    unit: { ka: '1 წუთი აუდიო', en: '1 minute of audio' },
    model: 'gemini-3.8-flash-tts',
    lines: [
      { what: 'audio out 1,500 tok × $18/1M (full price from 2027-01-01)', usd: tok(1_500, 18), source: 'official', url: SRC.tts },
      { what: 'text in ~250 tok × $1/1M', usd: tok(250, 1), source: 'official', url: SRC.tts },
    ],
    retryShare: 0,
    infraUsd: infra(1, 10),
    userFacing: true,
  },
  {
    id: 'voice.stt.minute',
    service: 'voice',
    label: { ka: 'მეტყველების ამოცნობა (Chirp 3), 1 წუთი', en: 'Speech to text (Chirp 3), 1 minute' },
    unit: { ka: '1 წუთი', en: '1 minute' },
    model: 'chirp_3',
    lines: [{ what: 'Speech-to-Text V2 standard, first 500K min/month', usd: 0.016, source: 'official', url: SRC.stt }],
    retryShare: 0,
    infraUsd: infra(0, 5),
    userFacing: true,
  },
  // ── Live ───────────────────────────────────────────────────────────────────────────────────────────────────────────
  {
    id: 'live.voice.minute',
    service: 'live',
    label: { ka: 'ლაივ საუბარი (ხმა), 1 წუთი', en: 'Live voice call, 1 minute' },
    unit: { ka: '1 წუთი', en: '1 minute' },
    model: 'gemini-3.8-live',
    lines: [
      v('audio in 1,500 tok × $3/1M', tok(1_500, 3)),
      v('audio out, ~half the minute: 750 tok × $12/1M', tok(750, 12), 'estimated'),
      v('conversation context re-read, ~40K text tok × $0.75/1M', tok(40_000, 0.75), 'estimated'),
    ],
    retryShare: 0,
    infraUsd: 0.0007, // Cloud Run relay, min-instances=1 (~$9-10/month) spread over ~15K minutes
    userFacing: true,
  },
  {
    id: 'live.avatar.minute',
    service: 'live',
    label: { ka: 'ლაივ ავატარი (ვიდეო + ხმა), 1 წუთი', en: 'Live talking avatar (video + voice), 1 minute' },
    unit: { ka: '1 წუთი', en: '1 minute' },
    model: 'gemini-3.8-live',
    lines: [
      v('avatar video out 6,192 tok/s × 60 × $1/1M', tok(6_192 * 60, 1)),
      v('audio in 1,500 tok × $3/1M', tok(1_500, 3)),
      v('audio out, ~half the minute: 750 tok × $12/1M', tok(750, 12), 'estimated'),
      v('conversation context re-read, ~40K text tok × $0.75/1M', tok(40_000, 0.75), 'estimated'),
    ],
    retryShare: 0,
    infraUsd: 0.0007,
    userFacing: true,
  },
  // ── Chat ───────────────────────────────────────────────────────────────────────────────────────────────────────────
  {
    id: 'chat.message',
    service: 'chat',
    label: { ka: 'ჩატის პასუხი', en: 'Chat reply' },
    unit: { ka: '1 პასუხი', en: '1 reply' },
    model: 'gemini-3.8-flash',
    lines: [v('~3K tok in × $1.50/1M', tok(3_000, 1.5), 'estimated'), v('~800 tok out × $7.50/1M', tok(800, 7.5), 'estimated')],
    retryShare: 0,
    infraUsd: infra(0, 4),
    userFacing: false, // inside the plan's daily chat cap, not sold per reply
  },
  {
    id: 'chat.search',
    service: 'chat',
    label: { ka: 'ჩატის პასუხი Google ძიებით', en: 'Chat reply with Google Search' },
    unit: { ka: '1 პასუხი', en: '1 reply' },
    model: 'gemini-3.8-flash + grounding',
    lines: [v('grounded query, $14 per 1,000', 0.014), v('~6K tok in / 1K out', tok(6_000, 1.5) + tok(1_000, 7.5), 'estimated')],
    retryShare: 0,
    infraUsd: infra(0, 6),
    userFacing: false,
  },
];

/** Full USD cost of one unit: Google lines × (1 + retry share) + hosting. FX is added in econ.costGelOf. */
export function fullCostUsd(a: CogsAction): number {
  const list = a.lines.reduce((s, l) => s + l.usd, 0);
  return list * (1 + a.retryShare) + a.infraUsd;
}

export function listCostUsd(a: CogsAction): number {
  return a.lines.reduce((s, l) => s + l.usd, 0);
}

export function cogsOf(id: string): CogsAction {
  const a = COGS.find((x) => x.id === id);
  if (!a) throw new Error(`cogs: unknown action ${id}`);
  return a;
}
