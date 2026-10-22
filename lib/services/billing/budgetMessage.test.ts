/** @jest-environment node */
/**
 * What a person reads when the PLATFORM's AI limit (not their own credits) refuses a call.
 *
 * ⚠️ 2026-10-16: the site's daily limit was spent and every surface said something different and wrong ("could not
 * reach the video service", "the call stopped", "the frame will be drawn automatically"). One module now says the same
 * true thing everywhere: which limit, when it lifts, and that the balance was not touched.
 */
import {
  BUDGET_ERROR_PREFIX, DAILY_RESET_TBILISI, budgetReasonOf, budgetRefusalMessage, budgetShortLabel, isBudgetRefusal,
} from './budgetMessage';

/** The guard's error as guardedCall.ts builds it (that module pulls in the server env, so it is mirrored here). */
const guardError = (reason: string) => Object.assign(new Error(`budget_exceeded:${reason}`), { name: 'BudgetExceededError', reason });

describe('budgetRefusalMessage', () => {
  it('the daily limit says when it lifts, in Tbilisi time, and that nothing was charged', () => {
    const ka = budgetRefusalMessage('ka', 'daily_limit');
    expect(ka).toContain(DAILY_RESET_TBILISI);
    expect(ka).toContain('თბილისის დროით');
    expect(ka).toContain('არაფერი ჩამოგეჭრა');
    expect(budgetRefusalMessage('en', 'daily_limit')).toMatch(/04:00 Tbilisi time \(00:00 UTC\).*Nothing was taken/);
    expect(budgetRefusalMessage('ru', 'daily_limit')).toContain('04:00');
  });

  it('Georgian is the default for an unknown or missing locale', () => {
    expect(budgetRefusalMessage(undefined, 'daily_limit')).toBe(budgetRefusalMessage('ka', 'daily_limit'));
    expect(budgetRefusalMessage('de', 'daily_limit')).toBe(budgetRefusalMessage('ka', 'daily_limit'));
  });

  it('the monthly limit and the full stop name the month, never a 04:00 that would not come', () => {
    for (const reason of ['monthly_limit', 'full_stop']) {
      for (const l of ['ka', 'en', 'ru']) expect(budgetRefusalMessage(l, reason)).not.toContain('04:00');
    }
    expect(budgetRefusalMessage('en', 'monthly_limit')).toMatch(/this month/);
  });

  it('a suspended service says so', () => {
    expect(budgetRefusalMessage('en', 'service_suspended')).toMatch(/paused for the rest of the month/);
  });

  it('an unavailable guard is "try again shortly": no limit, no reset time, nothing charged', () => {
    for (const l of ['ka', 'en', 'ru']) {
      const m = budgetRefusalMessage(l, 'guard_unavailable');
      expect(m).not.toBe(budgetRefusalMessage(l, 'daily_limit'));
      expect(m).not.toContain('04:00');
    }
    expect(budgetRefusalMessage('en', 'guard_unavailable')).toMatch(/can't check its AI budget right now.*Nothing was taken from your balance.*try again shortly/);
    expect(budgetRefusalMessage('ka', 'guard_unavailable')).toContain('ბალანსიდან არაფერი ჩამოგეჭრა');
    expect(budgetRefusalMessage('ru', 'guard_unavailable')).toContain('С баланса ничего не списано');
  });

  it('an unknown or missing reason reads as the daily limit, the common case', () => {
    expect(budgetRefusalMessage('en', null)).toBe(budgetRefusalMessage('en', 'daily_limit'));
    expect(budgetRefusalMessage('en', 'something_else')).toBe(budgetRefusalMessage('en', 'daily_limit'));
  });
});

describe('isBudgetRefusal / budgetReasonOf', () => {
  it('recognise the guard\'s error, its message and the prefixed string', () => {
    const err = guardError('daily_limit');
    expect(isBudgetRefusal(err)).toBe(true);
    expect(isBudgetRefusal(err.message)).toBe(true);
    expect(isBudgetRefusal(`${BUDGET_ERROR_PREFIX}monthly_limit`)).toBe(true);
    expect(budgetReasonOf(`${BUDGET_ERROR_PREFIX}monthly_limit`)).toBe('monthly_limit');
    expect(budgetReasonOf(err)).toBe('daily_limit');
  });

  it('leave every other failure alone', () => {
    expect(isBudgetRefusal('veo quota — not retried')).toBe(false);
    expect(isBudgetRefusal(new Error('fetch failed'))).toBe(false);
    expect(isBudgetRefusal(null)).toBe(false);
    expect(budgetReasonOf('fetch failed')).toBeUndefined();
    expect(budgetReasonOf(BUDGET_ERROR_PREFIX)).toBeUndefined();
  });
});

describe('budgetShortLabel', () => {
  it('fits an empty storyboard tile in each language', () => {
    expect(budgetShortLabel('ka')).toBe('დღის AI ლიმიტი ამოიწურა');
    expect(budgetShortLabel('en')).toBe('Daily AI limit reached');
    expect(budgetShortLabel('ru')).toBe('Дневной лимит ИИ исчерпан');
  });
});
