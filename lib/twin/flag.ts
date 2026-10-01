import { isTruthyFlag } from '@/lib/env/flag';

/**
 * NEXT_PUBLIC_TWIN_ENABLED — the one switch for everything Digital Twin v0 (capture UI, /api/twin/*, the twin-first
 * poster, the "My twin" card). OFF by default: it waits on legal approving the consent text (lib/legal/content.ts).
 *
 * ⚠️ The default argument names `process.env.NEXT_PUBLIC_TWIN_ENABLED` LITERALLY on purpose: Next inlines a public env
 * var only where it is written out in full, so `env.NEXT_PUBLIC_TWIN_ENABLED` on a passed-in object would read
 * `undefined` in every browser bundle and leave the UI dark even with the flag on. Being a default, it is evaluated
 * per call, so the server and tests see the live value.
 */
export function isTwinEnabled(value: string | undefined = process.env.NEXT_PUBLIC_TWIN_ENABLED): boolean {
  return isTruthyFlag(value);
}
