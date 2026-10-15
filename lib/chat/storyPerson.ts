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

/**
 * Output budget of the two yes/no classifiers below. The JSON answer is a handful of tokens, but the flash tier is a
 * thinking model: llmText asks for thinkingBudget 0, and a model that still spends a few thinking tokens counts them
 * against maxOutputTokens. At 20 the budget could run out before any text, Gemini answered with an empty reply, and the
 * caller fell back to its old behaviour. Seen in Production on 2026-10-15 18:17Z: the re-stage check of a brief that
 * asked for a black jacket on a black background missed, and the storyboard opened on the raw selfie. A bigger cap costs
 * nothing (billing is per token produced) and leaves room for the answer.
 */
const CLASSIFIER_MAX_TOKENS = 256;

const SYSTEM =
  'You read a short video brief (any language: Georgian, English, Russian …) and decide one thing: will at least one HUMAN ' +
  'being be visible on screen? Count a person, people, a crowd, a singer or performer, a presenter, the user themselves ' +
  '("me", "my avatar"), hands or a body part of a person, and a theme that needs people (a love song, friendship, a family). ' +
  'Do NOT count animals (even talking or dressed ones), objects, vehicles, food, landscapes, buildings, nature or abstract ' +
  'visuals. Reply with JSON only: {"person": true} or {"person": false}.';

/** A yes/no classifier's reply → true / false, or null when it says neither clearly. `key` names the JSON field. */
function parseVerdict(raw: string | null | undefined, key: string): boolean | null {
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  if (!text) return null;
  try {
    const o = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, '')) as unknown;
    if (o && typeof o === 'object' && typeof (o as Record<string, unknown>)[key] === 'boolean') return (o as Record<string, boolean>)[key]!;
  } catch { /* not JSON — try the bare words below */ }
  const word = text.toLowerCase().replace(/[^a-z]/g, '');
  if (word === 'yes' || word === 'true') return true;
  if (word === 'no' || word === 'false') return false;
  return null;
}

/** The person classifier's reply → true / false, or null when it says neither clearly. */
export function parsePersonVerdict(raw: string | null | undefined): boolean | null {
  return parseVerdict(raw, 'person');
}

/** true = a person is on screen, false = nobody is, null = unknown (the caller keeps its old behaviour). */
export async function storyFeaturesPerson(brief: string): Promise<boolean | null> {
  const text = String(brief || '').trim().slice(0, 1500);
  if (!text) return null;
  try {
    const raw = await llmText({ system: SYSTEM, user: text, json: true, temperature: 0, maxTokens: CLASSIFIER_MAX_TOKENS, timeoutMs: 8000 });
    return parsePersonVerdict(raw);
  } catch {
    return null;
  }
}

/**
 * How a frame uses an uploaded photo: the PERSON is the reference's, the scene is the shot's. It used to say "identical
 * face, hair, skin tone, facial features and wardrobe as the reference", so a selfie in a T-shirt on a street at night
 * came back in that T-shirt for a brief that asked for a jacket on a black background. The face stays locked; the
 * clothing follows the shot when the shot names it, and the photo's own background and light never enter the frame.
 */
export const REFERENCE_PERSON_CLAUSE =
  'Featuring the EXACT same person as the reference image — identical face, hair, skin tone and facial features. ' +
  'The person wears the clothing this shot describes (the reference\'s own clothing only when the shot names none), ' +
  'and the background, location and lighting are the ones this shot describes, not the reference photo\'s.';

const RESTAGE_SYSTEM =
  'Someone uploaded ONE photo of a person and wrote a short brief (any language: Georgian, English, Russian …) for a video ' +
  'that stars that person. Decide one thing: does the brief say WHERE the person is (a background, a set, a place or a ' +
  'setting: a black background, a studio, a stage, a beach, a city street, an office) or WHAT they wear (clothing, a ' +
  'costume, a jacket, a suit)? Actions, gestures, speech, mood and camera moves alone do NOT count. ' +
  'Reply with JSON only: {"restage": true} or {"restage": false}.';

/**
 * Words that can only mean the brief names the person's place or clothes (KA / EN / RU). Read ONLY when the classifier
 * gives no answer: an explicit "შავ პიჯაკში შავ ფონზე" / "a black jacket on a black background" is not a judgement call,
 * so a Gemini miss must not open the film on the raw photo for it. Narrow on purpose: "სცენა" (scene AND stage) and other
 * words a brief uses about the film itself are left out, and a brief that names neither stays unknown (photo kept).
 */
const SETTING_OR_WARDROBE: readonly RegExp[] = [
  // Georgian: background (a whole word: "ტელეფონზე" and "მიკროფონი" contain the same letters), then t-shirt, jacket, coat,
  // suit/costume, shirt, tie, dress, clothing, studio, office, beach, street.
  /(?<!\p{L})ფონ(?:ზე|ი|ად|ში)(?!\p{L})|მაისურ|პიჯაკ|ქურთუკ|კოსტიუმ|პერანგ|ჰალსტუხ|კაბაში|კაბით|ტანსაცმ|სტუდიაში|სტუდიის|ოფისში|პლაჟზე|ქუჩაში/u,
  /\b(?:background|backdrop|jacket|blazer|suits?|t-?shirts?|shirts?|dress(?:es|ed)?|hoodie|outfit|costume|wearing|studio|office|beach|street)\b/i,
  // Russian, with letter boundaries (\b does not see Cyrillic; "телефон" and "фонтан" must not read as "фон").
  /(?<!\p{L})(?:фон[еау]?(?!\p{L})|пиджак|куртк|костюм|футболк|рубашк|плать|одет|студи|офис|пляж|улиц)/iu,
];

/** Does the brief itself name a place or clothes for the person, in so many words? (The classifier's fallback only.) */
export function briefNamesSettingOrWardrobe(brief: string): boolean {
  const text = String(brief || '');
  return SETTING_OR_WARDROBE.some((re) => re.test(text));
}

/** The re-stage classifier's reply → true / false, or null when it says neither clearly. */
export function parseRestageVerdict(raw: string | null | undefined): boolean | null {
  return parseVerdict(raw, 'restage');
}

/**
 * Does the brief put the photographed person somewhere else, or in other clothes? Asked once, when exactly ONE photo is
 * uploaded, before the storyboard makes that photo the film's first frame.
 *
 * ⚠️ WHY: a single photo used to BE scene 1, unchanged (the "Source Reference Locked" opening), and every clip starts from
 * its scene's frame. So a selfie taken in a T-shirt on a street at night opened a film whose brief asked for a black
 * jacket on a black background: the first eight seconds were the street. When the brief restages the person, scene 1 is
 * drawn like every other scene instead: the same face from the photo, in the brief's place and clothes.
 *
 * Gemini only (lib/ai/llmText). FAIL DIRECTION: unknown (no key, an error, an unreadable answer) is `null`, and the caller
 * keeps the photo as scene 1, so a flaky classifier can never take the user's own photo out of a film that wanted it —
 * unless the brief names the place or the clothes in so many words (briefNamesSettingOrWardrobe), which needs no model.
 */
export async function briefRestagesPhoto(brief: string): Promise<boolean | null> {
  const text = String(brief || '').trim().slice(0, 1500);
  if (!text) return null;
  let verdict: boolean | null = null;
  try {
    const raw = await llmText({ system: RESTAGE_SYSTEM, user: text, json: true, temperature: 0, maxTokens: CLASSIFIER_MAX_TOKENS, timeoutMs: 8000 });
    verdict = parseRestageVerdict(raw);
  } catch {
    verdict = null;
  }
  // The classifier's answer stands when it gives one. Without one, a brief that names the place or the clothes outright
  // is still a re-stage; anything else stays unknown and the caller keeps the photo as scene 1.
  if (verdict !== null) return verdict;
  return briefNamesSettingOrWardrobe(text) ? true : null;
}
