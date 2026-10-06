/** MyAvatar v32: this allowlist cannot be weakened by an environment flag or a client option. */
export const PERMITTED_PROVIDERS = ['google', 'elevenlabs', 'sandbox'] as const;
export type ProviderCapability = 'text' | 'image' | 'video' | 'music' | 'tts' | 'transcription' | 'dialog' | 'lipsync' | 'computer-use' | 'execution';
const CAPABILITIES: Record<ProviderCapability, readonly string[]> = {
  text: ['google'], image: ['google'], video: ['google'], music: ['google'],
  tts: ['google', 'elevenlabs'], transcription: ['google'], dialog: ['google'],
  lipsync: ['elevenlabs'], 'computer-use': ['google'], execution: ['sandbox'],
};
export function isProviderPermitted(provider: string, capability?: ProviderCapability): boolean {
  const canonical = ['gemini', 'vertex', 'imagen', 'veo', 'lyria'].includes(provider) ? 'google' : provider;
  const allowed: readonly string[] = capability ? CAPABILITIES[capability] : PERMITTED_PROVIDERS;
  return allowed.includes(canonical);
}
export class ProviderPolicyError extends Error {
  readonly code = 'provider_deprecated';
  constructor() { super('This provider is not permitted by MyAvatar v32'); this.name = 'ProviderPolicyError'; }
}
export function assertProviderPermitted(provider: string, capability?: ProviderCapability): void {
  if (!isProviderPermitted(provider, capability)) throw new ProviderPolicyError();
}
/** Compatibility code may retain the old field name, but cannot read or use a deprecated credential. */
export function deprecatedProviderCredential(_name: string): string | undefined { return undefined; }
export const DEPRECATED_AI_ENV_PREFIX = /^(?:NEXT_PUBLIC_)?(?:OPENAI|ANTHROPIC|OPENROUTER|DEEPSEEK|ATLAS|REPLICATE|STABILITY|RUNWAY|PIKA|LUMA|KLING|SORA|LTX|UDIO|SUNO|HEYGEN|DID|D_ID|WORLDLABS|WORLDS|HIGGSFIELD|HF_|FAL_|FAL\b|XAI|GROK|CARTESIA|DEEPGRAM|VAPI|RUNPOD|AZURE_SPEECH|AZURE_COGNITIVE|NANOBANANA|NANO_BANANA)/;
export function isDeprecatedAiCredential(name: string): boolean {
  return (name.startsWith('NEXT_PUBLIC_') && /(?:API_KEY|SECRET|TOKEN)$/.test(name.slice(12))) || (DEPRECATED_AI_ENV_PREFIX.test(name) && /KEY|TOKEN|SECRET/.test(name)) ||
    ['GOOGLE_GENERATIVE_AI_API_KEY', 'GOOGLE_AI_API_KEY', 'GOOGLE_API_KEY', 'GOOGLE_TTS_API_KEY', 'GOOGLE_VERTEX_API_KEY', 'GEMINI_API_KEYS', 'ELEVEN_API_KEY', 'ELEVENLABS_KEY', 'XI_API_KEY'].includes(name);
}
export function isDeprecatedProviderRoute(pathname: string): boolean {
  return /^\/api\/(?:replicate|udio|heygen|ltx-video|worldlabs|higgsfield|runway|pika|luma|kling|sora|openai|anthropic|stability|vapi)(?:\/|$)/.test(pathname) ||
    /^\/api\/chat\/(?:openai|anthropic)(?:\/|$)/.test(pathname);
}
