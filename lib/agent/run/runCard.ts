/**
 * lib/agent/run/runCard.ts — a multi-step Agent G run as one card in the chat (PART 6, G8 UI): the same step list as
 * the montage, MP3 and edit cards (lib/agent/media/taskSteps), with one row per run step, what each step is doing or
 * found, a credits line (held while a step runs, spent when it delivers), the step that waits for the user's yes, and
 * the run's own events in words. Pure, no network, safe in the browser; components/studio/AgentRunCard draws it.
 *
 * The card is built from the run as the server reads it (lib/tasks/taskView TaskView with its steps and events): the
 * card never decides a step's state itself, so a reload, a second tab and the job tray all tell the same story.
 */
import { formatDuration } from '@/lib/agent/media/audioChat';
import { audioErrorText, audioStageText } from '@/lib/agent/media/audioChat';
import { editErrorText, editLine, editStageText } from '@/lib/agent/media/editChat';
import { errorText as montageErrorText, priceLabel, stageText as montageStageText } from '@/lib/agent/media/montageChat';
import { countText, type StepState, type TaskCardModel, type TaskStatus, type TaskStep } from '@/lib/agent/media/taskSteps';
import type { MediaEdit } from '@/lib/agent/media/editPlan';
import type { EditAsk } from '@/lib/agent/media/editWords';
import type { TaskStepView, TaskView } from '@/lib/tasks/taskView';
import type { RunEvent } from './runEngine';
import type { RunSpec, RunTool } from './runSpec';
import type { RunChain } from './runChat';
import type { RunPlanView } from './runClient';

type Lang = 'ka' | 'en' | 'ru';
const pick = (locale: string): Lang => (locale === 'en' ? 'en' : locale === 'ru' ? 'ru' : 'ka');

/**
 * reading (uploading, planning) · planned (the plan waits for Start) · running (the run exists and is followed) ·
 * ended (the run reached a final status: its task says which) · failed (it never started, or the follow lost it) ·
 * dismissed (Cancel on the plan).
 */
export type AgentRunPhase = 'reading' | 'planned' | 'running' | 'ended' | 'failed' | 'dismissed';

/** One run card in the thread. Never persisted: a reload keeps the results (the Library) and the job tray keeps the run. */
export interface AgentRunState {
  phase: AgentRunPhase;
  chain: RunChain;
  /** The attachments' names, in the order sent. */
  names?: string[];
  /** Attachments settled so far / to upload (the upload step's „2/4"). */
  uploaded?: number;
  total?: number;
  plan?: RunPlanView;
  /** The signed spec and its token, sent back verbatim on Start. */
  spec?: RunSpec;
  token?: string;
  runId?: string;
  /** The last read of the run. */
  task?: TaskView;
  events?: RunEvent[];
  /** Stop was pressed and has not come back yet. */
  stopping?: boolean;
  /** The step whose yes is on its way. */
  approving?: string;
  /** Retry was pressed and the new run has not come back yet. */
  resuming?: boolean;
  /** When the working stretch began (the bubble, then Start) and when the run ended: the card's clock. */
  t0?: number;
  t1?: number;
  /** Why it never started (or the follow lost it), as a chat code (./runChat RunChatCode). */
  error?: string;
  /** The uploads that did not land. */
  files?: number[];
}

const T = {
  title: { ka: 'მრავალნაბიჯიანი დავალება', en: 'Multi-step task', ru: 'Многошаговая задача' },
  titleSoundCut: { ka: 'ხმა ერთი წყაროდან, კლიპები მასზე', en: 'One sound, the clips cut to it', ru: 'Звук из источника, клипы под него' },
  titleCutEdit: { ka: 'მონტაჟი და დამუშავება', en: 'Montage, then an edit', ru: 'Монтаж и правка' },
  upload: { ka: 'ფაილების ატვირთვა', en: 'Upload the files', ru: 'Загрузка файлов' },
  plan: { ka: 'გეგმა და შენი დასტური', en: 'Plan and your go-ahead', ru: 'План и ваше подтверждение' },
  soundFromFile: { ka: 'ვიდეოდან ხმის ამოღება', en: 'Take the sound out of the video', ru: 'Извлечение звука из видео' },
  soundFromLink: { ka: 'ბმულიდან ხმის ამოღება', en: 'Take the sound out of the link', ru: 'Извлечение звука по ссылке' },
  cutToSound: { ka: 'კლიპების მონტაჟი ამ ხმაზე', en: 'Cut the clips to that sound', ru: 'Монтаж клипов под этот звук' },
  cutToTrack: { ka: 'კლიპების მონტაჟი მუსიკაზე', en: 'Cut the clips to the track', ru: 'Монтаж клипов под трек' },
  editMontage: { ka: 'მონტაჟის დამუშავება', en: 'Edit the montage', ru: 'Правка монтажа' },
  finish: { ka: 'შემოწმება და შენახვა', en: 'Check and save', ru: 'Проверка и сохранение' },
  working: { ka: 'მუშაობს', en: 'Working', ru: 'В работе' },
  stopping: { ka: 'ვაჩერებ…', en: 'Stopping…', ru: 'Останавливаю…' },
  waiting: { ka: 'ველოდები შენს დასტურს', en: 'Waiting for you', ru: 'Жду вашего решения' },
  done: { ka: 'მზადაა', en: 'Done', ru: 'Готово' },
  partly: { ka: 'ნაწილობრივ მზადაა', en: 'Partly done', ru: 'Готово частично' },
  failed: { ka: 'ვერ შესრულდა', en: 'Did not finish', ru: 'Не удалось' },
  stopped: { ka: 'გაჩერდა', en: 'Stopped', ru: 'Остановлено' },
  dismissed: { ka: 'გაუქმდა', en: 'Cancelled', ru: 'Отменено' },
  waitStart: { ka: 'ველოდები „დაწყებას“', en: 'Waiting for Start', ru: 'Жду «Начать»' },
  inLine: { ka: 'რიგშია', en: 'In line', ru: 'В очереди' },
  reused: { ka: 'წინა ცდიდან, თავიდან არ გაკეთებულა', en: 'kept from the earlier try, not redone', ru: 'из прошлой попытки, не переделано' },
  savedLib: { ka: 'ბიბლიოთეკაშიც შევინახე', en: 'Also saved to your Library', ru: 'Сохранено и в Библиотеку' },
  skipped: { ka: 'არ დაწყებულა: წინა ნაბიჯი ვერ შესრულდა', en: 'Not started: the step before it did not finish', ru: 'Не начат: предыдущий шаг не завершился' },
  lost: { ka: 'ნაბიჯის სამუშაო დაიკარგა; „თავიდან ცდა“ მას ხელახლა გაუშვებს', en: 'The step’s job was lost; Retry runs it again', ru: 'Работа шага потерялась; «Повторить» запустит её снова' },
  inputMissing: { ka: 'ნაბიჯს შემავალი ფაილი არ ჰქონდა', en: 'The step had no input file', ru: 'У шага не было входного файла' },
  stillGoing: { ka: 'კავშირი გაწყდა; დავალება შეიძლება ისევ მიმდინარეობდეს', en: 'The connection dropped; the task may still be going', ru: 'Соединение прервалось; задача может ещё идти' },
} as const;
const say = (k: keyof typeof T, lang: Lang) => T[k][lang];

const UPLOAD = 'upload';
const PLAN = 'plan';
const FINISH = 'finish';

/** A run step's own row label. */
function stepLabel(tool: RunTool, chain: RunChain, lang: Lang): string {
  if (tool === 'audio_extract') return say(chain.kind === 'sound-cut' && 'url' in chain.source ? 'soundFromLink' : 'soundFromFile', lang);
  if (tool === 'montage') return say(chain.kind === 'sound-cut' ? 'cutToSound' : 'cutToTrack', lang);
  return say('editMontage', lang);
}

/** The edits of a chain in a few words („black and white colour · caption “Summer”"). */
export function chainEditsText(chain: RunChain, locale: string): string {
  if (chain.kind !== 'cut-edit') return '';
  // grade / fade / volume / caption: an ask is already the resolved edit (only trims and stills resolve against a file).
  return chain.edits.map((e: EditAsk) => editLine(e as MediaEdit, locale)).join(' · ');
}

/** Why a step ended without a result, in the words its own card uses. */
export function stepErrorText(tool: RunTool, code: string | null | undefined, locale: string): string {
  const lang = pick(locale);
  if (code === 'skipped') return say('skipped', lang);
  if (code === 'lost') return say('lost', lang);
  if (code === 'input_missing') return say('inputMissing', lang);
  if (tool === 'audio_extract') return audioErrorText(code ?? undefined, locale);
  if (tool === 'edit') return editErrorText(code ?? undefined, locale);
  return montageErrorText(code ?? undefined, locale);
}

/** A step's live stage, in the words its own card uses. */
function stepStageText(tool: RunTool, stage: string | null, locale: string): string {
  if (tool === 'audio_extract') return audioStageText(stage, locale);
  if (tool === 'edit') return editStageText(stage, locale);
  return montageStageText(stage, locale);
}

/** What a delivered step made („MP3 · 3:09", „0:31 · 9:16", „JPEG"). */
function resultLine(s: TaskStepView, lang: Lang): string | undefined {
  const r = s.result;
  if (!r) return undefined;
  const dur = r.durationSec ? formatDuration(r.durationSec) : '';
  if (r.media === 'audio') return ['MP3', dur].filter(Boolean).join(' · ');
  if (r.media === 'image') return 'JPEG';
  const parts = [dur, r.aspect ?? '', r.width && r.height ? `${r.width}×${r.height}` : ''].filter(Boolean);
  return parts.length ? parts.join(' · ') : lang === 'en' ? 'video' : lang === 'ru' ? 'видео' : 'ვიდეო';
}

/** One run step's state on the card. */
function stepStateOf(s: TaskStepView): StepState {
  switch (s.status) {
    case 'completed': return 'done';
    case 'running': return 'active';
    case 'queued': return s.taskId ? 'active' : 'pending';
    case 'awaiting_approval': return 'waiting';
    case 'failed': return 'failed';
    case 'partially_completed': return 'failed';
    case 'cancelled': return s.error === 'skipped' ? 'skipped' : 'stopped';
    default: return 'pending';
  }
}

export interface RunCredits {
  /** The most the run may charge without asking again (its plan). */
  approved: number;
  /** Held by the steps that run now. */
  reserved: number;
  /** Charged for what was delivered. */
  spent: number;
}

/** The run's credits from its plan and its steps as the server reads them. A step that ended without a result is paid back. */
export function runCredits(s: Pick<AgentRunState, 'plan' | 'task'>): RunCredits | null {
  if (!s.plan) return null;
  let reserved = 0;
  let spent = 0;
  for (const step of s.task?.steps ?? []) {
    const c = typeof step.credits === 'number' && step.credits > 0 ? step.credits : 0;
    if (step.status === 'completed' && !step.reused) spent += c;
    else if ((step.status === 'queued' && step.taskId) || step.status === 'running') reserved += c;
  }
  return { approved: s.plan.credits, reserved, spent };
}

/** The credits line: „Free", or „✦ 4 spent · ✦ 2 held · up to ✦ 8". */
export function creditsText(c: RunCredits, locale: string): string {
  const lang = pick(locale);
  if (c.approved <= 0 && c.reserved <= 0 && c.spent <= 0) return priceLabel(0, locale);
  const parts = [
    lang === 'en' ? `✦ ${c.spent} spent` : lang === 'ru' ? `потрачено ✦ ${c.spent}` : `დაიხარჯა ✦ ${c.spent}`,
    ...(c.reserved > 0 ? [lang === 'en' ? `✦ ${c.reserved} held` : lang === 'ru' ? `в резерве ✦ ${c.reserved}` : `დაკავებულია ✦ ${c.reserved}`] : []),
    lang === 'en' ? `up to ✦ ${c.approved}` : lang === 'ru' ? `не больше ✦ ${c.approved}` : `მაქსიმუმ ✦ ${c.approved}`,
  ];
  return parts.join(' · ');
}

/** What Retry would charge at most: the plan's price of every step not delivered. */
export function retryCredits(s: Pick<AgentRunState, 'plan' | 'task'>): number {
  const delivered = new Set((s.task?.steps ?? []).filter((x) => x.status === 'completed').map((x) => x.id));
  return (s.plan?.steps ?? []).filter((x) => !delivered.has(x.id)).reduce((n, x) => n + (x.credits > 0 ? x.credits : 0), 0);
}

/** Can the run be carried on (Retry): it ended without every result, and the server has it. */
export function canRetry(s: AgentRunState): boolean {
  const st = s.task?.status;
  return s.phase === 'ended' && !!s.runId && (st === 'failed' || st === 'partially_completed' || st === 'cancelled');
}

const creditsOfDetail = (detail: string | undefined): number | null => {
  const m = /(\d+)\s*credits?/.exec(detail ?? '');
  return m ? parseInt(m[1]!, 10) : null;
};

/** One event in words, with the step's own label. Internal bookkeeping (status words, invariants) says nothing. */
export function eventText(e: RunEvent, labels: Readonly<Record<string, string>>, locale: string): string | null {
  const lang = pick(locale);
  const who = e.step ? (labels[e.step] ?? e.step) : '';
  const c = creditsOfDetail(e.detail);
  const price = c !== null ? priceLabel(c, locale) : '';
  switch (e.type) {
    case 'run.created': return lang === 'en' ? 'You pressed Start: the run is created' : lang === 'ru' ? 'Вы нажали «Начать»: задача создана' : 'დააჭირე „დაწყებას“: დავალება შეიქმნა';
    case 'run.resumed': return lang === 'en' ? 'Carried on from the earlier try' : lang === 'ru' ? 'Продолжено с прошлой попытки' : 'გაგრძელდა წინა ცდიდან';
    case 'run.cancel_requested': return lang === 'en' ? 'You asked to stop' : lang === 'ru' ? 'Вы попросили остановить' : 'გაჩერება მთხოვე';
    case 'step.quoted': return lang === 'en' ? `${who}: priced (${price})` : lang === 'ru' ? `${who}: цена (${price})` : `${who}: ფასი (${price})`;
    case 'step.awaiting_approval': return lang === 'en' ? `${who}: needs your yes (${price})` : lang === 'ru' ? `${who}: нужно ваше «да» (${price})` : `${who}: შენს დასტურს ელოდება (${price})`;
    case 'step.approved': return lang === 'en' ? `${who}: you said yes` : lang === 'ru' ? `${who}: вы подтвердили` : `${who}: დაადასტურე`;
    case 'step.queued': return lang === 'en' ? `${who}: in line` : lang === 'ru' ? `${who}: в очереди` : `${who}: რიგშია`;
    case 'step.running': return lang === 'en' ? `${who}: working` : lang === 'ru' ? `${who}: в работе` : `${who}: მუშაობს`;
    case 'step.completed': return lang === 'en' ? `${who}: done` : lang === 'ru' ? `${who}: готово` : `${who}: მზადაა`;
    case 'step.failed': return lang === 'en' ? `${who}: did not finish` : lang === 'ru' ? `${who}: не удалось` : `${who}: ვერ შესრულდა`;
    case 'step.cancelled': return lang === 'en' ? `${who}: stopped` : lang === 'ru' ? `${who}: остановлен` : `${who}: გაჩერდა`;
    case 'step.skipped': return lang === 'en' ? `${who}: not started` : lang === 'ru' ? `${who}: не начат` : `${who}: არ დაწყებულა`;
    case 'step.reused': return lang === 'en' ? `${who}: kept from the earlier try` : lang === 'ru' ? `${who}: взят из прошлой попытки` : `${who}: წინა ცდიდან დარჩა`;
    case 'step.requote': return lang === 'en' ? `${who}: priced again` : lang === 'ru' ? `${who}: цена пересчитана` : `${who}: ფასი თავიდან დაითვალა`;
    default: return null;
  }
}

/** The card's model, its credits line and the last few events in words (newest last). */
export interface RunCardModel extends TaskCardModel {
  credits: string | null;
  log: string[];
  /** The step that waits for the user's yes, with the price and the quote the yes must name. */
  approval: { step: string; label: string; credits: number; quoteId: string } | null;
}

const LOG_LINES = 6;

export function runTask(s: AgentRunState, locale: string): RunCardModel {
  const lang = pick(locale);
  const tools: RunTool[] = s.plan?.steps.map((x) => x.tool)
    ?? (s.chain.kind === 'sound-cut' ? ['audio_extract', 'montage'] : ['montage', 'edit']);
  const ids: string[] = s.plan?.steps.map((x) => x.id) ?? (s.chain.kind === 'sound-cut' ? ['sound', 'cut'] : ['cut', 'edit']);
  const labels: Record<string, string> = {};
  ids.forEach((id, i) => { labels[id] = stepLabel(tools[i]!, s.chain, lang); });
  const views = new Map((s.task?.steps ?? []).map((v) => [v.id, v]));
  const total = s.total ?? s.names?.length ?? 0;
  const uploadsDone = total === 0 || (s.uploaded ?? 0) >= total;
  const runStatus = s.task?.status;
  const neverStarted = s.phase === 'failed' && !s.runId;

  // ── upload and plan ──
  let upload: StepState;
  let plan: StepState;
  if (s.phase === 'reading') {
    upload = uploadsDone ? 'done' : 'active';
    plan = uploadsDone ? 'active' : 'pending';
  } else if (s.phase === 'planned') {
    upload = 'done'; plan = 'waiting';
  } else if (s.phase === 'dismissed') {
    upload = 'done'; plan = 'stopped';
  } else if (neverStarted) {
    upload = s.error === 'upload_failed' ? 'failed' : 'done';
    plan = s.error === 'upload_failed' ? 'skipped' : 'failed';
  } else {
    upload = 'done'; plan = 'done';
  }
  const uploadStep: TaskStep = { key: UPLOAD, label: say('upload', lang), state: upload };
  if (upload === 'active' && total > 0) uploadStep.note = `${Math.min(s.uploaded ?? 0, total)}/${total}`;
  const planStep: TaskStep = { key: PLAN, label: say('plan', lang), state: plan };
  if (s.plan && plan !== 'pending' && plan !== 'skipped') {
    const n = s.plan.steps.length;
    planStep.detail = `${lang === 'en' ? `${n} steps` : lang === 'ru' ? `шагов: ${n}` : `${n} ნაბიჯი`} · ${priceLabel(s.plan.credits, locale)}`;
  }
  if (plan === 'waiting') planStep.note = say('waitStart', lang);
  if (plan === 'stopped') planStep.note = say('dismissed', lang);

  // ── the run's own steps ──
  const runSteps: TaskStep[] = ids.map((id, i) => {
    const tool = tools[i]!;
    const v = views.get(id);
    let state: StepState;
    if (v) state = stepStateOf(v);
    else if (s.phase === 'dismissed' || neverStarted) state = 'skipped';
    else if (s.phase === 'running' && i === 0) state = 'active'; // created, not read yet
    else state = 'pending';
    const step: TaskStep = { key: `step:${id}`, label: labels[id]!, state };
    if (tool === 'edit' && s.chain.kind === 'cut-edit' && state !== 'failed') step.detail = chainEditsText(s.chain, locale);
    if (v) {
      if (state === 'done') {
        const r = resultLine(v, lang);
        const credits = typeof v.credits === 'number' && v.credits > 0 ? ` · ✦ ${v.credits}` : '';
        step.detail = v.reused ? `${r ? `${r} · ` : ''}${say('reused', lang)}` : `${r ?? ''}${credits}`;
      } else if (state === 'active') {
        step.note = s.stopping ? say('stopping', lang) : v.taskId && (v.status === 'running' || v.stage) ? stepStageText(tool, v.stage, locale) : say('inLine', lang);
      } else if (state === 'waiting' && v.approval) {
        step.note = lang === 'en' ? `Needs your yes: ${priceLabel(v.approval.credits, locale)}` : lang === 'ru' ? `Нужно ваше «да»: ${priceLabel(v.approval.credits, locale)}` : `შენი დასტური: ${priceLabel(v.approval.credits, locale)}`;
      } else if (state === 'failed' || state === 'skipped') {
        step.detail = stepErrorText(tool, v.error, locale);
        step.warn = state === 'failed';
      }
    } else if (state === 'active' && s.stopping) {
      step.note = say('stopping', lang);
    }
    return step;
  });

  // ── check and save ──
  let fin: StepState = 'pending';
  if (runStatus === 'completed') fin = 'done';
  else if (runStatus === 'partially_completed') fin = 'failed';
  else if (s.phase === 'ended' || s.phase === 'dismissed' || neverStarted) fin = 'skipped';
  const finishStep: TaskStep = { key: FINISH, label: say('finish', lang), state: fin };
  if (fin === 'done') finishStep.detail = say('savedLib', lang);
  if (fin === 'failed') {
    const all = s.task?.steps ?? [];
    const got = all.filter((x) => x.status === 'completed').length;
    finishStep.detail = lang === 'en' ? `${got}/${all.length} results saved` : lang === 'ru' ? `сохранено результатов: ${got}/${all.length}` : `შენახულია ${got}/${all.length} შედეგი`;
  }

  const steps = [uploadStep, planStep, ...runSteps, finishStep];

  // ── the card's status ──
  let status: TaskStatus;
  let statusText: string;
  if (s.phase === 'reading') { status = 'working'; statusText = say('working', lang); }
  else if (s.phase === 'planned') { status = 'waiting'; statusText = say('waiting', lang); }
  else if (s.phase === 'dismissed') { status = 'stopped'; statusText = say('dismissed', lang); }
  else if (s.phase === 'failed') { status = 'failed'; statusText = s.runId && (s.error === 'network' || s.error === 'not_found') ? say('stillGoing', lang) : say('failed', lang); }
  else if (runStatus === 'completed') { status = 'done'; statusText = say('done', lang); }
  else if (runStatus === 'partially_completed') { status = 'failed'; statusText = say('partly', lang); }
  else if (runStatus === 'failed') { status = 'failed'; statusText = say('failed', lang); }
  else if (runStatus === 'cancelled') { status = 'stopped'; statusText = say('stopped', lang); }
  else if (runStatus === 'awaiting_approval') { status = 'waiting'; statusText = say('waiting', lang); }
  else { status = 'working'; statusText = say(s.stopping ? 'stopping' : 'working', lang); }

  const done = steps.filter((x) => x.state === 'done').length;
  const live = s.phase === 'reading' || s.phase === 'running';
  const clock = !s.t0 || s.phase === 'planned' || s.phase === 'dismissed' ? null : live ? { from: s.t0 } : s.t1 ? { from: s.t0, to: s.t1 } : null;
  const pct = s.phase === 'running' && typeof s.task?.pct === 'number' ? Math.max(0, Math.min(100, Math.round(s.task.pct))) : null;

  const credits = runCredits(s);
  const log = (s.events ?? []).map((e) => eventText(e, labels, locale)).filter((x): x is string => !!x).slice(-LOG_LINES);
  const waitingStep = (s.task?.steps ?? []).find((x) => x.status === 'awaiting_approval' && x.approval);
  const approval = waitingStep?.approval
    ? { step: waitingStep.id, label: labels[waitingStep.id] ?? waitingStep.id, credits: waitingStep.approval.credits, quoteId: waitingStep.approval.quoteId }
    : null;

  const title = s.chain.kind === 'sound-cut' ? say('titleSoundCut', lang) : s.chain.kind === 'cut-edit' ? say('titleCutEdit', lang) : say('title', lang);
  return {
    title, steps, done, total: steps.length, countText: countText(done, steps.length, locale), status, statusText, pct, clock,
    credits: credits ? creditsText(credits, locale) : null, log, approval,
  };
}
