/** @jest-environment node */
jest.mock('server-only', () => ({}));

import { readFileSync } from 'fs';
import { join } from 'path';
// eslint-disable-next-line import/first
import { alertStep, maybeAlertSpend, setSpendAlertChannelsForTests, spendAlertUsd } from './spendAlert';

const sent: Array<{ ch: string; text: string }> = [];
let seen = new Set<string>();

beforeEach(() => {
  sent.length = 0;
  seen = new Set();
  setSpendAlertChannelsForTests({
    telegram: async (text) => { sent.push({ ch: 'telegram', text }); return true; },
    email: async (_s, text) => { sent.push({ ch: 'email', text }); return true; },
    once: async (k) => (seen.has(k) ? false : (seen.add(k), true)),
  });
});
afterAll(() => setSpendAlertChannelsForTests(null));

describe('spend alert', () => {
  it('is off without SPEND_ALERT_USD', async () => {
    expect(spendAlertUsd({})).toBeNull();
    expect(await maybeAlertSpend(500, '2026-11-27', {})).toBeNull();
    expect(sent).toHaveLength(0);
  });

  it('steps at the figure and each multiple, once per day', async () => {
    expect(alertStep(49.99, 50)).toBe(0);
    expect(alertStep(50, 50)).toBe(1);
    expect(alertStep(149, 50)).toBe(2);
    const env = { SPEND_ALERT_USD: '50' };
    expect(await maybeAlertSpend(10, '2026-11-27', env)).toBeNull();
    expect(await maybeAlertSpend(51, '2026-11-27', env)).toMatchObject({ step: 1, telegram: true, email: true });
    expect(await maybeAlertSpend(60, '2026-11-27', env)).toBeNull();
    expect(await maybeAlertSpend(101, '2026-11-27', env)).toMatchObject({ step: 2 });
    expect(await maybeAlertSpend(51, '2026-11-28', env)).toMatchObject({ step: 1 });
    expect(sent.filter((s) => s.ch === 'telegram')).toHaveLength(3);
  });

  it('never throws, even when every channel fails', async () => {
    setSpendAlertChannelsForTests({
      telegram: async () => { throw new Error('x'); },
      email: async () => false,
      once: async () => true,
    });
    await expect(maybeAlertSpend(99, '2026-11-27', { SPEND_ALERT_USD: '50' })).resolves.toMatchObject({ telegram: false, email: false });
  });

  it('holds no address or secret in code', () => {
    const src = readFileSync(join(__dirname, 'spendAlert.ts'), 'utf8');
    expect(src).not.toMatch(/@gmail\.com|@myavatar\.ge/);
  });
});
