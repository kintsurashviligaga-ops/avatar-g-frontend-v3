/**
 * lib/env/flag.ts — tolerant boolean-env parsing, shared by client AND server.
 *
 * Dependency-free (no server-only imports) so it is safe inside NEXT_PUBLIC_* client bundles. A flag set
 * to `true` in a hosting dashboard must behave identically to `1` — a strict `=== '1'` check silently
 * leaves the feature OFF when someone types the natural `true`, which is a real deploy footgun. Accepts
 * '1' | 'true' | 'yes' | 'on' (case-insensitive, trimmed); everything else — unset, '', '0', 'false',
 * 'off', 'no' — is false. Mirrors the truthy semantics of lib/server/feature-flags `envBool`.
 */
export function isTruthyFlag(value: string | undefined | null): boolean {
  const v = (value ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}
