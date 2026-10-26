/**
 * The spend toast's two lines (−5 credits, balance N credits) — GG 2026-10-16: the interior design toast read
 * "ბალანსი 8560 კრედიტი ($317.04)" for a wallet of 856 credits, because the credit balance was converted as if it
 * were GEL. GG 2026-10-26 16:38Z: the balance's „($27)" read as the clip's price, so only the charge carries dollars
 * (creditsWithUsd) and the balance is credits alone (creditsLabel).
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { creditsWithUsd, creditCostFor } from './pricing';

describe('creditsWithUsd', () => {
  it('shows the wallet balance in credits with its real dollar value, not ten times it', () => {
    expect(creditsWithUsd(856)).toBe('856 კრედიტი ($31.70)');
    expect(creditsWithUsd(856, 'en')).toBe('856 credits ($31.70)');
    expect(creditsWithUsd(856, 'ru')).toBe('856 кред. ($31.70)');
  });

  it('prices one image render the way the route charges it', () => {
    // One image is the price book's 5 credits (lib/credits/priceBook), 0.50 ₾.
    expect(creditsWithUsd(creditCostFor('image'))).toBe('5 კრედიტი ($0.19)');
  });

  it('never prints NaN or a negative balance', () => {
    expect(creditsWithUsd(Number.NaN)).toBe('0 კრედიტი ($0.00)');
    expect(creditsWithUsd(null)).toBe('0 კრედიტი ($0.00)');
    expect(creditsWithUsd(-5)).toBe('0 კრედიტი ($0.00)');
  });

  it('is what the spend toast renders for the charge; the balance is credits without dollars', () => {
    const src = readFileSync(join(process.cwd(), 'components/studio/OmniStudio.tsx'), 'utf8');
    expect(src).toContain('creditsWithUsd(creditToast.credits, locale)');
    expect(src).toContain('creditsLabel(creditToast.balanceCredits, locale)');
    expect(src).not.toMatch(/creditsWithUsd\(creditToast\.balanceCredits/);
    expect(src).not.toMatch(/gelToCredits\(creditToast/);
    expect(src).not.toMatch(/formatWalletBalance\(creditToast/);
  });
});
