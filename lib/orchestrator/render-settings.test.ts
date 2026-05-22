/**
 * RenderSettings tests — normalization clamps, payload wire-shape, and
 * defaults. Guarantees the control suite can never feed an out-of-range
 * or binary value into the render Saga payload.
 */
import {
  DEFAULT_RENDER_SETTINGS,
  normalizeRenderSettings,
  renderSettingsToPayload,
  transitionLabel,
  captionThemeLabel,
} from './render-settings';

describe('render-settings', () => {
  test('defaults match the brief (crossfade / minimal / 30% / 24fps)', () => {
    expect(DEFAULT_RENDER_SETTINGS).toEqual({
      transition: 'crossfade', captionTheme: 'minimal', vocalDuckingPct: 30, fps: 24, sfxEnabled: true,
    });
  });

  test('normalize clamps ducking 0–100 and rounds', () => {
    expect(normalizeRenderSettings({ vocalDuckingPct: 140 }).vocalDuckingPct).toBe(100);
    expect(normalizeRenderSettings({ vocalDuckingPct: -10 }).vocalDuckingPct).toBe(0);
    expect(normalizeRenderSettings({ vocalDuckingPct: 33.7 }).vocalDuckingPct).toBe(34);
  });

  test('normalize coerces invalid enums + fps to safe defaults', () => {
    const s = normalizeRenderSettings({
      transition: 'explode' as never,
      captionTheme: 'rainbow' as never,
      fps: 120 as never,
    });
    expect(s.transition).toBe('crossfade');
    expect(s.captionTheme).toBe('minimal');
    expect(s.fps).toBe(24);
  });

  test('fps only accepts 24 or 60', () => {
    expect(normalizeRenderSettings({ fps: 60 }).fps).toBe(60);
    expect(normalizeRenderSettings({ fps: 30 as never }).fps).toBe(24);
  });

  test('payload is snake_case primitives (wire contract, no binary)', () => {
    const p = renderSettingsToPayload({ transition: 'wipe', captionTheme: 'bold_glow', vocalDuckingPct: 50, fps: 60, sfxEnabled: false });
    expect(p).toEqual({ transition: 'wipe', caption_theme: 'bold_glow', vocal_ducking_pct: 50, fps: 60, sfx_enabled: false });
    for (const v of Object.values(p)) {
      expect(['string', 'number', 'boolean']).toContain(typeof v);
    }
  });

  test('labels localize', () => {
    expect(transitionLabel('fade_to_black', 'en')).toBe('Fade to black');
    expect(transitionLabel('fade_to_black', 'ka')).toBe('შავში გასვლა');
    expect(captionThemeLabel('bold_glow', 'ru')).toBe('Яркое свечение');
  });
});
