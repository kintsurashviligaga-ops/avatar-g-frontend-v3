export type InteractionMode = 'dictation' | 'live' | 'read-aloud';
export interface SpeechPresentation { displayText: string; spokenResponse: string | null; }
/** Extractive fallback only, never a fabricated outcome or a substitute for an explicit full reading. */
export function conciseSpeech(text: string): string {
  const clean = text.replace(/```[\s\S]*?```/g, ' ')
    .replace(/\[(?:laughs?|chuckles?|whispers?|sighs?|pause|laughter)\]/gi, ' ')
    .replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/^[ \t]*(?:#{1,6}|[-*+] |\d+[.)] )/gm, '')
    .replace(/[*_`~]/g, '').replace(/\s+/g, ' ').trim();
  const sentences = clean.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
  let out = '';
  for (const sentence of sentences.slice(0, 3)) {
    if ((out + sentence).length > 480) break;
    out += sentence;
  }
  // Do not cut a number, price, negation or technical claim mid-sentence.
  return out.trim();
}
export function speechPresentation(input: {
  displayText: string; spokenResponse?: string; mode: InteractionMode; nativeAudioActive?: boolean; selectedText?: string;
}): SpeechPresentation {
  const spokenResponse = input.nativeAudioActive || input.mode === 'dictation' ? null
    : input.mode === 'read-aloud' ? input.selectedText ?? input.displayText
    : conciseSpeech(input.spokenResponse ?? input.displayText);
  return { displayText: input.displayText, spokenResponse };
}
