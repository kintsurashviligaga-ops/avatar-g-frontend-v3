/** @jest-environment jsdom */
/** The on-screen mic readout: off by default, measured numbers only, "—" for a step nothing reached. */
import { act, render, screen } from '@testing-library/react';
import { DictationMetricsReadout, micStatsEnabled, micStatsLine } from './DictationMetricsReadout';
import { pushDictationMetrics, summarizeDictationLatency, type DictationMetrics } from '@/lib/voice/dictationMetrics';

const M: DictationMetrics = {
  v: 1, engine: 'recorder', lang: 'ka-GE', outcome: 'text', tapToListeningMs: 180, listeningToFirstTextMs: 1500,
  stopToFinalMs: 900, passes: 2, passMs: [800, 900], serverSttMs: [], aborted: 0, deferred: 0, failed: 0, restarts: 0,
};

function memoryStore() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); } };
}

beforeEach(() => {
  delete (window as unknown as { __myavatarDictationMetrics?: unknown }).__myavatarDictationMetrics;
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});

test('micStatsEnabled: ?micstats=1 turns it on for the tab, ?micstats=0 off, nothing keeps the last choice', () => {
  const s = memoryStore();
  expect(micStatsEnabled('', s)).toBe(false);
  expect(micStatsEnabled('?micstats=1', s)).toBe(true);
  expect(micStatsEnabled('?other=x', s)).toBe(true);
  expect(micStatsEnabled('?micstats=0', s)).toBe(false);
  expect(micStatsEnabled('', s)).toBe(false);
  expect(micStatsEnabled('?micstats=1', null)).toBe(true);
});

test('the line shows p50 / p95 of what was measured and "—" for a step no dictation reached', () => {
  expect(micStatsLine(summarizeDictationLatency([M]), 'en')).toBe(
    'Mic, this device (1 dictations, p50 / p95 ms): tap→listening 180 / 180 · first text 1500 / 1500 · Stop→final 900 / 900',
  );
  expect(micStatsLine(summarizeDictationLatency([]), 'ka')).toMatch(/0 კარნახი.*შეხება→მოსმენა — · პირველი ტექსტი — · Stop→საბოლოო —$/);
});

test('hidden by default', () => {
  pushDictationMetrics(M);
  render(<DictationMetricsReadout locale="en" />);
  expect(screen.queryByTestId('mic-stats')).toBeNull();
});

test('with ?micstats=1 it shows the page\'s summaries and follows each new dictation', () => {
  window.history.replaceState(null, '', '/?micstats=1');
  pushDictationMetrics(M);
  render(<DictationMetricsReadout locale="en" />);
  expect(screen.getByTestId('mic-stats').textContent).toMatch(/\(1 dictations.*tap→listening 180 \/ 180/);
  act(() => { pushDictationMetrics({ ...M, tapToListeningMs: 400 }); });
  expect(screen.getByTestId('mic-stats').textContent).toMatch(/\(2 dictations.*tap→listening 180 \/ 400/);
});
