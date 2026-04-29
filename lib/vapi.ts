import 'server-only';

import { VapiClient } from '@vapi-ai/server-sdk';

let vapiClientSingleton: VapiClient | null = null;

function getVapiApiKey(): string {
  return String(process.env.VAPI_API_KEY || '').trim();
}

export function isVapiServerConfigured(): boolean {
  return Boolean(getVapiApiKey());
}

export function getVapiPhoneNumberId(): string | null {
  const phoneNumberId = String(process.env.VAPI_PHONE_NUMBER_ID || '').trim();
  return phoneNumberId || null;
}

export function getVapiServerClient(): VapiClient {
  const apiKey = getVapiApiKey();

  if (!apiKey) {
    throw new Error('VAPI_API_KEY is not configured');
  }

  if (!vapiClientSingleton) {
    vapiClientSingleton = new VapiClient({ token: apiKey });
  }

  return vapiClientSingleton;
}

function unwrapVapiResponse<T>(value: T | { data?: T }): T {
  if (typeof value === 'object' && value !== null && 'data' in value) {
    return (value as { data?: T }).data as T;
  }

  return value as T;
}

export async function createVapiCall(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const result = await getVapiServerClient().calls.create(payload as any);
  return unwrapVapiResponse<Record<string, unknown>>(result as any);
}

export async function createVapiAssistant(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const result = await getVapiServerClient().assistants.create(payload as any);
  return unwrapVapiResponse<Record<string, unknown>>(result as any);
}
