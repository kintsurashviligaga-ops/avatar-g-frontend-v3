/**
 * lib/studio/musicEngines.ts — the engines /api/ai/music can REALLY use, what each is good for, and — from the live
 * status route — which of them the server would actually run right now. Pure and isomorphic (the picker, the desktop
 * "Engines & prices" list and the route all import it): no React, no env, no I/O.
 *
 * ⚠️ THIS LIST IS THE ROUTE'S CHAIN, NOT A WISH LIST. Lyria 3 → Udio → ElevenLabs Music → MusicGen is the order the
 * route tries them in (`composeTrackUrl`); "Auto" is that chain, and a specific pick moves one engine to the FRONT of
 * it (the rest stay behind it as fallbacks, so a pick never turns a busy engine into a failed render). An engine the
 * server would refuse — no key, or its circuit breaker open after repeated failures — is shown but cannot be picked, and
 * MusicGen (instrumental-only) cannot be picked for a song. Nothing here changes a price: every engine bills by length.
 */
import type { MusicControlMode, MusicEngineId } from '@/lib/ai/musicControls';

export type { MusicEngineId };

/** What the user asked for: the chain as it stands, or one engine first. */
export type MusicEnginePref = 'auto' | MusicEngineId;

/** The route's failover order — also the order the picker lists them in. */
export const MUSIC_ENGINE_CHAIN: readonly MusicEngineId[] = ['lyria', 'udio', 'elevenlabs-music', 'musicgen'];

export function isMusicEngineId(v: unknown): v is MusicEngineId {
  return typeof v === 'string' && (MUSIC_ENGINE_CHAIN as readonly string[]).includes(v);
}

export function isMusicEnginePref(v: unknown): v is MusicEnginePref {
  return v === 'auto' || isMusicEngineId(v);
}

/** One engine as the status route reports it. */
export interface MusicEngineStatusEntry {
  /** A key / token is present and the operator has not switched it off. */
  configured: boolean;
  /** Its circuit breaker is open — recent consecutive failures; the chain skips it for a short while. */
  busy: boolean;
  /** How the Weirdness / Style-influence sliders reach it: 'native' parameters, or sentences in the brief ('prompt'). */
  controls: MusicControlMode;
}

/** GET /api/ai/music/engines — booleans only, never a key, model id or URL. */
export interface MusicEnginesStatus {
  engines: Record<MusicEngineId, MusicEngineStatusEntry>;
  /** Whether the two reference paths the "+ Audio" / "+ Voice" pill uses (Replicate: MusicGen melody · MiniMax) can run. */
  references: { cover: boolean; voice: boolean };
  /** What Auto tries, in order: the configured engines that are not busy. */
  chain: MusicEngineId[];
}

const bool = (v: unknown): boolean => v === true;

/** Validate a status body from the wire (anything else → null: the picker then offers Auto only). */
export function parseMusicEnginesStatus(raw: unknown): MusicEnginesStatus | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { engines?: unknown; references?: unknown; chain?: unknown };
  if (!r.engines || typeof r.engines !== 'object') return null;
  const src = r.engines as Record<string, unknown>;
  const engines = {} as Record<MusicEngineId, MusicEngineStatusEntry>;
  for (const id of MUSIC_ENGINE_CHAIN) {
    const e = src[id];
    if (!e || typeof e !== 'object') return null;
    const o = e as { configured?: unknown; busy?: unknown; controls?: unknown };
    engines[id] = { configured: bool(o.configured), busy: bool(o.busy), controls: o.controls === 'native' ? 'native' : 'prompt' };
  }
  const refs = (r.references && typeof r.references === 'object' ? r.references : {}) as { cover?: unknown; voice?: unknown };
  const chain = Array.isArray(r.chain) ? r.chain.filter(isMusicEngineId) : [];
  return { engines, references: { cover: bool(refs.cover), voice: bool(refs.voice) }, chain };
}

export type EngineAvailability = 'ready' | 'busy' | 'off' | 'unknown';

/** unknown = the status has not loaded (or failed): nothing but Auto is offered then. */
export function engineAvailability(status: MusicEnginesStatus | null, id: MusicEngineId): EngineAvailability {
  if (!status) return 'unknown';
  const e = status.engines[id];
  if (!e.configured) return 'off';
  return e.busy ? 'busy' : 'ready';
}

export type EngineBlock = 'off' | 'busy' | 'unknown' | 'instrumental-only';

export interface EngineChoice {
  id: MusicEnginePref;
  selectable: boolean;
  /** Why it cannot be picked — null when it can. */
  blocked: EngineBlock | null;
}

/** Auto, then each engine in chain order, with whether the server would take the pick. */
export function engineChoices(status: MusicEnginesStatus | null, o: { instrumental: boolean }): EngineChoice[] {
  const rows: EngineChoice[] = [{ id: 'auto', selectable: true, blocked: null }];
  for (const id of MUSIC_ENGINE_CHAIN) {
    const a = engineAvailability(status, id);
    // MusicGen makes no vocals: for a song it would silently hand back an instrumental.
    const blocked: EngineBlock | null = a !== 'ready' ? a : id === 'musicgen' && !o.instrumental ? 'instrumental-only' : null;
    rows.push({ id, selectable: blocked === null, blocked });
  }
  return rows;
}

/** The pick that will actually be sent: a stored pick the server would refuse right now is Auto. */
export function effectiveEnginePref(pref: MusicEnginePref, status: MusicEnginesStatus | null, o: { instrumental: boolean }): MusicEnginePref {
  if (pref === 'auto') return 'auto';
  return engineChoices(status, o).find((c) => c.id === pref)?.selectable ? pref : 'auto';
}

// ── copy (ka / en / ru) ───────────────────────────────────────────────────────────────────────────────────────────

type Lang = 'ka' | 'en' | 'ru';
const lang = (l: string | null | undefined): Lang => (l === 'en' || l === 'ru' ? l : 'ka');

export interface EngineCopy {
  auto: { name: string; role: (chainNames: string[]) => string };
  engines: Record<MusicEngineId, { name: string; role: string }>;
  blocked: Record<EngineBlock, string>;
  /** Under the list: how the price works. */
  priceNote: string;
  /** Under the list: what happens when an engine returns less than was asked. */
  settleNote: string;
  /** The fixed engines behind the two reference paths. */
  cover: { name: string; short: string };
  voice: { name: string; short: string };
}

export const ENGINE_COPY: Readonly<Record<Lang, EngineCopy>> = {
  ka: {
    auto: {
      name: 'ავტო',
      role: (n) => (n.length ? `ცდის თანმიმდევრობით: ${n.join(' → ')}` : 'ირჩევს საუკეთესო ხელმისაწვდომ ძრავს'),
    },
    engines: {
      lyria: { name: 'Lyria 3', role: 'Google · სიმღერები ვოკალით ან ინსტრუმენტული' },
      udio: { name: 'Udio', role: 'სრული სიმღერები, შენს სიგრძეზე მოჭრილი' },
      'elevenlabs-music': { name: 'ElevenLabs Music', role: 'სიმღერები ვოკალით · ზუსტი ხანგრძლივობა' },
      musicgen: { name: 'MusicGen', role: 'მხოლოდ ინსტრუმენტული · სარეზერვო ძრავა' },
    },
    blocked: {
      off: 'ჩართული არ არის',
      busy: 'დროებით დაკავებულია — სცადე მოგვიანებით',
      unknown: 'სტატუსი იტვირთება…',
      'instrumental-only': 'მხოლოდ ინსტრუმენტული',
    },
    priceNote: 'ფასი ყველა ძრავზე ერთნაირია — მას მხოლოდ ხანგრძლივობა განსაზღვრავს.',
    settleNote: 'თუ ძრავა შენს არჩეულზე მოკლე ტრეკს დააბრუნებს, სხვაობა ავტომატურად გიბრუნდება.',
    cover: { name: 'MusicGen · ქავერი', short: 'ქავერი' },
    voice: { name: 'MiniMax · შენი ხმა', short: 'შენი ხმა' },
  },
  en: {
    auto: {
      name: 'Auto',
      role: (n) => (n.length ? `Tries in order: ${n.join(' → ')}` : 'Picks the best engine that is available'),
    },
    engines: {
      lyria: { name: 'Lyria 3', role: 'Google · songs with vocals, or instrumentals' },
      udio: { name: 'Udio', role: 'Full songs, trimmed to your length' },
      'elevenlabs-music': { name: 'ElevenLabs Music', role: 'Songs with vocals · exact length' },
      musicgen: { name: 'MusicGen', role: 'Instrumental only · fallback engine' },
    },
    blocked: {
      off: 'Not switched on',
      busy: 'Busy right now — try again shortly',
      unknown: 'Checking status…',
      'instrumental-only': 'Instrumental only',
    },
    priceNote: 'The price is the same on every engine — only the length sets it.',
    settleNote: 'If an engine returns a shorter track than you picked, the difference is refunded automatically.',
    cover: { name: 'MusicGen · cover', short: 'Cover' },
    voice: { name: 'MiniMax · your voice', short: 'Your voice' },
  },
  ru: {
    auto: {
      name: 'Авто',
      role: (n) => (n.length ? `Пробует по порядку: ${n.join(' → ')}` : 'Выбирает лучший доступный движок'),
    },
    engines: {
      lyria: { name: 'Lyria 3', role: 'Google · песни с вокалом или инструментал' },
      udio: { name: 'Udio', role: 'Полные песни, обрезаются до вашей длины' },
      'elevenlabs-music': { name: 'ElevenLabs Music', role: 'Песни с вокалом · точная длина' },
      musicgen: { name: 'MusicGen', role: 'Только инструментал · запасной движок' },
    },
    blocked: {
      off: 'Не включён',
      busy: 'Сейчас занят — попробуйте чуть позже',
      unknown: 'Проверяем статус…',
      'instrumental-only': 'Только инструментал',
    },
    priceNote: 'Цена одинакова для всех движков — её задаёт только длина.',
    settleNote: 'Если движок вернул трек короче выбранного, разница возвращается автоматически.',
    cover: { name: 'MusicGen · кавер', short: 'Кавер' },
    voice: { name: 'MiniMax · ваш голос', short: 'Ваш голос' },
  },
};

export const engineCopy = (locale: string): EngineCopy => ENGINE_COPY[lang(locale)];

/** The names of the engines Auto would try, for its one-line role. */
export function chainNames(status: MusicEnginesStatus | null, locale: string): string[] {
  const c = engineCopy(locale);
  return (status?.chain ?? []).map((id) => c.engines[id].name);
}

/**
 * The pill's label: a reference track fixes the engine (a cover is MusicGen's melody model, a cloned voice is MiniMax);
 * otherwise the effective pick, or "Auto".
 */
export function enginePillLabel(o: {
  locale: string;
  pref: MusicEnginePref;
  reference: 'cover' | 'voice' | null;
}): string {
  const c = engineCopy(o.locale);
  if (o.reference === 'cover') return c.cover.short;
  if (o.reference === 'voice') return c.voice.short;
  return o.pref === 'auto' ? c.auto.name : c.engines[o.pref].name;
}
