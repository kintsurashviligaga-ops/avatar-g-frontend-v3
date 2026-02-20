import { MockCallsProvider } from '@/lib/calls/providers/mock';
import { TwilioCallsProvider } from '@/lib/calls/providers/twilio';
import { TelegramCallsProvider } from '@/lib/calls/providers/telegram';
import type { CallsProvider } from '@/lib/calls/providers/base';

export function getCallsProvider(): CallsProvider {
  const explicit = (process.env.AGENT_G_CALLS_PROVIDER || '').toLowerCase();

  if (explicit === 'twilio' && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    return new TwilioCallsProvider();
  }

  if (explicit === 'telegram' && process.env.TELEGRAM_BOT_TOKEN) {
    return new TelegramCallsProvider();
  }

  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    return new TwilioCallsProvider();
  }

  if (process.env.TELEGRAM_BOT_TOKEN) {
    return new TelegramCallsProvider();
  }

  return new MockCallsProvider();
}
