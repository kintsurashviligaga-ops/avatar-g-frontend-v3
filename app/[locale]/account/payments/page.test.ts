/** @jest-environment node */
/** The retired payment-provider page sends an old bookmark to the real billing page. */
const mockRedirect = jest.fn();
jest.mock('next/navigation', () => ({ redirect: (to: string) => mockRedirect(to) }));

import PaymentProvidersRedirect from './page';

it('redirects /{locale}/account/payments to /{locale}/account/billing', async () => {
  await PaymentProvidersRedirect({ params: Promise.resolve({ locale: 'ru' }) });
  expect(mockRedirect).toHaveBeenCalledWith('/ru/account/billing');
});
