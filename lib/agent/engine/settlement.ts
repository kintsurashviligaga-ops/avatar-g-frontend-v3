/**
 * lib/agent/engine/settlement.ts — what a finished run tells its owner, in Georgian first (Phase 8.10). PURE.
 *
 * The question GG asked: "the plan fails on step 2 of 5 — does Agent G refund and explain in Georgian?" On the Phase 3
 * engine (#308) the answer was: the executor refunds its own miss (06 §, wiring plan item 4), steps that needed step 2
 * are skipped, and the timeline gets `step.failed` with a raw code such as `verify: no audio track`. Nothing turned that
 * into words for the user, the card's credit total counted a failed attempt's charge even after its executor gave it
 * back, and a result VERIFY rejected after the executor charged for it had no refund at all (see EngineOptions
 * .refundRejected and the `refund` effect).
 *
 * `settlementOf` adds the money up per step (charged, given back, kept) and `explainRun` writes one message: what was
 * delivered, which step failed and why in plain words, what was skipped because of it, and what was returned. It reads
 * the run only; the ledger is still the truth and is never touched here.
 */
import type { EngineRun, StepState } from './types';

export type Lang = 'ka' | 'en' | 'ru';

export interface StepMoney { id: string; title: string; status: StepState['status']; charged: number; returned: number; kept: number }

export interface Settlement {
  steps: StepMoney[];
  charged: number;
  returned: number;
  /** What the run cost the user in the end. */
  kept: number;
  /** Charges on steps that delivered nothing and were not (yet) given back: these must be refunded or explained. */
  owed: number;
}

const DELIVERED: ReadonlySet<StepState['status']> = new Set(['done']);

export function settlementOf(run: EngineRun): Settlement {
  const steps = run.steps.map((s): StepMoney => {
    const title = run.plan.steps.find((p) => p.id === s.id)?.title ?? s.id;
    const charged = Math.max(0, s.credits ?? 0);
    const returned = Math.min(charged, Math.max(0, s.refundedCredits ?? 0));
    return { id: s.id, title, status: s.status, charged, returned, kept: charged - returned };
  });
  const sum = (f: (m: StepMoney) => number) => steps.reduce((a, m) => a + f(m), 0);
  return {
    steps,
    charged: sum((m) => m.charged),
    returned: sum((m) => m.returned),
    kept: sum((m) => m.kept),
    owed: sum((m) => (DELIVERED.has(m.status) ? 0 : m.kept)),
  };
}

const L = (lang: Lang, ka: string, en: string, ru: string): string => (lang === 'en' ? en : lang === 'ru' ? ru : ka);

/** A raw step / run error code → a reason a person understands. Unknown codes get a neutral line, never the raw code. */
export function reasonText(error: string | undefined, lang: Lang): string {
  const e = (error ?? '').toLowerCase();
  if (e === 'deadline') return L(lang, 'დრო ამოიწურა', 'it ran out of time', 'закончилось время');
  if (e === 'approval_timeout') return L(lang, 'შენს „კი“-ს ვერ დაველოდე', 'it waited too long for your yes', 'не дождался вашего «да»');
  if (e === 'cancelled') return L(lang, 'შენ შეაჩერე', 'you stopped it', 'вы остановили');
  if (e.startsWith('verify:')) return L(lang, 'შედეგმა ხარისხის შემოწმება ვერ გაიარა', 'the result failed the quality check', 'результат не прошёл проверку качества');
  if (/timeout|timed out/.test(e)) return L(lang, 'სერვისმა დროულად არ უპასუხა', 'the service did not answer in time', 'сервис не ответил вовремя');
  if (/rate|429|quota|busy|overload|unavailable|503/.test(e)) return L(lang, 'სერვისი ახლა გადატვირთულია', 'the service is busy right now', 'сервис сейчас перегружен');
  if (/safety|blocked|policy|refus/.test(e)) return L(lang, 'Google-მა უსაფრთხოების წესების გამო უარი თქვა', 'Google refused it under its safety rules', 'Google отказал по правилам безопасности');
  if (/insufficient|balance|credits/.test(e)) return L(lang, 'კრედიტები არ იყო საკმარისი', 'there were not enough credits', 'не хватило кредитов');
  if (/input|missing|not_found|404/.test(e)) return L(lang, 'საჭირო ფაილი ვერ ვიპოვე', 'a file it needed was not found', 'не найден нужный файл');
  return L(lang, 'ტექნიკური შეცდომა მოხდა', 'a technical error happened', 'произошла техническая ошибка');
}

const ord = (n: number, lang: Lang): string => (lang === 'ka' ? (n === 1 ? '1-ლი' : `${n}-ე`) : lang === 'ru' ? `${n}-й` : `${n}`);

/** One message for the owner when a run ends. Null while the run is still going. */
export function explainRun(run: EngineRun, lang: Lang = 'ka'): string | null {
  if (!['completed', 'partially_completed', 'failed', 'cancelled'].includes(run.status)) return null;
  const total = run.steps.length;
  const money = settlementOf(run);
  const idx = (id: string) => run.steps.findIndex((s) => s.id === id) + 1;
  const done = run.steps.filter((s) => s.status === 'done');
  const failed = run.steps.filter((s) => s.status === 'failed');
  const skipped = run.steps.filter((s) => s.status === 'skipped');
  const lines: string[] = [];

  if (run.status === 'completed') {
    lines.push(L(lang, `ყველა ${total} ნაბიჯი შესრულდა.`, `All ${total} steps are done.`, `Все ${total} шагов выполнены.`));
  } else if (run.status === 'cancelled') {
    lines.push(L(lang, `შეაჩერე: ${total}-დან ${done.length} ნაბიჯი მოასწრო.`, `You stopped it: ${done.length} of ${total} steps were done.`, `Вы остановили: выполнено ${done.length} из ${total} шагов.`));
  }
  for (const f of failed) {
    const n = idx(f.id);
    const title = money.steps.find((m) => m.id === f.id)?.title ?? f.id;
    lines.push(L(lang,
      `${total}-დან ${ord(n, lang)} ნაბიჯი („${title}“) ვერ შესრულდა: ${reasonText(f.error, lang)}.`,
      `Step ${n} of ${total} („${title}“) did not finish: ${reasonText(f.error, lang)}.`,
      `Шаг ${n} из ${total} («${title}») не выполнен: ${reasonText(f.error, lang)}.`));
  }
  if (run.status !== 'completed' && run.error === 'deadline' && !failed.length) {
    lines.push(L(lang, `დრო ამოიწურა.`, `It ran out of time.`, `Закончилось время.`));
  }
  if (skipped.length) {
    const ns = skipped.map((s) => idx(s.id)).join(', ');
    lines.push(L(lang,
      `${ns} ნაბიჯ(ებ)ი არ დაიწყო, რადგან ვერშესრულებულ ნაბიჯს ეყრდნობოდა — მათზე არაფერი ჩამოჭრილა.`,
      `Step(s) ${ns} did not start because they needed the failed step — nothing was charged for them.`,
      `Шаг(и) ${ns} не начались, потому что зависели от невыполненного шага — за них ничего не списано.`));
  }
  if (done.length && run.status !== 'completed') {
    const ns = done.map((s) => idx(s.id)).join(', ');
    lines.push(L(lang,
      `${ns} ნაბიჯ(ებ)ის შედეგი შენახულია ბიბლიოთეკაში და თავიდან გაშვებისას ხელახლა არ გადაიხდი.`,
      `The result of step(s) ${ns} is saved in your Library, and a re-run will not charge for it again.`,
      `Результат шага(ов) ${ns} сохранён в Библиотеке, при повторном запуске за него не нужно платить снова.`));
  }
  if (money.returned > 0) {
    lines.push(L(lang, `✦${money.returned} დაგიბრუნდა.`, `✦${money.returned} came back to you.`, `✦${money.returned} вернулись к вам.`));
  }
  if (money.owed > 0) {
    lines.push(L(lang,
      `✦${money.owed} ჯერ არ დაბრუნებულა — ვამოწმებ და დაგიბრუნდება.`,
      `✦${money.owed} has not come back yet — it is being checked and will be returned.`,
      `✦${money.owed} ещё не вернулись — проверяется, будут возвращены.`));
  }
  lines.push(L(lang, `სულ ჩამოიჭრა: ✦${money.kept}.`, `Total charged: ✦${money.kept}.`, `Всего списано: ✦${money.kept}.`));
  if (run.status === 'failed' || run.status === 'partially_completed') {
    lines.push(L(lang, 'გინდა, ვერშესრულებული ნაბიჯი თავიდან ვცადო? ჯერ ფასს გაჩვენებ.', 'Want me to try the failed step again? I\'ll show the price first.', 'Попробовать невыполненный шаг ещё раз? Сначала покажу цену.'));
  }
  return lines.join(' ');
}
