/** Words of the Live Agent Workspace (v5.1 Phase 7) in the site's three languages. */
import type { ApprovalKind, RunState, StepState } from '@/lib/agent/liveWorkspace/model';

export type Lang = 'ka' | 'en' | 'ru';
export const langOf = (locale: string): Lang => (locale === 'en' ? 'en' : locale === 'ru' ? 'ru' : 'ka');

export interface Words {
  title: string;
  subtitle: string;
  mock: string;
  runs: string;
  approvals: string;
  noApprovals: string;
  noRuns: string;
  steps: string;
  parallel: string;
  spent: (n: number, max: number) => string;
  stepCount: (done: number, all: number) => string;
  pause: string;
  resume: string;
  cancel: string;
  approve: string;
  decline: string;
  tapToAllow: string;
  expiresIn: (clock: string) => string;
  files: string;
  restart: string;
  run: Record<RunState, string>;
  step: Record<StepState, string>;
  kind: Record<ApprovalKind, string>;
  answered: { approved: string; declined: string; expired: string };
  noCredits: string;
}

export const WORDS: Record<Lang, Words> = {
  ka: {
    title: 'Agent G · სამუშაო სივრცე',
    subtitle: 'ყველა დავალება, ნაბიჯი და დასტური ერთ ადგილას',
    mock: 'სადემონსტრაციო მონაცემები: არაფერი სრულდება და კრედიტები არ იხარჯება',
    runs: 'დავალებები',
    approvals: 'დასტურები',
    noApprovals: 'დასტურს არაფერი ელოდება',
    noRuns: 'დავალება ჯერ არ არის',
    steps: 'ნაბიჯები',
    parallel: 'პარალელურად',
    spent: (n, max) => `✦${n} / ✦${max}`,
    stepCount: (d, a) => `${d}/${a} ნაბიჯი`,
    pause: 'პაუზა',
    resume: 'გაგრძელება',
    cancel: 'გაუქმება',
    approve: 'ნებართვა',
    decline: 'უარი',
    tapToAllow: 'ეს მოქმედება მხოლოდ შენი დასტურით სრულდება',
    expiresIn: (c) => `ვადა: ${c}`,
    files: 'ფაილები',
    restart: 'თავიდან ჩვენება',
    run: { planned: 'გეგმა მზადაა', awaiting_approval: 'გელოდება', running: 'მიმდინარეობს', paused: 'პაუზაზეა', delivered: 'მზადაა', failed: 'ვერ შესრულდა', cancelled: 'გაუქმდა', settled: 'მზადაა · ანგარიშსწორება დასრულდა' },
    step: { pending: 'წინ არის', queued: 'რიგშია', active: 'მიმდინარეობს', waiting: 'გელოდება', done: 'შესრულდა', failed: 'ვერ შესრულდა', skipped: 'არ შესრულებულა' },
    kind: { spend: 'ხარჯი', external: 'გარე მოქმედება', sensitive: 'მგრძნობიარე მოქმედება' },
    answered: { approved: 'ნებადართულია', declined: 'უარყოფილია', expired: 'ვადა გავიდა' },
    noCredits: 'კრედიტებს არ ხარჯავს',
  },
  en: {
    title: 'Agent G · Workspace',
    subtitle: 'Every task, step and approval in one place',
    mock: 'Demo data: nothing runs and no credits are spent',
    runs: 'Tasks',
    approvals: 'Approvals',
    noApprovals: 'Nothing is waiting for you',
    noRuns: 'No tasks yet',
    steps: 'Steps',
    parallel: 'in parallel',
    spent: (n, max) => `✦${n} / ✦${max}`,
    stepCount: (d, a) => `${d}/${a} steps`,
    pause: 'Pause',
    resume: 'Resume',
    cancel: 'Cancel',
    approve: 'Allow',
    decline: 'Decline',
    tapToAllow: 'This action only goes ahead with your tap',
    expiresIn: (c) => `expires in ${c}`,
    files: 'Files',
    restart: 'Replay',
    run: { planned: 'Plan ready', awaiting_approval: 'Waiting for you', running: 'Running', paused: 'Paused', delivered: 'Done', failed: 'Failed', cancelled: 'Cancelled', settled: 'Done · settled' },
    step: { pending: 'up next', queued: 'queued', active: 'in progress', waiting: 'waiting for you', done: 'done', failed: 'failed', skipped: 'not reached' },
    kind: { spend: 'Spend', external: 'Outside action', sensitive: 'Sensitive action' },
    answered: { approved: 'Allowed', declined: 'Declined', expired: 'Expired' },
    noCredits: 'no credits',
  },
  ru: {
    title: 'Agent G · Рабочее пространство',
    subtitle: 'Все задачи, шаги и подтверждения в одном месте',
    mock: 'Демо-данные: ничего не выполняется, кредиты не списываются',
    runs: 'Задачи',
    approvals: 'Подтверждения',
    noApprovals: 'Ничего не ждёт вашего ответа',
    noRuns: 'Задач пока нет',
    steps: 'Шаги',
    parallel: 'параллельно',
    spent: (n, max) => `✦${n} / ✦${max}`,
    stepCount: (d, a) => `${d}/${a} шагов`,
    pause: 'Пауза',
    resume: 'Продолжить',
    cancel: 'Отменить',
    approve: 'Разрешить',
    decline: 'Отказать',
    tapToAllow: 'Это действие выполняется только после вашего нажатия',
    expiresIn: (c) => `истекает через ${c}`,
    files: 'Файлы',
    restart: 'Повторить',
    run: { planned: 'План готов', awaiting_approval: 'Ждёт вас', running: 'Выполняется', paused: 'На паузе', delivered: 'Готово', failed: 'Не удалось', cancelled: 'Отменено', settled: 'Готово · расчёт завершён' },
    step: { pending: 'впереди', queued: 'в очереди', active: 'выполняется', waiting: 'ждёт вас', done: 'выполнено', failed: 'не удалось', skipped: 'не выполнялось' },
    kind: { spend: 'Расход', external: 'Внешнее действие', sensitive: 'Чувствительное действие' },
    answered: { approved: 'Разрешено', declined: 'Отказано', expired: 'Истекло' },
    noCredits: 'без кредитов',
  },
};
