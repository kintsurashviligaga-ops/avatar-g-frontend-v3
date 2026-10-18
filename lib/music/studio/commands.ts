/**
 * lib/music/studio/commands.ts — Agent G's words for Music Studio, in Georgian, English and Russian. Pure.
 *
 * A message becomes ONE of:
 *   · edit        — deterministic ops on the track in front of the user (trim, volume, mute, fades, convert);
 *   · join        — join the tracks the user selected;
 *   · regenerate  — the same settings again (a new quote, a new charge — never silent);
 *   · unsupported — remix / extend / stems / vocal removal / cover / voice conversion: said plainly, never simulated;
 *   · create      — anything else that asks for music: a DRAFT for the plan card (nothing is quoted or charged here).
 * null = not a music command.
 *
 * Volume, mute and fades reuse the Surgical Editor's parser (lib/ai/audioEditCommands) so both speak the same words.
 */
import { parseAudioEditCommand } from '@/lib/ai/audioEditCommands';
import type { EditOp, AudioFormat } from './audio';
import type { MusicRequest } from './contracts';

export type MusicCommand =
  | { kind: 'edit'; ops: EditOp[]; format: AudioFormat | null }
  | { kind: 'join'; crossfadeSec: number }
  | { kind: 'regenerate' }
  | { kind: 'unsupported'; op: 'remix' | 'extend' | 'stem_separation' | 'vocal_removal' | 'cover' | 'voice_conversion' | 'pitch_speed' }
  | { kind: 'create'; draft: Partial<Pick<MusicRequest, 'prompt' | 'mode' | 'genre' | 'mood' | 'tempo' | 'bpm' | 'lyricsLanguage' | 'vocalGender'>> };

const num = (s: string | undefined) => (s === undefined ? NaN : Number(s.replace(',', '.')));

const UNSUPPORTED: Array<[RegExp, Extract<MusicCommand, { kind: 'unsupported' }>['op']]> = [
  [/\bremix\b|რემიქს|ремикс/u, 'remix'],
  [/\bextend\b|\blonger\b|გააგრძელ|დაამატე.{0,12}წამ|продли|удлини/u, 'extend'],
  [/\bstems?\b|split.{0,10}(?:vocals?|instrument)|სტემ|დაყავი|раздели.{0,10}(?:вокал|дорожк)|стем/u, 'stem_separation'],
  [/(?:remove|without|no)\s+(?:the\s+)?vocals?|acapella|instrumental version of|ვოკალ.{0,10}(?:მოაშორ|ამოიღ|გარეშე)|убери.{0,6}вокал|без вокала/u, 'vocal_removal'],
  [/\bcover\b|ქავერ|кавер/u, 'cover'],
  [/(?:in|with) my voice|my own voice|ჩემი ხმით|моим голосом/u, 'voice_conversion'],
];

const FORMAT_RE: Array<[RegExp, AudioFormat]> = [
  [/\bwav\b|ვავ/u, 'wav'],
  [/\bm4a\b|\baac\b/u, 'm4a'],
  [/\bmp3\b/u, 'mp3'],
];

const MUSIC_WORDS = /\b(?:song|music|track|beat|tune|melody|instrumental|soundtrack|jingle)\b|სიმღერ|მუსიკ|მელოდ|ტრეკ|ბიტ|песн|музык|трек|мелоди|бит\b/u;
const MAKE_WORDS = /\b(?:make|create|compose|write|generate|produce)\b|შექმენ|გააკეთ|დამიწერ|შემიქმენ|გამიკეთ|сделай|создай|напиши|сочини|сгенерируй/u;

/** "first 15 s", "from 5 to 20", "0:10–0:40", "პირველი 20 წამი", "с 5 по 20 секунду". */
function parseTrim(lc: string): EditOp | null {
  const t = (m: string) => (m.includes(':') ? m.split(':').reduce((a, b) => a * 60 + num(b), 0) : num(m));
  const range = /(?:from|დან|с|от)?\s*(\d{1,2}:\d{2}|\d+(?:[.,]\d+)?)\s*(?:s|sec|წ|წამ\S*|сек\S*)?\s*(?:-|–|to|until|till|მდე|по|до)\s*(\d{1,2}:\d{2}|\d+(?:[.,]\d+)?)\s*(?:s|sec|seconds?|წ|წამ\S*|сек\S*)?/u.exec(lc);
  if (range && /trim|cut|keep|მოჭერ|დატოვე|ამოჭერ|обреж|оставь|вырежи|from|დან|\bс\b|\bот\b/u.test(lc)) {
    const a = t(range[1]!), b = t(range[2]!);
    if (Number.isFinite(a) && Number.isFinite(b) && b > a) return { op: 'trim', startSec: a, endSec: b };
  }
  const first = /(?:first|პირველი|первые)\s+(\d+(?:[.,]\d+)?)\s*(?:s|sec|seconds?|წამ\S*|сек\S*)/u.exec(lc);
  if (first) return { op: 'trim', startSec: 0, endSec: num(first[1]) };
  return null;
}

export function parseMusicCommand(text: string): MusicCommand | null {
  const raw = (typeof text === 'string' ? text : '').slice(0, 2000);
  const lc = raw.toLowerCase();
  if (!lc.trim()) return null;

  for (const [re, op] of UNSUPPORTED) if (re.test(lc)) return { kind: 'unsupported', op };

  if (/\b(?:again|regenerate|another (?:version|take)|re-?roll)\b|ხელახლა|თავიდან|კიდევ ერთი ვარიანტ|ещё раз|еще раз|заново|другой вариант/u.test(lc)) return { kind: 'regenerate' };

  if (/\b(?:join|merge|combine|stitch|sequence)\b|გააერთიან|შეაერთ|მიაბ|склей|объедини|соедини/u.test(lc)) {
    const xf = /cross-?fade[^\d]{0,12}(\d+(?:[.,]\d+)?)|კროსფეიდ[^\d]{0,12}(\d+(?:[.,]\d+)?)|кроссфейд[^\d]{0,12}(\d+(?:[.,]\d+)?)/u.exec(lc);
    const sec = xf ? num(xf[1] ?? xf[2] ?? xf[3]) : /cross-?fade|კროსფეიდ|кроссфейд/u.test(lc) ? 2 : 0;
    return { kind: 'join', crossfadeSec: Math.min(10, Math.max(0, sec || 0)) };
  }

  // "Make a slow song" is a request for music, not a speed edit: a message that asks to make music is a draft.
  const asksToMake = MUSIC_WORDS.test(lc) && MAKE_WORDS.test(lc);
  const ops: EditOp[] = [];
  const trim = asksToMake ? null : parseTrim(lc);
  if (trim) ops.push(trim);
  const base = asksToMake ? null : parseAudioEditCommand(raw);
  if (base?.pitch !== undefined || base?.speed !== undefined) return { kind: 'unsupported', op: 'pitch_speed' };
  if (base?.volume !== undefined) {
    if (base.volume === 0) ops.push({ op: 'mute' });
    else ops.push({ op: 'volume', db: Math.round(20 * Math.log10(base.volume) * 10) / 10 });
  }
  if (base?.fade?.inSec) ops.push({ op: 'fade_in', sec: base.fade.inSec });
  if (base?.fade?.outSec) ops.push({ op: 'fade_out', sec: base.fade.outSec });
  let format: AudioFormat | null = null;
  if (!asksToMake && (/convert|export|download|save as|გადაიყვან|ფორმატ|конверт|сохрани в|экспорт|\bas\b|\bin\b|ში\b|-ად/u.test(lc) || ops.length)) {
    for (const [re, f] of FORMAT_RE) if (re.test(lc)) { format = f; break; }
  }
  if (ops.length || format) return { kind: 'edit', ops, format };

  if (!(MUSIC_WORDS.test(lc) && (MAKE_WORDS.test(lc) || lc.length > 12))) return null;
  const draft: Extract<MusicCommand, { kind: 'create' }>['draft'] = { prompt: raw.trim().slice(0, 2000) };
  draft.mode = /instrumental|no vocals|without (?:vocals|lyrics)|ინსტრუმენტ|უსიტყვო|инструментал|без слов|без вокала/u.test(lc) ? 'instrumental'
    : /\bsong\b|\bsing|vocal|lyrics|სიმღერ|ვოკალ|ტექსტ|песн|вокал|спой/u.test(lc) ? 'song' : 'instrumental';
  const bpm = /(\d{2,3})\s*bpm/u.exec(lc);
  if (bpm && num(bpm[1]) >= 40 && num(bpm[1]) <= 220) draft.bpm = num(bpm[1]);
  else if (/\bslow\b|ნელ|медлен/u.test(lc)) draft.tempo = 'slow';
  else if (/\bfast\b|upbeat|სწრაფ|энергичн|быстр/u.test(lc)) draft.tempo = 'fast';
  if (draft.mode === 'song') {
    if (/georgian|ქართულ|грузин/u.test(lc)) draft.lyricsLanguage = 'ka';
    else if (/russian|რუსულ|русск/u.test(lc)) draft.lyricsLanguage = 'ru';
    else if (/english|ინგლისურ|английск/u.test(lc)) draft.lyricsLanguage = 'en';
    if (/\bduet\b|დუეტ|дуэт/u.test(lc)) draft.vocalGender = 'duet';
    else if (/female|woman|ქალ|женск/u.test(lc)) draft.vocalGender = 'female';
    else if (/\bmale\b|\bman\b|კაც|მამაკაც|мужск/u.test(lc)) draft.vocalGender = 'male';
  }
  return { kind: 'create', draft };
}
