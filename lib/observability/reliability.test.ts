/** @jest-environment node */
// The reliability helpers must be STRICTLY non-blocking (WS4.3): a logging-backend failure can never
// propagate into the caller (a live billing / render flow). These tests run the REAL structuredLog →
// console path (no mocks), assert the level/shape it emits, and force a serialization failure to prove
// the helper still never throws.
import { reportReliability, opsMarker } from './reliability';

describe('reportReliability', () => {
  let warn: jest.SpyInstance;
  beforeEach(() => { warn = jest.spyOn(console, 'warn').mockImplementation(() => {}); });
  afterEach(() => { warn.mockRestore(); });

  it('a degraded fallback alerts at warn; a healthy one does NOT (so alerts stay signal, not noise)', () => {
    // Healthy (primary served, degraded:false) → no warn.
    reportReliability({ surface: 'llm.text', providerServed: 'deepseek', fallbackDepth: 0, degraded: false });
    expect(warn).not.toHaveBeenCalled();

    // Degraded → warn, carrying the {surface, providerServed, fallbackDepth, degraded} signal.
    reportReliability({ surface: 'llm.text', providerServed: null, fallbackDepth: 4, degraded: true });
    expect(warn).toHaveBeenCalledTimes(1);
    const line = String(warn.mock.calls[0]?.[0]);
    expect(line).toContain('"event":"reliability"');
    expect(line).toContain('"degraded":true');
    expect(line).toContain('"fallbackDepth":4');
  });

  it('NEVER throws when logging fails (non-blocking guarantee)', () => {
    // A BigInt in the payload makes structuredLog's JSON.stringify throw — the helper must swallow it.
    expect(() => reportReliability({ surface: 'x', providerServed: 'a', fallbackDepth: 1, degraded: true, bad: BigInt(1) as unknown as number })).not.toThrow();
  });
});

describe('opsMarker', () => {
  let warn: jest.SpyInstance;
  beforeEach(() => { warn = jest.spyOn(console, 'warn').mockImplementation(() => {}); });
  afterEach(() => { warn.mockRestore(); });

  it('emits event:ops_marker with a stable marker + data (for log-based alerts)', () => {
    opsMarker('warn', 'render_drainer_reap', { reaped: 3, refunded: 2 });
    const line = String(warn.mock.calls[0]?.[0]);
    expect(line).toContain('"event":"ops_marker"');
    expect(line).toContain('"marker":"render_drainer_reap"');
    expect(line).toContain('"reaped":3');
  });

  it('NEVER throws when logging fails (non-blocking guarantee)', () => {
    expect(() => opsMarker('error', 'render_drainer_failure', { bad: BigInt(1) as unknown as number })).not.toThrow();
  });
});
