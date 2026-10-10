/**
 * lib/chat/videoIntent.ts — what a message that comes WITH a video in the chat is asking for.
 *
 * ⚠️ BEFORE THIS, EVERY MESSAGE SENT WITH A VIDEO WAS A PAID EDIT. The chat treated "a video + any text" as „edit this video":
 * /api/video/remix-intent classified the text and, when nothing matched, fell back to a colour grade — so "what is said in
 * this video?" or "summarise it" spent credits on re-grading the clip, and no question about a video could ever be asked.
 * The chat now tells the two apart HERE, before anything is sent or charged:
 *
 *   · an EDIT request ("add subtitles", "make it vintage", "trim the first 10 seconds", "speed it up", the chips' own
 *     phrases) → the remix pipeline, exactly as before;
 *   · anything else — a question, "describe", "summarise", "transcribe", "translate", or no text at all — is an
 *     UNDERSTANDING request: the clip is read as frames + soundtrack (lib/chat/videoDigest) and answered by the chat model
 *     at the chat's own price (free of per-request credits).
 *
 * A question wins over an edit word: "what music is in this video?" contains "music" and is still a question.
 * Pure, ka / en / ru, no network.
 */

const QUESTION = new RegExp([
  // punctuation
  '[?？؟]',
  // ka — interrogatives and "tell me about it" verbs
  '(^|\\s)(რა|რას|რაზე|რაზეა|რომელი|რომელ|ვინ|ვის|სად|როდის|რატომ|როგორ|რამდენი|რამდენად|როგორია|რისი)(\\s|$)',
  'აღწერე|შეაჯამე|შეჯამება|გადმომეცი|გადმოსცე|ახსენი|განმიმარტე|მითხარი|მიამბე|თარგმნე|გადათარგმნე|ამოიღე\\s+ტექსტი|წაიკითხე|ამოიკითხე|გაანალიზე|გააანალიზე|ჩაწერე\\s+რას|დააკვირდი',
  // en
  '\\b(what|which|who|whom|whose|where|when|why|how|is\\s+there|are\\s+there|does|do\\s+they|did)\\b',
  '\\b(describe|summari[sz]e|summary|explain|transcribe|transcript|translate|tell\\s+me|identify|analy[sz]e|recogni[sz]e|read\\s+out|list\\s+the)\\b',
  // ru
  '(^|\\s)(что|кто|где|когда|почему|зачем|как|какой|какая|какие|сколько|чей)(\\s|$)',
  'опиши|описать|перескажи|кратко|объясни|расскажи|переведи|расшифруй|транскрип|проанализируй|прочитай|определи',
].join('|'), 'i');

/** The edit families the remix pipeline can do — the same cues /api/video/remix-intent's keyword matcher reads. */
const EDIT = new RegExp([
  'სუბტიტრ|subtitle|captions?\\b|субтитр',
  'მუსიკ|music|музык|soundtrack|background\\s*track|ბიტ\\b|\\bbeat\\b',
  'ფონ(ი|ის)?\\s*(მოა?შორ|ამოი?ღ|წაშ|გააქრ|გაქრ)|(მოაშორე|ამოიღე|წაშალე|გააქრე)\\s+ფონ|remove\\s*(the\\s*)?background|rembg|remove\\s*bg|убер\\S*\\s*фон|удал\\S*\\s*фон',
  'პერსონაჟ|face\\s*swap|swap\\s*(the\\s*)?(face|character)|character\\s*swap|замен\\S*\\s*(лиц|персонаж)',
  'ფერი?\\s*(შეც|გაუმჯობეს|გააკეთ)|color\\s*(grade|correct)|colour\\s*(grade|correct)|\\bgrade\\b|vintage|cinematic|neon|ვინტაჟ|ნეონ|цвет|грейд|винтаж|ретро',
  'სტაბილ|stabili[sz]|стабилиз|გაასწორე\\s+ვიბრაც|shaky|gimbal|jitter',
  'რემპ|speed.?ramp|slow.?in|slow.?out',
  'სიჩქარ|speed(\\s*it)?\\s*up|slow(\\s*it)?\\s*down|\\bfaster\\b|\\bslower\\b|გაზარდე|გააჩქარე|შეანელე|скорост|ускор|замедл|\\b[0-9](\\.[0-9])?\\s*[xх]\\b',
  'მოჭ|\\btrim\\b|\\bcut\\s+(the|off|out)\\b|შემოკლ|обрез|обрежь',
  'ტექსტი?ს?\\s*(და?ამატ|ჩა?ამატ|დადე|დაადე)|წარწერ|text\\s*overlay|add\\s+(a\\s+)?(text|title|caption)|burn\\s+(in\\s+)?text|надпис|наложи\\s+текст|добав\\S*\\s+текст',
].join('|'), 'i');

/** True when the message is a question / "describe" / "summarise" — an understanding request, never an edit. */
export function isVideoQuestion(text: string): boolean {
  return QUESTION.test(text || '');
}

/** True when the text asks for an EDIT of the attached video (and is not a question about it). */
export function isVideoEditRequest(text: string): boolean {
  const t = (text || '').trim();
  if (!t) return false;
  if (isVideoQuestion(t)) return false;
  return EDIT.test(t);
}

/** What an attached video with NO words is asked: the chat's own default question, in the user's language. */
export function defaultVideoQuestion(locale: string): string {
  return locale === 'en' ? 'Describe this video: what happens, who or what is in it, and what is said.'
    : locale === 'ru' ? 'Опиши это видео: что происходит, кто или что в кадре и что говорят.'
      : 'აღწერე ეს ვიდეო: რა ხდება, ვინ ან რა ჩანს და რა ისმის.';
}
