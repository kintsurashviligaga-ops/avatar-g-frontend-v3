/** @jest-environment node */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import sources from '../../app/fonts/sources.json';

// A real Node child avoids next/jest's font-module mocks; use the SAME binary parser as next/font/local.
const PARSE = `const fs=require('node:fs');const m=require('next/dist/compiled/@next/font/dist/fontkit').default;
const f=(m.default||m)(fs.readFileSync(process.argv[1]));
console.log(JSON.stringify({glyphs:[...process.argv[2]].map(c=>f.hasGlyphForCodePoint(c.codePointAt(0))),
axes:f.variationAxes,unitsPerEm:f.unitsPerEm,ascent:f.ascent,descent:f.descent}));`;

describe('pinned local brand fonts', () => {
  test.each(sources.fonts)('$file is a licensed, pinned, parseable variable WOFF2 with the required script', font => {
    const bytes = readFileSync(resolve('app/fonts', font.file));
    expect(bytes.subarray(0, 4).toString()).toBe('wOF2');
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(font.sha256);
    expect(bytes.length).toBe(font.bytes);
    const sample = font.file.startsWith('Noto') ? 'ქართული' : 'MyAvatarПривет';
    const parsed = JSON.parse(execFileSync(process.execPath, ['-e', PARSE, resolve('app/fonts', font.file), sample], { encoding: 'utf8', timeout: 5000 }));
    expect(parsed.glyphs).toEqual([...sample].map(() => true));
    expect(parsed.axes.wght).toMatchObject({ min: 100, max: 900 });
    expect(parsed.unitsPerEm).toBe(font.metrics.unitsPerEm);
    expect(parsed.ascent).toBe(font.metrics.ascent);
    expect(parsed.descent).toBe(font.metrics.descent);
    expect(readFileSync(resolve('app/fonts', font.license), 'utf8')).toContain('SIL OPEN FONT LICENSE Version 1.1');
    expect(font.source).toContain(`/${sources.google_fonts_commit}/ofl/`);
  });

  test('the root layout keeps the brand variables and uses only packaged font inputs', () => {
    const source = readFileSync(resolve('app/layout.tsx'), 'utf8');
    expect(source).toContain('from "next/font/local"');
    expect(source).not.toMatch(/from ["']next\/font\/google["']/);
    for (const variable of ['--font-ui', '--font-display', '--font-georgian']) expect(source).toContain(`variable: "${variable}"`);
    for (const font of sources.fonts) expect(source).toContain(`./fonts/${font.file}`);
    expect(sources.fonts.reduce((sum, f) => sum + f.bytes, 0)).toBeLessThan(600_000);
  });
});
