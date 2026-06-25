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
import Anthropic from '@anthropic-ai/sdk';
import { selectTtsModel, voiceSettingsForModel, isGeorgianText } from '@/lib/audio/tts-model';
import { synthesizeGoogleTts, genderForPersona, type TtsGender } from '@/lib/audio/google-tts';
import { synthesizeAzureGeorgian, azureTtsConfigured } from '@/lib/audio/azure-tts';
import { KA_VOICE_MALE, KA_VOICE_FEMALE, georgianVoiceId } from '@/lib/audio/georgian-voice';
import { uploadAndSign } from '@/lib/orchestrator/storage-adapter';

/** Same model ladder the script agent uses, so narration matches the storyboard's voice. */
const NARRATION_MODEL =
  process.env.ANTHROPIC_SCRIPT_MODEL ?? process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5-20251001';

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
    'announc', 'sportscast', 'play[- ]?by[- ]?play', 'spoken', 'dialogue', 'speaks',
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
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  // ~2.4 spoken words/sec is a comfortable broadcast pace; keep it tight so the
  // synthesised track does not overrun the stitched cut.
  const targetWords = Math.max(12, Math.round(totalSec * 2.4));
  try {
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model: NARRATION_MODEL,
      max_tokens: 500,
      system: [
        'You are a professional voice-over scriptwriter for short cinematic videos.',
        'Output ONLY the words to be spoken aloud — no scene numbers, no stage directions,',
        'no speaker labels, no quotation marks, no markdown, no notes.',
        'Write in the SAME language as the brief (Georgian brief → Georgian; English → English; Russian → Russian).',
        'One continuous, energetic, vivid spoken piece tied to the on-screen action that reads naturally within the given duration.',
      ].join(' '),
      messages: [{
        role: 'user',
        content:
          `Brief: "${brief.trim()}"\n` +
          `Spoken duration: about ${totalSec} seconds (~${targetWords} words).\n` +
          'Write the voice-over narration now — spoken words only.',
      }],
    });
    const text = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();
    // Strip accidental wrapping quotes / smart-quotes the model sometimes adds.
    const cleaned = text.replace(/^["'“”«»\s]+|["'“”«»\s]+$/g, '').trim();
    if (cleaned.length < 3) return null;
    // Hard cap so a runaway response can never produce a minutes-long track.
    return cleaned.slice(0, 800);
  } catch {
    return null;
  }
}

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
 * Synthesise via Google Cloud TTS — used as the GEORGIAN-NATIVE fallback. Google
 * ships voices trained on ka-GE (Chirp3-HD / Neural2), which sound far more human
 * than ElevenLabs' non-native multilingual approximation. Returns null on any miss.
 */
async function synthesizeViaGoogle(text: string, gender?: TtsGender): Promise<{ base64: string; contentType: string } | null> {
  const audio = await synthesizeGoogleTts(text, { gender });
  if (!audio) return null;
  const buf = Buffer.from(audio);
  if (buf.byteLength < 1024) return null;
  return { base64: buf.toString('base64'), contentType: 'audio/mpeg' };
}

async function synthesizeVoiceover(
  text: string,
  voiceIdOverride?: string | null,
  gender?: TtsGender,
): Promise<{ base64: string; contentType: string } | null> {
  const georgian = isGeorgianText(text);
  const apiKey = process.env.ELEVENLABS_API_KEY;

  // PRIMARY: ElevenLabs. For Georgian the caller passes a CLONED native-Georgian
  // voice (KA_VOICE_DEFAULTS — real Georgian speakers, IVC) read on eleven_v3 (the
  // ka-capable model) → natural, accent-free, and the user's own chosen voices.
  // For non-Georgian it's the configured voice on turbo. Azure (generic native ka)
  // and Google are fallbacks only, so the cloned voices always win for Georgian.
  if (apiKey) {
    const voiceId =
      (voiceIdOverride && voiceIdOverride.trim() ? voiceIdOverride.trim() : null) ??
      ((georgian && process.env.ELEVENLABS_GEORGIAN_VOICE_ID
        ? process.env.ELEVENLABS_GEORGIAN_VOICE_ID
        : undefined) ?? process.env.ELEVENLABS_VOICE_ID);
    if (voiceId) {
      const modelId = selectTtsModel(text);
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 30_000);
      try {
        const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
          method: 'POST',
          headers: {
            'xi-api-key': apiKey,
            'Content-Type': 'application/json',
            Accept: 'audio/mpeg',
          },
          body: JSON.stringify({
            text,
            model_id: modelId,
            voice_settings: voiceSettingsForModel(modelId),
          }),
          signal: ac.signal,
        });
        if (res.ok) {
          const buf = Buffer.from(await res.arrayBuffer());
          // Guard against an empty / error-page body masquerading as audio.
          if (buf.byteLength >= 1024) return { base64: buf.toString('base64'), contentType: 'audio/mpeg' };
        }
      } catch {
        /* fall through to the Google fallback below */
      } finally {
        clearTimeout(timer);
      }
    }
  }

  // Fallback when ElevenLabs is absent/down. For Georgian, Azure native ka voices
  // (Eka/Giorgi) come before Google.
  if (georgian && azureTtsConfigured()) {
    const a = await synthesizeAzureGeorgian(text, gender === 'MALE' ? 'male' : 'female');
    if (a) {
      const buf = Buffer.from(a);
      if (buf.byteLength >= 512) return { base64: buf.toString('base64'), contentType: 'audio/mpeg' };
    }
  }
  const g = await synthesizeViaGoogle(text, gender);
  if (g) return g;
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
 * End-to-end commentator leg: brief → narration → speech → hosted signed URL.
 * Always resolves; returns null (never throws) on any failure so the caller can
 * fall back to the music-only timeline with zero behavioural change.
 */
export async function generateFilmVoiceover(opts: {
  brief: string;
  totalSec: number;
  compositeId: string;
  /** Verbatim dialogue the user typed in the video panel — spoken as-is, no rewrite. */
  narrationScript?: string | null;
  /** Explicit narrator gender from the video panel (👩/👨). Overrides brief auto-detect. */
  narratorGender?: 'male' | 'female' | null;
}): Promise<string | null> {
  try {
    const custom = opts.narrationScript && opts.narrationScript.trim() ? opts.narrationScript.trim().slice(0, 600) : null;
    const script = custom ?? (await generateNarrationScript(opts.brief, opts.totalSec));
    if (!script) return null;
    // Explicit panel choice wins; otherwise pick a voice that fits the protagonist
    // (male/female/child/elder/young) auto-detected from the brief.
    const voiceId = opts.narratorGender ? pickNarratorVoiceId(opts.narratorGender) : pickGeorgianVoiceId(opts.brief);
    const ttsGender: TtsGender = opts.narratorGender
      ? (opts.narratorGender === 'male' ? 'MALE' : 'FEMALE')
      : genderForPersona(detectPersona(opts.brief));
    const audio = await synthesizeVoiceover(script, voiceId, ttsGender);
    if (!audio) return null;
    // 2-hour signed URL — comfortably outlives the render + assemble window.
    const path = `${opts.compositeId}/voiceover.mp3`;
    return (await uploadAndSign('renders', path, audio.base64, audio.contentType, 7200)) ?? null;
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
  script: string;
  compositeId: string;
}): Promise<string | null> {
  try {
    const turns = parseDialogueScript(opts.script).slice(0, 12); // bound the track + cost
    if (!turns.length) return null;
    const segments = await Promise.all(
      turns.map((turn) => {
        const text = turn.text.slice(0, 400);
        if (!text) return Promise.resolve<{ base64: string; contentType: string } | null>(null);
        return synthesizeVoiceover(text, pickNarratorVoiceId(turn.gender), turn.gender === 'male' ? 'MALE' : 'FEMALE').catch(() => null);
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
  const text =
    `Cinematic, immersive sound design and ambience for this film scene: ${brief.slice(0, 280)}. ` +
    `Layered environmental sound effects and foley that fit the location and action. No music, no melody, no speech.`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 40_000);
  try {
    const res = await fetch('https://api.elevenlabs.io/v1/sound-generation', {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text, duration_seconds: duration, prompt_influence: 0.4 }),
      signal: ac.signal,
    });
    if (!res.ok) return null;
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
