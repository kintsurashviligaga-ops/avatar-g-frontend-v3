/**
 * A Live answer that OFFERS to start a render — or sends the user to a button — when nothing was prepared.
 *
 * ⚠️ GG 2026-10-25, the avatar call: "make a picture" got talk and no function call, so nothing was on screen and
 * nothing docked; an avatar probe the same day answered "5 credits. Shall I start?" the same way. The call's instruction
 * says to call prepare_generation first, but a model sometimes talks instead. The words alone show it, so the app
 * catches the answer and tells the model, once per thing the user said, with an [App] note.
 */

/** "Shall I start?" in the three call languages, as the model says it. */
const START_OFFER: readonly RegExp[] = [
  /დავიწყო(თ)?\s*[?？]/u,
  /გავუშვა\s*[?？]/u,
  /\b(shall|should) i (start|begin|go ahead)\b/i,
  /\bstart it\s*[?？]/i,
  /(запуска(ю|ть)|начина(ю|ть)|начать|запустить)\s*[?？]/iu,
];

/** "Press the button" (either order, within one sentence). */
const PRESS_BUTTON: readonly RegExp[] = [
  /(დააჭირ|დაჭერ)[^.?!]{0,60}ღილაკ|ღილაკ[^.?!]{0,60}(დააჭირ|დაჭერ)/u,
  /\b(press|tap|click|hit)\b[^.?!]{0,60}\bbutton\b|\bbutton\b[^.?!]{0,60}\b(press|tap|click)\b/i,
  /(нажм|нажать|нажимай)[^.?!]{0,60}кнопк|кнопк[^.?!]{0,60}(нажм|нажать|нажимай)/iu,
];

export function offersUnpreparedStart(said: string): boolean {
  const t = typeof said === 'string' ? said : '';
  if (!t.trim()) return false;
  return START_OFFER.some((r) => r.test(t)) || PRESS_BUTTON.some((r) => r.test(t));
}

/** The most notes one call sends: a model that keeps ignoring them is not argued with all call long. */
export const UNPREPARED_START_NOTES_MAX = 3;

export const UNPREPARED_START_NOTE = '[App] Nothing is prepared on the screen: you offered to start, or sent the user to a '
  + 'button, without calling prepare_generation. If the user asked for an image, video, music or an avatar, call '
  + 'prepare_generation now with its prompt and then say the price its answer gives. If they did not, ignore this note and '
  + 'never mention it.';
