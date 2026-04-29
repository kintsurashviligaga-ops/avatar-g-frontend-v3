export const MINIMUM_CREDITS_TO_START_CALL = 10;

export function calculateVoiceCredits(durationSeconds: number): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return 0;
  }

  return Math.ceil(durationSeconds / 30);
}

export function hasMinimumVoiceCredits(balance: number): boolean {
  return Number(balance) >= MINIMUM_CREDITS_TO_START_CALL;
}
