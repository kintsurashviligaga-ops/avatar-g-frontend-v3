export type AgentGTone = 'happy' | 'neutral' | 'stressed' | 'angry' | 'sad';

export type ToneDetection = {
  tone: AgentGTone;
  confidence: number;
  emojiHint?: boolean;
};

const HAPPY_KEYWORDS = [
  'მადლობა',
  'გილოცავ',
  'სუპერ',
  'მაგარია',
  'ძალიან კარგი',
  'happy',
  'great',
  'awesome',
  'thanks',
  'congrats',
  'yay',
];

const STRESSED_KEYWORDS = [
  'ნერვიულობ',
  'ვნერვიულობ',
  'ვნერვიულობდი',
  'მეშინია',
  'panic',
  'stressed',
  'anxious',
  'overwhelmed',
  'stress',
];

const ANGRY_KEYWORDS = [
  'გაბრაზებული',
  'გაბრაზდი',
  'ვბრაზობ',
  'გაბრაზება',
  'angry',
  'mad',
  'furious',
  'annoyed',
  'hate this',
];

const SAD_KEYWORDS = [
  'მოწყენილი',
  'ცუდად ვარ',
  'გულდაწყვეტილი',
  'დავიღალე',
  'sad',
  'depressed',
  'down',
  'tired of this',
  'hopeless',
];

function includesAny(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

function clamp(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return Number(value.toFixed(2));
}

export function detectTone(text: string): ToneDetection {
  const normalized = String(text || '').trim();
  if (!normalized) {
    return { tone: 'neutral', confidence: 0.3 };
  }

  const lower = normalized.toLowerCase();
  const exclamations = (normalized.match(/!/g) || []).length;
  const hasEmoji = /[\u{1F300}-\u{1FAFF}]/u.test(normalized);
  const uppercaseWords = normalized.match(/\b[A-Z]{3,}\b/g) || [];
  const isCapsHeavy = uppercaseWords.length >= 2;

  if (includesAny(lower, ANGRY_KEYWORDS) || exclamations >= 3 || isCapsHeavy) {
    return { tone: 'angry', confidence: clamp(0.88 + (exclamations >= 5 ? 0.07 : 0)), emojiHint: hasEmoji };
  }

  if (includesAny(lower, STRESSED_KEYWORDS) || /\?{2,}/.test(normalized)) {
    return { tone: 'stressed', confidence: clamp(0.82), emojiHint: hasEmoji };
  }

  if (includesAny(lower, SAD_KEYWORDS)) {
    return { tone: 'sad', confidence: clamp(0.84), emojiHint: hasEmoji };
  }

  if (includesAny(lower, HAPPY_KEYWORDS) || hasEmoji || exclamations >= 1) {
    return { tone: 'happy', confidence: clamp(0.78 + (exclamations >= 2 ? 0.08 : 0)), emojiHint: hasEmoji };
  }

  return { tone: 'neutral', confidence: 0.6, emojiHint: hasEmoji || undefined };
}
