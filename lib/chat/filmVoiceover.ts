/**
 * lib/chat/filmVoiceover.ts
 * =========================
 * PHASE 48 §2 — Commentator / voice-over leg for the 30-second film.
 *
 * The film pipeline already binds a cohesive INSTRUMENTAL score (Udio) and the
 * FFmpeg master already knows how to duck music under a spoken track
 * (`voiceoverUrl` → `vocal_ducking_pct` in lib/orchestrator/ffmpeg-assembly.ts).
 * What was missing was the *spoken* track itself: when a brief asks for a
 * commentator / narrator / voice-over, nothing generated the words or the audio.
 *
 * This module fills that gap as a self-contained, STRICTLY FAIL-OPEN leg:
 *
 *   1. `wantsCommentary(brief)` — cheap intent detector (en / ka / ru).
 *   2. Claude writes the spoken narration in the SAME language as the brief.
 *   3. ElevenLabs synthesises it with the SAME tuned Georgian-stable multilingual
 *      voice settings the live /api/elevenlabs/tts route uses (natural, not robotic).
 *   4. The clip is uploaded to a private bucket and a signed URL is returned.
 *
 * Every step returns `null` on any failure (missing key, model error, empty
 * audio, upload failure). A null voice-over leaves the existing music-only
 * pipeline byte-for-byte unchanged — the worst case is "no commentary", never a
 * broken render. The leg is also NOT separately billed: the commentary rides on
 * top of the existing film charge, so a failed/absent voice-over can never burn
 * extra GEL (§3 balance-protection intent).
 */

import 'server-only';
import { sanitizeSpokenText, splitSpokenText } from './spokenText';
import { castRoster, collapseVoicedTurns, type CastTurn, type VoicedTurn } from './dialogueCasting';
import { llmText } from '@/lib/ai/llmText';
import { selectTtsModel, voiceSettingsForModel, isGeorgianText, type ElevenLabsModelId } from '@/lib/audio/tts-model';
import { genderForPersona, type TtsGender } from '@/lib/audio/google-tts';
import { KA_VOICE_MALE, KA_VOICE_FEMALE, georgianVoiceId } from '@/lib/audio/georgian-voice';
import { isElevenLabsVoiceId } from '@/lib/audio/voiceId';
import { resolveVoiceId, personaToGender, toneToVoiceSettings, type VoiceLanguage, type VoicePersonaSel, type VoiceTone } from '@/lib/chat/voiceMap';
import { uploadAndSign, uploadBufferAndSign } from '@/lib/orchestrator/storage-adapter';
import { mp3DurationSec } from '@/lib/audio/mp3Duration';
import { withElevenLabsSlot } from '@/lib/elevenlabs/concurrency';
import { isLastingVoiceRefusal } from '@/lib/elevenlabs/account';
import { transcribeWithScribe } from '@/lib/services/dubbing/elevenScribe';
import type { CaptionWord } from '@/lib/pipeline/compositing/word-synced-captions';
import { checkFilmVoice, type VoiceVerdict } from './filmVoiceCheck';

/**
 * Strong-signal commentator / narration intent across Georgian, English and
 * Russian. Deliberately NOT triggered by the bare word "voice"/"ხმა"/"голос"
 * (too generic — would over-narrate ambient films); only explicit spoken-track
 * cues fire it.
 */
const COMMENTARY_RE = new RegExp(
  [
    // English
    'commentat', 'commentary', 'narrat', 'voice ?over', 'voiceover',
    // NOT 'spoken', 'dialogue' or 'speaks': they describe a character talking on screen ("the actor speaks to camera"),
    // and matching them sent the typed "What the character says" line to an off-screen narrator instead of the actor
    // (Video Core certification 2026-10-15, open item; the Georgian brief never matched, so only English briefs broke).
    'announc', 'sportscast', 'play[- ]?by[- ]?play',
    // Georgian — კომენტ(ატორი), ნარაცი(ა), გახმოვანებ, წამყვან(ი), დიქტორ(ი), თხრობ
    'კომენტ', 'ნარაცი', 'გახმოვან', 'წამყვან', 'დიქტორ', 'თხრობ',
    // Russian — комментат(ор), наррат(ор), озвуч(ка), диктор, ведущ(ий)
    'комментат', 'наррат', 'озвуч', 'диктор', 'ведущ',
  ].join('|'),
  'i',
);

/** True when the brief explicitly asks for a spoken commentator / narration. */
export function wantsCommentary(message: string | null | undefined): boolean {
  return typeof message === 'string' && COMMENTARY_RE.test(message);
}

/**
 * Write the spoken voice-over for `brief`, sized to `totalSec`, in the brief's
 * own language. Spoken words only — no stage directions, labels, or quotes.
 * Returns null on any failure (fail-open).
 */
async function generateNarrationScript(brief: string, totalSec: number): Promise<string | null> {
  // ~2.4 spoken words/sec is a comfortable broadcast pace; keep it tight so the
  // synthesised track does not overrun the stitched cut.
  const targetWords = Math.max(12, Math.round(totalSec * 2.4));
  // Live-provider chain: DeepSeek-V3 (Atlas) → Gemini → Anthropic (Anthropic is dead in prod).
  const text = await llmText({
    system: [
      'You are a professional voice-over scriptwriter for short cinematic videos.',
      'Output ONLY the words to be spoken aloud — no scene numbers, no stage directions,',
      'no speaker labels, no quotation marks, no markdown, no notes.',
      'Write in the SAME language as the brief (Georgian brief → Georgian; English → English; Russian → Russian).',
      'One continuous, energetic, vivid spoken piece tied to the on-screen action that reads naturally within the given duration.',
    ].join(' '),
    user:
      `Brief: "${brief.trim()}"\n` +
      `Spoken duration: about ${totalSec} seconds (~${targetWords} words).\n` +
      'Write the voice-over narration now — spoken words only.',
    maxTokens: 500,
    temperature: 0.7,
    timeoutMs: 30_000,
    // Google-only (docs/VEO_ENGINE.md §3): Gemini writes the narration or none is written (the film keeps its
    // dialogue / music) — never DeepSeek or Claude behind a Google-only film.
    googleOnly: true,
  });
  if (!text) return null;
  // Strip accidental wrapping quotes / smart-quotes the model sometimes adds.
  const cleaned = text.replace(/^["'“”«»\s]+|["'“”«»\s]+$/g, '').trim();
  if (cleaned.length < 3) return null;
  // Hard cap so a runaway response can never produce a minutes-long track.
  return cleaned.slice(0, 800);
}

// v363 — DEFENSIVE narration hygiene lives in the dependency-free ./spokenText module (pure + unit-tested);
// re-exported so existing importers (the assembler) keep resolving it from here.
export { sanitizeSpokenText };

/**
 * Synthesise `text` to an MP3 with the SAME tuned voice the live TTS route uses
 * (Georgian → eleven_multilingual_v2, natural settings). Returns base64 + content
 * type, or null on any failure.
 */
/**
 * Per-character Georgian voice map. To get a NATURAL, ACCENT-FREE Georgian read you
 * need a Georgian-native voice (ElevenLabs has no built-in one). Two ways to fill
 * these IN CODE (deploys via git — NO Vercel access needed):
 *   • paste a cloned/library Georgian voice ID as the string default below, OR
 *   • set the matching env var (ELEVENLABS_KA_*).
 * Until a slot is filled it falls back to ELEVENLABS_GEORGIAN_VOICE_ID → the single
 * configured voice, so nothing ever breaks. The persona is auto-detected from the
 * brief so a male/female/child/elder/young story gets a fitting voice.
 */
type VoicePersona = 'male' | 'female' | 'child' | 'elder' | 'young' | 'narrator';
// v329 — NATIVE Georgian voices cloned (ElevenLabs IVC) from real Georgian
// speakers supplied by the founder, read on eleven_v3 (the ka-capable model) for a
// natural, accent-free result. Male personas → the male clone; female/child → the
// female clone. Env (ELEVENLABS_KA_*) still overrides per-persona if ever needed.
const KA_VOICE_DEFAULTS: Record<VoicePersona, string> = {
  male: KA_VOICE_MALE,
  narrator: KA_VOICE_MALE,
  elder: KA_VOICE_MALE,
  young: KA_VOICE_MALE,
  female: KA_VOICE_FEMALE,
  child: KA_VOICE_FEMALE,
};
function detectPersona(brief: string): VoicePersona {
  const b = (brief || '').toLowerCase();
  if (/\b(child|kid|boy|girl|baby|toddler)\b|ბავშვ|ბიჭუნა|გოგონა/.test(b)) return 'child';
  if (/\b(old|elderly|aged|grandfather|grandmother)\b|მოხუც|ბებერ|ბაბუ|ბებია/.test(b)) return 'elder';
  if (/\b(young|teen|youth|teenager)\b|ახალგაზრდ|ჭაბუკ|მოზარდ/.test(b)) return 'young';
  if (/\b(woman|girl|lady|female|she|her|mother|sister|wife)\b|ქალ|გოგო|დედ|დის|ცოლ/.test(b)) return 'female';
  if (/\b(man|male|soldier|father|brother|king|warrior)\b|კაც|მამაკაც|ჯარისკაც|მამა|ძმ|მეფ|მებრძ/.test(b)) return 'male';
  return 'narrator';
}
/** Resolve the Georgian voice for a brief: env slot → code default → single fallback. */
function pickGeorgianVoiceId(brief: string): string | null {
  const persona = detectPersona(brief);
  const envSlot = process.env[`ELEVENLABS_KA_${persona.toUpperCase()}`];
  return (
    (envSlot && envSlot.trim()) ||
    (KA_VOICE_DEFAULTS[persona] && KA_VOICE_DEFAULTS[persona].trim()) ||
    (process.env.ELEVENLABS_GEORGIAN_VOICE_ID && process.env.ELEVENLABS_GEORGIAN_VOICE_ID.trim()) ||
    (process.env.ELEVENLABS_VOICE_ID && process.env.ELEVENLABS_VOICE_ID.trim()) ||
    null
  );
}

/**
 * Resolve the narrator voice for an EXPLICIT gender choice (the video panel's
 * 👩 ქალი / 👨 კაცი selector). Order: the task-specified env override
 * (ELEVENLABS_VOICE_ID_FEMALE / _MALE) → the cloned native-Georgian voice for that
 * gender (georgianVoiceId, which itself honours ELEVENLABS_GEORGIAN_VOICE_ID) →
 * the single configured voice. Fail-soft: returns null only when nothing at all
 * is configured, so a missing voice ID degrades to the auto pick rather than crashing.
 */
function pickNarratorVoiceId(gender: 'male' | 'female'): string | null {
  const envSlot = (gender === 'male' ? process.env.ELEVENLABS_VOICE_ID_MALE : process.env.ELEVENLABS_VOICE_ID_FEMALE) || '';
  return (
    envSlot.trim() ||
    (georgianVoiceId(gender) || '').trim() ||
    (process.env.ELEVENLABS_VOICE_ID && process.env.ELEVENLABS_VOICE_ID.trim()) ||
    null
  );
}

/**
 * Split a multi-character dialogue script into ordered { gender, text } turns.
 * Recognises Georgian (ქალი:/კაცი:), English (Woman:/Man:/Female:/Male:) and
 * Russian (Женщина:/Мужчина:) speaker prefixes. A line with no prefix continues
 * the previous speaker; text before any prefix defaults to the female narrator.
 * Exported for unit testing.
 */
export interface DialogueTurn { gender: 'male' | 'female'; text: string; }
const SPEAKER_RE = /^\s*(ქალ\S*|კაც\S*|მამაკაც\S*|woman|man|female|male|женщина|мужчина)\s*[:：]\s*(.*)$/i;
export function parseDialogueScript(script: string): DialogueTurn[] {
  const turns: DialogueTurn[] = [];
  let current: 'male' | 'female' | null = null;
  for (const rawLine of String(script || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const m = line.match(SPEAKER_RE);
    if (m) {
      const tag = m[1]!.toLowerCase();
      const isMale =
        tag.startsWith('კაც') || tag.startsWith('მამაკაც') ||
        tag === 'man' || tag === 'male' || tag.startsWith('мужч');
      current = isMale ? 'male' : 'female';
      const rest = (m[2] || '').trim();
      if (rest) turns.push({ gender: current, text: rest });
    } else {
      turns.push({ gender: current ?? 'female', text: line });
    }
  }
  // Merge consecutive same-speaker turns so each TTS call reads a full breath.
  const merged: DialogueTurn[] = [];
  for (const turn of turns) {
    const last = merged[merged.length - 1];
    if (last && last.gender === turn.gender) last.text = `${last.text} ${turn.text}`.trim();
    else merged.push({ ...turn });
  }
  return merged;
}

/**
 * Why ElevenLabs refused a request, for the log: the HTTP status and ElevenLabs' own error code (detail.status / detail.code,
 * e.g. `api_key_id_used_as_api_key`, `quota_exceeded`). Never the request, never the key. Never throws.
 */
export async function elevenLabsRefusal(res: { status: number; text: () => Promise<string> }): Promise<string> {
  let code = '';
  try {
    const body = JSON.parse(await res.text()) as { detail?: { status?: unknown; code?: unknown } | string } | null;
    const detail = body?.detail;
    if (detail && typeof detail === 'object') {
      code = [detail.code, detail.status].filter((x): x is string => typeof x === 'string' && /^[a-z0-9_]{1,64}$/i.test(x)).join(' / ');
    }
  } catch { /* not JSON: the status alone */ }
  return code ? `${res.status} ${code}` : String(res.status);
}

async function synthesizeVoiceover(
  text: string,
  voiceIdOverride?: string | null,
  // Only ever steered the Azure / Google fallback voices, which are gone (R7, below). The ElevenLabs voice is already
  // gender-matched by every caller through `voiceIdOverride`; kept so the call sites stay as they are.
  _gender?: TtsGender,
  // PHASE 2 L1 — optional tone-driven voice-setting nudges, merged OVER the model
  // defaults. Empty/{} → byte-identical to the previous behaviour.
  extraVoiceSettings?: Record<string, number>,
  // Told each ElevenLabs refusal's HTTP status (0 when no answer came), so a caller can tell a plan / key refusal from
  // a passing outage.
  onRefusal?: (status: number) => void,
): Promise<{ base64: string; contentType: string } | null> {
  const georgian = isGeorgianText(text);
  const apiKey = process.env.ELEVENLABS_API_KEY;

  // PRIMARY: ElevenLabs. For Georgian the caller passes a CLONED native-Georgian
  // voice (KA_VOICE_DEFAULTS — real Georgian speakers, IVC) read on eleven_v3 (the
  // ka-capable model) → natural, accent-free, and the user's own chosen voices.
  // For non-Georgian it's the configured voice on turbo. ElevenLabs is the ONLY provider
  // here — see the R7 note at the end of this function.
  if (apiKey) {
    const voiceId =
      (voiceIdOverride && voiceIdOverride.trim() ? voiceIdOverride.trim() : null) ??
      ((georgian && process.env.ELEVENLABS_GEORGIAN_VOICE_ID
        ? process.env.ELEVENLABS_GEORGIAN_VOICE_ID
        : undefined) ?? process.env.ELEVENLABS_VOICE_ID)?.trim(); // a pasted env value often ends in a newline
    // An override that is not a voice id never reaches the provider URL path (lib/audio/voiceId): no voice, no call.
    if (voiceId && isElevenLabsVoiceId(voiceId)) {
      const primaryModel = selectTtsModel(text);
      // eleven_v3 is the ONLY EL model with native `ka`, but it is alpha / limited-access — if the
      // account can't use it the request 4xxs and Georgian voiceover fails entirely (avatar + video
      // dub break). Fall back to eleven_multilingual_v2 (phonetic ka — imperfect but audible) so a
      // voice always comes out. Non-Georgian keeps its single turbo model.
      const modelChain: ElevenLabsModelId[] = primaryModel === 'eleven_v3'
        ? ['eleven_v3', 'eleven_multilingual_v2']
        : [primaryModel];
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 30_000);
      try {
        // Hold a shared ElevenLabs concurrency slot for the whole request+read so a
        // TTS call can't collide with a concurrent Music call (the song build fires
        // both) and trip the account's 2-concurrent 429.
        const out = await withElevenLabsSlot(async () => {
          for (const m of modelChain) {
            const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
              method: 'POST',
              headers: {
                'xi-api-key': apiKey,
                'Content-Type': 'application/json',
                Accept: 'audio/mpeg',
              },
              body: JSON.stringify({
                text,
                model_id: m,
                voice_settings: { ...voiceSettingsForModel(m), ...(extraVoiceSettings ?? {}) },
              }),
              signal: ac.signal,
            });
            if (res.ok) {
              const buf = Buffer.from(await res.arrayBuffer());
              // Guard against an empty / error-page body masquerading as audio.
              if (buf.byteLength >= 1024) return { base64: buf.toString('base64'), contentType: 'audio/mpeg' as const };
            } else {
              // Named, never silent: on 2026-10-17 every voice of a paid film came back null with nothing in the logs, and
              // the cause (the key's ID set where the key belongs) was only found in the Music leg's warning.
              // eslint-disable-next-line no-console
              console.warn(`[tts] ElevenLabs ${m} refused: ${await elevenLabsRefusal(res)}`);
              onRefusal?.(res.status);
            }
            // else: try the next model in the chain (e.g. eleven_v3 not enabled on this account)
          }
          return null;
        });
        if (out) return out;
      } catch {
        /* fall through to the explicit miss below */
        onRefusal?.(0); // a timeout or a dropped connection: no answer, so never a lasting one
      } finally {
        clearTimeout(timer);
      }
    }
  }

  // ⚠️ NO FALLBACK PROVIDER (PROJECT_MASTER R7 — no silent fallback). When ElevenLabs was absent or down this fell to
  // Azure's native ka voices (Eka/Giorgi) for Georgian, then to Google Cloud TTS — so a film, a dub or an avatar line
  // could be voiced by a different provider's different voice from the one the user cast, with nothing to say so, and
  // Azure is not an allowed provider at all. A request uses ONE provider: ElevenLabs (the eleven_v3 → multilingual_v2
  // retry above stays on it). Its miss is this function's explicit outcome — null — which every caller already
  // handles as its own no-voice path (a film keeps its music-only master; the dub / redub / presenter routes answer
  // their existing error).
  return null;
}

/**
 * Speak ARBITRARY user text → an mp3 hosted at a fetchable https URL. Powers the
 * lip-sync "dub from text" flow (and any other text-to-voice need). Returns null on
 * any failure so the caller can fall back. `voiceId` overrides the auto voice pick.
 */
export async function textToHostedSpeech(text: string, voiceId?: string | null): Promise<string | null> {
  try {
    // Fall back to the hardcoded KA voice map (pickGeorgianVoiceId) — NOT just the env
    // voice — so TTS never silently returns null when ELEVENLABS_VOICE_ID is unset.
    const audio = await synthesizeVoiceover(text, voiceId ?? pickGeorgianVoiceId(text), genderForPersona(detectPersona(text)));
    if (!audio) return null;
    const path = `lipsync-tts/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp3`;
    return (await uploadAndSign('renders', path, audio.base64, audio.contentType, 7200)) ?? null;
  } catch {
    return null;
  }
}

/**
 * The talking avatar's line (app/api/avatar/veo, GG's 2026-10-17 07:54Z choice: its Georgian is ElevenLabs', the picture
 * Veo's). ONE request in the voice of the chosen gender — the cloned native-Georgian voice for a Georgian line — hosted at
 * `path` (a fixed path, so the status route finds it again by the job alone), with how long it plays: the route refuses a
 * line longer than the clip BEFORE it charges. `{ off: true }` when ElevenLabs refused it for good (a plan without the
 * cloned voices, a spent quota, a wrong key); null on any other miss (no key, an outage, empty audio, a failed upload).
 */
export async function speakAvatarLine(opts: { text: string; gender?: 'male' | 'female' | null; path: string }): Promise<{ url: string; seconds: number } | { off: true } | null> {
  try {
    const text = sanitizeSpokenText(opts.text).trim();
    if (!text) return null;
    const voiceId = opts.gender ? pickNarratorVoiceId(opts.gender) : pickGeorgianVoiceId(text);
    const gender: TtsGender = opts.gender ? (opts.gender === 'male' ? 'MALE' : 'FEMALE') : genderForPersona(detectPersona(text));
    const refusals: number[] = [];
    const audio = await synthesizeVoiceover(text, voiceId, gender, undefined, (status) => { refusals.push(status); });
    // Every model ElevenLabs was asked refused in a way a retry cannot change (2026-10-17 09:31Z: `401
    // subscription_required / ivc_not_permitted` — the plan does not allow the cloned Georgian voices): the voice is
    // off, and the user is not told to "try in a minute".
    if (!audio) return refusals.length > 0 && refusals.every(isLastingVoiceRefusal) ? { off: true } : null;
    const buf = Buffer.from(audio.base64, 'base64');
    const seconds = mp3DurationSec(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
    if (seconds === null) return null;
    const url = await uploadBufferAndSign('renders', opts.path, buf, audio.contentType, 7200);
    return url ? { url, seconds } : null;
  } catch {
    return null;
  }
}

/** Longest text one TTS request carries. A longer narration is read in sentence-sized parts and joined. */
const TTS_PART_CHARS = 600;
/**
 * The whole narration's bound: a 4-minute film's worth of Georgian speech. It used to be the single request's 600, which
 * silently cut a long narration mid-sentence — invisible while Veo spoke the film's lines, but a Georgian film is voiced
 * entirely off camera now (lib/chat/filmComposite), and its words are already measured against the film's length there.
 */
const NARRATION_MAX_CHARS = 2400;

/** What the narration leg is told: the brief, the length, and the voice the panel picked. */
export interface FilmVoiceoverOptions {
  brief: string;
  totalSec: number;
  compositeId: string;
  /** Verbatim dialogue the user typed in the video panel — spoken as-is, no rewrite. */
  narrationScript?: string | null;
  /** Explicit narrator gender from the video panel (👩/👨). Overrides brief auto-detect. */
  narratorGender?: 'male' | 'female' | null;
  /** PHASE 2 L1 — Character Voice selector (language + persona + tone). When persona
   *  AND language are both set they win over narratorGender via the VOICE_MAP. */
  voiceLanguage?: VoiceLanguage | null;
  voicePersona?: VoicePersonaSel | null;
  voiceTone?: VoiceTone | null;
}

/**
 * The narration's words, and a way to read them aloud in the voice the panel picked (each call is one more read). null when
 * there is nothing to say (no script, and the writer gave none).
 */
async function filmNarration(opts: FilmVoiceoverOptions): Promise<{ script: string; speak: () => Promise<{ base64: string; contentType: string } | null> } | null> {
  // v363 — sanitize the verbatim narration so production annotations (TC/SFX/overlay/scene headers) are
  // never spoken. If sanitizing empties it (the field held only a shot-list), fall back to the LLM writer.
  const sanitized = sanitizeSpokenText(opts.narrationScript).slice(0, NARRATION_MAX_CHARS);
  const custom = sanitized.length >= 3 ? sanitized : null;
  const script = custom ?? (await generateNarrationScript(opts.brief, opts.totalSec));
  if (!script) return null;
  // PHASE 2 L1 — the Character Voice selector wins when present (lang+persona);
  // else the explicit panel gender; else a brief-detected persona voice. The two
  // legacy branches are untouched so existing renders behave identically.
  let voiceId: string | null;
  let ttsGender: TtsGender;
  if (opts.voicePersona && opts.voiceLanguage) {
    voiceId = resolveVoiceId(opts.voiceLanguage, opts.voicePersona) ?? pickGeorgianVoiceId(opts.brief);
    ttsGender = personaToGender(opts.voicePersona) === 'male' ? 'MALE' : 'FEMALE';
  } else if (opts.narratorGender) {
    voiceId = pickNarratorVoiceId(opts.narratorGender);
    ttsGender = opts.narratorGender === 'male' ? 'MALE' : 'FEMALE';
  } else {
    voiceId = pickGeorgianVoiceId(opts.brief);
    ttsGender = genderForPersona(detectPersona(opts.brief));
  }
  const settings = toneToVoiceSettings(opts.voiceTone);
  const speak = async (): Promise<{ base64: string; contentType: string } | null> => {
    // One voice, read in order: each part is the same voice and settings, and the mp3 frames concatenate into one track
    // (the dialogue leg below joins its lines the same way). A part that fails fails the whole voice — never a hole.
    const parts = await Promise.all(splitSpokenText(script, TTS_PART_CHARS).map((p) => synthesizeVoiceover(p, voiceId, ttsGender, settings)));
    if (!parts.length || parts.some((p) => !p)) return null;
    const read = parts as { base64: string; contentType: string }[];
    return read.length === 1
      ? read[0]!
      : { base64: Buffer.concat(read.map((p) => Buffer.from(p.base64, 'base64'))).toString('base64'), contentType: read[0]!.contentType };
  };
  return { script, speak };
}

/**
 * End-to-end commentator leg: brief → narration → speech → hosted signed URL.
 * Always resolves; returns null (never throws) on any failure so the caller can
 * fall back to the music-only timeline with zero behavioural change.
 */
export async function generateFilmVoiceover(opts: FilmVoiceoverOptions): Promise<string | null> {
  try {
    const narration = await filmNarration(opts);
    const audio = narration ? await narration.speak() : null;
    if (!audio) return null;
    // 2-hour signed URL — comfortably outlives the render + assemble window.
    const path = `${opts.compositeId}/voiceover.mp3`;
    return (await uploadAndSign('renders', path, audio.base64, audio.contentType, 7200)) ?? null;
  } catch {
    return null;
  }
}

/** A film narration that was listened to after it was read (./filmVoiceCheck). */
export interface CheckedFilmVoiceover {
  url: string;
  /** How closely what Scribe heard matches the script (0–1); null = Scribe did not answer, the voice is unverified. */
  score: number | null;
  verdict: VoiceVerdict | null;
  /** 1, or 2 when the first read did not say its words. */
  reads: number;
  /** The script's own words, timed from the audio: the film's subtitles, when the user asks for them. */
  words: CaptionWord[] | null;
}

/**
 * generateFilmVoiceover, listened to: Scribe (ElevenLabs speech-to-text) hears the read, and a read that does not say its
 * words is read once more (./filmVoiceCheck checkFilmVoice). The better read is hosted, with its score and the script's
 * words timed for subtitles. A verdict of 'fail' is the caller's to act on (a film whose voice is its only speech is not
 * made with it). Never throws; null when no voice came back.
 */
export async function generateCheckedFilmVoiceover(opts: FilmVoiceoverOptions): Promise<CheckedFilmVoiceover | null> {
  try {
    const narration = await filmNarration(opts);
    if (!narration) return null;
    const languageCode = isGeorgianText(narration.script) ? 'ka' : null;
    const outcome = await checkFilmVoice({
      script: narration.script,
      read: async () => {
        const audio = await narration.speak();
        if (!audio) return null;
        const buf = Buffer.from(audio.base64, 'base64');
        return { audio: { buf, contentType: audio.contentType }, seconds: mp3DurationSec(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)) };
      },
      listen: async ({ buf }) => {
        // Bounded well under the dispatch's budget: a check that cannot answer leaves the voice unverified, never late.
        const heard = await transcribeWithScribe(buf, { languageCode, diarize: false, timeoutMs: 30_000 });
        return heard ? { text: heard.text, words: heard.words ?? [] } : null;
      },
    });
    if (!outcome) return null;
    const url = await uploadBufferAndSign('renders', `${opts.compositeId}/voiceover.mp3`, outcome.read.audio.buf, outcome.read.audio.contentType, 7200);
    if (!url) return null;
    return { url, score: outcome.score, verdict: outcome.verdict, reads: outcome.reads, words: outcome.words };
  } catch {
    return null;
  }
}

/**
 * Multi-character dialogue voice-over: parse the script into speaker turns, TTS
 * each turn in the matching gendered voice (concurrently, order preserved), then
 * concatenate the MP3 segments into one continuous track and host it. The segments
 * share the same ElevenLabs mp3 format, so a byte-concat plays back as sequential
 * dialogue (woman → man → …). Strictly fail-open: any miss returns null and the
 * film falls back to the music-only mix. Not separately billed.
 */
export async function generateDialogueVoiceover(opts: {
  /** Legacy gender-tagged dialogue script (MALE:/FEMALE: lines). */
  script?: string;
  /** Phase 1 — structured per-SPEAKER turns (from parseMasterScript.dialogue) → N-character casting. Wins. */
  turns?: CastTurn[];
  compositeId: string;
}): Promise<string | null> {
  try {
    // Structured per-speaker turns → a stable cast voice per character; else the legacy gender-tagged script.
    // Each voiced line keeps its persona GENDER for the TTS settings (stability 0.48 is untouched) — only the
    // voice ID varies per character. The speaker key drives casting AND the same-speaker merge below.
    let voiced: VoicedTurn[];
    if (opts.turns && opts.turns.length) {
      const roster = castRoster(opts.turns);
      voiced = opts.turns.map((t) => {
        const speaker = (t.speaker ?? '').trim().toLowerCase();
        const cast = roster.get(speaker);
        // Parity with the narration leg: scrub any production annotation from the (folded narrator + dialogue)
        // turn text so nothing but the spoken words is voiced. Clean prose (incl. all Georgian) passes through.
        return { speaker, text: sanitizeSpokenText(t.text), voiceId: cast?.voiceId ?? pickNarratorVoiceId(cast?.gender ?? 'female'), gender: cast?.gender ?? 'female' };
      });
    } else {
      // Legacy gender-tagged path — byte-identical to before: speaker key = gender, no sanitize.
      voiced = parseDialogueScript(opts.script ?? '').map((turn) => ({ speaker: turn.gender, text: turn.text, voiceId: pickNarratorVoiceId(turn.gender), gender: turn.gender }));
    }
    // Merge consecutive SAME-speaker lines into one breath, then bound to 12 turns while RESERVING the
    // narrator VO spine from truncation (see collapseVoicedTurns).
    voiced = collapseVoicedTurns(voiced, 12);
    if (!voiced.length) return null;
    const segments = await Promise.all(
      voiced.map((v) => {
        const text = v.text.slice(0, 400);
        if (!text) return Promise.resolve<{ base64: string; contentType: string } | null>(null);
        return synthesizeVoiceover(text, v.voiceId, v.gender === 'male' ? 'MALE' : 'FEMALE').catch(() => null);
      }),
    );
    const buffers = segments
      .filter((s): s is { base64: string; contentType: string } => Boolean(s))
      .map((s) => Buffer.from(s.base64, 'base64'));
    if (!buffers.length) return null;
    const merged = Buffer.concat(buffers);
    const path = `${opts.compositeId}/dialogue.mp3`;
    return (await uploadAndSign('renders', path, merged.toString('base64'), 'audio/mpeg', 7200)) ?? null;
  } catch {
    return null;
  }
}

/** DAY-4/5 multi-voice activation — a per-speaker dialogue STEM (a rendered line + who + when) that the
 *  ffmpeg assembly spatial-premixes. */
export interface DialogueStem { url: string; speaker: string; startSec: number }
export interface DialogueStemsResult { stems: DialogueStem[]; mergedUrl: string | null }

/** Pure precondition for the spatial multi-voice premix: ≥2 DISTINCT speakers AND every turn timecoded (the
 *  assembly's resolveDialogueCastPlan.multiSpeaker gate). Bounded to a sane turn count for cost. */
export function dialogueStemsViable(turns: readonly (CastTurn & { startSec?: number | null })[]): boolean {
  const t = (turns ?? []).filter((x) => x && (x.speaker ?? '').trim());
  if (t.length < 2 || t.length > 16) return false;
  if (!t.every((x) => typeof x.startSec === 'number' && Number.isFinite(x.startSec))) return false;
  return new Set(t.map((x) => (x.speaker ?? '').trim().toLowerCase())).size >= 2;
}

/**
 * DAY-4/5 — render TIMECODED per-speaker dialogue STEMS for the multi-voice spatial premix. Each line is
 * synthesised ONCE in its cast voice (castRoster) and uploaded as its own stem; the same buffers are also
 * concatenated into a `mergedUrl` single-track fallback (so no line is rendered twice). Returns null when the
 * turns aren't multi-voice-viable (→ caller uses generateDialogueVoiceover's single track) or any leg misses,
 * so the film ALWAYS gets a voice track. Casting only picks voice IDs — stability 0.48 is untouched.
 */
export async function generateDialogueStems(opts: {
  turns: (CastTurn & { startSec?: number | null })[];
  compositeId: string;
}): Promise<DialogueStemsResult | null> {
  try {
    const turns = (opts.turns ?? []).filter((t) => t && (t.speaker ?? '').trim());
    if (!dialogueStemsViable(turns)) return null;
    const roster = castRoster(turns);
    const rendered = await Promise.all(turns.map(async (t, i) => {
      const speaker = (t.speaker ?? '').trim().toLowerCase();
      const cast = roster.get(speaker);
      const text = sanitizeSpokenText(t.text).slice(0, 400);
      if (!text) return null;
      const audio = await synthesizeVoiceover(text, cast?.voiceId ?? pickNarratorVoiceId(cast?.gender ?? 'female'), (cast?.gender ?? 'female') === 'male' ? 'MALE' : 'FEMALE').catch(() => null);
      if (!audio) return null;
      const path = `${opts.compositeId}/dstem-${i}-${speaker.replace(/[^a-z0-9]+/gi, '').slice(0, 16) || 'x'}.mp3`;
      const url = await uploadAndSign('renders', path, audio.base64, audio.contentType, 7200);
      return url ? { url, speaker: t.speaker, startSec: t.startSec as number, buf: Buffer.from(audio.base64, 'base64') } : null;
    }));
    // Every turn must have produced a stem (the assembly's 1:1 stem↔entry guard) — else fall back to merged.
    if (rendered.some((r) => !r)) return null;
    const ok = rendered as { url: string; speaker: string; startSec: number; buf: Buffer }[];
    const stems: DialogueStem[] = ok.map(({ url, speaker, startSec }) => ({ url, speaker, startSec }));
    // Merged single-track fallback from the SAME buffers (no re-render).
    const mergedPath = `${opts.compositeId}/dialogue.mp3`;
    const mergedUrl = (await uploadAndSign('renders', mergedPath, Buffer.concat(ok.map((r) => r.buf)).toString('base64'), 'audio/mpeg', 7200)) ?? null;
    return { stems, mergedUrl };
  } catch {
    return null;
  }
}

/**
 * ⚠️ ElevenLabs refuses a sound-generation `text` over 450 characters (`400 text_too_long`): the brief was cut at 280 but
 * the fixed words around it add 181, so a full brief sent 461 and the film lost its whole ambience bed (live E2E
 * 2026-10-17, film B). The brief now gets only the room the fixed words leave.
 */
export const SFX_TEXT_MAX = 450;
const SFX_HEAD = 'Cinematic, immersive sound design and ambience for this film scene: ';
const SFX_TAIL = '. Layered environmental sound effects and foley that fit the location and action. No music, no melody, no speech.';
export function sfxPromptText(brief: string): string {
  return `${SFX_HEAD}${brief.slice(0, SFX_TEXT_MAX - SFX_HEAD.length - SFX_TAIL.length)}${SFX_TAIL}`;
}

/**
 * Synthesise a cinematic SOUND-DESIGN / ambience track via the ElevenLabs
 * sound-generation API (text → layered SFX, foley, atmosphere). The FFmpeg master
 * mixes this UNDER the music so the film has real environmental sound, not just a
 * score. Fail-open: any miss returns null and the film keeps its music-only mix.
 */
async function synthesizeSfx(brief: string, totalSec: number): Promise<{ base64: string; contentType: string } | null> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return null;
  // The sound-generation endpoint caps at 22s; ask for as much as fits the film.
  const duration = Math.max(8, Math.min(22, Math.round(totalSec)));
  const text = sfxPromptText(brief);
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 40_000);
  try {
    const res = await fetch('https://api.elevenlabs.io/v1/sound-generation', {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text, duration_seconds: duration, prompt_influence: 0.4 }),
      signal: ac.signal,
    });
    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.warn(`[sfx] ElevenLabs sound generation refused: ${await elevenLabsRefusal(res)}`);
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength < 1024) return null;
    return { base64: buf.toString('base64'), contentType: 'audio/mpeg' };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * End-to-end SFX leg: brief → sound design → hosted signed URL. Always resolves;
 * returns null (never throws) so the caller falls back to the music-only mix.
 */
export async function generateFilmSfx(opts: {
  brief: string;
  totalSec: number;
  compositeId: string;
}): Promise<string | null> {
  try {
    const audio = await synthesizeSfx(opts.brief, opts.totalSec);
    if (!audio) return null;
    const path = `${opts.compositeId}/sfx.mp3`;
    return (await uploadAndSign('renders', path, audio.base64, audio.contentType, 7200)) ?? null;
  } catch {
    return null;
  }
}
