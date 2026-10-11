/**
 * lib/agent/media/askCoverage.ts — what a montage message asks that its plan does not hold, by name. Pure, browser-safe.
 *
 * 2026-10-11: the owner's montage asked for speed ramps, an overlay, a moving text and an end text; the card showed a
 * plain montage and none of the rest. Each part of a montage message is now either in the plan (the montage reads the
 * music start, the length, the frame and the speed ramps; the edit after it the colour, fades, volume, overlay and
 * text), or named here with the reason it is not. A card that leaves something out says so before Start.
 *
 * Conservative: only what the words plainly ask is named. A word the plan does hold (a ramp for „შეანელე", the clips'
 * own sound off for „უხმოდ", the frame for „9:16") is never listed.
 *
 * ⚠️ NO `\b` NEXT TO GEORGIAN OR CYRILLIC (ASCII-only). Token edges there are Unicode lookarounds.
 */
import { mineEdits, type EditAsk } from './editWords';
import { mineComposition } from './layerWords';
import { askLine } from './editChat';
import { rampOf } from './montageAsk';
import { minePlanParams } from '@/lib/agent/params';

type Lang = 'ka' | 'en' | 'ru';
const pick = (locale: string): Lang => (locale === 'en' ? 'en' : locale === 'ru' ? 'ru' : 'ka');

export type UnplannedKind =
  /** Transitions the plan cannot draw. Not listed since the montage plans them itself (its card says where they go). */
  | 'transition'
  /** Zoom, shake, glitch: no such effect yet. Not listed since 2026-10-11 (they are `motion` edits now); kept for old cards. */
  | 'motion_fx'
  /** Playing a video backwards: ffmpeg's reverse holds the whole clip in memory, so it is not offered. */
  | 'reverse'
  /** The frame filled with a blurred copy of the shot: the montage fills its frame with each shot (edges trimmed). */
  | 'fit_blur'
  /** A logo or other picture on the video: it needs its own picture, on the finished montage. */
  | 'logo'
  /** A cover still: taken from the finished video. */
  | 'thumbnail'
  /** Text asked with no words to draw, or a call to action with no words. */
  | 'text_words'
  | 'cta_words'
  /** Captions of the song's or the speech's words (automatic transcription is not on), or translated captions. */
  | 'speech_captions'
  | 'translate_captions'
  /** A person, an object or the background taken out of the picture: AI fill, a paid provider call, not switched on. */
  | 'remove_object'
  /** A stretch cut out of the middle, a trim the montage's length does not cover. */
  | 'cut_middle'
  | 'trim'
  /** The whole edit faster or slower (it would move every cut off the beat) with no shot-by-shot ramp asked. */
  | 'speed'
  /** A change to layers a montage not made yet does not have. */
  | 'layer_change'
  /** An edit a chain has no step for (the sound-of-a-video chain): ask for it on the result. */
  | 'later_edit';

export interface Unplanned {
  kind: UnplannedKind;
  /** The edit itself, for `later_edit`. */
  edit?: EditAsk;
}

const TRANSITION = /transitions?|cross\s*-?\s*fade|dissolve|გადასვლ|ტრანზიშ|переход/iu;
const FADE_WORD = /ფეიდ|fade|затух|растворен/iu;
const BETWEEN = /between|შორის|между/iu;

/** The montage holds these itself: speed as a ramp of shots, mute (the clips are silent, the track is the sound), the frame. */
const MONTAGE_HOLDS: ReadonlySet<EditAsk['op']> = new Set(['speed', 'mute', 'aspect']);

const same = (a: EditAsk, b: EditAsk): boolean => JSON.stringify(a) === JSON.stringify(b);

/**
 * What the words of a montage message ask that its plan leaves out. `planned` are the edits a chained edit step will do
 * after the montage (none for a plain montage card); every other edit the words ask is named, as are the asks no edit
 * does (playing backwards, a blurred background behind a montage's shots).
 */
export function unplannedAsks(text: string | undefined, planned: readonly EditAsk[] = []): Unplanned[] {
  const raw = typeof text === 'string' ? text.slice(0, 20_000) : '';
  if (!raw.trim()) return [];
  const out: Unplanned[] = [];
  const has = (k: UnplannedKind) => out.some((u) => u.kind === k);
  const add = (u: Unplanned) => { if (u.kind === 'later_edit' || !has(u.kind)) out.push(u); };

  // The words to be drawn are read out first: „დააწერე „zoom in"" draws a word, it asks no zoom.
  const rest = mineComposition(raw).rest;
  // Transitions are the montage's own now (./montageAsk transitionAsk → lib/services/montage/transitionPlan): its card
  // names the styles and every boundary that stays a cut. Still read here, so a „fade between" is not also a whole-video fade.
  // Zoom, shake and glitch are edits now (./editWords mineMotion): the chain after the montage draws them.
  const transition = TRANSITION.test(rest) || (FADE_WORD.test(rest) && BETWEEN.test(rest));

  const mined = mineEdits(raw);
  for (const m of mined.missing) add({ kind: m === 'caption_text' ? 'text_words' : m === 'cta_text' ? 'cta_words' : 'logo' });
  for (const u of mined.unsupported) add({ kind: u });
  if (mined.logo) add({ kind: 'logo' });

  const params = minePlanParams(rest);
  const ramp = rampOf(rest);
  for (const e of mined.edits) {
    if (planned.some((p) => same(p, e))) continue;
    if (e.op === 'speed') { if (!ramp) add({ kind: 'speed' }); continue; }
    if (e.op === 'aspect' && e.fit === 'blur') { add({ kind: 'fit_blur' }); continue; }
    if (MONTAGE_HOLDS.has(e.op)) continue;
    if (e.op === 'thumbnail') { add({ kind: 'thumbnail' }); continue; }
    if (e.op === 'trim') { if (params.durationSec === undefined && params.musicStartSec === undefined) add({ kind: 'trim' }); continue; }
    if (e.op === 'fade' && transition) continue;
    if (e.op === 'layers') {
      if (e.add?.some((l) => l.kind === 'image')) add({ kind: 'logo' });
      if (e.change?.length || e.remove?.length) add({ kind: 'layer_change' });
      // The texts and masks asked with a logo are drawn by the chain (lib/agent/run/runChat keeps them): only the logo is out.
      const words: EditAsk = { op: 'layers', add: (e.add ?? []).filter((l) => l.kind !== 'image') };
      if (words.add!.length && !planned.some((p) => same(p, words))) add({ kind: 'later_edit', edit: words });
      continue;
    }
    if (e.op === 'captions') continue; // a caption track is named by its unsupported kind above
    add({ kind: 'later_edit', edit: e });
  }
  return out;
}

/** One left-out ask and why, in words. */
export function unplannedLine(u: Unplanned, locale: string): string {
  const lang = pick(locale);
  switch (u.kind) {
    case 'transition':
      return lang === 'en' ? 'transitions between shots: this edit has no boundary to draw them on'
        : lang === 'ru' ? 'переходы между кадрами: в этом монтаже нет склеек для них'
          : 'გადასვლები კადრებს შორის: ამ მონტაჟს გადასასვლელი ადგილი არ აქვს';
    case 'motion_fx':
      return lang === 'en' ? 'zoom, shake or glitch: these effects are not available yet'
        : lang === 'ru' ? 'зум, тряска или глитч: этих эффектов пока нет'
          : 'ზუმი, კანკალი ან გლიჩი: ეს ეფექტები ჯერ არ მაქვს';
    case 'reverse':
      return lang === 'en' ? 'playing it backwards: not available yet (the whole clip would have to fit in memory)'
        : lang === 'ru' ? 'проиграть задом наперёд: пока нет (весь клип пришлось бы держать в памяти)'
          : 'უკუღმა გაშვება: ჯერ არ მაქვს (მთელი კლიპი მეხსიერებაში უნდა დაეტიოს)';
    case 'fit_blur':
      return lang === 'en' ? 'a blurred background behind the picture: a montage fills its frame with every shot (edges trimmed); ask for it on a single video'
        : lang === 'ru' ? 'размытый фон за картинкой: монтаж заполняет кадр каждым планом (края обрезаются); попросите это на отдельном видео'
          : 'ბუნდოვანი ფონი კადრის უკან: მონტაჟი ყოველი კადრით მთელ ჩარჩოს ავსებს (კიდეები იჭრება); ეს ცალკე ვიდეოზე მთხოვე';
    case 'logo':
      return lang === 'en' ? 'a logo: once the montage is ready, send the logo picture with it and say where it goes'
        : lang === 'ru' ? 'логотип: когда монтаж будет готов, пришлите картинку логотипа и скажите, где его поставить'
          : 'ლოგო: მონტაჟის შემდეგ ლოგოს სურათი გამომიგზავნე და მითხარი, სად დავდო';
    case 'thumbnail':
      return lang === 'en' ? 'a cover still: ask once the montage is ready, I take it from the finished video'
        : lang === 'ru' ? 'обложка: попросите, когда монтаж будет готов, возьму кадр из готового видео'
          : 'ყდის კადრი: მონტაჟის შემდეგ მთხოვე, მზა ვიდეოდან ამოვიღებ';
    case 'text_words':
      return lang === 'en' ? 'a text: I cannot tell which words to write; put them in quotes, e.g. “Summer”'
        : lang === 'ru' ? 'текст: не видно, какие слова написать; напишите их в кавычках, например «Лето»'
          : 'ტექსტი: ვერ ვხვდები, რა სიტყვები დავწერო; ბრჭყალებში დაწერე, მაგ. „ზაფხული“';
    case 'cta_words':
      return lang === 'en' ? 'a call to action: write its words in quotes'
        : lang === 'ru' ? 'призыв к действию: напишите его слова в кавычках'
          : 'მოწოდება: მისი სიტყვები ბრჭყალებში დაწერე';
    case 'speech_captions':
      return lang === 'en' ? 'captions of the song’s or the speech’s words: automatic transcription is not switched on yet; send me the text'
        : lang === 'ru' ? 'субтитры по словам песни или речи: автоматическое распознавание пока не включено; пришлите текст'
          : 'ქეფშენები სიმღერის ან საუბრის სიტყვებით: ავტომატური ამოცნობა ჯერ ჩართული არ არის; ტექსტი მომწერე';
    case 'translate_captions':
      return lang === 'en' ? 'translated captions: not switched on yet'
        : lang === 'ru' ? 'перевод субтитров: пока не включён'
          : 'ქეფშენების თარგმანი: ჯერ ჩართული არ არის';
    case 'remove_object':
      return lang === 'en' ? 'taking a person, an object or the background out of the picture: that needs AI fill (a paid provider call), not switched on yet'
        : lang === 'ru' ? 'убрать человека, предмет или фон из кадра: нужно заполнение ИИ (платный вызов провайдера), пока не включено'
          : 'ადამიანის, საგნის ან ფონის ამოღება კადრიდან: AI-ით შევსება სჭირდება (ფასიანი პროვაიდერის გამოძახება), ჯერ ჩართული არ არის';
    case 'cut_middle':
      return lang === 'en' ? 'cutting a stretch out of the middle: the montage picks its own shots; ask for it on the finished video'
        : lang === 'ru' ? 'вырезать кусок из середины: монтаж сам выбирает кадры; попросите это на готовом видео'
          : 'შუა მონაკვეთის ამოჭრა: მონტაჟი კადრებს თავად არჩევს; ეს მზა ვიდეოზე მთხოვე';
    case 'trim':
      return lang === 'en' ? 'trimming: the montage’s length comes from the music and your words; say the length in seconds (e.g. “20 seconds”)'
        : lang === 'ru' ? 'обрезка: длина монтажа идёт от музыки и ваших слов; скажите длину в секундах (например, «20 секунд»)'
          : 'მოჭრა: მონტაჟის სიგრძე მუსიკიდან და შენი სიტყვებიდან მოდის; სიგრძე წამებში თქვი (მაგ. „20 წამიანი“)';
    case 'speed':
      return lang === 'en' ? 'the whole video faster or slower: that would move every cut off the beat; say “speed up and slow down where needed” and single shots change speed by the music'
        : lang === 'ru' ? 'всё видео быстрее или медленнее: тогда все склейки уйдут с бита; скажите «ускорь и замедли где нужно», и отдельные кадры поменяют скорость по музыке'
          : 'მთელი ვიდეოს აჩქარება ან შენელება: ყველა ჭრა ბითს ასცდებოდა; თქვი „სადაც საჭიროა ააჩქარე და შეანელე“ და ცალკეული კადრები მუსიკის მიხედვით შეიცვლება';
    case 'layer_change':
      return lang === 'en' ? 'changing a text or logo: the montage has none yet; ask for the change on the finished video'
        : lang === 'ru' ? 'изменить текст или логотип: в монтаже их ещё нет; попросите изменение на готовом видео'
          : 'ტექსტის ან ლოგოს შეცვლა: მონტაჟს ჯერ არ აქვს; ცვლილება მზა ვიდეოზე მთხოვე';
    case 'later_edit': {
      const what = u.edit ? askLine(u.edit, locale) : '';
      const tail = lang === 'en' ? 'ask for it on the finished montage' : lang === 'ru' ? 'попросите это на готовом монтаже' : 'მზა მონტაჟზე მთხოვე';
      return what ? `${what}: ${tail}` : tail;
    }
  }
}

/** The left-out asks in one line, or '' when the plan holds everything: „Not in this plan: … · …". */
export function unplannedText(list: readonly Unplanned[] | undefined, locale: string): string {
  if (!list?.length) return '';
  const lang = pick(locale);
  const head = lang === 'en' ? 'Not in this plan' : lang === 'ru' ? 'Не входит в этот план' : 'ამ გეგმაში არ შედის';
  return `${head}: ${list.map((u) => unplannedLine(u, locale)).join(' · ')}.`;
}
