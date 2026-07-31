/**
 * Natural-language routing for the four studio services that had NO sentence path at all.
 *
 * ⚠️ WHAT WAS MISSING. Montage, Dubbing, Presentation and 3D are all `live: true` in the service
 * catalogue and all have stable POST endpoints, but the only way to reach any of them was to click them
 * in the composer's mode menu — `PANEL_SERVICES` + `setPanelService(...)`. Typing "dub this video into
 * Russian" or "make me a 10-slide deck" produced a conversational reply and nothing else. The chat could
 * TALK about every service and ACT on three of them (image, music, video).
 *
 * Avatar was worse than missing: `detectIntent` classifies `avatar_generation` at 0.85 confidence, the
 * dispatch block contains branches for exactly `image_generation` and `music_generation`, and nothing
 * consumes the avatar verdict — so "make me an avatar" was recognised, cleared the 0.7 gate, and then
 * fell silently through to plain text.
 *
 * ⚠️ WHY THIS IS DETERMINISTIC AND NOT A MODEL CALL. The obvious alternative is Gemini function-calling.
 * It is rejected here on purpose: every one of these services SPENDS CREDITS, dispatch happens
 * client-side, and a hallucinated tool call would be an unrecoverable charge against a real wallet. A
 * regex cannot invent a service that was not named. (It also costs nothing and adds no latency, which
 * matters on a path we just spent a commit shortening.) The trade is real and worth stating: paraphrase
 * that names no service noun will not route, and falls through to ordinary chat exactly as today.
 *
 * ⚠️ AND WHY MATCHING IS DELIBERATELY CONSERVATIVE. These open a PREFILLED PANEL — they never start a
 * paid render on their own. Even so, a question about a service ("რა არის დუბლირება?", "how much does
 * dubbing cost?") must not yank the user into a form. Routing therefore needs a service noun AND either
 * an imperative lead or a possessive/deictic object, and any interrogative lead vetoes it outright.
 */

export type StudioService = 'montage' | 'dubbing' | 'presentation' | 'model3d' | 'avatar';

export interface StudioIntent {
  service: StudioService;
  /** Parameters mined from the sentence — only ever set when explicitly present. */
  params: {
    /** Dubbing target language, as a DubbingLanguage code. */
    targetLanguage?: string;
    /** Presentation slide count. */
    slideCount?: number;
    /** Requested length in seconds (montage). */
    durationSec?: number;
    /** Deck topic / model subject — the user's own words, never paraphrased. */
    topic?: string;
  };
}

/**
 * ⚠️ `\b` IS ASCII-ONLY AND SILENTLY FAILS ON THIS PRODUCT'S PRIMARY LANGUAGE. JavaScript's word
 * boundary is defined against `\w` = [A-Za-z0-9_], so no Georgian or Cyrillic letter is ever a "word
 * character" — `/\bდუბლირ/` and `/\bозвуч/` do not match what they obviously look like they match.
 * A first draft of this file used `\b` throughout and every non-Latin case failed while the English
 * ones passed, which is exactly the shape of bug that ships. Boundaries here are Unicode-aware
 * lookarounds with the `u` flag instead, and `\w*` suffixes are `\p{L}*`.
 */
const L = '\\p{L}';
const B0 = `(?<![${L}\\p{N}])`; // start-of-token, any script
const B1 = `(?![${L}\\p{N}])`;  // end-of-token, any script

/** Interrogatives and cost/capability probes. A question about a service is not a request for it. */
const QUESTION_LEAD = new RegExp(
  `^\\s*(?:what|what's|whats|how|how's|why|when|where|who|which|can|could|is|are|do|does|did|should|would|will|tell me|explain|რა|რას|რატომ|როგორ|როდის|სად|ვინ|რამდენი|შეიძლება|შემიძლია|იცი|მიამბე|что|как|почему|когда|где|кто|сколько|можно|можешь|расскажи)${B1}`,
  'iu',
);

/** An explicit request to act. */
const IMPERATIVE_LEAD = new RegExp(
  `^\\s*(?:please\\s+)?(?:make|create|generate|build|produce|render|do|give me|i want|i need|i'd like|let's|start|open|turn|convert|dub|translate|assemble|stitch|splice|combine|merge|edit|cut|design|prepare|გააკეთე|შექმენი|დამიმზადე|დამიგენერირე|გადათარგმნე|გადმოაკეთე|დაამზადე|მინდა|მჭირდება|დაიწყე|გახსენი|შემიქმენი|გააერთიანე|дублируй|сделай|создай|сгенерируй|собери|склей|переведи|озвучь|хочу|нужно|начни|открой|подготовь)${B1}`,
  'iu',
);

/** "this/my/that <thing>" — a deictic object is as good a signal of intent as an imperative. */
const DEICTIC = new RegExp(
  `${B0}(?:this|these|my|that|the\\s+attached|ამ|ეს|ჩემი|იმ|это|этот|эту|мой|моё|мои|прикреплённ${L}*)${B1}`,
  'iu',
);

const SERVICE_NOUNS: Array<{ service: StudioService; re: RegExp }> = [
  // Dubbing FIRST: "dub this video" also contains "video", and dubbing is the more specific claim.
  // "translate/გადათარგმნე/переведи + a video object" is a dubbing request too — that is what a user
  // means by translating a video, and it was the phrasing that fell through to plain chat.
  { service: 'dubbing', re: new RegExp(`${B0}(?:dub(?:bing|bed)?|voice[\\s-]?over\\s+in|lip[\\s-]?dub|დუბლირ${L}*|გახმოვან${L}*|дубляж|дублир${L}*|озвуч${L}*)${B1}|(?:translate|გადათარგმნე|переведи)${B1}[\\s\\S]{0,40}(?:video|clip|ვიდეო|видео)`, 'iu') },
  { service: 'presentation', re: new RegExp(`${B0}(?:presentation|slide\\s*deck|slides?|deck|powerpoint|keynote|პრეზენტაცი${L}*|სლაიდ${L}*|презентаци${L}*|слайд${L}*)${B1}`, 'iu') },
  { service: 'model3d', re: new RegExp(`${B0}(?:3\\s*-?\\s*d\\s*(?:model|object|mesh|asset)|three[\\s-]?d\\s*model|glb|3d\\s*მოდელ${L}*|სამგანზომილებ${L}*|3d[\\s-]?модел${L}*|трёхмерн${L}*)${B1}`, 'iu') },
  // Montage LAST: its nouns (clips, footage) are the most likely to appear incidentally.
  { service: 'montage', re: new RegExp(`${B0}(?:montage|stitch|splice|(?:combine|merge|join)\\s+(?:the\\s+)?(?:clips?|videos?|footage)|edit\\s+together|cut\\s+together|მონტაჟ${L}*|გააერთიან${L}*|монтаж${L}*|склей${L}*|соедини${L}*)${B1}`, 'iu') },
  { service: 'avatar', re: new RegExp(`${B0}(?:avatar|talking\\s+head|lip[\\s-]?sync|ავატარ${L}*|аватар${L}*|липсинк)${B1}`, 'iu') },
];

/** Dubbing target languages the service supports, by how a user names them. */
const LANGUAGE_WORDS: Array<{ code: string; re: RegExp }> = [
  { code: 'en', re: new RegExp(`${B0}(?:english|инглиш|английск${L}*|ინგლისურ${L}*)`, 'iu') },
  { code: 'ru', re: new RegExp(`${B0}(?:russian|русск${L}*|რუსულ${L}*)`, 'iu') },
  { code: 'ka', re: new RegExp(`${B0}(?:georgian|грузинск${L}*|ქართულ${L}*)`, 'iu') },
  { code: 'es', re: new RegExp(`${B0}(?:spanish|испанск${L}*|ესპანურ${L}*)`, 'iu') },
  { code: 'fr', re: new RegExp(`${B0}(?:french|французск${L}*|ფრანგულ${L}*)`, 'iu') },
  { code: 'de', re: new RegExp(`${B0}(?:german|немецк${L}*|გერმანულ${L}*)`, 'iu') },
  { code: 'it', re: new RegExp(`${B0}(?:italian|итальянск${L}*|იტალიურ${L}*)`, 'iu') },
  { code: 'tr', re: new RegExp(`${B0}(?:turkish|турецк${L}*|თურქულ${L}*)`, 'iu') },
];

/** Bounded quantifiers — every one is capped so a pasted number cannot become a 900-slide request. */
function mineSlideCount(text: string): number | undefined {
  const m = new RegExp(`(\\d{1,3})\\s*-?\\s*(?:slides?|სლაიდ${L}*|слайд${L}*)`, 'iu').exec(text);
  const n = m?.[1] ? parseInt(m[1], 10) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.min(50, n) : undefined;
}

function mineDurationSec(text: string): number | undefined {
  const sec = new RegExp(`(\\d{1,4})\\s*(?:s${B1}|sec${B1}|secs${B1}|second|seconds|წამ${L}*|сек${L}*)`, 'iu').exec(text);
  if (sec?.[1]) {
    const n = parseInt(sec[1], 10);
    if (Number.isFinite(n) && n > 0) return Math.min(3600, n);
  }
  const min = new RegExp(`(\\d{1,3})\\s*(?:m${B1}|min${B1}|mins${B1}|minute|minutes|წუთ${L}*|минут${L}*)`, 'iu').exec(text);
  if (min?.[1]) {
    const n = parseInt(min[1], 10);
    if (Number.isFinite(n) && n > 0) return Math.min(3600, n * 60);
  }
  return undefined;
}

function mineTargetLanguage(text: string): string | undefined {
  // Only a language named as a DESTINATION ("into Russian", "to English", "რუსულად") counts — otherwise
  // "translate the Russian subtitles into English" would pick Russian, the source.
  const dest = /(?:in\s?to|into|to|in|на|რუსულ|ქართულ|ინგლისურ)\s+([^\s,.;!?]+)/i;
  for (const { code, re } of LANGUAGE_WORDS) {
    const m = dest.exec(text);
    if (m && re.test(m[0])) return code;
  }
  // Georgian marks the destination with a case ending rather than a preposition: "რუსულად", "ინგლისურად".
  const ka = new RegExp(`(ინგლისურ|რუსულ|ქართულ|ესპანურ|ფრანგულ|გერმანულ|იტალიურ|თურქულ)ად${B1}`, 'iu').exec(text);
  if (ka?.[1]) {
    const stem = ka[1].toLowerCase();
    const map: Record<string, string> = {
      'ინგლისურ': 'en', 'რუსულ': 'ru', 'ქართულ': 'ka', 'ესპანურ': 'es',
      'ფრანგულ': 'fr', 'გერმანულ': 'de', 'იტალიურ': 'it', 'თურქულ': 'tr',
    };
    return map[stem];
  }
  return undefined;
}

/**
 * Route a sentence to a studio service, or null.
 *
 * Bounded: only the first 400 characters are examined. Every regex here is anchored or bounded, but a
 * pasted screenplay should not be scanned in full on every keystroke-completed message either.
 */
export function detectStudioIntent(text: string | null | undefined): StudioIntent | null {
  const raw = String(text ?? '').trim();
  if (!raw) return null;
  const t = raw.slice(0, 400);

  // A question about a service is not a request for it.
  if (QUESTION_LEAD.test(t)) return null;

  const hit = SERVICE_NOUNS.find(({ re }) => re.test(t));
  if (!hit) return null;

  // Needs a reason to believe this is a REQUEST: an imperative lead, or a deictic object ("dub THIS").
  if (!IMPERATIVE_LEAD.test(t) && !DEICTIC.test(t)) return null;

  const params: StudioIntent['params'] = {};
  if (hit.service === 'dubbing') {
    const lang = mineTargetLanguage(t);
    if (lang) params.targetLanguage = lang;
  }
  if (hit.service === 'presentation') {
    const n = mineSlideCount(t);
    if (n) params.slideCount = n;
  }
  if (hit.service === 'montage') {
    const d = mineDurationSec(t);
    if (d) params.durationSec = d;
  }
  return { service: hit.service, params };
}
