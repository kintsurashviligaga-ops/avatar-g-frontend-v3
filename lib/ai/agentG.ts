/**
 * Agent G — the central intent ROUTER for MyAvatar's chat pipeline.
 *
 * Given a natural-language prompt (ka / en / ru) and the kind of any attached asset, it decides WHICH Surgical
 * Editor workspace the user wants and, for photo/audio, the concrete sub-agent ACTION to auto-run there. Editor
 * execution + billing already live in the metered sub-agent routes (/api/ai/edit-photo, /api/ai/edit-audio, and the
 * client-driven video NLE) — Agent G does NOT generate or charge; it reasons and routes.
 *
 * DESIGN: deterministic keyword classification, NOT an LLM call. For this small, explicit intent space that is the
 * correct tool — zero latency, zero token cost, no hallucination, fully unit-testable. Routing is gated on an edit
 * VERB, matched carefully so it never hijacks ordinary chat:
 *   • Latin/Cyrillic verbs match as WHOLE WORDS ("mute" ≠ "muted", "erase" ≠ "eraser").
 *   • Georgian verbs use PREVERB-PREFIXED stems ("გააფერად", not the bare root "ფერად") so they don't collide with
 *     common nouns/adjectives ("ფერადი" = colorful, "ჭერი" = ceiling, "დაშორება" = breakup).
 * So "what a colorful photo" / "what's in the background?" classify as CLARIFY and stay conversational.
 */

export type AgentGRoute = 'PHOTO_STUDIO' | 'VIDEO_EDITOR' | 'AUDIO_STUDIO' | 'CLARIFY';
export type EditorMode = 'photo' | 'video' | 'audio';
export type AssetKind = 'image' | 'video' | 'audio';
export type PhotoAction = 'remove_bg' | 'upscale' | 'face_restore' | 'colorize';
export type AudioAction = 'vocal_isolation' | 'splitter';

export interface AgentGDecision {
  route: AgentGRoute;
  mode: EditorMode | null;          // null only for CLARIFY
  action: PhotoAction | AudioAction | null; // concrete auto-run action (photo/audio); null = open workspace only
  confidence: number;               // 0..1
  reason: string;
}

const GEORGIAN = /[Ⴀ-ჿ]/;
const LETTER = /\p{L}/u;
/**
 * Does `k` occur in `text` as a real match (not a coincidental substring)?
 * Georgian keywords (already preverb-prefixed to be distinctive) match by substring so agglutinated suffixes still
 * hit. Latin/Cyrillic keywords must be WHOLE WORDS — bounded by a non-letter (or string edge) on BOTH sides — so
 * "muted"/"eraser"/"sharpener" never trigger on "mute"/"erase"/"sharpen".
 */
export function matchKeyword(text: string, k: string): boolean {
  if (GEORGIAN.test(k)) return text.includes(k);
  let i = text.indexOf(k);
  while (i !== -1) {
    const before = i === 0 ? '' : text.charAt(i - 1);
    const after = i + k.length >= text.length ? '' : text.charAt(i + k.length);
    if ((!before || !LETTER.test(before)) && (!after || !LETTER.test(after))) return true;
    i = text.indexOf(k, i + 1);
  }
  return false;
}
const has = (text: string, keys: readonly string[]): boolean => keys.some((k) => matchKeyword(text, k));
const score = (text: string, keys: readonly string[]): number => keys.reduce((n, k) => (matchKeyword(text, k) ? n + 1 : n), 0);

// ── EDIT VERBS — presence of ANY makes a prompt an actual edit request. Bare generation nouns ("music"/"მუსიკა")
//    are excluded so a generate-music ask is never hijacked. Georgian entries are preverb-prefixed (imperative +
//    common 1st-person) so they don't match the bare roots inside ordinary nouns. ──
const PHOTO_VERBS = [
  // ka (remove / erase / colorize / improve / increase / clean / restore)
  'მოაშორ', 'მოვაშორ', 'მოშორ', 'მოაცილ', 'წაშალ', 'წავშალ', 'გააფერად', 'გავაფერად', 'დააფერად',
  'გააუმჯობეს', 'გავაუმჯობეს', 'გაზარდ', 'გაასუფთავ', 'აღადგინ', 'აღვადგინ',
  // en
  'remove', 'erase', 'delete', 'colorize', 'colourize', 'upscale', 'enhance', 'restore', 'deblur', 'unblur', 'cut out', 'cutout', 'sharpen',
  // ru
  'удали', 'убери', 'сотри', 'раскрась', 'колоризуй', 'улучши', 'апскейл', 'реставрируй', 'восстанови',
] as const;
const VIDEO_VERBS = [
  // ka (cut / mute)
  'გაჭერ', 'გავჭერ', 'ამოჭერ', 'ამოვჭერ', 'დაადუმ', 'დავადუმ',
  // en ('cut'/'mute' are whole-word matched, so "haircut"/"muted" never hit)
  'trim', 'split', 'mute', 'cut', 'stitch', 'splice',
  // ru
  'обрежь', 'нарежь', 'заглуши', 'склей', 'вырежи',
] as const;
const AUDIO_VERBS = [
  // ka (isolate / clean / extract / karaoke)
  'იზოლირ', 'გაწმენდ', 'გავწმენდ', 'გამოყავ', 'კარაოკე',
  // en ('clean' whole-word only, so "cleaner" never hits)
  'de-noise', 'denoise', 'isolate', 'karaoke', 'clean', 'acapella', 'acappella',
  // ru
  'изолируй', 'караоке', 'убери шум',
] as const;

// ── CATEGORY NOUNS — never trigger routing on their own; they only pick WHICH workspace when a verb is present. ──
const PHOTO_NOUNS = ['ფონ', 'ხარისხ', 'სახე', 'სახის', 'სურათ', 'ფოტო', 'background', 'bg', 'face', 'photo', 'image', 'picture', 'фон', 'лицо', 'фото', 'изображен', 'качеств'] as const;
const VIDEO_NOUNS = ['ვიდეო', 'კადრ', 'მონტაჟ', 'video', 'clip', 'montage', 'footage', 'видео', 'кадр', 'клип', 'монтаж'] as const;
const AUDIO_NOUNS = ['ხმაური', 'ვოკალ', 'ინსტრუმენტ', 'audio', 'vocal', 'instrumental', 'noise', 'stem', 'song', 'track', 'аудио', 'вокал', 'шум', 'песн', 'трек'] as const;

/** Map a photo edit prompt to a concrete /api/ai/edit-photo action (null → just open the studio). */
export function photoAction(text: string): PhotoAction | null {
  const wantsBg = has(text, ['ფონ', 'background', 'bg', 'фон']);
  const removes = has(text, ['მოაშორ', 'მოვაშორ', 'მოშორ', 'მოაცილ', 'წაშალ', 'წავშალ', 'remove', 'erase', 'delete', 'cut out', 'cutout', 'удали', 'убери', 'сотри']);
  if (wantsBg && (removes || has(text, ['transparent', 'გამჭვირვ', 'прозрачн']))) return 'remove_bg';
  if (has(text, ['გააფერად', 'გავაფერად', 'დააფერად', 'colorize', 'colourize', 'раскрась', 'колоризуй'])) return 'colorize';
  if (has(text, ['ხარისხ', 'upscale', 'enhance', 'გაზარდ', 'გააუმჯობეს', 'გავაუმჯობეს', 'sharpen', 'resolution', 'რეზოლუც', 'апскейл', 'улучши', 'разрешен', 'качеств'])) return 'upscale';
  if (has(text, ['სახე', 'სახის', 'face', 'restore', 'აღადგინ', 'აღვადგინ', 'gfpgan', 'лицо', 'реставрируй', 'восстанови'])) return 'face_restore';
  if (wantsBg) return 'remove_bg';
  return null;
}

/** Map an audio edit prompt to a concrete /api/ai/edit-audio action (null → just open the studio). */
export function audioAction(text: string): AudioAction | null {
  if (has(text, ['კარაოკე', 'karaoke', 'ინსტრუმენტ', 'instrumental', 'караоке', 'инструментал', 'split vocal', 'vocal split', 'stem', 'გამოყავ'])) return 'splitter';
  if (has(text, ['ხმაური', 'de-noise', 'denoise', 'noise', 'გაწმენდ', 'გავწმენდ', 'isolate', 'იზოლირ', 'шум', 'изолируй'])) return 'vocal_isolation';
  if (has(text, ['ვოკალ', 'vocal', 'вокал', 'acapella', 'acappella'])) return 'splitter';
  return null;
}

// Leading words that mark a QUESTION / hypothetical rather than a command. Combined with the verb gate + whole-word
// matching, this stops "should I delete this photo?" / "can you enhance my understanding?" from routing or charging.
const NON_COMMAND_LEAD = [
  'what', 'why', 'how', 'who', 'when', 'where', 'should', 'can ', 'could', 'would', 'is ', 'are ', 'do ', 'does', 'did', 'may ', 'might',
  'რა', 'რას', 'რატომ', 'როგორ', 'ვინ', 'ეს ', 'შემიძლ', 'შეიძლ', 'შეგიძლ',
  'можно', 'как ', 'что ', 'почему', 'это ', 'ли ', 'стоит',
] as const;
/**
 * Is `text` an imperative COMMAND (worth auto-running a paid action for) rather than a question/description? A '?'
 * anywhere, or a leading question/modal word, means "no". A leading politeness word (please / გთხოვ / пожалуйста)
 * is stripped first so "please remove the background" still counts.
 */
export function isImperativeCommand(text: string): boolean {
  let t = (text || '').toLowerCase().trim();
  if (!t || t.includes('?')) return false;
  t = t.replace(/^(please|kindly|გთხოვ[a-zა-ჿ]*|თუ შეიძლება|пожалуйста)[\s,]+/u, '').trim();
  return !NON_COMMAND_LEAD.some((w) => t.startsWith(w));
}

const routeFor = (mode: EditorMode): AgentGRoute => (mode === 'photo' ? 'PHOTO_STUDIO' : mode === 'video' ? 'VIDEO_EDITOR' : 'AUDIO_STUDIO');
const modeForAsset = (kind: AssetKind): EditorMode => (kind === 'image' ? 'photo' : kind === 'audio' ? 'audio' : 'video');
const clarify = (reason: string): AgentGDecision => ({ route: 'CLARIFY', mode: null, action: null, confidence: 0, reason });

/**
 * Classify a prompt into an editor workspace + optional auto-action.
 *
 * Routing requires an edit VERB. With an attached asset, its kind fixes the workspace (a plain "describe this" has no
 * verb → CLARIFY → the caller falls back to normal chat). Without an asset, the workspace is the category whose
 * verbs+nouns score highest. No edit verb at all → CLARIFY.
 */
export function classifyIntent(rawText: string, assetKind?: AssetKind | null): AgentGDecision {
  const text = (rawText || '').toLowerCase().trim();
  const verbHit = has(text, PHOTO_VERBS) || has(text, VIDEO_VERBS) || has(text, AUDIO_VERBS);

  if (assetKind) {
    if (!verbHit) return clarify('attached asset but no edit verb — treat as conversational');
    const mode = modeForAsset(assetKind);
    const action = mode === 'photo' ? photoAction(text) : mode === 'audio' ? audioAction(text) : null;
    return { route: routeFor(mode), mode, action, confidence: 0.9, reason: `attached ${assetKind} + edit intent` };
  }

  if (!verbHit) return clarify('no editable asset and no edit verb');
  // Category score = 2×(verb hits) + (noun hits) + a strong +3 when a concrete action maps (this disambiguates
  // shared verbs like "split": "split the vocals" boosts audio, "split the clip" stays video). Ties resolve
  // photo → video → audio.
  const pa = photoAction(text);
  const aa = audioAction(text);
  const cat = {
    photo: 2 * score(text, PHOTO_VERBS) + score(text, PHOTO_NOUNS) + (pa ? 3 : 0),
    video: 2 * score(text, VIDEO_VERBS) + score(text, VIDEO_NOUNS),
    audio: 2 * score(text, AUDIO_VERBS) + score(text, AUDIO_NOUNS) + (aa ? 3 : 0),
  };
  const order: EditorMode[] = ['photo', 'video', 'audio'];
  const mode = order.reduce((a, b) => (cat[b] > cat[a] ? b : a), 'photo' as EditorMode);
  const action = mode === 'photo' ? pa : mode === 'audio' ? aa : null;
  return { route: routeFor(mode), mode, action, confidence: 0.7, reason: 'keyword-classified (no asset)' };
}
