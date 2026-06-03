import { filmBalanceDecision } from './filmBalanceGate';

// The 30-second film forecast is ~10.20 ₾ retail. The gate must never start a
// paid render the wallet can't cover (the stitch step needs funds), yet must NOT
// lock paying users out when the balance simply can't be read (infra blip).
describe('filmBalanceDecision — up-front pay-as-you-go gate', () => {
  const REQUIRED = 10.2;

  it('blocks a confirmed zero balance (no credits row → 0) — the live 0.00 ₾ case', () => {
    // This is the exact bug behind the stranded 0/5 spinner: a no-row user used
    // to read as null and slip past the gate. A confirmed 0 must block.
    expect(filmBalanceDecision(0, REQUIRED)).toBe('insufficient');
  });

  it('blocks any confirmed balance below the forecast', () => {
    expect(filmBalanceDecision(5, REQUIRED)).toBe('insufficient');
    expect(filmBalanceDecision(10.19, REQUIRED)).toBe('insufficient');
  });

  it('allows a balance that exactly meets or exceeds the forecast', () => {
    expect(filmBalanceDecision(10.2, REQUIRED)).toBe('ok');
    expect(filmBalanceDecision(50, REQUIRED)).toBe('ok');
  });

  it('fails OPEN when the balance is unknown (null = DB/migration error)', () => {
    // An infra blip must never strand a paying user; per-leg debit + rollback
    // still protect spend downstream.
    expect(filmBalanceDecision(null, REQUIRED)).toBe('unknown');
  });
});
