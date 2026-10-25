// TEST-ONLY: median voice pitch of a 16-bit PCM mono WAV (decode the avatar mp4 first, e.g.
//   ffmpeg -i out.mp4 -vn -ac 1 -ar 24000 -c:a pcm_s16le out.wav   or   afconvert -f WAVE -d LEI16@24000 -c 1 out.mp4 out.wav)
// Usage: node pitch.mjs out.wav  → {"voicedFrames":…, "medianHz":…, "guess":"female|male"}
// Adult male speech sits around 85–155 Hz, female around 165–255 Hz.
import { readFileSync } from 'node:fs';

const buf = readFileSync(process.argv[2]);
let off = 12, rate = 24000, data = null;
while (off + 8 <= buf.length) {
  const id = buf.toString('latin1', off, off + 4); const size = buf.readUInt32LE(off + 4);
  if (id === 'fmt ') rate = buf.readUInt32LE(off + 12);
  if (id === 'data') { data = buf.subarray(off + 8, off + 8 + size); break; }
  off += 8 + size + (size & 1);
}
if (!data) { console.log(JSON.stringify({ error: 'no data chunk' })); process.exit(1); }
const x = new Float32Array(data.length >> 1);
for (let i = 0; i < x.length; i++) x[i] = data.readInt16LE(i * 2) / 32768;

const frame = Math.round(rate * 0.04), hop = Math.round(rate * 0.02);
const minLag = Math.floor(rate / 400), maxLag = Math.ceil(rate / 70);
const f0 = [];
let peakRms = 0;
for (let s = 0; s + frame + maxLag < x.length; s += hop) {
  let e = 0; for (let i = 0; i < frame; i++) e += x[s + i] * x[s + i];
  peakRms = Math.max(peakRms, Math.sqrt(e / frame));
}
for (let s = 0; s + frame + maxLag < x.length; s += hop) {
  let e0 = 0; for (let i = 0; i < frame; i++) e0 += x[s + i] * x[s + i];
  if (Math.sqrt(e0 / frame) < peakRms * 0.15) continue; // silence / idle
  const rs = [];
  let best = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let c = 0, e1 = 0;
    for (let i = 0; i < frame; i++) { c += x[s + i] * x[s + i + lag]; e1 += x[s + i + lag] * x[s + i + lag]; }
    const r = c / Math.sqrt(e0 * e1 + 1e-12);
    rs.push(r); if (r > best) best = r;
  }
  if (best <= 0.6) continue;
  // The shortest lag that is (almost) as good as the best one: multiples of the period correlate too (octave errors).
  const k = rs.findIndex((r, i) => r >= best * 0.9 && (i === 0 || r >= rs[i - 1]) && (i === rs.length - 1 || r >= rs[i + 1]));
  f0.push(rate / (minLag + (k < 0 ? rs.indexOf(best) : k)));
}
f0.sort((a, b) => a - b);
const median = f0.length ? Math.round(f0[f0.length >> 1]) : null;
console.log(JSON.stringify({ seconds: +(x.length / rate).toFixed(1), voicedFrames: f0.length, medianHz: median,
  p25: f0.length ? Math.round(f0[f0.length >> 2]) : null, p75: f0.length ? Math.round(f0[(f0.length * 3) >> 2]) : null,
  guess: median == null ? 'unknown' : median >= 160 ? 'female' : 'male' }));
