import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import BogReadiness from './BogReadiness';

const readiness = {
  configured: true, environment: 'production', clientIdTail: '1234', callbackKey: 'published-production',
  callbackUrl: 'https://myavatar.ge/api/billing/bog/webhook', schemaReady: true, cronSecretSet: true,
  ordersByStatus: { init_failed: 4 },
  recentOrders: [{ kind: 'topup', status: 'init_failed', amountGel: 10, createdAt: '2026-10-03T07:38:18Z', rejectReason: 'init (production): oauth HTTP 401 invalid_client' }],
};

test('shows the deployment state and runs the credential check on request only', async () => {
  const f = jest.fn(async (_url: string, init?: RequestInit) => {
    const body = init?.method === 'POST'
      ? { probe: { verdict: 'credentials_refused', environment: 'production', httpStatus: 401, answer: '{"error":"invalid_client"}', hint: 'set BOG_ENV=sandbox', tookMs: 80 } }
      : { bog: readiness };
    return { ok: true, status: 200, json: async () => body };
  });
  global.fetch = f as unknown as typeof fetch;
  render(<BogReadiness ka={false} />);
  expect(await screen.findByText(/client …1234/)).toBeTruthy();
  expect(screen.getByText(/oauth HTTP 401 invalid_client/)).toBeTruthy();
  expect(f).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: /Test credentials with BOG/ }));
  await waitFor(() => expect(screen.getByText(/credentials_refused · HTTP 401/)).toBeTruthy());
  expect(screen.getByText('set BOG_ENV=sandbox')).toBeTruthy();
  expect(f).toHaveBeenLastCalledWith('/api/admin/billing/bog', expect.objectContaining({ method: 'POST', body: JSON.stringify({ action: 'oauth' }) }));
});
