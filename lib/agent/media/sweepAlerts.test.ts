/** @jest-environment node */
import { BACKLOG_ALERT, sweepAlerts } from './sweepAlerts';

const quiet = { gaveUp: [], waiting: [] };

test('a quiet sweep raises nothing; one or two waiting jobs are normal traffic', () => {
  expect(sweepAlerts({ montage: { ...quiet, stillOwed: [] }, audio: quiet, edit: quiet })).toEqual([]);
  expect(sweepAlerts({ montage: { gaveUp: [], waiting: ['a'] }, audio: { gaveUp: [], waiting: ['b'] } })).toEqual([]);
});

test('a refund the sweep could not pay is an error: a user is owed credits now', () => {
  expect(sweepAlerts({ montage: { gaveUp: [], waiting: [], stillOwed: ['j1', 'j2'] }, audio: quiet })).toEqual([
    { level: 'error', marker: 'agent_g_refund_debt', data: { total: 2, byQueue: { montage: 2 }, ids: ['j1', 'j2'] } },
  ]);
});

test('jobs given up (worker died twice) and a backlog are warnings, counted per queue', () => {
  const alerts = sweepAlerts({
    montage: { gaveUp: ['m1'], waiting: ['m2', 'm3'] },
    audio: { gaveUp: ['a1'], waiting: [] },
    edit: { gaveUp: [], waiting: ['e1'] },
  });
  expect(alerts).toEqual([
    { level: 'warn', marker: 'agent_g_gave_up', data: { total: 2, byQueue: { montage: 1, audio: 1 }, ids: ['m1', 'a1'] } },
    { level: 'warn', marker: 'agent_g_queue_backlog', data: { total: BACKLOG_ALERT, byQueue: { montage: 2, edit: 1 }, ids: ['m2', 'm3', 'e1'] } },
  ]);
});

test('the ids are capped, the counts are not', () => {
  const many = Array.from({ length: 25 }, (_, i) => `j${i}`);
  const [debt] = sweepAlerts({ montage: { gaveUp: [], waiting: [], stillOwed: many } });
  expect(debt!.data).toMatchObject({ total: 25 });
  expect((debt!.data.ids as string[]).length).toBe(10);
});
