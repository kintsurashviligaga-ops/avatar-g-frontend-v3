import { validateVoicePreferences, type VoicePreferences } from './settings';
export const VOICE_PREFERENCES_EVENT = 'myavatar:voice-preferences';
type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export function preferenceKey(userId: string | null | undefined): string | null {
  return typeof userId === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(userId) ? `myavatar:voice:v1:${userId}` : null;
}
export function loadVoicePreferences(userId: string | null | undefined, storage?: StorageLike): VoicePreferences {
  try { const key = preferenceKey(userId); return validateVoicePreferences(key && storage ? JSON.parse(storage.getItem(key) || 'null') : null); }
  catch { return validateVoicePreferences(null); }
}
export function saveVoicePreferences(userId: string | null | undefined, raw: unknown, storage?: StorageLike): boolean {
  const key = preferenceKey(userId); if (!key || !storage) return false;
  try { storage.setItem(key, JSON.stringify(validateVoicePreferences(raw))); return true; } catch { return false; }
}
export function clearVoicePreferences(userId: string | null | undefined, storage?: StorageLike): boolean {
  const key = preferenceKey(userId); if (!key || !storage) return false;
  try { storage.removeItem(key); return true; } catch { return false; }
}
