/** @jest-environment node */
jest.mock('server-only', () => ({}));
const mockUpdate = jest.fn();
jest.mock('../supabase/server', () => ({
  createServiceRoleClient: () => ({
    from: () => ({ update: (v: unknown) => { mockUpdate(v); return { eq: async () => ({ error: null }) }; } }),
  }),
}));

import { NOT_WIRED, deliverOutputs } from './deliveryEngine';
import type { ExecutiveOutputs } from '@/types/billing';

it('never records an email or SMS as sent: nothing sends them', async () => {
  const outputs = { deliveries: [] } as unknown as ExecutiveOutputs;
  const records = await deliverOutputs({ userId: 'u', taskId: 't', outputs, channels: ['email', 'sms', 'dashboard'] });
  expect(records).toEqual([
    { channel: 'email', status: 'failed', detail: NOT_WIRED },
    { channel: 'sms', status: 'failed', detail: NOT_WIRED },
    expect.objectContaining({ channel: 'dashboard', status: 'sent' }),
  ]);
  expect(mockUpdate.mock.calls[0][0].outputs.deliveries).toHaveLength(3);
});
