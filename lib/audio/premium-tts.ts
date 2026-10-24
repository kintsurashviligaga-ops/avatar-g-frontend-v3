'use client';

/**
 * lib/audio/premium-tts.ts — read-aloud for the older chat screens, on the page's one player (lib/speech/player).
 *
 * It used to own a second <audio> element, read only the first 800 characters of a reply, and could play over the
 * studio's read. Now it starts the shared player: the whole text is read in sentence chunks, a chunk that fails stops
 * the read there instead of being skipped, and any other read (or Live taking the microphone) stops this one. Gemini TTS
 * on Vertex only, through /api/tts/gemini: no other provider and never a browser voice.
 */
import type { SpeechLocale } from '@/lib/speech/contract';
import { speechPlayer } from '@/lib/speech/player';

/** The owner of a read started here (the speech-mode replies of the older chat screens). */
export const PREMIUM_OWNER = 'premium';

/** Read `text` aloud, stopping whatever else is being read. Not inside a tap? The element was unlocked by an earlier one. */
export function speakPremium(text: string, locale: SpeechLocale = 'ka'): void {
  speechPlayer().play({ owner: PREMIUM_OWNER, text, locale });
}

/** Stop the read started by speakPremium; a read another button started is left alone. */
export function stopPremium(): void {
  speechPlayer().stop(PREMIUM_OWNER);
}
