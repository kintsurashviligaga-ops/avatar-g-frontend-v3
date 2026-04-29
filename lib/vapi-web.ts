'use client';

import Vapi from '@vapi-ai/web';

let vapiWebSingleton: Vapi | null = null;
let singletonKey = '';

export function isVapiWebConfigured(): boolean {
  return Boolean(String(process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY || '').trim());
}

export function getVapiWebClient(explicitPublicKey?: string): Vapi | null {
  const resolvedKey = String(explicitPublicKey || process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY || '').trim();

  if (!resolvedKey) {
    return null;
  }

  if (!vapiWebSingleton || singletonKey !== resolvedKey) {
    vapiWebSingleton = new Vapi(resolvedKey);
    singletonKey = resolvedKey;
  }

  return vapiWebSingleton;
}
