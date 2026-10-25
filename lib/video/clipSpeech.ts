/**
 * lib/video/clipSpeech.ts — read a direct clip's prompt (lib/video/clipPrompt): its faithful English, the words its
 * characters say, and who says them. Server-only; one Gemini Flash call on Vertex, JSON out.
 *
 * ⚠️ A READER, NOT A DIRECTOR. The film pipeline's director wrote new English scene scripts from the user's words, and
 * the clip came out a different story (GG, 2026-10-25 16:10Z). This call only translates and points at the spoken words:
 * it is told to add nothing, and the words a character says are kept verbatim in the user's language.
 *
 * FAIL-OPEN, LIKE promptToEnglish: no transport, a timeout or an answer of the wrong shape falls back to the lines in quote
 * marks and lib/ai/promptToEnglish's translation (which keeps quoted words verbatim) — never a failed clip.
 */
import 'server-only';
import { promptToEnglish } from '@/lib/ai/promptToEnglish';
import { googleTransportBlocker } from '@/lib/ai/google/transport';
import { generateWithGemini } from '@/lib/gemini/client';
import { parseClipReading, quotedLines, type ClipReading } from './clipPrompt';

const READER_SYSTEM = [
  'You prepare a user\'s video prompt for Google Veo, which makes ONE short clip. Answer with JSON only:',
  '{"english": string, "lines": string[], "speaker": "male" | "female" | "unknown", "silent": boolean}.',
  '"english": a faithful, literal English translation of the WHOLE prompt. Add nothing and remove nothing: no new story,',
  'characters, places, actions, camera moves, music or style the user did not write. Keep every detail the user gave.',
  'Wherever a character says something aloud, write the marker [LINE 1], [LINE 2] … in place of the spoken words, and keep',
  'who says it and how (for example: The old man smiles and says [LINE 1]).',
  '"lines": the exact words each character says aloud, in order, VERBATIM in the user\'s own language and spelling — never',
  'translated. If the user only reports speech (for example "he says that he is happy"), write the shortest natural',
  'first-person line in the user\'s language for it. Empty when nobody speaks.',
  '"speaker": the gender of who speaks, from the prompt; "unknown" when it does not say.',
  '"silent": true only when nobody in the prompt speaks, talks, sings or chats.',
].join(' ');

/** The prompt's reading. Never throws. A line too long for the clip is the route's to refuse (CLIP_SPEECH_MAX_CHARS). */
export async function readClipPrompt(prompt: string): Promise<ClipReading> {
  return (await viaGemini(prompt)) ?? fallback(prompt);
}

async function viaGemini(prompt: string): Promise<ClipReading | null> {
  if (googleTransportBlocker()) return null;
  try {
    const r = await generateWithGemini({
      prompt: `Video prompt:\n${prompt}`, systemPrompt: READER_SYSTEM, tier: 'flash',
      maxTokens: 700, temperature: 0, thinkingBudget: 0, timeoutMs: 12_000, responseMimeType: 'application/json',
    });
    const reading = parseClipReading((r.text || '').trim());
    // eslint-disable-next-line no-console
    if (!reading) console.warn('[video.clip] prompt reader answered off-shape; falling back to quoted lines');
    return reading;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[video.clip] prompt reader failed:', e instanceof Error ? e.message.slice(0, 160) : String(e).slice(0, 160));
    return null;
  }
}

/** The quoted lines stay verbatim; the rest is promptToEnglish's literal translation (itself fail-open to the original). */
async function fallback(prompt: string): Promise<ClipReading> {
  const { marked, lines } = quotedLines(prompt);
  const english = await promptToEnglish(marked, 'video');
  return { english: english.trim() || marked, lines, speaker: null, silent: false };
}
