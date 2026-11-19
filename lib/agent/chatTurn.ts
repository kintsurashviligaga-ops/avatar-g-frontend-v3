/**
 * lib/agent/chatTurn.ts — what the chat does with one typed or spoken message BEFORE any tool reads it as a prompt:
 * Agent G's reading of the words (lib/agent/intent) against what is on screen (its cards, the job tray, a reply or a
 * render in flight) gives one step for the studio to carry out. Pure, no React, no network: the studio builds the
 * snapshot, this decides, the studio acts.
 *
 *   pass             the message goes on to the doors that already handle it (focus gate, remix, cards, panels, chat)
 *   say              Agent G answers in words: the user's turn and Agent G's note, nothing runs, nothing is charged
 *   stop             stop what is named (cards, tray jobs, the reply or render in flight), then say what was stopped
 *   continue-stream  the last reply was cut off at the length limit: the model picks it up from there
 *   redo             the last Agent G card stopped or failed: ask Agent G again with the same turn (↻), a fresh plan
 *   requote          the montage plan on screen takes the change („9:16", „20 seconds", „music from 5 s") and is
 *                    priced again; nothing runs before Start
 *   remontage        the montage Agent G just DELIVERED takes the change the same way (the music from 5 s): a new plan
 *                    from the same files and words, nothing runs before Start
 *   edit             Agent G edits one attached video or picture, or its own last result, itself (./media/editExec):
 *                    the edits read from the words (./media/editWords; text, logos, masks and captions ./media/layerWords),
 *                    planned on a card, run on Start
 *   run              two steps chained (./run/runChat): the sound of one video or link with the other clips cut to it,
 *                    or a montage and the edits a montage does not do itself; planned on one card, run on Start
 *   resume           „continue" after a run that ended without every result: a new run that keeps what was delivered
 *   analyze          a question about the one attached video or audio file, or about one public YouTube link: Agent G
 *                    reads the whole file with Gemini (./media/analyzeChat) and answers on a card; nothing is charged
 */
import { classifyAgentIntent, type IntentInput } from './intent';
import type { AgentIntent, CapabilityId } from './contracts';
import { asksForEdit, mineEdits, onlyDescribing, type EditAsk } from './media/editWords';
import { mineComposition } from './media/layerWords';
import { editErrorText } from './media/editChat';
import { runChainAsk, type RunChain } from './run/runChat';
import { analyzeAsk, type AnalyzeAsk } from './media/analyzeChat';
import {
  askReply, continueReply, interceptAct, mergeMontagePrompt, statusReply, stopReply, unsupportedReply, type ActIntent, type WorkItem,
} from './intentReply';

/** One Agent G card in the thread (montage, MP3, edit or a multi-step run), in thread order. */
export interface ThreadCard {
  id: string;
  kind: 'montage' | 'audio' | 'edit' | 'run';
  phase: string;
  /** The step in words, already in the UI language (the card's own stage line). */
  stage?: string | null;
  pct?: number | null;
  /** A Stop already went out for it. */
  stopping?: boolean;
  /** Montage: the words the plan was made from. */
  prompt?: string;
}

/** One job in the tray that no card narrates (the card's own jobs are its). */
export interface TrayJob {
  id: string;
  kind: string;
  label: string;
  status: string;
  pct?: number | null;
  stage?: string | null;
  /** Observed from the server (a reload-recovered render): stopped through the task API, when it can be. */
  durable?: boolean;
  cancellable?: boolean;
}

export interface ChatSnapshot {
  /** The composer's tool: 'chat' or a focus tool. */
  mode: string;
  locale: string;
  /** What this message carries, by kind. */
  attachments: IntentInput['attachments'];
  cards: readonly ThreadCard[];
  jobs: readonly TrayJob[];
  /** A chat reply streaming ('reply') or a single-slot render in flight ('render'). */
  foreground: 'reply' | 'render' | null;
  /** The last reply stopped at the output-token limit. */
  lastTruncated: boolean;
  /** ↻ under the last reply would ask Agent G again (its card stopped or failed). */
  lastRedoable: boolean;
  /** The id of the montage card waiting for Start, when it is the latest reply: a change re-quotes it. */
  pendingMontageId: string | null;
  /** The last finished result in the thread. */
  previous: IntentInput['previous'];
  /** Agent G's media routes are open to this user (AGENT_G_MEDIA_EXEC). */
  montageOn: boolean;
  audioOn: boolean;
  editOn?: boolean;
  /** The last result is an edit Agent G made in this thread (its layers and captions can be changed in words). */
  previousEdit?: boolean;
  /** The last result is a montage Agent G delivered in this thread: its card, and the words it was planned from. */
  previousMontage?: { id: string; prompt?: string } | null;
  /** Multi-step runs are open to this user (the same AGENT_G_MEDIA_EXEC door as the montage). */
  runOn?: boolean;
  /** The last reply is a run card that ended without every result: „continue" carries it on. */
  resumableRunId?: string | null;
  /** Agent G's whole-file analysis is open to this user (AGENT_G_FILE_ANALYSIS, the route's GET). */
  analyzeOn?: boolean;
}

export type ChatStep =
  | { kind: 'pass'; intent: AgentIntent }
  /** keepComposer: the words and files stay in the box (an ask: add what is missing and send again). */
  | { kind: 'say'; text: string; keepComposer?: boolean; intent: AgentIntent }
  | {
    kind: 'stop';
    text: string;
    /** Running cards to stop and waiting plans to drop. */
    cards: string[];
    /** Local tray jobs to cancel. */
    jobs: string[];
    /** Server-observed jobs to stop through the task API. */
    durable: string[];
    /** Stop the reply or render in flight. */
    foreground: boolean;
    intent: AgentIntent;
  }
  | { kind: 'continue-stream'; intent: AgentIntent }
  | { kind: 'redo'; intent: AgentIntent }
  | { kind: 'requote'; cardId: string; prompt: string; intent: AgentIntent }
  | { kind: 'remontage'; cardId: string; prompt: string; intent: AgentIntent }
  /**
   * source: a video or picture attached to this message (`file`: its index in the attachments, default the first video),
   * or the last result Agent G made in this thread. `logo`: the index of the attached picture an image layer puts on
   * (./media/layerWords LOGO_REF, replaced by the uploaded file's path).
   */
  | { kind: 'edit'; source: 'file' | 'previous'; edits: EditAsk[]; file?: number; logo?: number; intent: AgentIntent }
  /** Two steps chained, planned on one card (nothing runs before Start). */
  | { kind: 'run'; chain: RunChain; intent: AgentIntent }
  /** Carry the run card on (a new run that reuses what was delivered). */
  | { kind: 'resume'; cardId: string; intent: AgentIntent }
  /** A question about the attached file or a YouTube link, answered by the whole-file analysis on its own card. */
  | { kind: 'analyze'; ask: AnalyzeAsk; intent: AgentIntent }
  /**
   * A video or a music video asked in words („24-წამიანი მუსიკალური კლიპი გამიკეთე"): the Video tool opens in that mode, at
   * that length, and plans for review; nothing renders or is charged before Generate (Video Core v1.0 AC-01). No
   * `durationSec` when the words named none: the tool must not inherit the last project's length (§10).
   */
  | { kind: 'open'; tool: 'video'; videoMode: 'musicvideo' | 'documentary'; durationSec?: number; aspect?: string; intent: AgentIntent };

const LIVE_CARD: ReadonlySet<string> = new Set(['reading', 'checking', 'running']);
const LIVE_JOB: ReadonlySet<string> = new Set(['queued', 'rendering']);

const JOB_WHAT: Record<string, WorkItem['what']> = {
  image: 'image', product: 'image', music: 'music', video: 'video', remix: 'video', avatar: 'avatar', lipsync: 'avatar',
};

const cardItem = (c: ThreadCard): WorkItem => ({
  what: c.kind,
  status: c.phase === 'quoted' ? 'waiting' : 'running',
  ...(c.stage ? { stage: c.stage } : {}),
  ...(typeof c.pct === 'number' ? { pct: c.pct } : {}),
});

const jobItem = (j: TrayJob): WorkItem => ({
  what: JOB_WHAT[j.kind] ?? 'other',
  status: j.status === 'queued' ? 'queued' : 'running',
  ...(j.label ? { label: j.label } : {}),
  ...(j.stage ? { stage: j.stage } : {}),
  ...(typeof j.pct === 'number' ? { pct: j.pct } : {}),
});

const foregroundItem = (f: 'reply' | 'render'): WorkItem => ({ what: f === 'reply' ? 'reply' : 'other', status: 'running' });

/** What is running or waiting right now, in the order the user sees it. */
export function workOf(s: ChatSnapshot): WorkItem[] {
  const cards = s.cards.filter((c) => LIVE_CARD.has(c.phase) || c.phase === 'quoted').map(cardItem);
  const jobs = s.jobs.filter((j) => LIVE_JOB.has(j.status)).map(jobItem);
  return [...cards, ...jobs, ...(s.foreground ? [foregroundItem(s.foreground)] : [])];
}

/**
 * An edit Agent G makes itself, when its route is open: a frame-shape change (media.edit) of the one video attached, or
 * an edit of its own last video (media.edit, or a remix op aimed at the previous result). On an attached video every
 * other edit stays the remix's, as before. Null: not this, the old flow answers.
 */
function editStep(text: string, intent: ActIntent, s: ChatSnapshot): ChatStep | null {
  if (s.mode !== 'chat' || !s.editOn) return null;
  const kinds = s.attachments ?? [];
  const cap = intent.capability;
  const onPrevious = intent.target === 'previous' && !kinds.length;
  // Subtitles are the speech written out (the remix's job), and a music start is the montage's (remontage).
  if (intent.params.editOp === 'captions' || intent.params.editOp === 'music_offset') return null;
  if (!(cap === 'media.edit' || (onPrevious && cap === 'video.remix'))) return null;
  const locale = intent.lang;
  if (intent.missing.includes('previous') || (onPrevious && s.previous?.kind !== 'video')) {
    return { kind: 'say', text: editErrorText('no_previous', locale), keepComposer: true, intent };
  }
  // A picture (the one attached, or Agent G's last result) takes a new frame, a colour and layers (v2.1).
  const picture = cap === 'media.edit' && ((kinds.length === 1 && kinds[0] === 'image') || (!kinds.length && s.previous?.kind === 'image'));
  if (picture) {
    const mined = mineEdits(text);
    if (!mined.edits.length || mined.edits.some((e) => !PICTURE_OPS.has(e.op))) return null;
    return { kind: 'edit', source: kinds.length ? 'file' : 'previous', edits: mined.edits, ...(kinds.length ? { file: 0 } : {}), intent };
  }
  if (intent.missing.includes('video')) return { kind: 'say', text: askReply(intent, locale), keepComposer: true, intent };
  const source = onPrevious ? 'previous' : intent.target === 'attachment' && kinds.length === 1 && kinds[0] === 'video' ? 'file' : null;
  if (!source) return { kind: 'say', text: editErrorText('bad_input', locale), keepComposer: true, intent };
  const mined = mineEdits(text);
  if (mined.unsupported.includes('cut_middle')) return { kind: 'say', text: editErrorText('cut_middle', locale), intent };
  if (mined.unsupported.includes('reverse')) return { kind: 'say', text: editErrorText('reverse', locale), intent };
  if (mined.missing.includes('caption_text')) return { kind: 'say', text: editErrorText('caption_text', locale), keepComposer: true, intent };
  if (!mined.edits.length) return null;
  return { kind: 'edit', source, edits: mined.edits, ...(source === 'file' ? { file: 0 } : {}), intent };
}

/**
 * CapCut's effects (GG 2026-10-11 17:38Z): light and colour, a turn, a mirror, a zoom, a shake, a glitch, steadying, a
 * frame filled with the picture's own blur, the sound cleaned. Agent G's own edit reads them (free, a plan before Start);
 * the remix has none of them, so on the one file attached they are Agent G's, with every other edit of the same words.
 * With nothing attached, words that name the video or picture („ამ ვიდეოს ზუმი დაუმატე") are about Agent G's last
 * result. Played backwards is said to be out, not passed to a door that would try it.
 */
function effectStep(text: string, intent: AgentIntent, s: ChatSnapshot): ChatStep | null {
  if (s.mode !== 'chat' || !s.editOn) return null;
  const kinds = s.attachments ?? [];
  const attached = kinds.length === 1 && (kinds[0] === 'video' || kinds[0] === 'image') ? kinds[0] : null;
  const prev = s.previous?.kind === 'video' || s.previous?.kind === 'image' ? s.previous.kind : null;
  const onPrevious = !kinds.length && prev !== null && THIS_MEDIA.test(text);
  const kind = attached ?? (onPrevious ? prev : null);
  if (!kind) return null;
  const mined = mineEdits(text);
  const effect = mined.edits.some((e) => EFFECT_OPS.has(e.op) || (e.op === 'aspect' && e.fit === 'blur'));
  const reverse = kind === 'video' && mined.unsupported.includes('reverse');
  if (!effect && !reverse) return null;
  // „this video looks warm", "I filmed this with a shaky camera", "is it warm?": words that describe, not an ask.
  if (onlyDescribing(mined) && !asksForEdit(text)) return null;
  const locale = intent.lang;
  if (reverse) return { kind: 'say', text: editErrorText('reverse', locale), intent };
  if (mined.unsupported.includes('cut_middle')) return { kind: 'say', text: editErrorText('cut_middle', locale), intent };
  if (mined.missing.length || mined.logo) return null;
  // A photo takes the turn, the mirror, the light and colour; a zoom on a photo is bringing it to life (video.generate).
  if (kind === 'image' && mined.edits.some((e) => !PICTURE_OPS.has(e.op))) return null;
  return attached
    ? { kind: 'edit', source: 'file', edits: mined.edits, file: 0, intent }
    : { kind: 'edit', source: 'previous', edits: mined.edits, intent };
}
/** The video or picture named, with nothing attached: Agent G's last result. */
const THIS_MEDIA = /(?:ამ|ეს|ამას|წინა|ბოლო)\s+(?:ვიდეო|კლიპ|სურათ|ფოტო|შედეგ|მონტაჟ)|(?:this|that|the|last|previous)\s+(?:video|clip|picture|photo|image|result|montage|edit)|(?:это|этот|эту|последн\p{L}*|предыдущ\p{L}*)\s+(?:видео|клип|фото|картинк|результат|монтаж)/iu;
const EFFECT_OPS: ReadonlySet<string> = new Set(['adjust', 'flip', 'rotate', 'motion', 'stabilize', 'denoise', 'loudness']);

/** What a picture can take (./media/editPlan PICTURE_EDITS): places erased, a turn, a mirror, a new frame, light and colour, layers. */
const PICTURE_OPS: ReadonlySet<string> = new Set(['erase', 'rotate', 'flip', 'aspect', 'adjust', 'grade', 'layers']);

/**
 * Media Studio v2.1: text, a CTA, a logo, a mask or captions put on a video or a picture, or a change to what Agent G
 * put on its own last result („ზედა ლოგო მოხსენი", „იგივე ქეფშენებით და მათ გარეშე"). Words that only change what is
 * there are read so on the last result only when that is an edit of Agent G's: otherwise „make the text more premium"
 * is about a text the chat wrote, and the chat answers it. Null: not this.
 */
function compositionStep(text: string, intent: AgentIntent, s: ChatSnapshot): ChatStep | null {
  if (s.mode !== 'chat' || !s.editOn) return null;
  // A question about the file („what text should I put on it?") is the chat's; „can you add a title?" asks for one.
  if (/[?？]\s*$/u.test(text.trim()) && !asksForEdit(text)) return null;
  const comp = mineComposition(text);
  if (!comp.hit) return null;
  const kinds = s.attachments ?? [];
  if (kinds.some((k) => k !== 'video' && k !== 'image')) return null;
  // Photos with a new video's brief („Veo 3.1, 8s … 0–2s: … 2–8s: … no captions") are its first frame, not pictures to
  // edit: the shot times are not caption lines (GG's E2E 2026-10-26 answered „This file has no picture.").
  if (kinds.length && kinds.every((k) => k === 'image') && intent.kind === 'act'
    && (intent.capability === 'video.generate' || intent.capability === 'video.music-video')) return null;
  const locale = intent.lang;
  const videos = kinds.flatMap((k, i) => (k === 'video' ? [i] : []));
  const images = kinds.flatMap((k, i) => (k === 'image' ? [i] : []));
  const prev = s.previous?.kind === 'video' || s.previous?.kind === 'image' ? s.previous.kind : null;
  const revises = comp.asks.some((a) => (a.op === 'layers' ? Boolean(a.change?.length || a.remove?.length) : !a.track));
  const adds = comp.asks.some((a) => (a.op === 'layers' ? Boolean(a.add?.length) : Boolean(a.track)));

  // Which file: a video attached; else the picture attached (the second one is the logo); else the last result.
  let source: 'file' | 'previous' | null = null;
  let file: number | undefined, logo: number | undefined;
  if (videos.length > 1) return null;
  if (videos.length === 1) {
    if (images.length > (comp.logo ? 1 : 0)) return null;
    source = 'file'; file = videos[0];
    if (comp.logo) logo = images[0];
  } else if (images.length) {
    if (images.length > 2 || (images.length === 2 && !comp.logo)) return null;
    if (comp.logo && images.length === 1 && prev && s.previousEdit) { source = 'previous'; logo = images[0]; }
    else { source = 'file'; file = images[0]; if (comp.logo) logo = images[1]; }
  } else if (prev && (s.previousEdit || (adds && !revises))) {
    source = 'previous';
  }
  if (!source) return null;
  const video = source === 'file' ? kinds[file!] === 'video' : prev === 'video';

  // What cannot be done, or is missing, is said before anything is uploaded.
  if (comp.unsupported.includes('remove_object')) return { kind: 'say', text: editErrorText('remove_object', locale), intent };
  const speech = comp.unsupported.find((u) => u === 'speech_captions' || u === 'translate_captions');
  if (speech) return video ? { kind: 'say', text: editErrorText(speech, locale), intent } : null;
  // A fresh file has no layers of ours: what is removed from it is in the picture, erased at the place said.
  if (source === 'file' && comp.asks.some((a) => a.op === 'layers' && a.remove?.some((t) => t.all || !(t.at ?? t.where)))) {
    return { kind: 'say', text: editErrorText('erase_where', locale), keepComposer: true, intent };
  }
  if (comp.missing.includes('cta_text')) return { kind: 'say', text: editErrorText('cta_text', locale), keepComposer: true, intent };
  if (comp.missing.includes('caption_text')) return { kind: 'say', text: editErrorText('caption_text', locale), keepComposer: true, intent };
  if (comp.logo && logo === undefined) return { kind: 'say', text: editErrorText('logo_file', locale), keepComposer: true, intent };

  const mined = mineEdits(text);
  if (mined.unsupported.includes('cut_middle')) return { kind: 'say', text: editErrorText('cut_middle', locale), intent };
  if (mined.unsupported.includes('reverse')) return { kind: 'say', text: editErrorText('reverse', locale), intent };
  if (!mined.edits.length) return null;
  // A picture takes a frame, a colour and layers; captions, a trim or a speed are a video's.
  if (!video && mined.edits.some((e) => !PICTURE_OPS.has(e.op))) return { kind: 'say', text: editErrorText('no_video', locale), keepComposer: true, intent };
  return { kind: 'edit', source, edits: mined.edits, ...(file !== undefined ? { file } : {}), ...(logo !== undefined ? { logo } : {}), intent };
}

/** One message, read against the screen: the step the studio takes. */
export function planChatTurn(text: string, s: ChatSnapshot): ChatStep {
  const pending: { capability: CapabilityId } | null = s.pendingMontageId && s.montageOn ? { capability: 'agent.montage' } : null;
  const intent = classifyAgentIntent({
    text,
    attachments: s.attachments ?? [],
    mode: s.mode,
    previous: s.previous ?? null,
    pending,
    locale: s.locale,
  });
  const locale = intent.lang;

  if (intent.kind === 'control') {
    if (intent.op === 'status') return { kind: 'say', text: statusReply(workOf(s), locale), intent };

    if (intent.op === 'stop') {
      const cards = s.cards.filter((c) => (c.phase === 'running' && !c.stopping) || c.phase === 'quoted');
      const live = s.jobs.filter((j) => LIVE_JOB.has(j.status));
      const jobs = live.filter((j) => !j.durable).map((j) => j.id);
      const durable = live.filter((j) => j.durable && j.cancellable).map((j) => j.id);
      // A server job that cannot be stopped from here is not listed as stopped: it was not.
      const stoppedJobs = live.filter((j) => !j.durable || j.cancellable);
      const items = [...cards.map(cardItem), ...stoppedJobs.map(jobItem), ...(s.foreground ? [foregroundItem(s.foreground)] : [])];
      return {
        kind: 'stop', text: stopReply(items, locale), cards: cards.map((c) => c.id), jobs, durable, foreground: !!s.foreground, intent,
      };
    }

    // continue
    if (s.lastTruncated) return { kind: 'continue-stream', intent };
    if (s.cards.some((c) => c.phase === 'quoted')) return { kind: 'say', text: continueReply('plan-waiting', locale), intent };
    if (workOf(s).length) return { kind: 'say', text: continueReply('running', locale), intent };
    // A run that stopped part-way goes on from where it ended: what it delivered is kept, not made again.
    if (s.resumableRunId && s.runOn) return { kind: 'resume', cardId: s.resumableRunId, intent };
    if (s.lastRedoable) return { kind: 'redo', intent };
    // In the chat „continue" after a finished answer is the conversation's own (a story, a list): the model has it.
    return s.mode === 'chat' ? { kind: 'pass', intent } : { kind: 'say', text: continueReply('nothing', locale), intent };
  }

  // Two steps in one message („the sound of the first video, the other clips cut to it"; „cut to the music, black and
  // white"): one run card. Before the one-step readings, which would answer the first with „the track is missing" and cut
  // the second without its edits.
  if (s.mode === 'chat' && s.runOn) {
    const chain = runChainAsk(text, s.attachments ?? []);
    if (chain) return { kind: 'run', chain, intent };
  }

  // Text, a logo, a mask or captions on the file, or a change to what Agent G put on its last result (v2.1).
  const composed = compositionStep(text, intent, s);
  if (composed) return composed;
  const effect = effectStep(text, intent, s);
  if (effect) return effect;

  if (intent.kind === 'act') {
    // „The music from 5 s" or „only the last five" on the montage Agent G just delivered: the same files planned again
    // with the change.
    if (s.mode === 'chat' && s.montageOn && s.previousMontage && intent.target === 'previous'
      && ((intent.capability === 'media.edit' && intent.params.editOp === 'music_offset') || intent.capability === 'agent.montage')) {
      return { kind: 'remontage', cardId: s.previousMontage.id, prompt: mergeMontagePrompt(s.previousMontage.prompt, text), intent };
    }
    const edit = editStep(text, intent, s);
    if (edit) return edit;
    const how = interceptAct(intent, { mode: s.mode, montageOn: s.montageOn, audioOn: s.audioOn });
    if (how === 'requote' && s.pendingMontageId) {
      const card = s.cards.find((c) => c.id === s.pendingMontageId);
      return { kind: 'requote', cardId: s.pendingMontageId, prompt: mergeMontagePrompt(card?.prompt, text), intent };
    }
    if (how === 'ask') return { kind: 'say', text: askReply(intent, locale), keepComposer: true, intent };
    if (how === 'unsupported') return { kind: 'say', text: unsupportedReply(intent, locale), intent };
    // A video or a music video asked in words, in the chat: the Video tool in that mode, at that length (Video Core v1.0
    // AC-01). A photo brought to life and „the same character" keep their own path; the edits were answered above.
    // Only with nothing attached but pictures (the board's references) and tracks (kept for the soundtrack): an attached
    // video or document ("make a video from this script", "a video like this one") is material the legacy flow reads,
    // and the Video tool would plan the board from the words alone and clear the file from the box.
    if (s.mode === 'chat' && !intent.missing.length && intent.target !== 'previous'
      && (s.attachments ?? []).every((k) => k === 'image' || k === 'audio')
      && (intent.capability === 'video.music-video' || (intent.capability === 'video.generate' && !intent.params.fromImage && !intent.params.sameCharacter && !intent.params.editOp))) {
      return {
        kind: 'open', tool: 'video', videoMode: intent.capability === 'video.music-video' ? 'musicvideo' : 'documentary',
        ...(intent.params.durationSec !== undefined ? { durationSec: intent.params.durationSec } : {}),
        ...(intent.params.aspect ? { aspect: intent.params.aspect } : {}),
        intent,
      };
    }
  }

  // „What is said in my video?" where the analysis is open: Gemini reads the whole file, not a few frames. A request to
  // make something (a song about the clip) is not a question about it; edits and the MP3 ask never reach here.
  if (s.mode === 'chat' && s.analyzeOn && intent.kind !== 'act') {
    const ask = analyzeAsk(text, s.attachments ?? []);
    if (ask) return { kind: 'analyze', ask, intent };
  }

  return { kind: 'pass', intent };
}

/**
 * Words typed in a tool whose Run spends at once (product ad, character swap, remix) that are not a request: talk, a
 * question, feedback, „stop", „where are you?". They go to the chat; only the panel's own Generate runs on them anyway.
 */
export function wordsAreForChat(text: string, mode: string, locale: string): boolean {
  const t = text.trim();
  if (!t) return false;
  const k = classifyAgentIntent({ text: t, mode, locale }).kind;
  return k === 'control' || k === 'talk' || k === 'question' || k === 'feedback';
}

/** „tell me …", „explain …" anywhere in the message: the classifier reads these as plain chat, never as a request. */
const TELL_ME = /(?<![\p{L}\p{N}])(?:tell\s+me|explain|მითხარი|მიამბე|ამიხსენი|ახსენი|განმიმარტე|расскажи|объясни|поясни)(?![\p{L}\p{N}])/iu;

/**
 * Words that only talk ABOUT something — a question, talk, feedback, a control word, or „tell me / explain …" — and order
 * nothing. The send path's multi-scene shortcut (OmniStudio) reads „storyboard" or „3 scenes" as a film brief; with these
 * words around it the storyboard is the topic: „open the settings and tell me what a storyboard is" planned a two-scene
 * film (tests/agent-g-panels.spec.ts) instead of going to the chat.
 */
export function wordsAskToBeTold(text: string, mode: string, locale: string): boolean {
  return wordsAreForChat(text, mode, locale) || TELL_ME.test(text);
}
