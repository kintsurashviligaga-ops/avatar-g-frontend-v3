const PLATFORM_HINTS = /create|generate|build|launch|make\s+campaign|export|produce|listing|business\s+plan|social\s+posts|voiceover/i;

export type AgentGAssistantMode = 'platform' | 'general';

export function inferAssistantMode(goal: string, forceUsePlatformTools?: boolean): AgentGAssistantMode {
  if (typeof forceUsePlatformTools === 'boolean') {
    return forceUsePlatformTools ? 'platform' : 'general';
  }

  return PLATFORM_HINTS.test(goal) ? 'platform' : 'general';
}
