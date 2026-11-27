/**
 * lib/services/montage/smart/sentence.ts — Agent G's smart edit: one sentence in Georgian, English or Russian becomes
 * timeline ops (Phase 8.7 PR C). PURE and deterministic (no model call, so it is free, instant and testable):
 *
 *   „აიღე ეს 3 კლიპი, ამოჭერი მოსაწყენი ადგილები, დაადე ქართული სუბტიტრები და მუსიკა რიტმზე დასვი"
 *   "Take these 3 clips, cut the boring parts, add Georgian captions, and put the music on the beat"
 *   → [removeSilence, beatSync, captions(ka)]
 *
 * "The boring parts" are the pauses and filler words (GG D3: free by default). The Gemini "AI watch" pass (✦4/min) is
 * asked for only in so many words ("with AI", „AI-ით", «с ИИ») and is listed as `aiTrim`; the editor states it is not
 * built yet rather than doing something else. A sentence with no edit word in it is not a smart edit (`matched: false`).
 */
import type { CaptionLang, CaptionStyleId } from './captions';
import { normalizeOps, type SmartOp } from './ops';
import type { TemplateId } from './templates';
import type { Sensitivity } from './silence';

export interface SmartSentence {
  ops: SmartOp[];
  /** At least one edit word was found. */
  matched: boolean;
}

const has = (re: RegExp, s: string) => re.test(s);

const PAUSES = /(მოსაწყენ|პაუზ|სიჩუმ|ზედმეტ\S*\s+ადგილ|ცარიელ\S*\s+ადგილ|boring|dead\s*air|silen(?:ce|t)|pauses?\b|\bums?\b|filler|скучн|пауз|тишин|лишн\S*\s+мест|паразит)/iu;
const FILLERS_OFF = /(სიტყვა-?პარაზიტ\S*\s+(?:არ|ნუ)|without\s+fillers?|keep\s+(?:the\s+)?fillers?|без\s+удаления\s+паразит)/iu;
const TIGHT = /(მჭიდრო|ძალიან\s+მოკლე|ყველა\s+პაუზ|tight|aggressive|every\s+pause|all\s+(?:the\s+)?pauses|плотн|все\s+пауз|агрессивн)/iu;
const GENTLE = /(რბილ|ფრთხილ|მხოლოდ\s+გრძელ|gentle|light(?:ly)?|only\s+(?:the\s+)?long|мягк|аккуратн|только\s+длинн)/iu;
const AI = /(\bAI\b|ხელოვნური\s+ინტელექტ|\bИИ\b|нейросет|with\s+gemini|gemini-ით)/iu;

const CAPTIONS = /(სუბტიტრ|ტიტრ|წარწერ|caption|subtitle|субтитр|титр|подпис)/iu;
const BEAT = /(რიტმ|ბიტ|ტაქტ|\bbeat|rhythm|tempo|ритм|бит(?![а-яё])|такт|в\s+такт)/iu;

const LANG: Array<[CaptionLang, RegExp]> = [
  ['ka', /(ქართულ|georgian|грузин)/iu],
  ['en', /(ინგლისურ|english|англий)/iu],
  ['ru', /(რუსულ|russian|русск)/iu],
];

const STYLE: Array<[CaptionStyleId, RegExp]> = [
  ['karaoke', /(კარაოკე|karaoke|караоке)/iu],
  ['boxed', /(ფონით|ფონზე|boxed|with\s+a\s+box|background|плашк|на\s+фоне)/iu],
  ['minimal', /(მინიმალ|minimal|simple|минимал|простые)/iu],
  ['standard', /(სტანდარტ|ჩვეულებრივ|ქვემოთ|standard|plain|bottom|стандарт|обычн|внизу)/iu],
  ['bold-word', /(სიტყვა-?სიტყვა|მსხვილ|bold|word[\s-]by[\s-]word|tiktok-style|по\s+слову|жирн)/iu],
];

const TEMPLATE: Array<[TemplateId, RegExp]> = [
  ['music-promo', /(მუსიკალურ\S*\s+პრომო|music\s+promo|промо\s+(?:трека|песни))/iu],
  ['explainer', /(ახსნ|explainer|tutorial|ინსტრუქცი|объясн|туториал)/iu],
  ['shorts', /(shorts|შორტს|шортс)/iu],
  ['tiktok', /(tiktok|ტიკტოკ|тикток|reels?\b|რილს|рилс)/iu],
  ['youtube', /(youtube|იუთუბ|ютуб)/iu],
  ['square', /(instagram\s+(?:post|square)|კვადრატ|square|квадрат)/iu],
];

const TRANSITION: Array<['glitch' | 'crossfade' | 'fade' | 'slide' | 'zoom', RegExp]> = [
  ['glitch', /(გლიჩ|glitch|глитч)/iu],
  ['crossfade', /(crossfade|cross-fade|გადადნობ|кроссфейд|растворени)/iu],
  ['slide', /(სლაიდ|slide|слайд)/iu],
  ['zoom', /(ზუმ|zoom|зум)/iu],
  ['fade', /(ჩაქრობ|fade|затухани|затемнени)/iu],
];

const ASPECT: Array<['9:16' | '16:9' | '1:1', RegExp]> = [
  ['9:16', /(9\s*[:x/]\s*16|ვერტიკალ|vertical|portrait|вертикал)/iu],
  ['16:9', /(16\s*[:x/]\s*9|ჰორიზონტალ|horizontal|landscape|wide|горизонтал)/iu],
  ['1:1', /(1\s*[:x/]\s*1)/iu],
];

/** Captions in the language named, else the language the person wrote in (Georgian script → ka, Cyrillic → ru). */
function captionLang(text: string): CaptionLang {
  for (const [l, re] of LANG) if (re.test(text)) return l;
  if (/[Ⴀ-ჿ]/.test(text)) return 'ka';
  if (/[Ѐ-ӿ]/.test(text)) return 'ru';
  return 'en';
}

export function parseSmartSentence(raw: string): SmartSentence {
  const text = String(raw ?? '').slice(0, 2000);
  const out: SmartOp[] = [];

  const tpl = TEMPLATE.find(([, re]) => re.test(text));
  if (tpl) out.push({ op: 'template', id: tpl[0] });
  const aspect = ASPECT.find(([, re]) => re.test(text));
  if (aspect) out.push({ op: 'aspect', aspect: aspect[0] });

  if (has(PAUSES, text)) {
    const sensitivity: Sensitivity = has(TIGHT, text) ? 'tight' : has(GENTLE, text) ? 'low' : 'normal';
    out.push({ op: 'removeSilence', sensitivity, fillers: !has(FILLERS_OFF, text) });
    if (has(AI, text)) out.push({ op: 'aiTrim' });
  }
  if (has(BEAT, text)) out.push({ op: 'beatSync' });
  const tr = TRANSITION.find(([, re]) => re.test(text));
  if (tr) out.push({ op: 'transition', style: tr[0] });
  if (has(CAPTIONS, text)) {
    const st = STYLE.find(([, re]) => re.test(text));
    out.push({ op: 'captions', lang: captionLang(text), style: st ? st[0] : 'bold-word' });
  }

  const ops = normalizeOps(out);
  // A template or a format alone is a setting, not an edit: it takes at least one edit word to be a smart edit.
  const matched = ops.some((o) => o.op === 'removeSilence' || o.op === 'beatSync' || o.op === 'captions' || o.op === 'aiTrim' || o.op === 'transition');
  return { ops, matched };
}
