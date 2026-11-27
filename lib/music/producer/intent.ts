/**
 * lib/music/producer/intent.ts — read a chat or Agent G sentence as a Music Producer request, and where it should go.
 * Pure. Georgian, English and Russian.
 *
 *   "Create a sad piano track, 1 minute long, and add it to Scene 3 of my video"
 *     → spec { moods: [sad], instruments: [piano], lengthSec: 60, vocals: false }, target { kind: 'scene', scene: 3 }
 *
 * Only what the words say is set; everything else stays at the default (the user can still open the controls). A length
 * between two sold lengths goes UP to the next one (never a shorter track than asked); over 3 minutes is capped at the
 * full song and reported in `notes`, so the reply can say it.
 */
import { DEFAULT_SPEC, GENRES, INSTRUMENTS, MOODS, PRODUCER_LENGTHS, type Preset, type ProducerLength, type ProducerSpec } from './spec';

export type ProducerTarget = { kind: 'scene'; scene: number } | { kind: 'film' } | { kind: 'montage' } | null;

export interface ProducerAsk {
  spec: ProducerSpec;
  target: ProducerTarget;
  /** What the parser had to decide ("length_capped"). */
  notes: string[];
}

const MUSIC = /\b(music|track|song|tune|soundtrack|score|beat|melody|instrumental)\b|მუსიკ|ტრეკ|სიმღერ|მელოდი|саундтрек|музык|трек|песн|мелоди/i;
const VOCAL = /\b(song|sing|sung|vocals?|lyrics|singer)\b|სიმღერ|ვოკალ|იმღერ|ტექსტით|песн|вокал|спой|поёт/i;
const INSTRUMENTAL = /\binstrumental\b|\bno vocals\b|without vocals|ინსტრუმენტ|ვოკალის გარეშე|инструментал|без вокала/i;
const FULL = /\bfull[- ]song\b|\bwhole song\b|სრული სიმღერ|полн\w* песн/i;

const EN_ORD = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];
const KA_ORD = ['პირველ', 'მეორე', 'მესამე', 'მეოთხე', 'მეხუთე', 'მეექვსე', 'მეშვიდე', 'მერვე', 'მეცხრე', 'მეათე'];
const RU_ORD = ['перв', 'втор', 'трет', 'четв[её]рт', 'пят', 'шест', 'седьм', 'восьм', 'девят', 'десят'];

function sceneOf(t: string): number | null {
  const digit = /\bscene\s*(?:#|no\.?\s*)?(\d{1,2})\b|სცენა\s*(\d{1,2})|მე-?(\d{1,2})\s*სცენ|(\d{1,2})-?(?:ე|-ე)?\s*სცენ|сцен\w*\s*(\d{1,2})|(\d{1,2})[-\s]?(?:й|ей|ю)?\s*сцен/i.exec(t);
  if (digit) {
    const n = Number(digit.slice(1).find((g) => g != null));
    return n >= 1 && n <= 10 ? n : null;
  }
  for (let i = 0; i < 10; i++) {
    if (new RegExp(`\\b${EN_ORD[i]}\\s+scene\\b`, 'i').test(t)) return i + 1;
    if (new RegExp(`${KA_ORD[i]}\\S*\\s+სცენ`, 'i').test(t)) return i + 1;
    if (new RegExp(`${RU_ORD[i]}\\S*\\s+сцен`, 'i').test(t)) return i + 1;
  }
  return null;
}

const WHOLE_FILM = /\b(whole|entire|full)\s+(film|movie|video)\b|მთელ\S*\s+(ფილმ|ვიდეო)|весь\s+(фильм|ролик|видео)|всему\s+(фильму|видео)/i;
const MONTAGE = /\bmontage\b|მონტაჟ|монтаж/i;

function lengthOf(t: string): { sec: ProducerLength; capped: boolean } | null {
  if (FULL.test(t)) return { sec: 180, capped: false };
  const min = /(\d+(?:[.,]\d+)?)\s*(?:-|\s)?(?:minutes?|mins?\b|წუთ|мин)/i.exec(t);
  const sec = /(\d{1,3})\s*(?:-|\s)?(?:seconds?|secs?\b|s\b|წამ|сек)/i.exec(t);
  const wanted = min ? Number((min[1] ?? '').replace(',', '.')) * 60 : sec ? Number(sec[1]) : (/\b(a|one) minute\b|ერთ\s*წუთ|одн\w* минут|минутн/i.test(t) ? 60 : null);
  if (wanted == null || !(wanted > 0)) return null;
  const up = PRODUCER_LENGTHS.find((l) => l >= wanted);
  return up ? { sec: up, capped: false } : { sec: 180, capped: true };
}

function picks(t: string, list: readonly Preset[]): string[] {
  const low = t.toLowerCase();
  return list.filter((p) => {
    const en = p.label.en.toLowerCase();
    const enHit = new RegExp(`\\b${en.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&').replace(/\s+/g, '[\\s-]*')}\\b`, 'i').test(low);
    const stem = (s: string) => s.toLowerCase().slice(0, Math.max(4, s.length - 2));
    return enHit || low.includes(stem(p.label.ka)) || low.includes(stem(p.label.ru));
  }).map((p) => p.id);
}

const BPM = /(\d{2,3})\s*bpm\b/i;

/** The request, or null when the sentence is not asking for music. */
export function parseProducerAsk(text: string): ProducerAsk | null {
  const t = (text ?? '').trim();
  if (!t || !MUSIC.test(t)) return null;
  const notes: string[] = [];
  const len = lengthOf(t);
  if (len?.capped) notes.push('length_capped');
  const vocals = INSTRUMENTAL.test(t) ? false : VOCAL.test(t);
  const bpmM = BPM.exec(t);
  const bpm = bpmM ? Math.min(180, Math.max(60, Number(bpmM[1]))) : null;
  const scene = sceneOf(t);
  const target: ProducerTarget = scene ? { kind: 'scene', scene } : WHOLE_FILM.test(t) ? { kind: 'film' } : MONTAGE.test(t) ? { kind: 'montage' } : null;
  const spec: ProducerSpec = {
    ...DEFAULT_SPEC,
    brief: t.slice(0, 1000),
    genre: picks(t, GENRES)[0] ?? null,
    moods: picks(t, MOODS).slice(0, 2),
    instruments: picks(t, INSTRUMENTS).slice(0, 6),
    bpm,
    vocals,
    autoLyrics: vocals,
    lengthSec: len?.sec ?? 30,
  };
  return { spec, target, notes };
}
