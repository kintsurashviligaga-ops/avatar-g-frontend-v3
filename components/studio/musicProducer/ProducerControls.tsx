'use client';

/**
 * Music Producer controls (Phase 8.5): genre + mood chips, instruments, a target-tempo slider (Auto by default — Lyria
 * reads BPM from the prompt, it is a target, not a lock), Vocals / Instrumental, lyrics (write for me or my own), voice,
 * length 30 s / 1 / 2 / 3 min with the price on every chip, and "keep out". Georgian vocals carry a small "Beta" tag
 * (GG 2026-11-15). No stems control: stems are not offered (GG 2026-11-15). Pure UI: state is the parent's.
 */
import { BPM_MAX, BPM_MIN, SING_LANGUAGES, GENRES, INSTRUMENTS, MAX_INSTRUMENTS, MAX_MOODS, MOODS, PRODUCER_LENGTHS, type ProducerLang, type ProducerLength, type ProducerSpec, type ProducerVoice } from '@/lib/music/producer/spec';
import { LABELS } from '@/lib/music/producer/labels';
import { lengthPrices, type ProducerBook } from '@/lib/music/producer/price';
import { singsGeorgian } from '@/lib/music/producer/book';

export const chip = (on: boolean) =>
  `inline-flex min-h-[36px] items-center gap-1 rounded-full border px-3 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60 disabled:opacity-40 ${
    on ? 'border-app-accent bg-app-accent/15 text-app-text' : 'border-app-border/25 text-app-muted hover:bg-app-border/10'
  }`;

const legend = 'mb-2 text-[12px] font-semibold uppercase tracking-wide text-app-muted';

const T = {
  describe: { ka: 'აღწერე სიმღერა', en: 'Describe the song', ru: 'Опишите песню' },
  genre: { ka: 'ჟანრი', en: 'Genre', ru: 'Жанр' },
  mood: { ka: 'განწყობა', en: 'Mood', ru: 'Настроение' },
  instruments: { ka: 'საკრავები', en: 'Instruments', ru: 'Инструменты' },
  auto: { ka: 'ავტო', en: 'Auto', ru: 'Авто' },
  vocals: { ka: 'ვოკალით', en: 'Vocals', ru: 'С вокалом' },
  instrumental: { ka: 'ინსტრუმენტული', en: 'Instrumental', ru: 'Инструментал' },
  mine: { ka: 'ჩემი ტექსტი', en: 'My own lyrics', ru: 'Свой текст' },
  voice: { ka: 'ხმა', en: 'Voice', ru: 'Голос' },
  language: { ka: 'ენა', en: 'Sung in', ru: 'Язык' },
  length: { ka: 'ხანგრძლივობა', en: 'Length', ru: 'Длина' },
  avoid: { ka: 'არ მინდა', en: 'Keep out', ru: 'Без' },
  beta: { ka: 'ბეტა', en: 'Beta', ru: 'Бета' },
  lyricsHint: { ka: '[Verse] … [Chorus] …', en: '[Verse] … [Chorus] …', ru: '[Verse] … [Chorus] …' },
  tempoNote: { ka: 'მიზანი, არა ზუსტი', en: 'a target, not exact', ru: 'ориентир, не точно' },
} as const;

const VOICES: Array<{ id: ProducerVoice; label: Record<ProducerLang, string> }> = [
  { id: 'auto', label: { ka: 'ავტო', en: 'Auto', ru: 'Авто' } },
  { id: 'female', label: { ka: 'ქალი', en: 'Female', ru: 'Женский' } },
  { id: 'male', label: { ka: 'კაცი', en: 'Male', ru: 'Мужской' } },
  { id: 'duet', label: { ka: 'დუეტი', en: 'Duet', ru: 'Дуэт' } },
];

export const lengthLabel = (s: ProducerLength, lang: ProducerLang): string =>
  s === 30 ? (lang === 'ka' ? '30 წმ' : lang === 'ru' ? '30 с' : '30 s') : `${s / 60} ${lang === 'ka' ? 'წთ' : lang === 'ru' ? 'мин' : 'min'}`;

export function GeorgianBeta({ lang, testId = 'mp-georgian-beta' }: { lang: ProducerLang; testId?: string }) {
  return (
    <span data-testid={testId} title={LABELS.georgianBeta[lang]}
      className="ml-1 rounded-full border border-amber-400/40 bg-amber-400/10 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-amber-300">
      {T.beta[lang]}
    </span>
  );
}

export function ProducerControls({ value, onChange, book, lang }: {
  value: ProducerSpec;
  onChange: (next: ProducerSpec) => void;
  book: ProducerBook;
  lang: ProducerLang;
}) {
  const set = <K extends keyof ProducerSpec>(k: K, v: ProducerSpec[K]) => onChange({ ...value, [k]: v });
  const toggle = (k: 'moods' | 'instruments', id: string, max: number) => {
    const cur = value[k];
    set(k, cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= max ? cur : [...cur, id]);
  };
  const prices = lengthPrices(book, PRODUCER_LENGTHS);
  const georgian = singsGeorgian(value);
  return (
    <div data-testid="mp-controls" className="space-y-4 rounded-2xl border border-app-border/15 bg-app-elevated/45 p-4">
      <label className="block">
        <span className={legend}>{T.describe[lang]}</span>
        <textarea data-testid="mp-brief" value={value.brief} maxLength={1000} rows={2} onChange={(e) => set('brief', e.target.value)}
          className="mt-1 w-full resize-none rounded-xl border border-app-border/20 bg-app-bg/60 p-3 text-[14px] text-app-text focus:border-app-accent focus:outline-none" />
      </label>

      <fieldset>
        <legend className={legend}>{T.genre[lang]}</legend>
        <div className="flex flex-wrap gap-1.5">
          {GENRES.map((g) => (
            <button key={g.id} type="button" aria-pressed={value.genre === g.id} data-testid={`mp-genre-${g.id}`}
              onClick={() => set('genre', value.genre === g.id ? null : g.id)} className={chip(value.genre === g.id)}>{g.label[lang]}</button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className={legend}>{T.mood[lang]} <span className="normal-case tracking-normal">· {value.moods.length}/{MAX_MOODS}</span></legend>
        <div className="flex flex-wrap gap-1.5">
          {MOODS.map((m) => {
            const on = value.moods.includes(m.id);
            return <button key={m.id} type="button" aria-pressed={on} data-testid={`mp-mood-${m.id}`} disabled={!on && value.moods.length >= MAX_MOODS}
              onClick={() => toggle('moods', m.id, MAX_MOODS)} className={chip(on)}>{m.label[lang]}</button>;
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend className={legend}>{T.instruments[lang]} <span className="normal-case tracking-normal">· {value.instruments.length}/{MAX_INSTRUMENTS}</span></legend>
        <div className="flex flex-wrap gap-1.5">
          {INSTRUMENTS.map((m) => {
            const on = value.instruments.includes(m.id);
            return <button key={m.id} type="button" aria-pressed={on} data-testid={`mp-inst-${m.id}`} disabled={!on && value.instruments.length >= MAX_INSTRUMENTS}
              onClick={() => toggle('instruments', m.id, MAX_INSTRUMENTS)} className={chip(on)}>{m.label[lang]}</button>;
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend className={legend}>{LABELS.targetTempo[lang]} <span className="normal-case tracking-normal text-app-muted/80">· {T.tempoNote[lang]}</span></legend>
        <div className="flex items-center gap-3">
          <button type="button" aria-pressed={value.bpm == null} data-testid="mp-bpm-auto" onClick={() => set('bpm', value.bpm == null ? 100 : null)} className={chip(value.bpm == null)}>{T.auto[lang]}</button>
          <input type="range" aria-label={LABELS.targetTempo[lang]} data-testid="mp-bpm" min={BPM_MIN} max={BPM_MAX} step={1}
            value={value.bpm ?? 100} disabled={value.bpm == null} onChange={(e) => set('bpm', Number(e.target.value))}
            className="h-1 flex-1 accent-[var(--app-accent,#8b5cf6)] disabled:opacity-40" />
          <span data-testid="mp-bpm-value" className="w-16 text-right text-[13px] tabular-nums text-app-text">{value.bpm == null ? '—' : `${value.bpm} BPM`}</span>
        </div>
      </fieldset>

      <fieldset>
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" aria-pressed={value.vocals} data-testid="mp-vocals" onClick={() => onChange({ ...value, vocals: true })} className={chip(value.vocals)}>
            {T.vocals[lang]}{georgian && (value.language ?? 'auto') === 'auto' && <GeorgianBeta lang={lang} testId="mp-georgian-beta-auto" />}
          </button>
          <button type="button" aria-pressed={!value.vocals} data-testid="mp-instrumental" onClick={() => onChange({ ...value, vocals: false, lyrics: '', autoLyrics: false })} className={chip(!value.vocals)}>{T.instrumental[lang]}</button>
          {value.vocals && (
            <>
              <span className="mx-1 h-5 w-px bg-app-border/25" aria-hidden="true" />
              <button type="button" aria-pressed={value.autoLyrics} data-testid="mp-lyrics-auto" onClick={() => onChange({ ...value, autoLyrics: true, lyrics: '' })} className={chip(value.autoLyrics)}>{LABELS.writeLyrics[lang]}</button>
              <button type="button" aria-pressed={!value.autoLyrics} data-testid="mp-lyrics-mine" onClick={() => set('autoLyrics', false)} className={chip(!value.autoLyrics)}>{T.mine[lang]}</button>
            </>
          )}
        </div>
        {value.vocals && !value.autoLyrics && (
          <textarea data-testid="mp-lyrics" value={value.lyrics} maxLength={1500} rows={5} placeholder={T.lyricsHint[lang]} onChange={(e) => set('lyrics', e.target.value)}
            className="mt-2 w-full rounded-xl border border-app-border/20 bg-app-bg/60 p-3 font-mono text-[13px] text-app-text focus:border-app-accent focus:outline-none" />
        )}
        {value.vocals && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-[12px] text-app-muted">{T.voice[lang]}</span>
            {VOICES.map((v) => (
              <button key={v.id} type="button" aria-pressed={value.voice === v.id} data-testid={`mp-voice-${v.id}`} onClick={() => set('voice', v.id)} className={chip(value.voice === v.id)}>{v.label[lang]}</button>
            ))}
          </div>
        )}
        {value.vocals && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label={T.language[lang]}>
            <span className="text-[12px] text-app-muted">{T.language[lang]}</span>
            {SING_LANGUAGES.map((l) => {
              const on = (value.language ?? 'auto') === l.id;
              return (
                <button key={l.id} type="button" role="radio" aria-checked={on} data-testid={`mp-lang-${l.id}`} onClick={() => set('language', l.id)} className={chip(on)}>
                  {l.label[lang]}{l.beta && <GeorgianBeta lang={lang} />}
                </button>
              );
            })}
          </div>
        )}
      </fieldset>

      <fieldset>
        <legend className={legend}>{T.length[lang]}</legend>
        <div className="grid grid-cols-4 gap-1.5">
          {prices.map(({ lengthSec, credits }) => (
            <button key={lengthSec} type="button" aria-pressed={value.lengthSec === lengthSec} data-testid={`mp-length-${lengthSec}`}
              onClick={() => set('lengthSec', lengthSec)}
              className={`flex min-h-[52px] flex-col items-center justify-center rounded-xl border text-[13px] ${value.lengthSec === lengthSec ? 'border-app-accent bg-app-accent/15 text-app-text' : 'border-app-border/20 text-app-muted hover:bg-app-border/10'}`}>
              <span className="font-medium">{lengthLabel(lengthSec, lang)}</span>
              <span className="tabular-nums text-[12px] text-app-muted">✦{credits}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <label className="block">
        <span className={legend}>{T.avoid[lang]}</span>
        <input data-testid="mp-avoid" value={value.avoid} maxLength={200} onChange={(e) => set('avoid', e.target.value)}
          className="mt-1 w-full rounded-xl border border-app-border/20 bg-app-bg/60 px-3 py-2 text-[14px] text-app-text focus:border-app-accent focus:outline-none" />
      </label>
    </div>
  );
}
