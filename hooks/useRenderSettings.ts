'use client';

/**
 * useRenderSettings — persists the in-chat video render configuration to
 * the signed-in user's Supabase `user_metadata.render_settings`.
 *
 * Why user_metadata (not a new table): these are small per-user UI
 * preferences. Storing them on the auth user needs zero DDL / migration,
 * is automatically row-scoped to the user, and survives reloads + devices.
 *
 * Behaviour:
 *   - On mount, hydrate from user_metadata (falls back to defaults / any
 *     guest value cached in localStorage when signed-out).
 *   - On every change, update local state immediately (snappy UI) and fire
 *     a debounced (800 ms) async write so rapid slider drags collapse into
 *     a single mutation.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { createBrowserClient } from '@/lib/supabase/browser';
import {
  type RenderSettings,
  DEFAULT_RENDER_SETTINGS,
  normalizeRenderSettings,
} from '@/lib/orchestrator/render-settings';

const LS_KEY = 'myavatar-render-settings';
const DEBOUNCE_MS = 800;

export function useRenderSettings(): [RenderSettings, (next: RenderSettings) => void, { hydrated: boolean }] {
  const [settings, setSettingsState] = useState<RenderSettings>(DEFAULT_RENDER_SETTINGS);
  const [hydrated, setHydrated] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hydrate once: prefer the authenticated user_metadata, fall back to a
  // guest localStorage cache, then defaults.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let loaded: RenderSettings | null = null;
      try {
        const supabase = createBrowserClient();
        if (supabase) {
          const { data } = await supabase.auth.getUser();
          const meta = data.user?.user_metadata as { render_settings?: Partial<RenderSettings> } | undefined;
          if (meta?.render_settings) loaded = normalizeRenderSettings(meta.render_settings);
        }
      } catch { /* ignore — fall through */ }
      if (!loaded) {
        try {
          const raw = localStorage.getItem(LS_KEY);
          if (raw) loaded = normalizeRenderSettings(JSON.parse(raw) as Partial<RenderSettings>);
        } catch { /* ignore */ }
      }
      if (!cancelled) {
        if (loaded) setSettingsState(loaded);
        setHydrated(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const persist = useCallback((value: RenderSettings) => {
    // Guest cache — always written so a later sign-in can migrate it.
    try { localStorage.setItem(LS_KEY, JSON.stringify(value)); } catch { /* ignore quota */ }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void (async () => {
        try {
          const supabase = createBrowserClient();
          if (!supabase) return;
          const { data } = await supabase.auth.getUser();
          if (!data.user) return; // guest — localStorage only
          await supabase.auth.updateUser({ data: { render_settings: value } });
        } catch { /* network/transient — guest cache already holds it */ }
      })();
    }, DEBOUNCE_MS);
  }, []);

  const setSettings = useCallback((next: RenderSettings) => {
    const normalized = normalizeRenderSettings(next);
    setSettingsState(normalized);
    persist(normalized);
  }, [persist]);

  // Flush a pending write on unmount.
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return [settings, setSettings, { hydrated }];
}
