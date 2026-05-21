/**
 * RenderSettings — the user-configurable parameters the in-chat video
 * control suite produces and that flow, as plain JSON (never binary),
 * into the CapCut_Render_Agent payload via the event broker + Saga.
 *
 * Pure data + pure helpers — no React, no IO — so it is trivially unit
 * testable and safe to import from both the client control suite and any
 * server-side runner.
 */

export type TransitionType = 'crossfade' | 'dissolve' | 'wipe' | 'fade_to_black';
export type CaptionTheme = 'minimal' | 'bold_glow' | 'subtitle_bar' | 'none';
export type RenderFps = 24 | 60;

export interface RenderSettings {
  /** Transition applied between the five 6-second clips. */
  transition: TransitionType;
  /** Caption styling token set (resolved against Figma layout tokens). */
  captionTheme: CaptionTheme;
  /**
   * Music attenuation under vocals, 0–100 %. The brief's default is a
   * 30 % background reduction during vocal delivery.
   */
  vocalDuckingPct: number;
  /** 24 = native; 60 = AI frame-interpolation smoothness. */
  fps: RenderFps;
}

export const DEFAULT_RENDER_SETTINGS: RenderSettings = {
  transition: 'crossfade',
  captionTheme: 'minimal',
  vocalDuckingPct: 30,
  fps: 24,
};

export const TRANSITIONS: TransitionType[] = ['crossfade', 'dissolve', 'wipe', 'fade_to_black'];
export const CAPTION_THEMES: CaptionTheme[] = ['minimal', 'bold_glow', 'subtitle_bar', 'none'];

/** Clamp + coerce arbitrary input into a valid RenderSettings object. */
export function normalizeRenderSettings(input: Partial<RenderSettings> | null | undefined): RenderSettings {
  const s = input ?? {};
  const transition: TransitionType = TRANSITIONS.includes(s.transition as TransitionType)
    ? (s.transition as TransitionType) : DEFAULT_RENDER_SETTINGS.transition;
  const captionTheme: CaptionTheme = CAPTION_THEMES.includes(s.captionTheme as CaptionTheme)
    ? (s.captionTheme as CaptionTheme) : DEFAULT_RENDER_SETTINGS.captionTheme;
  const rawDuck = typeof s.vocalDuckingPct === 'number' ? s.vocalDuckingPct : DEFAULT_RENDER_SETTINGS.vocalDuckingPct;
  const vocalDuckingPct = Math.max(0, Math.min(100, Math.round(rawDuck)));
  const fps: RenderFps = s.fps === 60 ? 60 : 24;
  return { transition, captionTheme, vocalDuckingPct, fps };
}

/**
 * Fold settings into a flat, JSON-only payload fragment for the render
 * event / Saga step. Keys are snake_case to match the CapCut agent's
 * expected wire contract. Guaranteed primitive values (no binary).
 */
export function renderSettingsToPayload(settings: RenderSettings): {
  transition: TransitionType;
  caption_theme: CaptionTheme;
  vocal_ducking_pct: number;
  fps: RenderFps;
} {
  const s = normalizeRenderSettings(settings);
  return {
    transition: s.transition,
    caption_theme: s.captionTheme,
    vocal_ducking_pct: s.vocalDuckingPct,
    fps: s.fps,
  };
}

/** Human labels (trilingual) for the control suite UI. */
export function transitionLabel(t: TransitionType, locale: 'ka' | 'en' | 'ru'): string {
  const map: Record<TransitionType, [string, string, string]> = {
    crossfade:     ['კროსფეიდი', 'Crossfade', 'Кроссфейд'],
    dissolve:      ['გადადნობა', 'Dissolve', 'Растворение'],
    wipe:          ['გადაფარვა', 'Wipe', 'Вайп'],
    fade_to_black: ['შავში გასვლა', 'Fade to black', 'В чёрное'],
  };
  const triple = map[t];
  return locale === 'ka' ? triple[0] : locale === 'ru' ? triple[2] : triple[1];
}

export function captionThemeLabel(c: CaptionTheme, locale: 'ka' | 'en' | 'ru'): string {
  const map: Record<CaptionTheme, [string, string, string]> = {
    minimal:      ['მინიმალური', 'Minimal', 'Минимал'],
    bold_glow:    ['მკვეთრი ნათება', 'Bold glow', 'Яркое свечение'],
    subtitle_bar: ['სუბტიტრის ზოლი', 'Subtitle bar', 'Полоса субтитров'],
    none:         ['გარეშე', 'None', 'Без'],
  };
  const triple = map[c];
  return locale === 'ka' ? triple[0] : locale === 'ru' ? triple[2] : triple[1];
}
