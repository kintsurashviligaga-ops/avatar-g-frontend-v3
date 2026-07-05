#!/usr/bin/env node
/**
 * gen_frames.mjs — deterministic, ON-BRAND frame generator for the 60s showcase ANIMATIC.
 *
 * The UI shots (S02/03/05/06/07/08) are tagged [CAPTURE]/[HYBRID] in the blueprint precisely
 * because text-to-video models hallucinate garbled UI. So instead of AI-generating them, this
 * renders clean, LEGIBLE, brand-locked frames FROM CODE (SVG → PNG via @resvg/resvg-js → a static
 * shot-duration .mov via ffmpeg). Every one of the 16 slots is filled with a real, deterministic
 * frame; render then concats them into an exact-60s animatic. This is NOT the final hero cut
 * (that needs real 60fps UI captures + AE motion + AI-environmental shots + full audio) — it is an
 * honest, autonomous, watchable proof-of-concept the platform generated of its OWN commercial.
 *
 * Usage: node commercial/pipeline/gen_frames.mjs   (writes 01_source/** .mov + 06_exports/animatic mp4)
 */
import { Resvg } from '@resvg/resvg-js';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(execFileSync('cat', [resolve(ROOT, 'asset_manifest.json')]).toString());
// `--vertical` → native 9:16 1080×1920 mobile render (the landscape design is authored in a fixed
// 1920×1080 space, then scaled + centered as a premium hero-card on the brand void, with a persistent
// wordmark). Default → 16:9 1920×1080. Final master would be 2160p; this is the 1080p animatic.
const VERTICAL = process.argv.includes('--vertical') || process.env.ORIENT === 'vertical';
const W = 1920, H = 1080, FPS = 24;                               // design space (frame fns author here)
const OW = VERTICAL ? 1080 : 1920, OH = VERTICAL ? 1920 : 1080;   // output canvas
const BG = '#0A0A0F', CY = '#00D4FF', VI = '#7A5CFF', TX = '#E8ECF4', MUT = '#5b6577';
const FRAMES = resolve(ROOT, '04_work/frames'); mkdirSync(FRAMES, { recursive: true });

// ── shared SVG primitives ────────────────────────────────────────────────────
const DEFS = `<defs>
    <radialGradient id="void" cx="50%" cy="45%" r="75%"><stop offset="0%" stop-color="#111119"/><stop offset="70%" stop-color="${BG}"/><stop offset="100%" stop-color="#050508"/></radialGradient>
    <linearGradient id="cyan" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="${CY}"/><stop offset="100%" stop-color="${VI}"/></linearGradient>
    <filter id="glow"><feGaussianBlur stdDeviation="6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>`;
const S = (inner) => {
  const bg = `<rect width="${W}" height="${H}" fill="url(#void)"/>`;
  if (!VERTICAL)
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${OW}" height="${OH}" viewBox="0 0 ${OW} ${OH}">${DEFS}${bg}${inner}</svg>`;
  // 9:16 — scale the 1920×1080 design to the 1080 mobile width, center it as a hero card on the
  // brand void, ring it in faint cyan, and hold the wordmark below (premium mobile treatment).
  const K = OW / W, bandH = H * K, top = (OH - bandH) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${OW}" height="${OH}" viewBox="0 0 ${OW} ${OH}">${DEFS}
    <rect width="${OW}" height="${OH}" fill="url(#void)"/>
    <g transform="translate(0 ${top.toFixed(1)}) scale(${K.toFixed(4)})">${bg}${inner}</g>
    <rect x="8" y="${(top - 8).toFixed(1)}" width="${OW - 16}" height="${(bandH + 16).toFixed(1)}" rx="16" fill="none" stroke="${CY}" stroke-opacity="0.16" stroke-width="1.5"/>
    ${label(OW / 2, OH - 112, 'My Avatar', 32, TX, 'middle', 800)}
    <line x1="${OW / 2 - 72}" y1="${OH - 96}" x2="${OW / 2 + 72}" y2="${OH - 96}" stroke="${CY}" stroke-width="3" stroke-linecap="round"/>
    ${label(OW / 2, OH - 60, 'MyAvatar.ge', 20, CY, 'middle', 600)}
  </svg>`;
};
const tile = (x, y, w, h, r, fill, stroke, sw) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}"${stroke ? ` stroke="${stroke}" stroke-width="${sw || 1}"` : ''}/>`;
const label = (x, y, t, size, fill, anchor, weight) => `<text x="${x}" y="${y}" font-family="Inter,Segoe UI,Helvetica,Arial,sans-serif" font-size="${size}" fill="${fill || TX}" text-anchor="${anchor || 'start'}" font-weight="${weight || 500}">${t}</text>`;
const kicker = (t) => label(W / 2, 84, t, 22, MUT, 'middle', 600);
const wordmark = (x, y, s) => `${label(x, y, 'My ', s, TX, 'start', 800)}<tspan></tspan>${label(x + s * 2.1, y, 'Avatar', s, CY, 'start', 800)}`;

// six service tiles
const tiles6 = (cx, cy, active) => {
  const names = ['Chat', 'Image', 'Music', 'Video', 'Avatar', 'Remix'];
  const tw = 250, th = 150, gap = 26, cols = 3;
  const gw = cols * tw + (cols - 1) * gap, gh = 2 * th + gap;
  const ox = cx - gw / 2, oy = cy - gh / 2;
  return names.map((n, i) => {
    const c = i % cols, r = Math.floor(i / cols);
    const x = ox + c * (tw + gap), y = oy + r * (th + gap);
    const on = n === active;
    return `${tile(x, y, tw, th, 18, '#12131b', on ? CY : '#20222e', on ? 2 : 1)}
      ${on ? tile(x, y, tw, th, 18, 'none', CY, 2) : ''}
      <circle cx="${x + 34}" cy="${y + 40}" r="13" fill="none" stroke="${on ? CY : MUT}" stroke-width="2"/>
      ${label(x + 24, y + th - 28, n, 26, on ? CY : TX, 'start', 700)}`;
  }).join('');
};

// ── per-shot frame content (on-brand, legible; representative of the beat) ────
const FRAME = {
  S01: () => `<circle cx="${W / 2}" cy="${H / 2}" r="4" fill="${CY}" filter="url(#glow)"/>
    <circle cx="${W / 2}" cy="${H / 2}" r="60" fill="none" stroke="${CY}" stroke-opacity="0.12"/>`,
  S02: () => `${kicker('THE PROMPT')}
    ${tile(W / 2 - 620, H / 2 - 70, 1240, 140, 28, '#12131b', '#22242f', 1.5)}
    ${label(W / 2 - 588, H / 2 + 16, 'კინემატოგრაფიული რგოლი ზამთრის თბილისზე, ნისლიანი დილა', 30, TX)}
    <rect x="${W / 2 + 560}" y="${H / 2 - 12}" width="3" height="34" fill="${CY}" filter="url(#glow)"/>`,
  S03: () => `${kicker('READY')}
    ${tile(W / 2 - 620, H / 2 - 70, 1240, 140, 28, '#12131b', CY, 2.5)}
    ${label(W / 2 - 588, H / 2 + 16, 'კინემატოგრაფიული რგოლი ზამთრის თბილისზე…', 30, TX)}
    <circle cx="${W / 2 + 560}" cy="${H / 2}" r="26" fill="url(#cyan)" filter="url(#glow)"/>`,
  S04: () => `${label(W / 2, H / 2 - 40, 'IGNITE', 34, CY, 'middle', 800)}
    <line x1="${W / 2 - 500}" y1="${H / 2 + 30}" x2="${W / 2 + 500}" y2="${H / 2 + 30}" stroke="url(#cyan)" stroke-width="10" stroke-linecap="round" filter="url(#glow)"/>`,
  S05: () => `${kicker('ONE CHAT · A FULL STUDIO')}${tiles6(W / 2, H / 2 + 10, 'Chat')}`,
  S06: () => {
    let g = '';
    for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) g += tile(W / 2 - 520 + c * 270, H / 2 - 150 + r * 160, 250, 140, 14, '#171922', c === 1 && r === 0 ? CY : '#242732', c === 1 && r === 0 ? 2.5 : 1);
    return `${kicker('IMAGE')}${g}`;
  },
  S07: () => `${kicker('MUSIC COMPOSER')}
    ${tile(W / 2 - 560, H / 2 - 150, 1120, 300, 22, '#12131b', '#22242f', 1.5)}
    ${label(W / 2 - 520, H / 2 - 96, '📝 Lyrics   ✨ Write lyrics', 24, MUT)}
    ${label(W / 2 - 520, H / 2 - 20, '🎤 Your voice · Record · Upload · Trained-RVC', 24, MUT)}
    ${Array.from({ length: 60 }, (_, i) => { const bh = 20 + 90 * Math.abs(Math.sin(i * 0.5)); return `<rect x="${W / 2 - 500 + i * 17}" y="${H / 2 + 110 - bh}" width="8" height="${bh}" rx="3" fill="${CY}" opacity="${0.5 + 0.5 * Math.abs(Math.sin(i * 0.5))}"/>`; }).join('')}`,
  S08: () => `${kicker('CHARACTER SWAP')}
    ${tile(W / 2 - 470, H / 2 - 150, 300, 300, 20, '#171922', '#242732', 1)}
    ${tile(W / 2 + 170, H / 2 - 150, 300, 300, 20, '#171922', CY, 2)}
    <circle cx="${W / 2 - 320}" cy="${H / 2 - 30}" r="70" fill="#242732"/>
    <circle cx="${W / 2 + 320}" cy="${H / 2 - 30}" r="70" fill="url(#cyan)" opacity="0.8"/>
    ${label(W / 2, H / 2 + 130, '→ identity lock ✓', 24, CY, 'middle', 600)}`,
  S09: () => `${kicker('FAN-OUT → ONE PIPELINE')}${tiles6(W / 2, H / 2, '')}
    <circle cx="${W / 2}" cy="${H / 2}" r="40" fill="url(#cyan)" filter="url(#glow)"/>`,
  S10: () => `${kicker('PARALLEL PIPELINE')}
    ${[0, 1, 2, 3].map(i => `<line x1="300" y1="${H / 2 - 120 + i * 80}" x2="${W - 300}" y2="${H / 2 - 120 + i * 80}" stroke="${CY}" stroke-opacity="0.4" stroke-width="3"/>`).join('')}
    ${[0, 1, 2, 3].map(i => tile(500 + i * 210, H / 2 - 132 + i * 80, 90, 60, 8, '#12131b', CY, 1.5)).join('')}`,
  S11: () => `${kicker('Cap-3 · mapWithConcurrency · 4 workers')}
    ${[0, 1, 2, 3].map(i => { const w = 900 * (0.4 + i * 0.15); return `${tile(W / 2 - 450, H / 2 - 130 + i * 70, 900, 40, 20, '#171922', '#242732', 1)}${tile(W / 2 - 450, H / 2 - 130 + i * 70, w, 40, 20, 'url(#cyan)', '', 0)}${label(W / 2 - 480, H / 2 - 102 + i * 70, 'L' + (i + 1), 20, MUT, 'end')}`; }).join('')}`,
  S12: () => `${kicker('AUTO ASSEMBLY')}
    ${['scenes', 'music', 'audio', 'levels'].map((n, i) => `${tile(W / 2 - 400, H / 2 - 140 + i * 72, 800, 52, 12, '#12131b', i === 0 ? CY : '#242732', i === 0 ? 2 : 1)}${label(W / 2 - 370, H / 2 - 104 + i * 72, n, 24, i === 0 ? CY : MUT)}`).join('')}`,
  S13: () => `${kicker('100% · MASTER')}
    ${[0, 1, 2, 3].map(i => tile(W / 2 - 450 + i * 235, H / 2 - 100, 220, 26, 13, 'url(#cyan)', '', 0)).join('')}
    ${tile(W / 2 - 160, H / 2 + 10, 320, 180, 18, '#12131b', CY, 3)}
    ${label(W / 2, H / 2 + 116, '▶', 44, CY, 'middle')}`,
  S14: () => `${tile(W / 2 - 220, H / 2 - 130, 440, 260, 20, '#12131b', CY, 3)}
    ${label(W / 2, H / 2 + 20, '▶', 60, CY, 'middle', 700)}
    <circle cx="${W / 2}" cy="${H / 2}" r="260" fill="none" stroke="${CY}" stroke-opacity="0.12"/>`,
  S15: () => `${kicker('THE UNIFIED COMPOSITE')}
    ${tile(W / 2 - 520, H / 2 - 200, 1040, 400, 16, '#0d0e14', '#20222e', 1.5)}
    ${tile(W / 2 - 470, H / 2 - 160, 940, 300, 10, '#12131b', CY, 2)}
    ${label(W / 2, H / 2 + 10, '▶', 54, CY, 'middle')}
    ${tile(W / 2 - 120, H / 2 + 210, 240, 16, 8, '#1a1c26', '', 0)}`,
  S16: () => `<g filter="url(#glow)">${wordmark(W / 2 - 150, H / 2 - 10, 64)}</g>
    <line x1="${W / 2 - 150}" y1="${H / 2 + 26}" x2="${W / 2 + 150}" y2="${H / 2 + 26}" stroke="url(#cyan)" stroke-width="5" stroke-linecap="round" filter="url(#glow)"/>
    ${label(W / 2, H / 2 + 78, 'MyAvatar.ge', 26, TX, 'middle', 600)}
    ${label(W / 2, H / 2 + 120, 'ერთი ჩატი. უსასრულო შემოქმედება.', 24, MUT, 'middle')}`,
};

// ── render each shot → SVG → PNG → static shot-duration .mov ──────────────────
console.log(`▶ generating 16 on-brand frames @ ${OW}×${OH} · ${FPS}fps`);
const slotMovs = [];
for (const s of manifest.shots) {
  const svg = S((FRAME[s.id] || (() => kicker(s.id)))());
  const svgPath = resolve(FRAMES, `${s.id}.svg`);
  const pngPath = resolve(FRAMES, `${s.id}.png`);
  const movPath = resolve(ROOT, s.output);
  writeFileSync(svgPath, svg);
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: OW } }).render().asPng();
  writeFileSync(pngPath, png);
  mkdirSync(dirname(movPath), { recursive: true });
  // static frame held for the exact shot duration, uniform codec/params so concat is clean.
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-loop', '1', '-framerate', String(FPS), '-i', pngPath,
    '-t', String(s.dur_sec), '-r', String(FPS), '-s', `${OW}x${OH}`, '-pix_fmt', 'yuv420p',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', movPath]);
  slotMovs.push(movPath);
  console.log(`  ✓ ${s.id}  ${s.dur_frames}f/${s.dur_sec}s  → ${s.output}`);
}

// ── concat all 16 → exact-60s animatic ───────────────────────────────────────
const listPath = resolve(ROOT, '04_work/animatic_concat.txt');
writeFileSync(listPath, slotMovs.map((m) => `file '${m}'`).join('\n') + '\n');
const outDir = resolve(ROOT, VERTICAL ? '06_exports/9x16' : '06_exports/animatic'); mkdirSync(outDir, { recursive: true });
const outMp4 = resolve(outDir, VERTICAL ? 'MyAvatar_60s_9x16_1080x1920.mp4' : 'MyAvatar_60s_animatic_1080p.mp4');
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', listPath,
  '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', outMp4]);
rmSync(FRAMES + '/tmp', { recursive: true, force: true });
console.log(`▶ ANIMATIC → ${outMp4.replace(ROOT + '/', 'commercial/')}`);
