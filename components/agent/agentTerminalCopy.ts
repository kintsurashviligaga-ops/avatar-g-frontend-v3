/**
 * components/agent/agentTerminalCopy.ts — every word the Agent Terminal shows, in Georgian, English and Russian.
 *
 * ⚠️ THE PAGE WAS ENGLISH ONLY (Phase 7.6 audit, 2026-11-13). /ka/services/agent-g and /ka/agent-terminal both open it,
 * and a Georgian visitor read "Agent Terminal", "Please sign in to run the agent." and the server's own "goal too long
 * (max 2000)". Server errors now go through `terminalErrorText`: a known status or code gets a sentence that says what to
 * do next; anything else gets the generic line, never the raw server text.
 */
export type TerminalLang = 'ka' | 'en' | 'ru';
export const terminalLang = (locale: string | undefined): TerminalLang => (locale === 'en' || locale === 'ru' ? locale : 'ka');

export interface TerminalCopy {
  title: string;
  intro: string;
  introStrong: string;
  placeholder: string;
  run: string;
  running: string;
  reasoning: string;
  thought: string;
  observation: string;
  final: string;
  newRun: string;
  close: string;
  toolCalls: (n: number) => string;
  stop: Record<'final' | 'max_steps' | 'llm_error', string>;
  tools: Record<string, string>;
  suggestions: readonly string[];
  errors: {
    signIn: string;
    network: string;
    tooLong: string;
    rateLimited: string;
    invalid: string;
    generic: string;
  };
}

export const TERMINAL_COPY: Record<TerminalLang, TerminalCopy> = {
  ka: {
    title: 'Agent G ტერმინალი',
    intro: 'ავტონომიური აგენტი, რომელიც იკვლევს, ამზადებს და აწყობს შენს მარკეტინგულ მედიას. ის ნაბიჯ-ნაბიჯ ფიქრობს და ყველა ნაბიჯს ხედავ. სოციალური პოსტები',
    introStrong: 'მხოლოდ მზადდება და არასდროს ქვეყნდება',
    placeholder: 'მიეცი აგენტს მიზანი… (⌘/Ctrl + Enter გასაშვებად)',
    run: 'გაშვება',
    running: 'მუშაობს…',
    reasoning: 'აგენტი ფიქრობს…',
    thought: 'აზრი',
    observation: 'შედეგი',
    final: 'პასუხი',
    newRun: 'ახალი დავალება',
    close: 'დახურვა',
    toolCalls: (n) => `${n} ხელსაწყოს გამოძახება`,
    stop: { final: 'დასრულდა', max_steps: 'ნაბიჯების ლიმიტზე შეჩერდა', llm_error: 'მოდელი მიუწვდომელია' },
    tools: {
      web_search: 'ძიება ვებში',
      scrape_webpage: 'გვერდის წაკითხვა',
      prepare_instagram_post: 'პოსტის მომზადება ⛔',
      orchestrate_media: 'მედიის აწყობა',
      quote_browser_task: 'ბრაუზერის გეგმა',
      quote_code_run: 'პროგრამის გეგმა',
    },
    suggestions: [
      'გამოიკვლიე 2026 წლის ქართული ყავის მაღაზიების მარკეტინგის ტრენდები და შეაჯამე 3 იდეა.',
      'მოამზადე Instagram-ის წარწერა კანის მოვლის ხაზის შაბათ-კვირის ფასდაკლებისთვის.',
      'დაწერე 6-წამიანი ვერტიკალური ვიდეოს ბრიფი ახალი ენერგეტიკული სასმელისთვის.',
    ],
    errors: {
      signIn: 'აგენტის გასაშვებად ჯერ შედი ანგარიშზე.',
      network: 'აგენტს ვერ დავუკავშირდით. შეამოწმე ინტერნეტი და სცადე ხელახლა.',
      tooLong: 'მიზანი ძალიან გრძელია (მაქსიმუმ 2000 სიმბოლო). შეამოკლე და სცადე ხელახლა.',
      rateLimited: 'ძალიან ბევრი დავალება ერთად. დაელოდე ერთ წუთს და სცადე ხელახლა.',
      invalid: 'მიზანი ვერ წავიკითხეთ. დაწერე, რა უნდა გააკეთოს აგენტმა, და სცადე ხელახლა.',
      generic: 'აგენტმა დავალება ვერ შეასრულა. სცადე ცოტა ხანში.',
    },
  },
  en: {
    title: 'Agent G Terminal',
    intro: 'An autonomous agent that researches, prepares and orchestrates your marketing media. It reasons step by step, and you see every step. Social posts are',
    introStrong: 'prepared, never published',
    placeholder: 'Give the agent a goal… (⌘/Ctrl + Enter to run)',
    run: 'Run agent',
    running: 'Running…',
    reasoning: 'The agent is reasoning…',
    thought: 'thought',
    observation: 'observation',
    final: 'Final answer',
    newRun: 'New run',
    close: 'Close',
    toolCalls: (n) => `${n} tool call${n === 1 ? '' : 's'}`,
    stop: { final: 'completed', max_steps: 'stopped at the step limit', llm_error: 'model unavailable' },
    tools: {
      web_search: 'web search',
      scrape_webpage: 'read page',
      prepare_instagram_post: 'prepare post ⛔',
      orchestrate_media: 'orchestrate media',
      quote_browser_task: 'browser plan',
      quote_code_run: 'program plan',
    },
    suggestions: [
      'Research 2026 Georgian coffee-shop marketing trends and summarize 3 hooks.',
      'Prepare an Instagram caption for a weekend discount on our skincare line.',
      'Draft a 6-second vertical video brief for a new energy drink launch.',
    ],
    errors: {
      signIn: 'Sign in first to run the agent.',
      network: 'We could not reach the agent. Check your connection and try again.',
      tooLong: 'The goal is too long (2,000 characters at most). Shorten it and try again.',
      rateLimited: 'Too many runs at once. Wait a minute and try again.',
      invalid: 'We could not read the goal. Write what the agent should do and try again.',
      generic: 'The agent could not finish this run. Try again shortly.',
    },
  },
  ru: {
    title: 'Терминал Agent G',
    intro: 'Автономный агент, который исследует, готовит и собирает ваши маркетинговые материалы. Он рассуждает пошагово, и вы видите каждый шаг. Посты для соцсетей',
    introStrong: 'только готовятся и никогда не публикуются',
    placeholder: 'Дайте агенту цель… (⌘/Ctrl + Enter для запуска)',
    run: 'Запустить',
    running: 'Выполняется…',
    reasoning: 'Агент рассуждает…',
    thought: 'мысль',
    observation: 'результат',
    final: 'Ответ',
    newRun: 'Новая задача',
    close: 'Закрыть',
    toolCalls: (n) => `вызовов инструментов: ${n}`,
    stop: { final: 'завершено', max_steps: 'остановлено на лимите шагов', llm_error: 'модель недоступна' },
    tools: {
      web_search: 'поиск в сети',
      scrape_webpage: 'чтение страницы',
      prepare_instagram_post: 'подготовка поста ⛔',
      orchestrate_media: 'сборка медиа',
      quote_browser_task: 'план браузера',
      quote_code_run: 'план программы',
    },
    suggestions: [
      'Изучи маркетинговые тренды грузинских кофеен 2026 года и кратко опиши 3 идеи.',
      'Подготовь подпись для Instagram к скидке выходного дня на нашу линию ухода за кожей.',
      'Напиши бриф 6-секундного вертикального видео для запуска нового энергетика.',
    ],
    errors: {
      signIn: 'Сначала войдите в аккаунт, чтобы запустить агента.',
      network: 'Не удалось связаться с агентом. Проверьте подключение и попробуйте снова.',
      tooLong: 'Цель слишком длинная (не более 2000 символов). Сократите её и попробуйте снова.',
      rateLimited: 'Слишком много запусков сразу. Подождите минуту и попробуйте снова.',
      invalid: 'Не удалось прочитать цель. Напишите, что должен сделать агент, и попробуйте снова.',
      generic: 'Агент не смог выполнить задачу. Попробуйте чуть позже.',
    },
  },
};

/** The sentence for a failed /api/agent/run answer. Never the server's own text. */
export function terminalErrorText(status: number, lang: TerminalLang): string {
  const e = TERMINAL_COPY[lang].errors;
  if (status === 401) return e.signIn;
  if (status === 413) return e.tooLong;
  if (status === 429) return e.rateLimited;
  if (status === 400) return e.invalid;
  if (status === 0) return e.network;
  return e.generic;
}
