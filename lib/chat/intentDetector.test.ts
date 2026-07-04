import { detectIntent, isGenerativeCommand } from './intentDetector';

/**
 * Pins the STEP-1 autonomous chat dispatch contract (OmniStudio send()). The client dispatches a chat
 * message to a paid generator ONLY when it is an imperative generate COMMAND AND classifies as media:
 *   dispatch(msg) === isGenerativeCommand(msg) && detectIntent(msg).intent ∈ {image,music,video} && conf>=0.7
 * isGenerativeCommand is an ALLOWLIST (must LEAD with a generate verb) so questions, declaratives,
 * complaints, comparisons and deliberations — the false-positive-hijack classes two adversarial
 * reviews surfaced — never auto-spend a credit. Every case below was flagged by those reviews.
 */
const DISPATCHABLE = ['image_generation', 'music_generation', 'video_generation'] as const;
const wouldDispatch = (msg: string): boolean => {
  if (!isGenerativeCommand(msg)) return false; // dispatch-site allowlist
  const d = detectIntent(msg);
  return (DISPATCHABLE as readonly string[]).includes(d.intent) && d.confidence >= 0.7;
};

describe('intentDetector — autonomous chat dispatch classification', () => {
  it('classifies explicit generative asks to the right modality at high confidence (>=0.7)', () => {
    expect(detectIntent('generate a majestic tiger image')).toMatchObject({ intent: 'image_generation' });
    expect(detectIntent('generate a majestic tiger image').confidence).toBeGreaterThanOrEqual(0.7);
    expect(detectIntent('make an epic lofi hip hop beat').intent).toBe('music_generation');
    expect(detectIntent('create a 30 second promo video for my shop').intent).toBe('video_generation');
  });

  it('DISPATCHES imperative generate commands (incl. polite, mid-sentence "how", quality descriptors)', () => {
    for (const m of [
      'generate a majestic tiger image',
      'make an epic lofi hip hop beat',
      'create a 30 second promo video for my shop',
      'compose an ambient cinematic track',
      'render an illustration of a castle at dawn',
      'make a song about how love works',                                  // mid-sentence "how" must NOT block
      'can you make me a tiger image?',                                     // polite generate + '?' still dispatches
      'please generate a poster for my cafe',
      'make a poster that looks better',                                    // fresh generate + quality descriptor
      'generate an image of a cat but make it look better than the last one', // iterating on a prior result
    ]) {
      expect(wouldDispatch(m)).toBe(true);
    }
  });

  it('does NOT hijack questions / declaratives / complaints / comparisons / mixing', () => {
    for (const q of [
      // review round 1 — verb-then-noun interrogatives
      'how do I create an image in Photoshop?',
      "what's the best way to render an image?",
      'should I make a poster or a banner?',
      'explain how flux works',
      'make my song sound better',                                         // edit of an EXISTING asset
      'can you explain how to compose a track?',
      // review round 2 — declaratives / complaints / comparisons / deliberation / bare keywords
      'is flux better than sdxl for portraits',
      'my client asked for a music video',
      'the app wont let me generate a video',
      "i cant decide whether to generate a poster or a banner",
      // plain non-generative chat
      "what's a good image editing app?",
      'tell me about the history of jazz music',
      'hello, how are you today?',
      'summarize this document for me',
    ]) {
      expect(wouldDispatch(q)).toBe(false);
    }
  });

  it('empty / whitespace → text_chat (safe default, streams normally)', () => {
    expect(detectIntent('').intent).toBe('text_chat');
    expect(wouldDispatch('   ')).toBe(false);
  });
});
