'use client';

import type Vapi from '@vapi-ai/web';

let vapiWebSingleton: Vapi | null = null;
let singletonKey = '';

export function isVapiWebConfigured(): boolean {
  return Boolean(String(process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY || '').trim());
}

export async function getVapiWebClient(explicitPublicKey?: string): Promise<Vapi | null> {
  const resolvedKey = String(explicitPublicKey || process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY || '').trim();

  if (!resolvedKey) {
    return null;
  }

  if (!vapiWebSingleton || singletonKey !== resolvedKey) {
    const { default: VapiCtor } = await import('@vapi-ai/web');
    vapiWebSingleton = new VapiCtor(resolvedKey);
    singletonKey = resolvedKey;
  }

  return vapiWebSingleton;
}
