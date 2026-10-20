/**
 * lib/chat/filmSceneRedoClient.ts — the studio's half of a scene redo (server: app/api/film/scene/redo, lib/chat/filmSceneRedo).
 *
 * In the chat, „შეცვალე მე-2 სცენა: პური უფრო ახალი იყოს" right after a film (or the film's own edit box naming one scene) is
 * read here as ONE scene to shoot again. Agent G asks first, with the scene's price on its card (GG 2026-10-16: the agent
 * clarifies, the user agrees, then it starts); the card's Create or a „კი" runs it: the scene is rendered again, followed until
 * it lands, and cut into the same film, whose bubble then holds the new cut. Pure parts and an injectable runner, so the
 * whole path is tested without a browser.
 */
import { creditsLabel } from '@/lib/credits/quote';

type Lang = 'ka' | 'en' | 'ru';
const lang = (locale: string | null | undefined): Lang => (locale === 'en' ? 'en' : locale === 'ru' ? 'ru' : 'ka');

// ─── Which scene the words name ─────────────────────────────────────────────────────────────────────────────────

const KA_ORDINAL: ReadonlyArray<[RegExp, number]> = [
  [/პირველ/, 1], [/მეორე/, 2], [/მესამე/, 3], [/მეოთხე/, 4], [/მეხუთე/, 5], [/მეექვსე/, 6], [/მეშვიდე/, 7], [/მერვე/, 8], [/მეცხრე/, 9], [/მეათე/, 10],
];
const EN_ORDINAL: ReadonlyArray<[RegExp, number]> = [
  [/\bfirst\b/, 1], [/\bsecond\b/, 2], [/\bthird\b/, 3], [/\bfourth\b/, 4], [/\bfifth\b/, 5], [/\bsixth\b/, 6], [/\bseventh\b/, 7], [/\beighth\b/, 8],
];
const RU_ORDINAL: ReadonlyArray<[RegExp, number]> = [
  [/перв/, 1], [/втор/, 2], [/трет/, 3], [/четв[её]рт/, 4], [/пят/, 5], [/шест/, 6], [/седьм/, 7], [/восьм/, 8],
];

const SCENE = '(?:scene|სცენ[ა-ჰ]*|сцен[а-яё]*)';

/** A scene number as Georgian writes it before „სცენა": „1-ლი", „მე-2", „მე-12". */
export function kaScene(n: number): string {
  return n === 1 ? '1-ლი' : `მე-${n}`;
}

/** Every scene number the words name („scene 2", „სცენა 2", „მე-2 სცენა", „2-ე სცენა", „1-ლი სცენა", „მეორე სცენა", „second scene", „сцена 2"). */
export function namedScenes(text: string): number[] {
  const t = String(text ?? '').toLowerCase();
  const found = new Set<number>();
  const add = (n: number) => { if (Number.isInteger(n) && n >= 1 && n <= 24) found.add(n); };
  for (const m of t.matchAll(new RegExp(`${SCENE}\\s*(?:#|№|n[o°]\\.?)?\\s*(\\d{1,2})(?!\\d)`, 'g'))) add(Number(m[1]));
  for (const m of t.matchAll(new RegExp(`(?:^|[^\\d])(?:მე-?)?(\\d{1,2})(?:\\s*-?\\s*(?:st|nd|rd|th|ლი|ე|ი|ая|ую|ой|я|й))?\\s+${SCENE}`, 'g'))) add(Number(m[1]));
  for (const m of t.matchAll(new RegExp(`(\\S+)\\s+${SCENE}`, 'g'))) {
    const word = m[1] ?? '';
    for (const [re, n] of [...KA_ORDINAL, ...EN_ORDINAL, ...RU_ORDINAL]) if (re.test(word)) add(n);
  }
  return [...found].sort((a, b) => a - b);
}

const CHANGE_WORDS = [
  /შეცვალ|გადაიღ|გადააკეთ|თავიდან|გაასწორ|გამოასწორ|ხელახლა|გადაარენდერ|ჩაანაცვლ|გააუმჯობეს|უკეთესად|გადაღება/,
  /\b(change|redo|re-do|reshoot|re-shoot|remake|fix|replace|re-?render|regenerate|improve|again|make)\b/,
  /измен|передела|пересн|перегенер|исправ|замен|улучш|заново/,
];

/**
 * The words as a redo of ONE scene of a film of `totalScenes` scenes, or null. They must name exactly one scene of that film
 * and ask for it to change; the words themselves are the note the scene is shot again with.
 */
export function sceneRedoAsk(text: string, totalScenes: number): { ordinal: number; note: string } | null {
  const raw = String(text ?? '').trim();
  if (!raw || raw.length > 600 || !(totalScenes >= 1)) return null;
  const scenes = namedScenes(raw).filter((n) => n <= totalScenes);
  if (scenes.length !== 1) return null;
  const lower = raw.toLowerCase();
  if (!CHANGE_WORDS.some((re) => re.test(lower))) return null;
  return { ordinal: scenes[0]!, note: raw };
}

// ─── What Agent G says ───────────────────────────────────────────────────────────────────────────────────────────

/** A scene's vision grade as the film result carries it (the shape of lib/ai/visionQualityGate SceneQaEntry). */
export interface SceneGrade { ordinal: number; grade: 'A' | 'B' | 'C' | 'F' | null; status?: 'PASS' | 'FAIL' | 'SKIPPED' | 'UNAVAILABLE' }

/**
 * What the per-scene vision check found, said once under the film (audit item 3b): a scene graded F has a real flaw
 * (a warp, a different face), a C one came out weak. A film that can still be changed scene by scene names the
 * command that shoots the weakest one again. Nothing to say → ''.
 */
export function weakScenesText(grades: ReadonlyArray<SceneGrade> | null | undefined, canRedo: boolean, locale: string | null | undefined): string {
  const by = (g: SceneGrade['grade']) => (grades ?? []).filter((q) => q.grade === g && q.status !== 'SKIPPED' && q.status !== 'UNAVAILABLE').map((q) => q.ordinal).sort((a, b) => a - b);
  const flawed = by('F');
  const weak = by('C');
  const unverified = (grades ?? []).filter((q) => q.grade === null || q.status === 'SKIPPED' || q.status === 'UNAVAILABLE').map((q) => q.ordinal).sort((a, b) => a - b);
  if (!flawed.length && !weak.length && !unverified.length) return '';
  const l = lang(locale);
  const list = (ns: number[]) => {
    const words = ns.map((n) => (l === 'ka' ? kaScene(n) : String(n)));
    const and = l === 'en' ? ' and ' : l === 'ru' ? ' и ' : ' და ';
    return words.length > 1 ? `${words.slice(0, -1).join(', ')}${and}${words[words.length - 1]}` : (words[0] ?? '');
  };
  const lines: string[] = [];
  if (flawed.length) {
    lines.push(l === 'en'
      ? `⚠️ The visual check found a real flaw in scene${flawed.length > 1 ? 's' : ''} ${list(flawed)}.`
      : l === 'ru'
        ? `⚠️ Визуальная проверка нашла серьёзный дефект в сцен${flawed.length > 1 ? 'ах' : 'е'} ${list(flawed)}.`
        : `⚠️ ვიზუალურმა შემოწმებამ ${list(flawed)} სცენაში სერიოზული ხარვეზი იპოვა.`);
  }
  if (weak.length) {
    lines.push(l === 'en'
      ? `ℹ️ Scene${weak.length > 1 ? 's' : ''} ${list(weak)} came out weak.`
      : l === 'ru'
        ? `ℹ️ Сцен${weak.length > 1 ? 'ы' : 'а'} ${list(weak)} получил${weak.length > 1 ? 'ись' : 'ась'} слабо.`
        : `ℹ️ ${list(weak)} სცენა სუსტად გამოვიდა.`);
  }
  if (unverified.length) {
    lines.push(l === 'en'
      ? `ℹ️ Visual quality was not verified for scene${unverified.length > 1 ? 's' : ''} ${list(unverified)}.`
      : l === 'ru'
        ? `ℹ️ Качество сцен${unverified.length > 1 ? ' ' : 'ы '}${list(unverified)} визуально не проверено.`
        : `ℹ️ ${list(unverified)} სცენის ვიზუალური ხარისხი შემოწმებული არ არის.`);
  }
  if (canRedo && (flawed.length || weak.length)) {
    const n = flawed[0] ?? weak[0]!;
    lines.push(l === 'en'
      ? `If you like, write “change scene ${n}” and I'll shoot only that scene again at the scene's price.`
      : l === 'ru'
        ? `Если хотите, напишите «измени сцену ${n}», и я пересниму только её по цене сцены.`
        : `თუ გინდა, დაწერე „შეცვალე ${kaScene(n)} სცენა“ და მხოლოდ მას თავიდან გადავიღებ სცენის ფასად.`);
  }
  return lines.join('\n');
}

/** The priced question before a scene is shot again. `credits` 0 (an admin) names no price. */
export function sceneRedoOfferText(ordinal: number, credits: number, locale: string | null | undefined): string {
  const price = creditsLabel(credits, locale ?? 'ka');
  switch (lang(locale)) {
    case 'en':
      return `I'll shoot scene ${ordinal} again with your note and cut it into the same film; the other scenes stay as they are.${credits > 0 ? ` It costs the scene's price, ${price}, and if Google cannot render it, the credits come back.` : ''} Shall I start?`;
    case 'ru':
      return `Пересниму сцену ${ordinal} с вашим замечанием и вставлю её в тот же фильм; остальные сцены останутся как есть.${credits > 0 ? ` Стоимость — цена сцены, ${price}; если Google не сможет её снять, кредиты вернутся.` : ''} Начать?`;
    default:
      return `${kaScene(ordinal)} სცენას თავიდან გადავიღებ შენი შენიშვნით და იმავე ფილმში ჩავსვამ, დანარჩენი სცენები უცვლელი დარჩება.${credits > 0 ? ` ფასი სცენის ფასია, ${price}. თუ Google სცენას ვერ გადაიღებს, კრედიტები დაგიბრუნდება.` : ''} დავიწყო?`;
  }
}

export type SceneRedoPhase = 'rendering' | 'cutting';

export function sceneRedoProgressText(ordinal: number, phase: SceneRedoPhase, locale: string | null | undefined): string {
  const l = lang(locale);
  if (phase === 'cutting') {
    return l === 'en' ? `✂️ Cutting the new scene ${ordinal} into the film…` : l === 'ru' ? `✂️ Новая сцена ${ordinal} вставляется в фильм…` : `✂️ ახალი ${kaScene(ordinal)} სცენა ფილმში ჩაისმება…`;
  }
  return l === 'en' ? `🎬 Shooting scene ${ordinal} again…` : l === 'ru' ? `🎬 Сцена ${ordinal} переснимается…` : `🎬 ${kaScene(ordinal)} სცენა თავიდან იღება…`;
}

/** What the bubble says once the redo is over. */
export function sceneRedoResultText(outcome: SceneRedoOutcome, ordinal: number, locale: string | null | undefined): string {
  const l = lang(locale);
  switch (outcome.kind) {
    case 'done':
      return l === 'en' ? `✅ Scene ${ordinal} was replaced; the other scenes are the same.` : l === 'ru' ? `✅ Сцена ${ordinal} заменена; остальные сцены те же.` : `✅ ${kaScene(ordinal)} სცენა შეიცვალა, დანარჩენი სცენები იგივეა.`;
    case 'clip_only':
      return l === 'en'
        ? `⚠️ The new scene ${ordinal} was shot, but the film could not be cut with it. Here is the new scene; ask again to cut it in.`
        : l === 'ru'
          ? `⚠️ Новая сцена ${ordinal} снята, но вставить её в фильм не удалось. Вот новая сцена; попросите ещё раз, чтобы вставить её.`
          : `⚠️ ახალი ${kaScene(ordinal)} სცენა გადაღებულია, მაგრამ ფილმში ვერ ჩაისვა. აქ არის ახალი სცენა; ჩასასმელად კიდევ ერთხელ მთხოვე.`;
    case 'failed': {
      const back = outcome.refunded && outcome.credits > 0 ? creditsLabel(outcome.credits, locale ?? 'ka') : null;
      return l === 'en'
        ? `⚠️ Scene ${ordinal} could not be shot again.${back ? ` ${back} came back to you.` : ''}`
        : l === 'ru'
          ? `⚠️ Сцену ${ordinal} не удалось переснять.${back ? ` ${back} возвращены.` : ''}`
          : `⚠️ ${kaScene(ordinal)} სცენა თავიდან ვერ გადაიღო.${back ? ` ${back} დაგიბრუნდა.` : ''}`;
    }
    case 'refused':
      return `⚠️ ${refusalText(outcome, ordinal, l)}`;
  }
}

function refusalText(o: Extract<SceneRedoOutcome, { kind: 'refused' }>, ordinal: number, l: Lang): string {
  const price = typeof o.price === 'number' ? creditsLabel(o.price, l) : null;
  switch (o.error) {
    case 'insufficient_credits':
      return l === 'en' ? `Not enough credits: the scene costs ${price ?? 'more'}. Nothing was charged.` : l === 'ru' ? `Недостаточно кредитов: сцена стоит ${price ?? 'больше'}. Ничего не списано.` : `კრედიტი არ გყოფნის: სცენის ფასია ${price ?? 'მეტი'}. არაფერი ჩამოგეჭრა.`;
    case 'price_changed':
      return l === 'en' ? `The scene's price is now ${price}. Nothing was charged; ask again to see the new price.` : l === 'ru' ? `Цена сцены теперь ${price}. Ничего не списано; попросите ещё раз, чтобы увидеть новую цену.` : `სცენის ფასი ახლა არის ${price}. არაფერი ჩამოგეჭრა; ახალი ფასის სანახავად კიდევ მთხოვე.`;
    case 'scene_busy':
      return l === 'en' ? `Scene ${ordinal} is already being shot again.` : l === 'ru' ? `Сцена ${ordinal} уже переснимается.` : `${kaScene(ordinal)} სცენა უკვე იღება თავიდან.`;
    case 'film_stitching':
      return l === 'en' ? 'The film is being cut right now. Try again when it is done.' : l === 'ru' ? 'Фильм сейчас монтируется. Попробуйте, когда он будет готов.' : 'ფილმი ახლა იჭრება. სცადე, როცა მორჩება.';
    case 'budget_exhausted':
      return o.message || (l === 'en' ? 'Today’s video limit is reached.' : l === 'ru' ? 'Дневной лимит видео исчерпан.' : 'დღევანდელი ვიდეოს ლიმიტი ამოიწურა.');
    case 'film_not_found':
      return l === 'en' ? 'This film can no longer be changed scene by scene (it is older than a day).' : l === 'ru' ? 'Этот фильм больше нельзя менять по сценам (ему больше суток).' : 'ამ ფილმს სცენებად ვეღარ შევცვლი (ერთ დღეზე ძველია).';
    default:
      return l === 'en' ? 'The scene could not be started. Nothing was charged.' : l === 'ru' ? 'Не удалось начать сцену. Ничего не списано.' : 'სცენის გადაღება ვერ დაიწყო. არაფერი ჩამოგეჭრა.';
  }
}

// ─── The run ────────────────────────────────────────────────────────────────────────────────────────────────────

export type SceneRedoOutcome =
  | { kind: 'done'; masterUrl: string; clipUrl: string | null }
  | { kind: 'clip_only'; clipUrl: string }
  | { kind: 'failed'; refunded: boolean; credits: number; error: string }
  | { kind: 'refused'; status: number; error: string; price?: number; message?: string };

export interface SceneRedoDeps {
  fetch: (input: string, init?: RequestInit) => Promise<Response>;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
}

const defaultDeps = (): SceneRedoDeps => ({
  fetch: (input, init) => fetch(input, { credentials: 'include', ...init }),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  now: () => Date.now(),
});

/** How often a render is asked about, and for how long (the server gives one up, and its price back, at 25 min). */
export const REDO_POLL_MS = 6_000;
export const REDO_CLIENT_DEADLINE_MS = 27 * 60_000;

interface RedoView { status?: string; clipUrl?: string | null; masterUrl?: string | null; refunded?: boolean; credits?: number; error?: string | null }

const readJson = async (r: Response): Promise<Record<string, unknown>> => (await r.json().catch(() => ({}))) as Record<string, unknown>;
const q = (tokenId: string, ordinal: number) => `filmTokenId=${encodeURIComponent(tokenId)}&ordinal=${ordinal}`;

/** What redoing the scene costs this user, or null when the film cannot be redone scene by scene. */
export async function quoteSceneRedo(tokenId: string, ordinal: number, deps: SceneRedoDeps = defaultDeps()): Promise<{ price: number; scenes: number } | null> {
  try {
    const r = await deps.fetch(`/api/film/scene/redo?${q(tokenId, ordinal)}&quote=1`, { cache: 'no-store' });
    if (!r.ok) return null;
    const j = await readJson(r);
    return typeof j.price === 'number' && j.price >= 0 ? { price: j.price, scenes: typeof j.scenes === 'number' ? j.scenes : 0 } : null;
  } catch {
    return null;
  }
}

/**
 * Shoot one scene again and cut it into the film. Answers how it ended; never throws for a server's answer (an abort does).
 * `expectedPrice` is the price the user agreed to: the server takes no more.
 */
export async function runSceneRedo(
  args: { tokenId: string; ordinal: number; note: string | null; expectedPrice: number; signal?: AbortSignal; onPhase?: (phase: SceneRedoPhase) => void },
  deps: SceneRedoDeps = defaultDeps(),
): Promise<SceneRedoOutcome> {
  const { tokenId, ordinal, signal } = args;
  const start = await deps.fetch('/api/film/scene/redo', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
    body: JSON.stringify({ filmTokenId: tokenId, ordinal, ...(args.note ? { note: args.note } : {}), expectedPrice: args.expectedPrice }),
  });
  const started = await readJson(start);
  if (start.status !== 202) {
    return {
      kind: 'refused', status: start.status, error: typeof started.error === 'string' ? started.error : 'redo_failed',
      ...(typeof started.price === 'number' ? { price: started.price } : {}),
      ...(typeof started.message === 'string' ? { message: started.message } : {}),
    };
  }
  args.onPhase?.('rendering');
  const deadline = deps.now() + REDO_CLIENT_DEADLINE_MS;
  let view: RedoView = (started.redo as RedoView) ?? {};
  while (view.status !== 'ready') {
    if (view.status === 'failed') {
      return { kind: 'failed', refunded: view.refunded === true, credits: typeof view.credits === 'number' ? view.credits : 0, error: view.error || 'render_failed' };
    }
    if (deps.now() > deadline) return { kind: 'failed', refunded: false, credits: 0, error: 'render_timed_out' };
    if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
    await deps.sleep(REDO_POLL_MS);
    // A miss (a 429, a blip) is asked again on the next tick; only the server's own state ends the wait.
    const r = await deps.fetch(`/api/film/scene/redo?${q(tokenId, ordinal)}`, { cache: 'no-store', signal }).catch((e: unknown) => {
      if (signal?.aborted) throw e;
      return null;
    });
    if (r && r.ok) view = ((await readJson(r)).redo as RedoView) ?? view;
  }
  const clipUrl = typeof view.clipUrl === 'string' ? view.clipUrl : null;
  args.onPhase?.('cutting');
  const cut = await deps.fetch('/api/film/scene/redo/stitch', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
    body: JSON.stringify({ filmTokenId: tokenId, ordinal }),
  }).catch((e: unknown) => {
    if (signal?.aborted) throw e;
    return null;
  });
  const cutView = cut ? (((await readJson(cut)).redo as RedoView) ?? {}) : {};
  if (cut && cut.ok && typeof cutView.masterUrl === 'string' && cutView.masterUrl) return { kind: 'done', masterUrl: cutView.masterUrl, clipUrl };
  return clipUrl ? { kind: 'clip_only', clipUrl } : { kind: 'failed', refunded: false, credits: 0, error: 'stitch_failed' };
}
