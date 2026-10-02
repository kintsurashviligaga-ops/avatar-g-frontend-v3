/** @jest-environment node */
/**
 * app/manifest.ts — the one web app manifest. Its colours are the brand's ground, every icon it lists is a real file
 * of the declared size, and an installed app keeps its identity.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import manifest from '../../app/manifest';

const m = manifest();
const root = process.cwd();

/** --app-bg from the dark theme in app/globals.css ("0 0 0") as #rrggbb. */
function appBg(): string {
  const css = readFileSync(join(root, 'app/globals.css'), 'utf8');
  const match = css.match(/--app-bg:\s*(\d+)\s+(\d+)\s+(\d+)\s*;/);
  if (!match) throw new Error('--app-bg not found in app/globals.css');
  return `#${match.slice(1, 4).map((n) => Number(n).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

describe('app/manifest.ts', () => {
  it('names the app MyAvatar and runs it standalone', () => {
    expect(m.name).toBe('MyAvatar');
    expect(m.short_name).toBe('MyAvatar');
    expect(m.display).toBe('standalone');
    expect(m.scope).toBe('/');
  });

  it('opens the studio (docs/DESIGN.md §9) and pins the app identity to that start_url', () => {
    // ⚠️ Chrome keys an install on `id`, which defaults to start_url: an `id` equal to the start_url existing installs
    // were made with means start_url can move later without orphaning them.
    expect(m.start_url).toBe('/ka/dashboard');
    expect(m.id).toBe('/ka/dashboard');
  });

  it('paints the launch and the status bar in the brand ground (--app-bg, the viewport theme-color)', () => {
    expect(m.background_color?.toUpperCase()).toBe(appBg());
    expect(m.theme_color?.toUpperCase()).toBe(appBg());
    expect(readFileSync(join(root, 'app/layout.tsx'), 'utf8')).toContain(`themeColor: '${appBg().toLowerCase()}'`);
  });

  it('lists 192 and 512 "any" icons and a 512 maskable one, each a real PNG of that size under public/', () => {
    const icons = m.icons ?? [];
    const has = (sizes: string, purpose: string) => icons.some((i) => i.sizes === sizes && i.purpose === purpose);
    expect(has('192x192', 'any')).toBe(true);
    expect(has('512x512', 'any')).toBe(true);
    expect(has('512x512', 'maskable')).toBe(true);
    for (const icon of icons) {
      const file = join(root, 'public', icon.src);
      expect(existsSync(file)).toBe(true);
      const b = readFileSync(file);
      const [w, h] = (icon.sizes ?? '').split('x').map(Number);
      expect(icon.type).toBe('image/png');
      expect([b.readUInt32BE(16), b.readUInt32BE(20)]).toEqual([w, h]);
    }
  });
});
