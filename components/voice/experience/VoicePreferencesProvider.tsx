'use client';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { clearVoicePreferences, loadVoicePreferences, preferenceKey, saveVoicePreferences, VOICE_PREFERENCES_EVENT } from '@/lib/voice/experience/preferences';
import { validateVoicePreferences, type VoicePreferences } from '@/lib/voice/experience/settings';

export function useVoicePreferences(userId?: string | null) {
  const [state, setState] = useState<{ userId?: string | null; value: VoicePreferences }>({ userId, value: validateVoicePreferences(null) });
  const [saved, setSaved] = useState(true);
  const preferences = state.userId === userId ? state.value : validateVoicePreferences(null);
  useEffect(() => {
    const read = () => { let value = validateVoicePreferences(null); try { value = loadVoicePreferences(userId, localStorage); } catch { /* denied */ } setState({ userId, value }); };
    const changed = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail || detail.userId !== userId) return;
      setState({ userId, value: validateVoicePreferences(detail.value) });
      setSaved(detail.saved === true);
    };
    const storage = (e: StorageEvent) => { if (e.key === preferenceKey(userId) || e.key === null) read(); };
    read(); window.addEventListener(VOICE_PREFERENCES_EVENT, changed); window.addEventListener('storage', storage);
    return () => { window.removeEventListener(VOICE_PREFERENCES_EVENT, changed); window.removeEventListener('storage', storage); };
  }, [userId]);
  const update = useCallback((raw: unknown) => {
    const value = validateVoicePreferences(raw); setState({ userId, value });
    let ok = false; try { ok = saveVoicePreferences(userId, value, localStorage); } catch { /* denied */ }
    setSaved(ok);
    // Same-account controls and the active call share the current value even when device storage is denied.
    window.dispatchEvent(new CustomEvent(VOICE_PREFERENCES_EVENT, { detail: { userId, value, saved: ok } }));
  }, [userId]);
  const reset = useCallback(() => {
    let ok = false; try { ok = clearVoicePreferences(userId, localStorage); } catch { /* denied */ }
    setSaved(ok); setState({ userId, value: validateVoicePreferences(null) });
    window.dispatchEvent(new CustomEvent(VOICE_PREFERENCES_EVENT, { detail: { userId, value: validateVoicePreferences(null), saved: ok } }));
  }, [userId]);
  return { preferences, update, reset, saved };
}
type Context = ReturnType<typeof useVoicePreferences>;
const VoiceContext = createContext<Context | null>(null);
export function VoicePreferencesProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const value = useVoicePreferences(userId);
  return <VoiceContext.Provider value={userId ? value : null}>{children}</VoiceContext.Provider>;
}
export const useVoicePreferencesContext = () => useContext(VoiceContext);
