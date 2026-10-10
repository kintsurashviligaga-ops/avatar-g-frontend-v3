/**
 * lib/agent/media/taskSteps.ts — Agent G's montage, MP3 and edit cards as a list of steps, the way a task panel shows work:
 * every step from the upload to the saved result stays on the card, ✓ when done, a spinner on the one in progress, an
 * empty circle on what is still ahead. Pure, no network, safe in the browser; components/studio/AgentTaskCard draws it.
 *
 * ⚠️ WHY A LIST. The card used to be one line that the next stage replaced („Preparing the files" → „Joining the shots"
 * …), with nothing at all while the files uploaded and nothing after the result landed: the Preview admin run of
 * 2026-10-09 read as „it sent, did nothing, then the card flashed and vanished". The owner asked for the panel his own
 * tasks show in. So the card is the whole road, built here from the card state alone: the job's stage says how far it
 * got, and every step before that stage is done even when a poll skipped it (a 3-second read can miss a short stage).
 */
import type { AgentAudioState } from './audioChat';
import { formatBytes } from './audioChat';
import type { AgentMontageState } from './montageChat';
import { priceLabel } from './montageChat';
import { editsLine, outputLine, type AgentEditState } from './editChat';

type Lang = 'ka' | 'en' | 'ru';
const pick = (locale: string): Lang => (locale === 'en' ? 'en' : locale === 'ru' ? 'ru' : 'ka');
const sec = (n: number) => (Math.round(n * 10) / 10).toString();

/**
 * done · active (spinner) · waiting (the user's move: the plan before Start) · pending (empty circle) ·
 * failed (✕, where it broke) · stopped (where Stop or Cancel ended it) · skipped (never reached after an end).
 */
export type StepState = 'done' | 'active' | 'waiting' | 'pending' | 'failed' | 'stopped' | 'skipped';

export interface TaskStep {
  key: string;
  label: string;
  state: StepState;
  /** What the step found or made („119 BPM · every cut on a beat"). */
  detail?: string;
  /** A word on the step's state („2/4", „Waiting for Start", „Stopping…"). */
  note?: string;
  /** The detail is a caution (rights the source could not show). */
  warn?: boolean;
  /** Extra attributes for the detail line (tests read the rights from it). */
  attrs?: Record<string, string>;
}

export type TaskStatus = 'working' | 'waiting' | 'done' | 'failed' | 'stopped';

export interface TaskCardModel {
  title: string;
  steps: TaskStep[];
  done: number;
  total: number;
  /** „3/8 steps". */
  countText: string;
  status: TaskStatus;
  statusText: string;
  /** The job's own percent while it runs (the thin bar under the header). */
  pct: number | null;
  /** The card's clock: running from `from`, or frozen at `to`. Absent while the plan waits for the user. */
  clock: { from: number; to?: number } | null;
}

const T = {
  agentMontage: { ka: 'მონტაჟი მუსიკის რიტმზე', en: 'Montage to the beat', ru: 'Монтаж под бит' },
  agentAudio: { ka: 'MP3-ის ამოღება', en: 'MP3 extraction', ru: 'Извлечение MP3' },
  working: { ka: 'მუშაობს', en: 'Working', ru: 'В работе' },
  stopping: { ka: 'ვაჩერებ…', en: 'Stopping…', ru: 'Останавливаю…' },
  waiting: { ka: 'ველოდები შენს დასტურს', en: 'Waiting for you', ru: 'Жду вашего решения' },
  done: { ka: 'მზადაა', en: 'Done', ru: 'Готово' },
  failed: { ka: 'ვერ შესრულდა', en: 'Did not finish', ru: 'Не удалось' },
  stopped: { ka: 'გაჩერდა', en: 'Stopped', ru: 'Остановлено' },
  dismissed: { ka: 'გაუქმდა', en: 'Cancelled', ru: 'Отменено' },
  waitStart: { ka: 'ველოდები „დაწყებას“', en: 'Waiting for Start', ru: 'Жду «Начать»' },
  // Montage steps.
  upload: { ka: 'ფაილების ატვირთვა', en: 'Upload the files', ru: 'Загрузка файлов' },
  analyse: { ka: 'ბითის და ხანგრძლივობის ანალიზი', en: 'Read the beat and the lengths', ru: 'Анализ бита и длительности' },
  plan: { ka: 'გეგმა და შენი დასტური', en: 'Plan and your go-ahead', ru: 'План и ваше подтверждение' },
  prepare: { ka: 'ფაილების მომზადება', en: 'Prepare the files', ru: 'Подготовка файлов' },
  normalize: { ka: 'კადრების ჭრა ერთ ფორმატში', en: 'Cut the shots to one format', ru: 'Нарезка кадров в один формат' },
  stitch: { ka: 'კადრების გაერთიანება', en: 'Join the shots', ru: 'Склейка кадров' },
  music: { ka: 'მუსიკის დადება', en: 'Lay the track under it', ru: 'Наложение трека' },
  finish: { ka: 'შემოწმება და შენახვა', en: 'Check and save', ru: 'Проверка и сохранение' },
  savedLib: { ka: 'ბიბლიოთეკაშიც შევინახე', en: 'Also saved to your Library', ru: 'Сохранено и в Библиотеку' },
  noBeat: { ka: 'მკაფიო ბითი არ არის · ნახევარწამიანი ბადე', en: 'No steady beat · an even half-second grid', ru: 'Чёткого бита нет · ровная сетка в полсекунды' },
  onBeat: { ka: 'ყოველი ჭრა ბითზე', en: 'every cut on a beat', ru: 'каждая склейка в бит' },
  // MP3 steps.
  checkLink: { ka: 'ბმულის შემოწმება', en: 'Check the link', ru: 'Проверка ссылки' },
  readFile: { ka: 'ფაილის ატვირთვა და წაკითხვა', en: 'Upload and read the file', ru: 'Загрузка и чтение файла' },
  rights: { ka: 'გამოყენების უფლება', en: 'Usage rights', ru: 'Права на использование' },
  extract: { ka: 'ხმის ამოღება MP3-ად', en: 'Take the sound out as MP3', ru: 'Извлечение звука в MP3' },
  qc: { ka: 'შედეგის შემოწმება', en: 'Check the result', ru: 'Проверка результата' },
  save: { ka: 'შენახვა', en: 'Save it', ru: 'Сохранение' },
  yourFile: { ka: 'შენი ფაილი', en: 'your file', ru: 'ваш файл' },
  own: { ka: 'შენი ატვირთულია', en: 'yours', ru: 'ваш файл' },
  unverified: { ka: 'შეუმოწმებელი: დაწყება ნიშნავს, რომ ფაილი შენია ან ლიცენზია გაქვს', en: 'unverified: Start means the file is yours or licensed to you', ru: 'не проверены: «Начать» означает, что файл ваш или у вас есть лицензия' },
  // Edit steps.
  agentEdit: { ka: 'ვიდეოს რედაქტირება', en: 'Video edit', ru: 'Правка видео' },
  agentStill: { ka: 'კადრი ვიდეოდან', en: 'A still from the video', ru: 'Кадр из видео' },
  readVideo: { ka: 'ვიდეოს ატვირთვა და წაკითხვა', en: 'Upload and read the video', ru: 'Загрузка и чтение видео' },
  openResult: { ka: 'ჩემი ბოლო შედეგის გახსნა', en: 'Open my last result', ru: 'Открыть мой последний результат' },
  editRender: { ka: 'ვიდეოს დამუშავება', en: 'Edit the video', ru: 'Обработка видео' },
  stillRender: { ka: 'კადრის ამოღება', en: 'Take the still', ru: 'Снять кадр' },
} as const;

const say = (k: keyof typeof T, lang: Lang) => T[k][lang];

/** „3/8 steps" · „3/8 ნაბიჯი" · „Шаги: 3/8". */
export function countText(done: number, total: number, locale: string): string {
  const lang = pick(locale);
  return lang === 'en' ? `${done}/${total} steps` : lang === 'ru' ? `Шаги: ${done}/${total}` : `${done}/${total} ნაბიჯი`;
}

type End = 'failed' | 'stopped';

/**
 * Lay the step states out from the index the work is at. `end` marks that step as where the work ended (a failure, a
 * stop) and everything after it as never reached.
 */
function lay(keys: readonly string[], at: number, mode: 'active' | 'waiting' | 'done' | End): StepState[] {
  return keys.map((_, i) => {
    if (mode === 'done' || i < at) return 'done';
    if (i > at) return mode === 'failed' || mode === 'stopped' ? 'skipped' : 'pending';
    return mode;
  });
}

function finish(title: string, steps: TaskStep[], status: TaskStatus, statusText: string, pct: number | null,
  clock: TaskCardModel['clock'], locale: string): TaskCardModel {
  const done = steps.filter((s) => s.state === 'done').length;
  return { title, steps, done, total: steps.length, countText: countText(done, steps.length, locale), status, statusText, pct, clock };
}

const clamp = (n: number | undefined) => (typeof n === 'number' && isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : null);

// ── The montage ──────────────────────────────────────────────────────────────────────────────────────────────────────

export const MONTAGE_STEPS = ['upload', 'analyse', 'plan', 'prepare', 'normalize', 'stitch', 'music', 'finish'] as const;
/** The job's stage → the step it belongs to (lib/agent/media/montageWorker's stages). */
const MONTAGE_STAGE_AT: Record<string, number> = { queued: 3, starting: 3, retrying: 3, resolve: 3, bridge: 3, normalize: 4, stitch: 5, music: 6, completed: 7 };

export function montageTask(s: AgentMontageState, locale: string): TaskCardModel {
  const lang = pick(locale);
  const q = s.quote;
  const total = s.names?.length ?? 0;
  const ranAt = s.stage ? (MONTAGE_STAGE_AT[s.stage] ?? 3) : 3;

  let at: number;
  let mode: 'active' | 'waiting' | 'done' | End;
  let status: TaskStatus;
  let statusText: string;
  switch (s.phase) {
    case 'reading':
      at = total > 0 && (s.uploaded ?? 0) >= total ? 1 : 0; mode = 'active'; status = 'working'; statusText = say('working', lang); break;
    case 'quoted':
      at = 2; mode = 'waiting'; status = 'waiting'; statusText = say('waiting', lang); break;
    case 'running':
      at = ranAt; mode = 'active'; status = 'working'; statusText = say(s.stopping ? 'stopping' : 'working', lang); break;
    case 'done':
      at = MONTAGE_STEPS.length; mode = 'done'; status = 'done'; statusText = say('done', lang); break;
    case 'cancelled':
      at = ranAt; mode = 'stopped'; status = 'stopped'; statusText = say('stopped', lang); break;
    case 'dismissed':
      at = 2; mode = 'stopped'; status = 'stopped'; statusText = say('dismissed', lang); break;
    case 'failed':
    default:
      // No plan yet: it broke on the upload or on reading the files; with a plan, on the step its stage names.
      at = q ? ranAt : s.error === 'upload_failed' ? 0 : 1; mode = 'failed'; status = 'failed'; statusText = say('failed', lang); break;
  }
  const states = lay(MONTAGE_STEPS, at, mode);

  const clips = Math.max(0, total - 1);
  const filesDetail = total > 0
    ? (lang === 'en' ? `${clips} clip${clips === 1 ? '' : 's'} · 1 track` : lang === 'ru' ? `клипов: ${clips} · трек: 1` : `${clips} კლიპი · 1 მუსიკა`)
    : undefined;
  const beatDetail = q ? (q.beatSynced && q.bpm ? `${Math.round(q.bpm)} BPM · ${say('onBeat', lang)}` : say('noBeat', lang)) : undefined;
  const planDetail = q
    ? (lang === 'en' ? `${q.shots} shots from ${q.clips} clip${q.clips === 1 ? '' : 's'} · ${sec(q.totalSec)} s · ${q.aspect} · ${priceLabel(q.credits, locale)}`
      : lang === 'ru' ? `${q.shots} кадров из клипов (${q.clips}) · ${sec(q.totalSec)} с · ${q.aspect} · ${priceLabel(q.credits, locale)}`
        : `${q.shots} კადრი ${q.clips} კლიპიდან · ${sec(q.totalSec)} წმ · ${q.aspect} · ${priceLabel(q.credits, locale)}`)
    : undefined;

  const steps: TaskStep[] = MONTAGE_STEPS.map((key, i) => {
    const state = states[i]!;
    const step: TaskStep = { key, label: say(key, lang), state };
    if (key === 'upload') {
      if (state === 'active' && total > 0) step.note = `${Math.min(s.uploaded ?? 0, total)}/${total}`;
      else if (state === 'done' && filesDetail) step.detail = filesDetail;
    }
    if (key === 'analyse' && state === 'done' && beatDetail) step.detail = beatDetail;
    if (key === 'plan') {
      if (planDetail && state !== 'pending' && state !== 'skipped') step.detail = planDetail;
      if (state === 'waiting') step.note = say('waitStart', lang);
      if (state === 'stopped') step.note = say('dismissed', lang);
    }
    if (state === 'active' && s.stopping) step.note = say('stopping', lang);
    if (key === 'finish' && state === 'done') step.detail = say('savedLib', lang);
    return step;
  });

  const clock = clockOf(s.phase, s.t0, s.t1);
  return finish(say('agentMontage', lang), steps, status, statusText, s.phase === 'running' ? clamp(s.pct) : null, clock, locale);
}

// ── The MP3 ──────────────────────────────────────────────────────────────────────────────────────────────────────────

export const AUDIO_STEPS = ['source', 'rights', 'plan', 'extract', 'qc', 'save'] as const;
/** The job's stage → the step it belongs to (lib/agent/media/audioWorker's stages). */
const AUDIO_STAGE_AT: Record<string, number> = { queued: 3, starting: 3, retrying: 3, extract: 3, qc: 4, upload: 5, completed: 5 };

export function audioTask(s: AgentAudioState, locale: string): TaskCardModel {
  const lang = pick(locale);
  const q = s.quote;
  const source = q?.source ?? s.source ?? 'link';
  const ranAt = s.stage ? (AUDIO_STAGE_AT[s.stage] ?? 3) : 3;

  let at: number;
  let mode: 'active' | 'waiting' | 'done' | End;
  let status: TaskStatus;
  let statusText: string;
  switch (s.phase) {
    case 'checking':
      at = 0; mode = 'active'; status = 'working'; statusText = say('working', lang); break;
    case 'quoted':
      at = 2; mode = 'waiting'; status = 'waiting'; statusText = say('waiting', lang); break;
    case 'running':
      at = ranAt; mode = 'active'; status = 'working'; statusText = say(s.stopping ? 'stopping' : 'working', lang); break;
    case 'done':
      at = AUDIO_STEPS.length; mode = 'done'; status = 'done'; statusText = say('done', lang); break;
    case 'cancelled':
      at = ranAt; mode = 'stopped'; status = 'stopped'; statusText = say('stopped', lang); break;
    case 'dismissed':
      at = 2; mode = 'stopped'; status = 'stopped'; statusText = say('dismissed', lang); break;
    case 'failed':
    default:
      // No plan: the source itself was refused (a platform, a page, a file that would not upload).
      at = q ? ranAt : 0; mode = 'failed'; status = 'failed'; statusText = say('failed', lang); break;
  }
  const states = lay(AUDIO_STEPS, at, mode);

  const size = q?.bytes ? ` · ${formatBytes(q.bytes, locale)}` : '';
  const sourceDetail = q ? `${q.source === 'file' ? say('yourFile', lang) : (q.host ?? '')}${size}` : undefined;
  const r = q?.rights;
  const rightsDetail = r
    ? r.status === 'licensed'
      ? `${r.license ?? ''}${r.author ? (lang === 'en' ? `, by ${r.author}` : lang === 'ru' ? `, автор: ${r.author}` : `, ავტორი: ${r.author}`) : ''}`
      : r.status === 'own' ? say('own', lang) : say('unverified', lang)
    : undefined;
  const free = lang === 'en' ? 'free' : lang === 'ru' ? 'бесплатно' : 'უფასო';
  const planDetail = q ? `„${q.name}“ · MP3 ${q.bitrateKbps} kbps · ${q.credits > 0 ? `✦ ${q.credits}` : free}` : undefined;

  const steps: TaskStep[] = AUDIO_STEPS.map((key, i) => {
    const state = states[i]!;
    const label = key === 'source' ? say(source === 'file' ? 'readFile' : 'checkLink', lang) : say(key, lang);
    const step: TaskStep = { key, label, state };
    if (key === 'source' && state === 'done' && sourceDetail) step.detail = sourceDetail;
    if (key === 'rights' && state === 'done' && r && rightsDetail) {
      step.detail = rightsDetail;
      step.warn = r.status === 'unverified';
      step.attrs = { 'data-testid': 'agent-audio-rights', 'data-rights': r.status };
    }
    if (key === 'plan') {
      if (planDetail && state !== 'pending' && state !== 'skipped') step.detail = planDetail;
      if (state === 'waiting') step.note = say('waitStart', lang);
      if (state === 'stopped') step.note = say('dismissed', lang);
    }
    if (state === 'active' && s.stopping) step.note = say('stopping', lang);
    if (key === 'save' && state === 'done') step.detail = say('savedLib', lang);
    return step;
  });

  const clock = clockOf(s.phase, s.t0, s.t1);
  return finish(say('agentAudio', lang), steps, status, statusText, s.phase === 'running' ? clamp(s.pct) : null, clock, locale);
}

// ── The edit ─────────────────────────────────────────────────────────────────────────────────────────────────────────

export const EDIT_STEPS = ['source', 'plan', 'render', 'qc', 'save'] as const;
/** The job's stage → the step it belongs to (lib/agent/media/editWorker's stages). */
const EDIT_STAGE_AT: Record<string, number> = { queued: 2, starting: 2, retrying: 2, render: 2, qc: 3, upload: 4, completed: 4 };

export function editTask(s: AgentEditState, locale: string): TaskCardModel {
  const lang = pick(locale);
  const q = s.quote;
  const still = q?.plan.output === 'jpg';
  const ranAt = s.stage ? (EDIT_STAGE_AT[s.stage] ?? 2) : 2;

  let at: number;
  let mode: 'active' | 'waiting' | 'done' | End;
  let status: TaskStatus;
  let statusText: string;
  switch (s.phase) {
    case 'reading':
      at = 0; mode = 'active'; status = 'working'; statusText = say('working', lang); break;
    case 'quoted':
      at = 1; mode = 'waiting'; status = 'waiting'; statusText = say('waiting', lang); break;
    case 'running':
      at = ranAt; mode = 'active'; status = 'working'; statusText = say(s.stopping ? 'stopping' : 'working', lang); break;
    case 'done':
      at = EDIT_STEPS.length; mode = 'done'; status = 'done'; statusText = say('done', lang); break;
    case 'cancelled':
      at = ranAt; mode = 'stopped'; status = 'stopped'; statusText = say('stopped', lang); break;
    case 'dismissed':
      at = 1; mode = 'stopped'; status = 'stopped'; statusText = say('dismissed', lang); break;
    case 'failed':
    default:
      // No plan: the file would not upload or read, or the edit does not fit it.
      at = q ? ranAt : 0; mode = 'failed'; status = 'failed'; statusText = say('failed', lang); break;
  }
  const states = lay(EDIT_STEPS, at, mode);
  const free = lang === 'en' ? 'free' : lang === 'ru' ? 'бесплатно' : 'უფასო';
  const planDetail = q ? `${editsLine(q.edits, locale)} · ${outputLine(q.plan, locale)} · ${q.credits > 0 ? `✦ ${q.credits}` : free}` : undefined;

  const steps: TaskStep[] = EDIT_STEPS.map((key, i) => {
    const state = states[i]!;
    const label = key === 'source' ? say(s.source === 'previous' ? 'openResult' : 'readVideo', lang)
      : key === 'render' ? say(still ? 'stillRender' : 'editRender', lang)
        : say(key, lang);
    const step: TaskStep = { key, label, state };
    if (key === 'plan') {
      if (planDetail && state !== 'pending' && state !== 'skipped') step.detail = planDetail;
      if (state === 'waiting') step.note = say('waitStart', lang);
      if (state === 'stopped') step.note = say('dismissed', lang);
    }
    if (state === 'active' && s.stopping) step.note = say('stopping', lang);
    if (key === 'save' && state === 'done') step.detail = say('savedLib', lang);
    return step;
  });

  const clock = clockOf(s.phase, s.t0, s.t1);
  return finish(say(still ? 'agentStill' : 'agentEdit', lang), steps, status, statusText, s.phase === 'running' ? clamp(s.pct) : null, clock, locale);
}

/** The clock runs while Agent G works (reading the files, the run) and stops where the run ended; none on a plan. */
function clockOf(phase: string, t0: number | undefined, t1: number | undefined): TaskCardModel['clock'] {
  if (!t0 || phase === 'quoted' || phase === 'dismissed') return null;
  if (phase === 'reading' || phase === 'checking' || phase === 'running') return { from: t0 };
  return t1 ? { from: t0, to: t1 } : null;
}

/** 7 → „0:07", 83 → „1:23". */
export function clockText(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Does the card on screen own its job (the job tray leaves it alone)? While it runs, and after it ended in an answer the
 * server gave (done, stopped, failed): the card shows that end itself, so the tray's own „ready" row would only flash
 * and vanish under it (the „popped up and disappeared" of the 2026-10-09 run). Not when the follow lost the job (no
 * network, no such job, already running elsewhere): the job may still be going, and the tray is how the user sees it.
 */
export function cardOwnsJob(card: { phase: string; error?: string; quote?: { jobId?: string } } | undefined): string | null {
  const id = card?.quote?.jobId;
  if (!id) return null;
  if (card.phase === 'running' || card.phase === 'done' || card.phase === 'cancelled') return id;
  if (card.phase === 'failed' && card.error && !LOST.has(card.error)) return id;
  return null;
}
const LOST: ReadonlySet<string> = new Set(['network', 'not_found', 'in_progress', 'unauthenticated', 'rate_limited']);
