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
async function synthesizeVoiceover(text: string): Promise<{ base64: string; contentType: string } | null> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return null;
  const georgian = isGeorgianText(text);
  const voiceId =
    (georgian && process.env.ELEVENLABS_GEORGIAN_VOICE_ID
      ? process.env.ELEVENLABS_GEORGIAN_VOICE_ID
      : undefined) ?? process.env.ELEVENLABS_VOICE_ID;
  if (!voiceId) return null;
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
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    // Guard against an empty / error-page body masquerading as audio.
    if (buf.byteLength < 1024) return null;
    return { base64: buf.toString('base64'), contentType: 'audio/mpeg' };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
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
}): Promise<string | null> {
  try {
    const script = await generateNarrationScript(opts.brief, opts.totalSec);
    if (!script) return null;
    const audio = await synthesizeVoiceover(script);
    if (!audio) return null;
    // 2-hour signed URL — comfortably outlives the render + assemble window.
    const path = `${opts.compositeId}/voiceover.mp3`;
    return (await uploadAndSign('renders', path, audio.base64, audio.contentType, 7200)) ?? null;
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
