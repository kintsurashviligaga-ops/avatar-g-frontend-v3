/**
 * lib/agent/liveWorkspace/mock.ts — MOCK timeline for the Live Agent Workspace preview (v5.1 Phase 7). No network, no money,
 * no real user: two invented runs that replay on a timer so the screen can be seen moving.
 *
 *   Run 1, a research task (Work Mode): one plan-level spend approval (GG 08:14Z: one tap per work-mode plan), then two
 *          searches IN PARALLEL, a table, a chart and a Georgian PDF saved to the Library.
 *   Run 2, a Browser Agent task (admin-only, D-08): it reaches a page with a card field and stops for an explicit tap
 *          (GG 12:34Z: sensitive actions always need a tap; fail closed).
 *
 * A script line with `after` waits until that approval is answered "approved"; a decline ends that run honestly.
 */
import type { TimelineEvent } from './model';

export type MockLang = 'ka' | 'en';
/** A timeline event without its time (Omit over each member of the union, so stepId and data stay checked). */
type NoAt = TimelineEvent extends infer E ? (E extends TimelineEvent ? Omit<E, 'at'> : never) : never;
export interface ScriptLine { ms: number; after?: string; ev: TimelineEvent }

const T = {
  ka: {
    goal1: 'საქართველოს ღვინის ექსპორტის კვლევა 2025 — ცხრილი, დიაგრამა და PDF ქართულად',
    plan: 'გეგმის შედგენა', s1: 'ძებნა: ექსპორტის სტატისტიკა', s2: 'ძებნა: ბაზრები და ფასები', csv: 'ცხრილის აწყობა (CSV)',
    chart: 'დიაგრამა Python-ით', pdf: 'PDF ანგარიში ქართულად', lib: 'შენახვა ბიბლიოთეკაში',
    a1: 'კვლევის გეგმის დაწყება', a1scope: '6 ნაბიჯი · მაქს. ✦18 · არცერთი გარე მოქმედება', a1why: 'გეგმა ხარჯავს კრედიტებს',
    d_src: 'წყარო: geostat.ge · 12 გვერდი', d_mk: '9 ქვეყანა · 3 წყარო', d_rows: '48 სტრიქონი · 6 სვეტი', d_chart: 'ხაზოვანი დიაგრამა, 2019–2025',
    d_pdf: '7 გვერდი', d_saved: 'wine-exports-2025.pdf',
    goal2: 'თბილისი–ბათუმის მატარებლის ბილეთის მოძებნა და დაჯავშნა',
    open: 'საიტის გახსნა', fill: 'მარშრუტის და თარიღის შევსება', pick: 'რეისის არჩევა', pay: 'გადახდის გვერდი', d_open: 'railway.ge',
    d_fill: 'თბილისი → ბათუმი · 20 ნოემბერი', d_pick: '08:10 · 2 სთ 40 წთ · 35 ₾',
    a2: 'გადახდის გვერდზე გადასვლა', a2scope: 'railway.ge · ბარათის ველი · 35 ₾ (კრედიტებს არ ხარჯავს)', a2why: 'გვერდზე ბარათის ველია: ეს მოქმედება მხოლოდ შენი დასტურით',
  },
  en: {
    goal1: 'Research Georgian wine exports 2025: a table, a chart and a PDF in Georgian',
    plan: 'Make the plan', s1: 'Search: export statistics', s2: 'Search: markets and prices', csv: 'Build the table (CSV)',
    chart: 'Chart with Python', pdf: 'PDF report in Georgian', lib: 'Save to the Library',
    a1: 'Start the research plan', a1scope: '6 steps · up to ✦18 · no outside actions', a1why: 'The plan spends credits',
    d_src: 'Source: geostat.ge · 12 pages', d_mk: '9 countries · 3 sources', d_rows: '48 rows · 6 columns', d_chart: 'Line chart, 2019–2025',
    d_pdf: '7 pages', d_saved: 'wine-exports-2025.pdf',
    goal2: 'Find and book a Tbilisi–Batumi train ticket',
    open: 'Open the site', fill: 'Fill in route and date', pick: 'Pick a train', pay: 'Payment page', d_open: 'railway.ge',
    d_fill: 'Tbilisi → Batumi · 20 November', d_pick: '08:10 · 2 h 40 min · 35 ₾',
    a2: 'Go to the payment page', a2scope: 'railway.ge · card field · 35 ₾ (no credits)', a2why: 'The page has a card field: this action only goes ahead with your tap',
  },
} as const;

export const MOCK_APPROVAL_PLAN = 'apr_plan_wine';
export const MOCK_APPROVAL_PAY = 'apr_pay_train';

/**
 * The whole replay. `ms` is an offset from `t0`, or, on a line with `after`, from the moment that approval was answered
 * yes (the player stamps `at` when it releases the line).
 */
export function mockScript(lang: MockLang, t0: number): ScriptLine[] {
  const t = T[lang];
  const r1 = 'run_wine', r2 = 'run_train';
  const L: ScriptLine[] = [];
  const at = (ms: number, ev: NoAt, after?: string) => L.push({ ms, after, ev: { ...ev, at: t0 + ms } as TimelineEvent });

  at(0, { type: 'run.planned', runId: r1, data: { goal: t.goal1, maxCredits: 18, steps: [
    { id: 'plan', title: t.plan, tool: 'gemini-3.8-flash' },
    { id: 's1', title: t.s1, tool: 'search', dependsOn: ['plan'], credits: 2 },
    { id: 's2', title: t.s2, tool: 'search', dependsOn: ['plan'], credits: 2 },
    { id: 'csv', title: t.csv, tool: 'code', dependsOn: ['s1', 's2'], credits: 3 },
    { id: 'chart', title: t.chart, tool: 'code', dependsOn: ['csv'], credits: 3 },
    { id: 'pdf', title: t.pdf, tool: 'pdf', dependsOn: ['chart'], credits: 4 },
    { id: 'lib', title: t.lib, tool: 'library', dependsOn: ['pdf'] },
  ] } });
  at(300, { type: 'step.started', runId: r1, stepId: 'plan' });
  at(1500, { type: 'step.done', runId: r1, stepId: 'plan', data: { detail: t.a1scope } });
  at(1600, { type: 'step.needs_approval', runId: r1, stepId: 's1', data: { id: MOCK_APPROVAL_PLAN, kind: 'spend', title: t.a1, scope: t.a1scope, credits: 18, reason: t.a1why, expiresAt: t0 + 10 * 60_000 } });

  // after the plan's yes: two searches side by side
  const go = MOCK_APPROVAL_PLAN;
  at(0, { type: 'step.started', runId: r1, stepId: 's1' }, go);
  at(100, { type: 'step.started', runId: r1, stepId: 's2' }, go);
  for (const [i, p] of [30, 55, 80].entries()) {
    at(800 + i * 900, { type: 'step.progress', runId: r1, stepId: 's1', data: { pct: p } }, go);
    at(1100 + i * 1000, { type: 'step.progress', runId: r1, stepId: 's2', data: { pct: p - 10 } }, go);
  }
  at(3600, { type: 'step.done', runId: r1, stepId: 's1', data: { detail: t.d_src, credits: 2 } }, go);
  at(4300, { type: 'step.done', runId: r1, stepId: 's2', data: { detail: t.d_mk, credits: 2 } }, go);
  at(4350, { type: 'run.cost', runId: r1, data: { creditsSpent: 4 } }, go);
  at(4500, { type: 'step.started', runId: r1, stepId: 'csv' }, go);
  at(5600, { type: 'step.done', runId: r1, stepId: 'csv', data: { detail: t.d_rows, credits: 3, artifact: { name: 'wine-exports.csv', kind: 'csv' } } }, go);
  at(5650, { type: 'run.cost', runId: r1, data: { creditsSpent: 7 } }, go);
  at(5800, { type: 'step.started', runId: r1, stepId: 'chart' }, go);
  at(6600, { type: 'step.progress', runId: r1, stepId: 'chart', data: { pct: 60 } }, go);
  at(7400, { type: 'step.done', runId: r1, stepId: 'chart', data: { detail: t.d_chart, credits: 3, artifact: { name: 'exports-chart.png', kind: 'image' } } }, go);
  at(7450, { type: 'run.cost', runId: r1, data: { creditsSpent: 10 } }, go);
  at(7600, { type: 'step.started', runId: r1, stepId: 'pdf' }, go);
  at(8600, { type: 'step.progress', runId: r1, stepId: 'pdf', data: { pct: 50 } }, go);
  at(9800, { type: 'step.done', runId: r1, stepId: 'pdf', data: { detail: t.d_pdf, credits: 4 } }, go);
  at(9850, { type: 'run.cost', runId: r1, data: { creditsSpent: 14 } }, go);
  at(10000, { type: 'step.started', runId: r1, stepId: 'lib' }, go);
  at(10600, { type: 'step.done', runId: r1, stepId: 'lib', data: { detail: t.d_saved, artifact: { name: t.d_saved, kind: 'pdf' } } }, go);
  at(10700, { type: 'run.delivered', runId: r1 }, go);
  at(11200, { type: 'run.settled', runId: r1 }, go);

  // Run 2: the Browser Agent
  at(900, { type: 'run.planned', runId: r2, data: { goal: t.goal2, maxCredits: 6, steps: [
    { id: 'open', title: t.open, tool: 'browser', credits: 1 },
    { id: 'fill', title: t.fill, tool: 'browser', dependsOn: ['open'], credits: 1 },
    { id: 'pick', title: t.pick, tool: 'browser', dependsOn: ['fill'], credits: 1 },
    { id: 'pay', title: t.pay, tool: 'browser', dependsOn: ['pick'] },
  ] } });
  at(1200, { type: 'step.started', runId: r2, stepId: 'open' });
  at(2600, { type: 'step.done', runId: r2, stepId: 'open', data: { detail: t.d_open, credits: 1 } });
  at(2700, { type: 'step.started', runId: r2, stepId: 'fill' });
  at(4200, { type: 'step.done', runId: r2, stepId: 'fill', data: { detail: t.d_fill, credits: 1 } });
  at(4300, { type: 'step.started', runId: r2, stepId: 'pick' });
  at(5600, { type: 'step.done', runId: r2, stepId: 'pick', data: { detail: t.d_pick, credits: 1 } });
  at(5650, { type: 'run.cost', runId: r2, data: { creditsSpent: 3 } });
  at(5800, { type: 'step.needs_approval', runId: r2, stepId: 'pay', data: { id: MOCK_APPROVAL_PAY, kind: 'sensitive', title: t.a2, scope: t.a2scope, credits: null, reason: t.a2why, expiresAt: t0 + 5 * 60_000 } });
  at(0, { type: 'step.started', runId: r2, stepId: 'pay' }, MOCK_APPROVAL_PAY);
  at(1500, { type: 'step.done', runId: r2, stepId: 'pay', data: { detail: t.d_open } }, MOCK_APPROVAL_PAY);
  at(1600, { type: 'run.delivered', runId: r2 }, MOCK_APPROVAL_PAY);
  return L;
}

/** What a decline does in the mock: the held step is skipped (by approval.answered) and its run ends. */
export function declineEnding(approvalId: string, at: number): TimelineEvent[] {
  const runId = approvalId === MOCK_APPROVAL_PLAN ? 'run_wine' : 'run_train';
  return [{ type: 'run.delivered', runId, at, data: { cancelled: true } }];
}
