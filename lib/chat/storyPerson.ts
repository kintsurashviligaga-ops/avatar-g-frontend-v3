/**
 * Does this film brief put a PERSON on screen? Asked once, before the storyboard's character-anchor portrait.
 *
 * ⚠️ WHY: the anchor is "a head-and-shoulders close-up of the SINGLE main character in this story", and every storyboard
 * frame is then drawn "featuring the EXACT same person as the reference image". A brief with no person in it ("a red paper
 * boat drifts across a pond to a dock where a grey cat watches") still got a portrait — the image model can only answer
 * that request with a human — and that invented woman was put into every frame, and from the frames into every Veo clip.
 * Seen in the paid Production film of 2026-10-15 (16:11Z): a woman in a green sweater the brief never mentioned.
 *
 * One Gemini flash call (lib/ai/llmText — Gemini only, no other provider). FAIL DIRECTION: a miss (no key, an error, an
 * unreadable answer) is `null`, and the caller keeps the old behaviour (draw the anchor). Only a clear "no person"
 * skips it, so a brief that does feature someone can never lose its identity lock to a flaky classifier.
 */
import 'server-only';
import { llmText } from '@/lib/ai/llmText';

const SYSTEM =
  'You read a short video brief (any language: Georgian, English, Russian …) and decide one thing: will at least one HUMAN ' +
  'being be visible on screen? Count a person, people, a crowd, a singer or performer, a presenter, the user themselves ' +
  '("me", "my avatar"), hands or a body part of a person, and a theme that needs people (a love song, friendship, a family). ' +
  'Do NOT count animals (even talking or dressed ones), objects, vehicles, food, landscapes, buildings, nature or abstract ' +
  'visuals. Reply with JSON only: {"person": true} or {"person": false}.';

/** The classifier's reply → true / false, or null when it says neither clearly. */
export function parsePersonVerdict(raw: string | null | undefined): boolean | null {
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  if (!text) return null;
  try {
    const o = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, '')) as unknown;
    if (o && typeof o === 'object' && typeof (o as { person?: unknown }).person === 'boolean') return (o as { person: boolean }).person;
  } catch { /* not JSON — try the bare words below */ }
  const word = text.toLowerCase().replace(/[^a-z]/g, '');
  if (word === 'yes' || word === 'true') return true;
  if (word === 'no' || word === 'false') return false;
  return null;
}

/** true = a person is on screen, false = nobody is, null = unknown (the caller keeps its old behaviour). */
export async function storyFeaturesPerson(brief: string): Promise<boolean | null> {
  const text = String(brief || '').trim().slice(0, 1500);
  if (!text) return null;
  try {
    const raw = await llmText({ system: SYSTEM, user: text, json: true, temperature: 0, maxTokens: 20, timeoutMs: 8000 });
    return parsePersonVerdict(raw);
  } catch {
    return null;
  }
}
