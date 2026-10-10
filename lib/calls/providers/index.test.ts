/** @jest-environment node */
import { getCallsProvider } from './index';
import { PHONE_CALLS_UNAVAILABLE, phoneCallsReady } from '../availability';

const ENV = { ...process.env };
afterEach(() => { process.env = ENV; });

describe('getCallsProvider', () => {
  it('no call path is ready', () => {
    expect(phoneCallsReady()).toBe(false);
  });

  it('is the unavailable provider, even with Twilio and Telegram keys set', async () => {
    process.env = { ...ENV, AGENT_G_CALLS_PROVIDER: 'twilio', TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: 't', TELEGRAM_BOT_TOKEN: 'b' };
    const provider = getCallsProvider();
    expect(provider.name).toBe('none');
    await expect(provider.startInboundSession({ userId: 'u', channel: 'phone', mode: 'qa' })).rejects.toThrow(PHONE_CALLS_UNAVAILABLE);
    await expect(provider.startOutboundCall('+995599123456', 'hi')).rejects.toThrow(PHONE_CALLS_UNAVAILABLE);
  });

  it('acknowledges no webhook and ends no call', async () => {
    const provider = getCallsProvider();
    expect(await provider.onWebhookEvent({ CallSid: 'CA1', status: 'active' })).toEqual({ ok: false });
    expect(await provider.endCall('CA1')).toEqual({ ok: false });
  });
});
