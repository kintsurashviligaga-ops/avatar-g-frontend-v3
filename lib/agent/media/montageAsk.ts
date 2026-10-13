/**
 * lib/agent/media/montageAsk.ts — the pure decisions of Agent G's "cut my clips to this music": which attachment is a
 * clip and which is the track, which frame shape the edit takes, the montage request it becomes, and whether the
 * finished master passes QC. No I/O (./montageExec does that), so every rule here is unit-tested.
 */
import type { BannerProbe, StreamDurations } from '@/lib/video/probeBanner';
import { displaysPortrait } from '@/lib/video/probeBanner';
import { OUTPUT_FPS, type BeatGrid, type CutPlan, type RampMode } from '@/lib/services/montage/beatPlan';
import { MUSIC_UNDER_OWN_DB } from '@/lib/services/montage/montageSound';
import type { MontageAspect, MontageShot, TransitionStyle } from '@/lib/services/montage/montagePlan';
import { MAX_SHOTS, MAX_TRANSITION_SEC, shotDuration, shotSpeed, timelineDuration, transitionOverlap } from '@/lib/services/montage/montagePlan';
import { MIXED_STYLES, type TransitionAsk, type TransitionShot } from '@/lib/services/montage/transitionPlan';
import { isPictureKind, type AgentMontageRequest, type MontageManifestItem } from './montageManifest';

/** At most MAX_SHOTS pictures (a picture is used at least once, so more could never all appear), a track and a narration. */
export const MAX_CLIPS = MAX_SHOTS;
export const MAX_FILES = MAX_CLIPS + 2;
/** A music track and a narration: the most sound files one montage takes. */
export const MAX_SOUNDS = 2;

export type InputSort =
  /** `clips`: every picture in the order sent, videos AND photos; `stills`: which of them are photos; `audios`: the sound
   *  files (none, one, or a track and a narration: ./montageAsk pickTracks says which is which). Manifest indices. */
  | { ok: true; clips: number[]; stills: number[]; audios: number[] }
  | { ok: false; error: 'unreadable' | 'no_clip' | 'several_tracks' | 'too_many_clips'; files?: number[] };

/** Codecs ffmpeg reports for a still picture (a JPEG, PNG, WebP, HEIF, BMP or TIFF file is a one-frame „video"). */
const STILL_CODECS = new Set(['mjpeg', 'png', 'webp', 'bmp', 'tiff', 'hevc', 'heif', 'av1', 'jpegxl', 'jpeg2000']);
/** A real clip lasts longer than this; a still picture reads as one frame (~0.04 s) or as no length at all. */
const STILL_MAX_SEC = 0.5;

/**
 * Is this probe a PHOTO (a still picture), not a clip? One picture stream of an image codec, no sound, no length to
 * speak of. An MJPEG camera clip lasts seconds, so it stays a clip; a track's cover art is not a picture stream here
 * (lib/video/probeBanner skips „attached pic").
 */
export function isStillProbe(p: Pick<BannerProbe, 'hasVideo' | 'hasAudio' | 'videoCodec' | 'durationSec'> | null): boolean {
  return !!p && p.hasVideo && !p.hasAudio && STILL_CODECS.has((p.videoCodec ?? '').toLowerCase()) && !(p.durationSec > STILL_MAX_SEC);
}

/**
 * Sort probed attachments: a video stream is a clip, a photo is a still shot, sound without a picture is a track or a
 * narration. At least one picture: videos, photos, or both (GG 2026-10-11 17:38Z: „სურათის მონტაჟსაც არ აკეთებს", a
 * montage of photos alone, and „მუსიკა თუ არ ავტვირთე … არ იწყებს", a montage with no track). At most two sound files.
 */
export function sortInputs(probes: ReadonlyArray<BannerProbe | null>, maxClips: number = MAX_CLIPS): InputSort {
  const unreadable = probes.flatMap((p, i) => (!p || (!p.hasVideo && !p.hasAudio) || (!(p.durationSec > 0) && !isStillProbe(p)) ? [i] : []));
  if (unreadable.length) return { ok: false, error: 'unreadable', files: unreadable };
  const clips = probes.flatMap((p, i) => (p!.hasVideo ? [i] : []));
  const stills = clips.filter((i) => isStillProbe(probes[i]!));
  const audios = probes.flatMap((p, i) => (!p!.hasVideo && p!.hasAudio ? [i] : []));
  if (!clips.length) return { ok: false, error: 'no_clip' };
  if (audios.length > MAX_SOUNDS) return { ok: false, error: 'several_tracks', files: audios };
  if (clips.length > maxClips) return { ok: false, error: 'too_many_clips' };
  return { ok: true, clips, stills, audios };
}

// ── the sound of a montage, in the user's words ────────────────────────────────────────────────────────────────────

/** „თავისი ხმაც", „keep the original sound", «оригинальный звук»: the clips' own sound stays in the edit. */
const OWN_SOUND = new RegExp([
  '(?:თავის|საკუთარ|ორიგინალ|ბუნებრივ|ნამდვილ)\\p{L}*\\s+ხმ', '(?<!\\p{L})ხმაც(?!\\p{L})', 'ხმ\\p{L}*\\s+(?:დატოვ|შეინარჩუნ|არ\\s+მოაშორ|არ\\s+წაშალ)',
  '(?:ვიდეო|კლიპ)\\p{L}*\\s+ხმ\\p{L}*\\s+(?:დატოვ|იყოს|შეინარჩუნ)',
  'original\\s+(?:sound|audio)', 'keep\\s+(?:the\\s+|their\\s+|its\\s+)?(?:original\\s+|own\\s+|clips?\\W?s?\\s+|videos?\\W?s?\\s+)?(?:sound|audio)',
  '(?:own|natural)\\s+(?:sound|audio)', 'with\\s+(?:the|their|its)\\s+(?:own\\s+)?(?:sound|audio)',
  'оригинальн\\p{L}*\\s+звук', '(?:свой|собственн\\p{L}*|родн\\p{L}*)\\s+звук', '(?:оставь|сохрани)\\p{L}*\\s+звук', 'звук\\s+(?:оставь|сохрани)',
].join('|'), 'iu');
/** „უხმოდ", "without sound", «без звука»: a silent edit (no music, no clips' sound). */
const SILENT = new RegExp([
  'უხმო', 'ხმის\\s+გარეშე', 'ხმ\\p{L}*\\s+(?:მოაშორ|წაშალ|გათიშ|ამოართვ)', '(?:მოაშორ|წაშალ|გათიშ)\\p{L}*\\s+ხმ',
  'without\\s+(?:any\\s+)?(?:sound|audio)', '\\bno\\s+(?:sound|audio)\\b', '\\bsilent\\b', '\\bmute(?:d)?\\b',
  'без\\s+звука', 'беззвучн', '(?:убери|выключи)\\p{L}*\\s+звук',
].join('|'), 'iu');
/** „მუსიკის გარეშე", "no music", «без музыки»: the words say there is to be no music (so no track is missing). */
const NO_MUSIC = /მუსიკის\s+გარეშე|უმუსიკო|მუსიკა\s+(?:არ\s+(?:მინდა|დაადო|დაადე|გინდა)|არა)|without\s+(?:any\s+)?music|\bno\s+music\b|без\s+музык/iu;
/** A narration the user recorded: „ჩემი ნარაცია", „გახმოვანება", "voice-over", «озвучка». */
const NARRATION = /ნარაცი|გახმოვან|ჩემი\s+ხმ|ჩემს\s+ხმ|ჩანაწერ|ხმოვან\p{L}*\s+(?:ტექსტ|კომენტ)|voice\s*-?\s*over|narrat|\bmy\s+voice\b|озвуч|закадров|голос\s+за\s+кадром|мой\s+голос/iu;
/** A sound file named as a recording of a voice, not a song. */
const VOICE_NAME = /voice|narrat|\bvo\b|record|\brec\b|memo|dictaphone|ნარაც|გახმოვ|ხმა|ჩანაწერ|голос|озвуч|запис/iu;

export function wantsOwnSound(text: string | undefined): boolean { return OWN_SOUND.test(text ?? ''); }
export function wantsSilence(text: string | undefined): boolean { return SILENT.test(text ?? ''); }
export function wantsNoMusic(text: string | undefined): boolean { return NO_MUSIC.test(text ?? ''); }
export function asksNarration(text: string | undefined): boolean { return NARRATION.test(text ?? ''); }
/** „ბითზე", „რიტმში", "on the beat", «в ритм»: cut on the music's beat even where the clips' own sound plays. */
const BEAT_CUTS = /ბით|ბიტ|რიტმ|\bbeats?\b|rhythm|(?<!\p{L})бит|ритм/iu;
export function wantsBeatCuts(text: string | undefined): boolean { return BEAT_CUTS.test(text ?? ''); }

/**
 * A LATER start of the music ON THE TIMELINE („მუსიკა ვიდეოს მე-5 წამიდან დაიწყოს", „მუსიკა მოგვიანებით შემოდიოდეს", "start
 * the music 5 seconds into the video", "delay the track", «музыка с 5-й секунды видео», «музыку позже») — not an offset INTO
 * the track („მუსიკა 58-ე წამიდან" = the track's own 58th second: lib/agent/params mineMusicStart, `musicFromSec`).
 * The montage contract lays the track on the master's first frame (AudioTiming.timelineStartSec = 0, a field of the
 * signed quote / manifest), so this version cannot do it: the quote SAYS so (`unsupported: ['music_delay']`, round 3
 * AC-23) and does not read the number as a track offset — never applied as something else, never dropped without a word.
 */
const MUSIC_WORD = /მუსიკ|სიმღერ|ტრეკ|საუნდტრეკ|music|track|song|soundtrack|музык|трек|песн|саундтрек/iu;
/** A later start anchored to the VIDEO (its second N, its first N seconds without music): a delay whatever else is said. */
const MUSIC_DELAY_ON_VIDEO = new RegExp([
  // a point in the VIDEO, not in the track: „ვიდეოს მე-5 წამიდან", „მონტაჟის 3 წამიდან", „ტაიმლაინზე 5 წამიდან", „კლიპის მე-2 წამზე"
  String.raw`(?:ვიდეოს|კლიპის|მონტაჟის|რგოლის|ტაიმლაინ\p{L}*)\s+(?:მე-?)?\d[\d.,:]*\s*-?\s*(?:ე\s*)?(?:წამიდან|წმ\.?\s*-?\s*დან|წამზე|წამთან)`,
  // „პირველი N წამი მუსიკის გარეშე / უმუსიკოდ"
  String.raw`პირველ\p{L}*\s+\d+\s*-?\s*წამ\p{L}*\s+(?:მუსიკის\s+გარეშე|უმუსიკო|უხმო)`,
  // "5 seconds into the video", "from the 5th second of the video", "no music for the first 5 seconds"
  String.raw`\d[\d.:]*\s*-?\s*(?:s|secs?|seconds?)\s+into\s+the\s+(?:video|clip|edit|montage|film|timeline|reel)`,
  String.raw`(?:music|track|song|soundtrack)\s+(?:only\s+)?(?:from|after|at)\s+(?:the\s+)?\d[\d.:]*(?:st|nd|rd|th)?\s*-?\s*(?:s|secs?|seconds?)\s+(?:of|into)\s+the\s+(?:video|clip|edit|montage|film|timeline|reel)`,
  String.raw`(?:no\s+music|silence|silent)\s+(?:for\s+|during\s+)?(?:the\s+)?first\s+\d+\s*(?:s|secs?|seconds?)`,
  // «с 5-й секунды видео», «первые 5 секунд без музыки»
  String.raw`(?:с|со|на)\s+\d[\d.:]*\s*-?\s*(?:й|ой|ей)?\s*секунд\p{L}*\s+(?:видео|клипа|монтажа|ролика|таймлайна)`,
  String.raw`первы\p{L}*\s+\d+\s*секунд\p{L}*\s+без\s+музык`,
].join('|'), 'iu');
/** "later", "after N seconds", "delay the track": a delay unless the seconds are the TRACK's own (below). */
const MUSIC_DELAY_LOOSE = new RegExp([
  // „მოგვიანებით", „დააგვიანე", „N წამის შემდეგ დაიწყოს / ჩაირთოს / შემოვიდეს"
  String.raw`მოგვიანებით|დააგვიან|დაგვიანებით`, String.raw`\d+\s*-?\s*წამის\s+(?:შემდეგ|მერე)\s+(?:დაიწყ|ჩაირთ|ჩართ|შემო)`,
  // "delay the music", "the track comes in later / after 3 s"
  String.raw`(?:delay|postpone|hold\s+back)\s+(?:the\s+)?(?:music|track|song|soundtrack)`,
  String.raw`(?:music|track|song|soundtrack)\s+(?:should\s+)?(?:comes?\s+in|kicks?\s+in|starts?|begins?)\s+(?:later|after\s+\d|only\s+(?:at|from|after)\s+\d)`,
  // «музыку позже / не сразу / с задержкой», «задержи музыку»
  String.raw`(?:музык|трек|песн|саундтрек)\p{L}*\s+(?:\S+\s+){0,2}?(?:позже|попозже|не\s+сразу|с\s+задержкой)`, String.raw`задерж\p{L}*\s+(?:музык|трек|песн)`,
].join('|'), 'iu');
/**
 * Seconds said to be the TRACK's own: "after 30 seconds of the song", "20 s into the track", „სიმღერის 30 წამის შემდეგ",
 * «с 30-й секунды песни» — an offset INTO the track (musicFromSec), never a later start on the timeline (review
 * 2026-10-13: "music starts after 30 seconds of the song" was told it is not supported and the offset was dropped).
 */
const SECONDS_OF_TRACK = new RegExp([
  String.raw`\d[\d.:]*\s*-?\s*(?:s|secs?|seconds?)?\s+(?:of|into|in)\s+the\s+(?:song|track|music|soundtrack)`,
  String.raw`(?:სიმღერის|ტრეკის|მუსიკის|საუნდტრეკის)\s+(?:მე-?)?\d`,
  String.raw`\d[\d.:]*\s*-?\s*(?:й|ой|ей)?\s*секунд\p{L}*\s+(?:песни|трека|музыки|саундтрека)(?!\p{L})`,
].join('|'), 'iu');
export function asksMusicDelay(text: string | undefined): boolean {
  const t = text ?? '';
  if (!MUSIC_WORD.test(t)) return false;
  return MUSIC_DELAY_ON_VIDEO.test(t) || (MUSIC_DELAY_LOOSE.test(t) && !SECONDS_OF_TRACK.test(t));
}

/**
 * What the montage sounds like:
 *   music      the track alone (the clips' own sound dropped): the beat montage as it always was;
 *   own+music  the clips' own sound leads and the track plays beneath it („თავისი ხმაც და ზემოდან მუსიკა");
 *   own        no track: the clips' own sound (a montage with no music, GG 2026-10-11 17:38Z);
 *   silent     nothing („უხმოდ"); a narration, when there is one, is still laid over any of these.
 */
export type SoundMode = 'music' | 'own+music' | 'own' | 'silent';

export function soundOf(text: string | undefined, hasMusic: boolean): SoundMode {
  const own = wantsOwnSound(text);
  if (hasMusic) return own ? 'own+music' : 'music';
  return wantsSilence(text) && !own ? 'silent' : 'own';
}

export interface TrackInfo {
  /** The file's index in the manifest (the order sent). */
  index: number;
  name: string;
  durationSec: number;
  grid: BeatGrid | null;
}

/**
 * Which sound file is the music and which the narration. One file: a narration when the words ask for one and not for
 * music, or its name says it is a recording; otherwise the music. Two: the one named as a recording is the narration;
 * else the one with a beat is the music (a voice has none; the steadier beat when both do), else the longer one. The card
 * names both before Start, so a wrong guess is seen, never heard first.
 */
export function pickTracks(text: string | undefined, tracks: readonly TrackInfo[]): { music: number | null; voice: number | null } {
  if (!tracks.length) return { music: null, voice: null };
  const named = (t: TrackInfo) => VOICE_NAME.test(t.name);
  if (tracks.length === 1) {
    const t = tracks[0]!;
    const voice = (asksNarration(text) && !/მუსიკ|music|song|музык|песн/iu.test((text ?? '').replace(NARRATION, ''))) || (named(t) && !t.grid);
    return voice ? { music: null, voice: t.index } : { music: t.index, voice: null };
  }
  const [a, b] = tracks as [TrackInfo, TrackInfo];
  if (named(a) !== named(b)) return named(a) ? { music: b.index, voice: a.index } : { music: a.index, voice: b.index };
  const conf = (t: TrackInfo) => t.grid?.confidence ?? -1;
  if (conf(a) !== conf(b)) return conf(a) > conf(b) ? { music: a.index, voice: b.index } : { music: b.index, voice: a.index };
  return a.durationSec >= b.durationSec ? { music: a.index, voice: b.index } : { music: b.index, voice: a.index };
}

const VERTICAL = /(?:reels?|tik\s?tok|shorts|stor(?:y|ies)|vertical|portrait|9\s*[:x/]\s*16|ვერტიკალ|სთორი|რილს|вертикал|сторис|рилс)/iu;
const SQUARE = /(?:square|1\s*[:x/]\s*1|კვადრატ|квадрат)/iu;
const WIDE = /(?:youtube|horizontal|landscape|widescreen|16\s*[:x/]\s*9|ჰორიზონტალ|горизонтал)/iu;

/** The frame shape the user named, if any. */
export function aspectFromPrompt(text: string | undefined): MontageAspect | null {
  const t = typeof text === 'string' ? text : '';
  if (VERTICAL.test(t)) return '9:16';
  if (SQUARE.test(t)) return '1:1';
  if (WIDE.test(t)) return '16:9';
  return null;
}

// ⚠️ NO `\b` next to Georgian or Cyrillic (ASCII-only): token edges there are Unicode lookarounds.
const FASTER = /ააჩქარ|აჩქარ|ჩქარ(?:ად|ი)|სწრაფ|speed\s*(?:it\s+)?up|faster|fast\s*-?\s*motion|ускор|быстре/iu;
const SLOWER = /შეანელ|შენელ|(?<!\p{L})ანელ|(?<!\p{L})ნელა|ნელ\p{L}*\s+მოძრაობ|სლოუ\s*-?\s*მო|slow\s*-?\s*mo|slow\s+(?:it\s+)?down|slower|замедл|медленн|слоу\s*-?\s*мо/iu;
const RAMP = /speed\s*-?\s*ramp|სპიდ\s*-?\s*რემპ|рамп\p{L}*\s+скорост|скоростн\p{L}*\s+рамп/iu;
/** A speed word on a transition („სწრაფი გადასვლები", "faster transitions", «переходы быстрые»): the transition's own. */
const TRANSITION_SPEED = /(?<!\p{L})(?:სწრაფ|ჩქარ|ნელ|quick|fast|faster|slow|slower|snappy|быстр|медленн)\p{L}*\s*-?\s*(?:transitions?|crossfades?|dissolves?|გადასვლ\p{L}*|ტრანზიშ\p{L}*|переход\p{L}*)|(?:transitions?|გადასვლ\p{L}*|переход\p{L}*)\s+(?:სწრაფ|ჩქარ|ნელ|quick|fast|slow|быстр|медленн)\p{L}*/giu;

/**
 * Speed changes asked of a montage („სადაც საჭიროა ააჩქარე კადრი და სადაც საჭიროა შეანელე", "speed ramps", «замедли»):
 * both ways (the music decides where), only slower, only faster. Null = none asked. A montage never changes the speed
 * of the whole edit (that would move its cuts off the beat): the words become a ramp of single shots
 * (lib/services/montage/beatPlan rampSpeeds).
 */
export function rampOf(text: string | undefined): RampMode | null {
  // „სწრაფი გადასვლებით", "quick transitions", «быстрые переходы»: how fast a transition is, not the shots' speed.
  const t = (typeof text === 'string' ? text : '').replace(TRANSITION_SPEED, ' ');
  if (RAMP.test(t)) return 'mixed';
  const fast = FASTER.test(t), slow = SLOWER.test(t);
  return fast && slow ? 'mixed' : slow ? 'slow' : fast ? 'fast' : null;
}

// ── transitions between the shots, in the user's words (GG 2026-10-11 17:38Z: „ქაფქათს … რაც აკლია") ─────────────────

/** Where a transition is asked: the word itself („გადასვლები", "transitions", «переходы») or a crossfade by name. */
const TRANSITION_AT = /transitions?|crossfades?|cross\s*-?\s*fades?|dissolves?|გადასვლ\p{L}*|ტრანზიშ\p{L}*|კროს\s*-?\s*ფეიდ\p{L}*|переход\p{L}*|кроссфейд\p{L}*|наплыв\p{L}*/giu;
/** „A fade between the clips" is a crossfade too. */
const FADE_BETWEEN = /(?:ფეიდ\p{L}*|fades?|fading|затухани\p{L}*)[^.!?;\n]{0,24}(?:between|შორის|между)|(?:between|შორის|между)[^.!?;\n]{0,24}(?:ფეიდ\p{L}*|fades?|fading|затухани\p{L}*)/giu;
/** „No transitions", „hard cuts": the edit cuts straight, as asked. */
const NO_TRANSITION = /(?:no|without)\s+(?:any\s+)?transitions?|hard\s+cuts?|გადასვლ\p{L}*\s+(?:გარეშე|არ\s+(?:მინდა|გინდა|დაამატო|გააკეთო))|(?<!\p{L})არ\s+(?:მინდა|დაამატო)\s+გადასვლ|без\s+переход\p{L}*|резк\p{L}*\s+склейк\p{L}*/iu;
/** A grade, not a transition colour: „შავ-თეთრი", "black and white", «чёрно-белый». Blanked before styles are read. */
const MONO = /შავ\s*-?\s*თეთრ\p{L}*|black\s*(?:and|&)\s*white|b\s*&\s*w|ч[её]рно\s*-?\s*бел\p{L}*/giu;
/** A word right after a style word that makes it something else: a white TEXT, a zoom EFFECT. */
const NOT_A_STYLE = /^\s*(?:-\s*)?(?:ტექსტ|წარწერ|ასო|შრიფტ|ფონ|ეფექტ|text|letters|font|caption|title|background|effect|текст|надпис|шрифт|фон|эффект)/iu;
// Each alternation is held to a word start: „around" is no circle, „blackboard" no fade.
const STYLE_WORDS: ReadonlyArray<readonly [TransitionStyle, RegExp]> = [
  ['crossfade', /(?<!\p{L})(?:cross\s*-?\s*fade\p{L}*|crossfade\p{L}*|dissolv\p{L}*|smooth\p{L}*|soft\p{L}*|მდოვრ\p{L}*|რბილ\p{L}*|ნაზ\p{L}*|კროს\s*-?\s*ფეიდ\p{L}*|плавн\p{L}*|мягк\p{L}*|кроссфейд\p{L}*|наплыв\p{L}*|растворени\p{L}*)/giu],
  ['fade', /(?<!\p{L})(?:(?:through|to|into)\s+black|black|შავ\p{L}*|ჩაბნელ\p{L}*|черн\p{L}*|чёрн\p{L}*|затемн\p{L}*)/giu],
  ['flash', /(?<!\p{L})(?:flash\p{L}*|white|ფლეშ\p{L}*|თეთრ\p{L}*|ციმციმ\p{L}*|გაელვ\p{L}*|вспышк\p{L}*|бел\p{L}*)/giu],
  ['wipe', /(?<!\p{L})(?:wipe\p{L}*|ვაიპ\p{L}*|шторк\p{L}*|вайп\p{L}*)/giu],
  ['slide', /(?<!\p{L})(?:slid\p{L}*|სლაიდ\p{L}*|სრიალ\p{L}*|გასრიალ\p{L}*|გადაცურ\p{L}*|сдвиг\p{L}*|слайд\p{L}*|скольж\p{L}*|выезд\p{L}*)/giu],
  ['zoom', /(?<!\p{L})(?:zoom\p{L}*|ზუმ\p{L}*|зум\p{L}*)/giu],
  ['circle', /(?<!\p{L})(?:circl\p{L}*|round|წრ(?:ე|ის|იულ|ით|ეებ)\p{L}*|кругл\p{L}*|круг\p{L}*)/giu],
  ['pixelize', /(?<!\p{L})(?:pixel\p{L}*|პიქსელ\p{L}*|пиксел\p{L}*)/giu],
  ['blur', /(?<!\p{L})(?:blur\p{L}*|ბლერ\p{L}*|ბლურ\p{L}*|ბუნდოვ\p{L}*|გაბუნდოვ\p{L}*|размыт\p{L}*|блюр\p{L}*)/giu],
];
/** Between two styles of one list: separators and „and / or" only. */
const LIST_GAP = /^[\s,/&+\-–]*(?:(?:and|or|და|ან|и|или)[\s,/&+\-–]*)?$/iu;
/** Between a style and the transition word after it: „zoom transitions", „ზუმის ტიპის გადასვლები", «зум-переходы». */
const BEFORE_GAP = /^[\s\-–]*(?:(?:style|type|like|ტიპის|სტილის|სტილით|სტილში|типа|стиля|в\s+стиле)[\s\-–]*)?$/iu;
/** Between the transition word and a style after it: at most two words („transitions with a zoom", „переходы с зумом"). */
const AFTER_GAP = /^[\s:\-–—(]*(?:[\p{L}.]+[\s:\-–—(]+){0,2}$/u;
/** „transitions AND a zoom" is a zoom effect beside the transitions, not their style. */
const AND = /(?<!\p{L})(?:and|plus|also|და|ასევე|и|также|плюс)(?!\p{L})|[,;]/iu;
/** „Different transitions": a different style at each boundary. */
const MIXED = /different|various|varied|random|mix(?:ed)?(?!\p{L})|სხვადასხვა|ყოველ\p{L}*\s+(?:ჯერზე\s+|ჯერ\s+)?სხვა|შერეულ\p{L}*|ნაირნაირ\p{L}*|разн\p{L}*|случайн\p{L}*|микс\p{L}*|смешанн\p{L}*/iu;
/** A length beside the word: „0.5 წამიანი გადასვლები", "1 second transitions", «переходы по 0,5 с». Never „from 1 s". */
const TRANSITION_LEN = /(?<!(?:from|from\s+the|от|с)\s)(?<![\d.,])(\d+(?:[.,]\d+)?)\s*-?\s*(?:s|secs?|seconds?|წმ|წამ(?:იან\p{L}*|ის|ი)?|сек\p{L}*|с)(?!\p{L})/iu;
const HALF_SECOND = /half\s+a?\s*second|ნახევარ\s*-?\s*წამ\p{L}*|полсекунд\p{L}*|пол\s+секунд\p{L}*/iu;
const QUICK = /quick\p{L}*|fast(?!\s*-?\s*motion)|short|swift|(?<!\p{L})(?:სწრაფ|ჩქარ|მოკლე)\p{L}*|быстр\p{L}*|коротк\p{L}*/iu;
const SLOW = /slow(?!\s*-?\s*mo|\s+(?:it\s+)?down|er)|long|gentle|(?<!\p{L})(?:ნელ|გრძელ|ხანგრძლივ)\p{L}*|медленн\p{L}*|длинн\p{L}*|долг\p{L}*/iu;
const QUICK_SEC = 0.3;
const SLOW_SEC = 1;
/** How far around the transition word a style or a length is read (never past a full stop). */
const NEAR = 36;

const SECS = '\\d+(?:[.,]\\d+)?\\s*-?\\s*(?:s|secs?|seconds?|წმ|წამ\\p{L}*|сек\\p{L}*|с)(?!\\p{L})';
const T_WORD = 'transitions?|crossfades?|cross\\s*-?\\s*fades?|dissolves?|fades?(?:\\s*-?\\s*(?:out|in))?|გადასვლ\\p{L}*|ტრანზიშ\\p{L}*|კროს\\s*-?\\s*ფეიდ\\p{L}*|ფეიდ\\p{L}*|переход\\p{L}*|кроссфейд\\p{L}*|наплыв\\p{L}*|затухани\\p{L}*';
/** One style word between a length and the transition word: „0.4 წამიანი ზუმ გადასვლები", "1 s zoom transitions". */
const T_STYLE = '(?:zoom|slide|wipe|flash|blur|circle|pixel|white|black|soft|smooth|ზუმ|სლაიდ|ფლეშ|ბლერ|მდოვრ|რბილ|თეთრ|შავ|зум|слайд|плавн|мягк)\\p{L}*\\s+';
/**
 * A transition's length as typed: before the word („0.4 წამიანი გადასვლები", "half-second … " is not a number) or after
 * it with at most one joining word ("transitions of 0.5 s", «переходы по 0,5 с», „გადასვლები 0.4 წამი").
 */
const TRANSITION_LEN_PHRASE = new RegExp(
  `(?<![\\d.,])${SECS}[\\s-]*(?:long\\s+)?(?:${T_STYLE})?(?:${T_WORD})|(?<!\\p{L})(?:${T_WORD})[\\s:\\-–—(]*(?:(?:of|lasting|by|for|at|each|თითო|по|длиной|в)\\s+)?(?<![\\d.,])${SECS}`,
  'giu',
);

/**
 * The text with every transition length blanked: „0.4 წამიანი გადასვლები" (or "fade out 2 s") is a transition's
 * length, never the edit's.
 */
export function withoutTransitionLength(text: string): string {
  return String(text ?? '').replace(TRANSITION_LEN_PHRASE, (m) => ' '.repeat(m.length));
}

/**
 * The transitions a montage message asks for: the styles named next to the word, in the order named (each boundary
 * takes the next; „different" = a mix), and the length (a number of seconds, „quick" or „slow"). Null = none asked, or
 * „no transitions". A transition with no style named is a crossfade.
 */
export function transitionAsk(text: string | undefined): TransitionAsk | null {
  const raw = typeof text === 'string' ? text.slice(0, 4000) : '';
  if (!raw.trim() || NO_TRANSITION.test(raw)) return null;
  // Blank what only looks like a style (a black-and-white grade) without moving any position.
  const t = raw.replace(MONO, (m) => ' '.repeat(m.length));
  const at = [...t.matchAll(TRANSITION_AT), ...t.matchAll(FADE_BETWEEN)].map((m) => ({ from: m.index ?? 0, to: (m.index ?? 0) + m[0].length }));
  if (!at.length) return null;
  const windows = at.map(({ from, to }) => {
    let a = Math.max(0, from - NEAR), b = Math.min(t.length, to + NEAR);
    const before = t.slice(a, from), after = t.slice(to, b);
    // A decimal point („0.5 წამიანი") is not a full stop.
    const stopB = [...before.matchAll(/[.!?;\n](?!\d)/gu)].pop();
    if (stopB) a += (stopB.index ?? 0) + 1;
    const stopA = after.search(/[.!?;\n](?!\d)/u);
    if (stopA >= 0) b = to + stopA;
    return { a, b };
  });
  // The styles are the words joined to a transition word: inside it („crossfades", „fade to black between"), a list right
  // before it („zoom and slide transitions"), or a list right after it („transitions with a zoom, a slide").
  const words = STYLE_WORDS.flatMap(([style, re]) => [...t.matchAll(re)].map((m) => ({ from: m.index ?? 0, to: (m.index ?? 0) + m[0].length, style })))
    .filter((w) => !NOT_A_STYLE.test(t.slice(w.to, w.to + 14)))
    .sort((x, y) => x.from - y.from || y.to - x.to)
    .filter((w, i, all) => !all.slice(0, i).some((v) => w.from < v.to));
  const found = new Map<number, TransitionStyle>();
  for (const span of at) {
    for (const w of words) if (w.from >= span.from && w.to <= span.to) found.set(w.from, w.style);
    let edge = span.from;
    for (const w of [...words].reverse()) {
      if (w.to > edge) continue;
      const gap = t.slice(w.to, edge);
      if (!(edge === span.from ? BEFORE_GAP : LIST_GAP).test(gap)) break;
      found.set(w.from, w.style);
      edge = w.from;
    }
    edge = span.to;
    for (const w of words) {
      if (w.from < edge) continue;
      const gap = t.slice(edge, w.from);
      if (!(edge === span.to ? AFTER_GAP.test(gap) && !AND.test(gap) : LIST_GAP.test(gap))) break;
      found.set(w.from, w.style);
      edge = w.to;
    }
  }
  const named = [...new Set([...found.entries()].sort((x, y) => x[0] - y[0]).map(([, st]) => st))];
  // A crossfade named by the transition word itself („crossfades") alongside other styles is one of them, not a mix.
  const near = windows.map((w) => t.slice(w.a, w.b)).join(' \n ');
  const mixed = !named.filter((s) => s !== 'crossfade').length && MIXED.test(near);
  const styles: TransitionStyle[] = mixed ? [...MIXED_STYLES] : named.length ? named : ['crossfade'];
  let sec: number | undefined;
  const len = TRANSITION_LEN.exec(near);
  const v = len ? Number(len[1]!.replace(',', '.')) : NaN;
  if (Number.isFinite(v) && v >= 0.1 && v <= MAX_TRANSITION_SEC) sec = v;
  else if (HALF_SECOND.test(near)) sec = 0.5;
  else if (QUICK.test(near)) sec = QUICK_SEC;
  else if (SLOW.test(near)) sec = SLOW_SEC;
  return { styles, ...(sec !== undefined ? { sec } : {}), ...(mixed ? { mixed: true } : {}) };
}

/** With no shape named, the shape most of the clips were shot in (as displayed: a phone's rotation counts). */
export function aspectFromClips(probes: ReadonlyArray<Pick<BannerProbe, 'width' | 'height' | 'rotation'>>): MontageAspect {
  const portrait = probes.filter((p) => displaysPortrait(p)).length;
  return portrait * 2 > probes.length ? '9:16' : '16:9';
}

/** The sound of a montage request: the mode, and the music and narration files it lays (absent = none). */
export interface MontageSound {
  mode: SoundMode;
  musicUrl?: string;
  voiceUrl?: string;
  /** The master second the narration starts at. */
  voiceStartSec?: number;
}

/**
 * The montage request body (./montageManifest parseAgentRequest takes it): hard cuts, the sound as asked (`sound`).
 * `clips[c]` is the plan's clip c: its URL and its index in the manifest, which every shot carries as `source`; a
 * photo's shot is an `image` shot (the lane turns it into a slow zoom of the shot's length). With music alone the
 * request is exactly what it always was (the bed path, clips muted); the clips' own sound is kept only when asked or
 * when there is no music.
 */
export function montageBody(
  plan: CutPlan,
  clips: ReadonlyArray<{ url: string; source: number; still?: boolean }>,
  sound: MontageSound,
  aspect: MontageAspect,
  manifest: readonly MontageManifestItem[],
  /** Per cut, its window and the transition into it (lib/services/montage/transitionPlan); absent = hard cuts. */
  transitions?: readonly TransitionShot[],
): Record<string, unknown> {
  const own = sound.mode === 'own' || sound.mode === 'own+music';
  return {
    shots: plan.cuts.map((c, k) => {
      const tr = transitions?.[k];
      return {
        url: clips[c.clip]?.url,
        source: clips[c.clip]?.source,
        kind: clips[c.clip]?.still ? 'image' : 'video',
        startSec: tr ? tr.startSec : c.startSec,
        endSec: tr ? tr.endSec : c.endSec,
        ...(c.speed !== undefined && c.speed !== 1 ? { speed: c.speed } : {}),
        transition: tr && k > 0 ? tr.transition : 'cut',
        ...(tr && k > 0 && tr.transition !== 'cut' && tr.transitionSec !== undefined ? { transitionSec: tr.transitionSec } : {}),
        muted: !own,
      };
    }),
    aspect,
    ...(sound.musicUrl ? { musicUrl: sound.musicUrl, musicStartSec: plan.musicStartSec } : {}),
    musicDuckDb: 0,
    musicOnly: sound.mode === 'music',
    ...(sound.musicUrl && sound.mode === 'own+music' ? { musicGainDb: MUSIC_UNDER_OWN_DB } : {}),
    ...(sound.voiceUrl ? { voiceUrl: sound.voiceUrl, ...(sound.voiceStartSec ? { voiceStartSec: sound.voiceStartSec } : {}) } : {}),
    manifest,
  };
}

export interface QcVerdict {
  ok: boolean;
  problems: string[];
  durationSec: number;
}

/**
 * QC of a finished master before it is delivered: a picture and a sound stream, the codecs every browser plays, and a
 * length within a second (or 3 %) of the plan. A master that fails is not delivered.
 */
export function qcMaster(probe: BannerProbe | null, expectedSec: number): QcVerdict {
  if (!probe) return { ok: false, problems: ['the finished file could not be read'], durationSec: 0 };
  const problems: string[] = [];
  if (!probe.hasVideo) problems.push('no picture');
  if (!probe.hasAudio) problems.push('no sound');
  if (probe.hasVideo && probe.videoCodec !== 'h264') problems.push(`picture codec ${probe.videoCodec ?? 'unknown'}`);
  if (probe.hasAudio && probe.audioCodec !== 'aac') problems.push(`sound codec ${probe.audioCodec ?? 'unknown'}`);
  const tolerance = Math.max(1, expectedSec * 0.03);
  if (!(Math.abs(probe.durationSec - expectedSec) <= tolerance)) {
    problems.push(`length ${probe.durationSec.toFixed(1)}s, planned ${expectedSec.toFixed(1)}s`);
  }
  return { ok: problems.length === 0, problems, durationSec: probe.durationSec };
}

// ── per-clip contribution QC (the owner's invariant, ./montageManifest) ──────────────────────────────────────────────

const r3 = (n: number) => Number(n.toFixed(3));

/** One shot on the master's timeline: where it sits in the OUTPUT and which window of which manifest file it shows. */
export interface TimelineShot {
  shot: number;
  source: number;
  outStartSec: number;
  outEndSec: number;
  srcStartSec: number;
  srcEndSec: number;
  /** The shot's playback speed (1 unless ramped): a second of the master shows `speed` seconds of the source. */
  speed: number;
}

/**
 * Where every shot lands in the master: cumulative shot lengths, folded the way the lane folds them (a cut adds the
 * shot; a transition overlaps it by its length, lib/services/montage/montagePlan timelineDuration). A shot's window
 * includes the transition into it and out of it: `outStartSec` is where it starts to show.
 */
export function outputTimeline(shots: ReadonlyArray<MontageShot & { source: number }>): TimelineShot[] {
  const out: TimelineShot[] = [];
  let total = 0;
  shots.forEach((s, i) => {
    const dur = shotDuration(s);
    const start = i === 0 || s.transition === 'cut' ? total : total - transitionOverlap(total, dur, s.transitionSec);
    out.push({ shot: i, source: s.source, outStartSec: r3(start), outEndSec: r3(start + dur), srcStartSec: s.startSec, srcEndSec: s.endSec, speed: shotSpeed(s) });
    total = start + dur;
  });
  return out;
}

/** Where one manifest video is looked for: the middle of its longest shot, in the master and in the source. */
export interface ClipProbePoint {
  index: number;
  name: string;
  /** The source's URL as the plan holds it (the live wiring re-signs it before reading). */
  url: string;
  shot: number;
  outT: number;
  srcT: number;
}

/**
 * A photo is looked for this far into its shot: the lane's slow zoom starts at 1× (lib/video/remixOps kenBurnsClip), so
 * a few frames in, the master shows the photo itself, conformed to the frame the way the QC conforms the source.
 */
export const STILL_QC_OFFSET_SEC = 0.1;

/**
 * One probe point per manifest picture (video or photo), in manifest order. A picture with no shot gets none (coverage
 * refused it earlier). A video is looked for in the middle of its longest shot (a transition takes at most 30 % of a
 * shot at either end, lib/services/montage/transitionPlan, so the middle is the clip alone); a photo just after its
 * shot starts, and after the transition into it.
 */
export function clipCheckPoints(request: AgentMontageRequest): ClipProbePoint[] {
  const timeline = outputTimeline(request.shots);
  const points: ClipProbePoint[] = [];
  for (const item of request.manifest) {
    if (item.kind !== 'video' && item.kind !== 'image') continue;
    const mine = timeline.filter((t) => t.source === item.index);
    if (!mine.length) continue;
    const best = mine.reduce((a, b) => (b.outEndSec - b.outStartSec > a.outEndSec - a.outStartSec ? b : a));
    const len = best.outEndSec - best.outStartSec;
    // A transition into the shot blends it with the one before: a photo is looked for just after it, never inside it.
    const prev = timeline[best.shot - 1];
    const inSec = prev ? Math.max(0, prev.outEndSec - best.outStartSec) : 0;
    const into = item.kind === 'image' ? Math.min(inSec + STILL_QC_OFFSET_SEC, inSec + len / 4) : len / 2;
    points.push({
      index: item.index, name: item.name, url: request.shots[best.shot]!.url, shot: best.shot,
      // A ramped shot shows `speed` seconds of its source per second of the master.
      outT: r3(best.outStartSec + into), srcT: item.kind === 'image' ? 0 : r3(best.srcStartSec + into * best.speed),
    });
  }
  return points;
}

/** Each checked frame is this many pixels square, 8-bit grey: small enough to ignore codec noise, big enough to see a scene. */
export const CLIP_QC_SIZE = 32;
/**
 * The largest mean absolute difference (0–255 grey levels over CLIP_QC_SIZE² pixels) at which an output frame still
 * counts as the source frame it should show. CALIBRATION (real ffmpeg, lib/agent/media/montageExec.ffmpeg.test.ts,
 * 2026-10-11): a clip that IS in the master measured 0.01–0.05 (testsrc, testsrc2, smptebars, rgbtestsrc, mandelbrot);
 * a clip swapped out for another measured 52.8. 12 sits well between, with room for real footage and codec noise.
 */
export const CLIP_QC_MAX_DIFF = 12;

/** Mean absolute difference of two equal-length grey frames; Infinity when they cannot be compared. */
export function frameDiff(a: Uint8Array | null | undefined, b: Uint8Array | null | undefined): number {
  if (!a || !b || a.length !== b.length || !a.length) return Number.POSITIVE_INFINITY;
  let s = 0;
  for (let i = 0; i < a.length; i += 1) s += Math.abs(a[i]! - b[i]!);
  return s / a.length;
}

/** The evidence one clip's check leaves on the job (result.qc.clips). `diff` null = a frame could not be read. */
export interface ClipEvidence {
  index: number;
  name: string;
  outT: number;
  srcT: number;
  diff: number | null;
  ok: boolean;
  /** The source moment that matched best, when it was not `srcT` (./montageWorker checkClips). */
  matchT?: number;
}

export interface ClipVerdict {
  ok: boolean;
  clips: ClipEvidence[];
  /** Clips whose frames were read and are NOT in the output (manifest indices). */
  missing: number[];
  /** Clips that could not be checked (a frame did not read). */
  unchecked: number[];
  problems: string[];
}

/**
 * Did every manifest video really contribute frames? For each probe point: the master's frame at `outT` against the
 * source's frame at `srcT` (conformed to the master's frame the way the lane conformed it). Fails closed: a frame that
 * cannot be read is a problem too, so a master is delivered only when every clip was SEEN in it.
 */
export function qcClips(
  points: readonly ClipProbePoint[],
  outFrames: ReadonlyArray<Uint8Array | null>,
  srcFrames: ReadonlyArray<Uint8Array | null>,
  maxDiff = CLIP_QC_MAX_DIFF,
): ClipVerdict {
  const clips: ClipEvidence[] = points.map((p, i) => {
    const d = frameDiff(outFrames[i], srcFrames[i]);
    const diff = Number.isFinite(d) ? Number(d.toFixed(2)) : null;
    return { index: p.index, name: p.name, outT: p.outT, srcT: p.srcT, diff, ok: diff !== null && diff <= maxDiff };
  });
  const missing = clips.filter((c) => c.diff !== null && !c.ok).map((c) => c.index);
  const unchecked = clips.filter((c) => c.diff === null).map((c) => c.index);
  const problems = [
    ...clips.filter((c) => c.diff !== null && !c.ok).map((c) => `clip ${c.index + 1} "${c.name}" is not in the output at ${c.outT}s (diff ${c.diff} > ${maxDiff})`),
    ...clips.filter((c) => c.diff === null).map((c) => `clip ${c.index + 1} "${c.name}" could not be checked at ${c.outT}s`),
  ];
  return { ok: problems.length === 0, clips, missing, unchecked, problems };
}

/** Sound and picture may end this far apart (an AAC frame is 23 ms; the mux ends the bed with the picture). */
export const AV_SYNC_TOLERANCE_SEC = 0.25;

export interface AvVerdict {
  ok: boolean;
  problems: string[];
  videoSec: number | null;
  audioSec: number | null;
  /** The picture's frames as counted, and the frames the plan's length takes at OUTPUT_FPS; null when not counted. */
  videoFrames: number | null;
  plannedFrames: number | null;
}

/**
 * A/V check of the master from its real stream lengths: a picture and a soundtrack, the picture as long as the plan
 * (qcMaster's tolerance) and the sound as long as the picture (AV_SYNC_TOLERANCE_SEC). The reader counts the picture's
 * packets (one per frame), and the check is FRAME-EXACT (Video Core v1.0 §4): the master holds exactly
 * round(planned × OUTPUT_FPS) frames — 70 s = 2100, 29.7 s = 891 — or it is not delivered, whatever the container says.
 * A picture whose frames were not counted fails the check as well (round 3, P0): unverified is not frame-exact.
 */
export function qcAvSync(d: StreamDurations | null, expectedSec: number): AvVerdict {
  if (!d) return { ok: false, problems: ['the stream lengths could not be read'], videoSec: null, audioSec: null, videoFrames: null, plannedFrames: null };
  const problems: string[] = [];
  if (d.videoSec === null) problems.push('no picture stream');
  if (d.audioSec === null) problems.push('no soundtrack stream');
  if (d.videoSec !== null && !(Math.abs(d.videoSec - expectedSec) <= Math.max(1, expectedSec * 0.03))) {
    problems.push(`picture ${d.videoSec.toFixed(2)}s, planned ${expectedSec.toFixed(2)}s`);
  }
  const videoFrames = typeof d.videoFrames === 'number' && Number.isFinite(d.videoFrames) ? d.videoFrames : null;
  const plannedFrames = Number.isFinite(expectedSec) && expectedSec > 0 ? Math.round(expectedSec * OUTPUT_FPS) : null;
  if (videoFrames !== null && plannedFrames !== null && videoFrames !== plannedFrames) {
    problems.push(`picture ${videoFrames} frames, planned ${plannedFrames} (${expectedSec.toFixed(3)}s at ${OUTPUT_FPS} fps)`);
  }
  // Round 3 (P0): the frame-exact check is MANDATORY. A reader that saw the picture but did not count its frames
  // leaves the length unverified, and an unverified master is not delivered as a frame-exact one (it used to pass on
  // the container's seconds alone). The live reader (lib/video/probeBanner parseFrameCrc) always counts.
  if (videoFrames === null && plannedFrames !== null && d.videoSec !== null) {
    problems.push(`picture frames not counted, planned ${plannedFrames}: the frame-exact check did not run`);
  }
  if (d.videoSec !== null && d.audioSec !== null && !(Math.abs(d.audioSec - d.videoSec) <= AV_SYNC_TOLERANCE_SEC)) {
    problems.push(`sound ${d.audioSec.toFixed(2)}s against picture ${d.videoSec.toFixed(2)}s`);
  }
  return { ok: problems.length === 0, problems, videoSec: d.videoSec, audioSec: d.audioSec, videoFrames, plannedFrames };
}

// ── provenance: what each source really contributes, read from the render graph (Media Studio v2.0 §6) ─────────────

/** One source's share of the master: every window of it the master shows, where, and for how long in total. */
export interface SourceContribution {
  index: number;
  name: string;
  kind: 'video' | 'image';
  shots: number;
  /** Seconds of the MASTER this source fills. Every used picture has more than 0, or the plan was refused. */
  outputSec: number;
  /** `speed`: a ramped window plays its source at this speed (absent = 1). */
  windows: Array<{ outStartSec: number; outEndSec: number; srcStartSec: number; srcEndSec: number; speed?: number }>;
}

/** The audio clocks of a montage, kept apart (Media Studio v2.0 §D): the track's own clock and the master's. */
export interface AudioTiming {
  /** Seconds into the ORIGINAL track that play at the master's first frame (the user's offset, exactly). */
  sourceStartSec: number;
  /** Where on the master's timeline the track starts. Agent G's montage lays it from the first frame. */
  timelineStartSec: number;
  /** How long the master is: the track must play from sourceStartSec for this long (the quote refused otherwise). */
  targetSec: number;
  /** What happens at the track's end: Agent G never loops or extends it; the quote refuses a track too short. */
  endPolicy: 'stop';
  /** The clips' own sound (Media Studio v2.0 sourceAudioPolicy): removed (music only, or a silent edit), or kept. */
  sourceAudio: 'remove' | 'preserve';
  /** What the track does to it (replacementAudioPolicy): replaces it, is mixed beneath it, or there is no track. */
  replacementAudio: 'replace' | 'mix' | 'none';
  /** The narration, when there is one: where on the master it starts; the rest steps back under it. */
  voice?: { timelineStartSec: number };
}

/**
 * The source-contribution manifest of a signed request: built from the SAME shots the lane renders (outputTimeline),
 * so it describes the render graph, not the plan's intentions. Sources with no shot are absent (the request's coverage
 * check refused such a plan before it was signed).
 */
export function sourceContribution(request: AgentMontageRequest): SourceContribution[] {
  const timeline = outputTimeline(request.shots);
  const out: SourceContribution[] = [];
  for (const item of request.manifest) {
    if (!isPictureKind(item.kind)) continue;
    const mine = timeline.filter((t) => t.source === item.index);
    if (!mine.length) continue;
    out.push({
      index: item.index, name: item.name, kind: item.kind === 'image' ? 'image' : 'video', shots: mine.length,
      outputSec: r3(mine.reduce((sum, t) => sum + (t.outEndSec - t.outStartSec), 0)),
      windows: mine.map((t) => ({ outStartSec: t.outStartSec, outEndSec: t.outEndSec, srcStartSec: t.srcStartSec, srcEndSec: t.srcEndSec, ...(t.speed !== 1 ? { speed: t.speed } : {}) })),
    });
  }
  return out;
}

/** The audio clocks a signed request asks for. */
export function audioTiming(request: AgentMontageRequest): AudioTiming {
  return {
    sourceStartSec: r3(request.musicStartSec ?? 0),
    timelineStartSec: 0,
    targetSec: r3(timelineDuration(request.shots)),
    endPolicy: 'stop',
    // montagePipeline: musicOnly → 'bed' (the clips' sound is dropped), otherwise 'under' (it stays, the track ducks).
    sourceAudio: request.musicOnly || request.shots.every((s) => s.muted) ? 'remove' : 'preserve',
    replacementAudio: !request.musicUrl ? 'none' : request.musicOnly ? 'replace' : 'mix',
    ...(request.voiceUrl ? { voice: { timelineStartSec: r3(request.voiceStartSec ?? 0) } } : {}),
  };
}

/** The QC outcome vocabulary (Media Studio v2.0 §6). Agent G's montage QC is all machine checks: PASS or FAIL. */
export type QcOutcome = 'PASS' | 'PARTIAL' | 'FAIL' | 'UNVERIFIED';
