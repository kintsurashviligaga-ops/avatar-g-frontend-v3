/**
 * lib/agent/media/cardPersist.ts — what of Agent G's cards in the chat (montage, MP3, edit, multi-step run) is saved
 * with the chat history, and how a card read back from it is shown again. Pure, no network, safe in the browser.
 *
 * ⚠️ WHY. The cards used to live in memory only („a reload keeps the result, not the buttons"). On the Preview run of
 * 2026-10-11 the owner switched the language while a montage rendered: the page mounted afresh, the chat that came back
 * had the bubble's words („Starting the edit") and no card, nothing followed the job any more, and the finished video
 * went to the Library and never into the chat. Now a card is saved with its message, lean (no upload bytes, no event
 * log, no half-pressed Stop), and the studio takes a card read back in 'running' to its job again by id, so the result
 * lands in the bubble that asked for it whatever happened to the page in between.
 *
 * A card read back where nothing can carry it on is closed honestly instead of spinning forever:
 *   · still reading the files (no plan yet): those reads lived in the old page; nothing was charged — send the files again;
 *   · a plan that expired, or one saved without its signed plan: closed as cancelled, nothing was charged;
 *   · a run whose start never answered (no run id): it may have started — the job list and the Library show it if so.
 * A plan still valid keeps its Start, so a language switch while reading the price loses nothing.
 */
import type { AgentAudioState } from './audioChat';
import type { AgentEditState } from './editChat';
import type { AgentMontageState } from './montageChat';
import type { AgentRunState } from '@/lib/agent/run/runCard';

type Lang = 'ka' | 'en' | 'ru';
const pick = (locale: string): Lang => (locale === 'en' ? 'en' : locale === 'ru' ? 'ru' : 'ka');

const SAY: Record<'interrupted' | 'expired' | 'startLost' | 'notStarted', Record<Lang, string>> = {
  interrupted: {
    ka: 'გვერდი ხელახლა ჩაიტვირთა, სანამ გეგმა მზად იქნებოდა, ამიტომ აქ შეჩერდა. არაფერი ჩამოგეჭრა. ფაილები ხელახლა გამომიგზავნე.',
    en: 'The page reloaded before the plan was ready, so it stopped here. Nothing was charged. Send the files again.',
    ru: 'Страница перезагрузилась до того, как план был готов, поэтому он остановился здесь. Ничего не списано. Отправьте файлы ещё раз.',
  },
  expired: {
    ka: 'ამ გეგმას ვადა გაუვიდა, ამიტომ დაწყება აღარ შეიძლება. არაფერი ჩამოგეჭრა. ახალი გეგმისთვის ხელახლა მთხოვე.',
    en: 'This plan has expired, so it can no longer be started. Nothing was charged. Ask again for a fresh plan.',
    ru: 'Срок этого плана истёк, его уже нельзя запустить. Ничего не списано. Попросите ещё раз, чтобы получить новый план.',
  },
  startLost: {
    ka: 'გვერდი ხელახლა ჩაიტვირთა, სანამ დავალება დაიწყებოდა. თუ ის მაინც დაიწყო, მის მსვლელობას დავალებების სიაში ნახავ, შედეგს კი ბიბლიოთეკაში.',
    en: 'The page reloaded while the task was starting. If it did start, you will see it in the job list and its result in the Library.',
    ru: 'Страница перезагрузилась, пока задача запускалась. Если она всё же началась, её ход виден в списке задач, а результат — в Библиотеке.',
  },
  notStarted: {
    ka: 'ეს დავალება სერვერზე ვერ ვიპოვე: გვერდი ხელახლა ჩაიტვირთა, სანამ ის დაიწყებოდა. არაფერი ჩამოგეჭრა. ხელახლა მთხოვე.',
    en: 'I could not find this job on the server: the page reloaded before it started. Nothing was charged. Ask again.',
    ru: 'Эта задача не найдена на сервере: страница перезагрузилась до её запуска. Ничего не списано. Попросите ещё раз.',
  },
};

/** A card taken back after a reload whose job the server has never seen: its run never got through. */
export function notStartedText(locale: string): string {
  return SAY.notStarted[pick(locale)];
}

// ── saving ─────────────────────────────────────────────────────────────────────────────────────────────────────────

/** A montage, MP3 or edit card as it is saved: the signed plan only while it can still be started, never a pending Stop. */
function leanJobCard<C extends AgentMontageState | AgentAudioState | AgentEditState>(c: C): C {
  const { request, token, stopping: _s, ...rest } = c;
  void _s;
  return (c.phase === 'quoted' && token ? { ...rest, request, token } : rest) as C;
}

export const persistMontage = (c: AgentMontageState): AgentMontageState => leanJobCard(c);
export const persistAudio = (c: AgentAudioState): AgentAudioState => leanJobCard(c);
export const persistEdit = (c: AgentEditState): AgentEditState => leanJobCard(c);

/** A run card as it is saved: no event log (the next read brings it back), no button half-pressed. */
export function persistRun(c: AgentRunState): AgentRunState {
  const { spec, token, events: _e, stopping: _s, approving: _a, resuming: _r, ...rest } = c;
  void _e; void _s; void _a; void _r;
  return (c.phase === 'planned' && spec && token ? { ...rest, spec, token } : rest) as AgentRunState;
}

// ── reading back ───────────────────────────────────────────────────────────────────────────────────────────────────

/** The message fields this module reads and writes (a chat Msg has them all). */
export interface CardMessage {
  text: string;
  noRetry?: boolean;
  montage?: AgentMontageState;
  audioJob?: AgentAudioState;
  editJob?: AgentEditState;
  runJob?: AgentRunState;
}

const expired = (quote: unknown, now: number): boolean => {
  const x = (quote as { expiresAt?: unknown } | undefined)?.expiresAt;
  return typeof x === 'number' && x <= now;
};

type JobCard = AgentMontageState | AgentAudioState | AgentEditState;

/** One montage, MP3 or edit card read back, and the bubble's words when they must change. */
function restoreJobCard<C extends JobCard>(c: C, now: number, lang: Lang): { card: C; text?: string } {
  if (c.phase === 'reading' || c.phase === 'checking') {
    return { card: { ...c, phase: 'failed', error: 'interrupted', stopping: false } as C, text: `⚠️ ${SAY.interrupted[lang]}` };
  }
  if (c.phase === 'quoted' && (!c.token || !c.quote || expired(c.quote, now))) {
    const { request: _q, token: _t, ...rest } = c;
    void _q; void _t;
    return { card: { ...rest, phase: 'dismissed' } as C, text: SAY.expired[lang] };
  }
  return { card: c.stopping ? { ...c, stopping: false } : c };
}

function restoreRunCard(c: AgentRunState, now: number, lang: Lang): { card: AgentRunState; text?: string } {
  if (c.phase === 'reading') {
    return { card: { ...c, phase: 'failed', error: 'interrupted' }, text: `⚠️ ${SAY.interrupted[lang]}` };
  }
  if (c.phase === 'planned' && (!c.spec || !c.token || expired(c.plan, now))) {
    const { spec: _s, token: _t, ...rest } = c;
    void _s; void _t;
    return { card: { ...rest, phase: 'dismissed' }, text: SAY.expired[lang] };
  }
  if (c.phase === 'running' && !c.runId) {
    return { card: { ...c, phase: 'failed', error: 'network' }, text: `⚠️ ${SAY.startLost[lang]}` };
  }
  return { card: c };
}

/**
 * The messages of a chat read back from the history, with every Agent G card in a state this page can carry on: a
 * running card stays running (the studio follows its job again), anything that lived only in the old page is closed
 * with a line that says what happened. Messages without a card are returned as they are.
 */
export function restoreAgentCards<M extends CardMessage>(messages: M[], locale: string, now: number = Date.now()): M[] {
  const lang = pick(locale);
  let changed = false;
  const out = messages.map((m) => {
    let next = m;
    const apply = (key: 'montage' | 'audioJob' | 'editJob' | 'runJob', r: { card: unknown; text?: string }) => {
      if (r.card === m[key] && r.text === undefined) return;
      next = { ...next, [key]: r.card, ...(r.text !== undefined ? { text: r.text, noRetry: true } : {}) };
    };
    if (m.montage) apply('montage', restoreJobCard(m.montage, now, lang));
    if (m.audioJob) apply('audioJob', restoreJobCard(m.audioJob, now, lang));
    if (m.editJob) apply('editJob', restoreJobCard(m.editJob, now, lang));
    if (m.runJob) apply('runJob', restoreRunCard(m.runJob, now, lang));
    if (next !== m) changed = true;
    return next;
  });
  return changed ? out : messages;
}
