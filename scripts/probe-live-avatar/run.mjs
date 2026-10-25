// TEST-ONLY probe (never merged): what does Vertex Gemini 3.8 Live send back for a talking avatar?
// Usage: node run.mjs <mode> [avatarName]
//   mode = names   → setups with several avatar names, no turn (setup errors cost nothing), prints which open
//   mode = talk    → one session with avatarName, one Georgian text turn, records every server message for ~25 s
// env: TOKEN (gcloud auth print-access-token), PROJECT, LOCATION (default europe-west4), MODEL (default gemini-3.8-live),
//      SHAPE = a | b | c  (where avatarConfig sits, see setupFor), BITRATE (videoBitrateBps, default 1500000)
// Writes out-<avatar>.mp4 (all video bytes in arrival order) and report-<avatar>.json next to this file.
import { writeFileSync } from 'node:fs';
import WebSocket from 'ws';

const [, , mode = 'names', avatarArg = 'Kira'] = process.argv;
const { TOKEN, PROJECT = 'gen-lang-client-0671348730', LOCATION = 'europe-west4', MODEL = 'gemini-3.8-live', SHAPE = 'a' } = process.env;
const BITRATE = Number(process.env.BITRATE || 1_500_000);
const url = `wss://${LOCATION}-aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1.LlmBidiService/BidiGenerateContent`;
const model = `projects/${PROJECT}/locations/${LOCATION}/publishers/google/models/${MODEL}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const here = (f) => new URL(`./${f}`, import.meta.url);

// The avatar field's place is unverified against Google's reference, so the probe tries the shapes seen in third-party code.
function setupFor(avatarName) {
  const avatar = { avatarName, videoBitrateBps: BITRATE };
  const base = {
    model,
    systemInstruction: { parts: [{ text: 'You are a friendly assistant. Always answer in the language the user writes in. Keep answers to one short sentence.' }] },
  };
  if (SHAPE === 'a') return { setup: { ...base, generationConfig: { responseModalities: ['VIDEO'] }, avatarConfig: avatar } };
  if (SHAPE === 'b') return { setup: { ...base, generationConfig: { responseModalities: ['AUDIO'] }, avatarConfig: avatar } };
  return { setup: { ...base, generationConfig: { responseModalities: ['VIDEO'], avatarConfig: avatar } } };
}

function open(avatarName) {
  const ws = new WebSocket(url, { headers: { Authorization: `Bearer ${TOKEN}` }, maxPayload: 256 * 1024 * 1024 });
  const t0 = Date.now();
  const state = { ws, t0, setupMs: -1, close: null, msgs: [] };
  state.ready = new Promise((resolve) => {
    ws.on('message', (raw) => {
      const m = JSON.parse(raw.toString());
      state.msgs.push({ t: Date.now() - t0, m, bytes: raw.length });
      if (m.setupComplete && state.setupMs < 0) { state.setupMs = Date.now() - t0; resolve(true); }
    });
    ws.on('close', (code, reason) => { state.close = { code, reason: reason.toString().slice(0, 300), t: Date.now() - t0 }; resolve(false); });
    ws.on('error', (e) => { state.error = e.message; resolve(false); });
  });
  ws.on('open', () => ws.send(JSON.stringify(setupFor(avatarName))));
  return state;
}

// Top-level MP4 boxes of one chunk: [type, size] pairs, so we see ftyp/moov once and moof/mdat after.
function boxes(buf) {
  const out = [];
  for (let i = 0; i + 8 <= buf.length && out.length < 12;) {
    const size = buf.readUInt32BE(i); const type = buf.toString('latin1', i + 4, i + 8);
    out.push(`${type}:${size}`);
    if (size < 8) break;
    i += size;
  }
  return out;
}

// Codec strings for MediaSource: avc1.PPCCLL from the avcC box, mp4a.40.<aot> from the esds box.
function codecs(buf) {
  const r = {};
  const a = buf.indexOf('avcC', 0, 'latin1');
  if (a > 0) r.video = 'avc1.' + [1, 2, 3].map((k) => buf[a + 4 + k].toString(16).padStart(2, '0')).join('');
  const e = buf.indexOf('esds', 0, 'latin1');
  if (e > 0) {
    const d = buf.indexOf(Buffer.from([0x05]), e + 12); // DecoderSpecificInfo tag
    if (d > 0) { const len = buf[d + 1]; const aot = buf[d + 2] >> 3; r.audio = `mp4a.40.${aot}`; r.audioCfgLen = len; }
  }
  const tk = buf.indexOf('tkhd', 0, 'latin1');
  if (tk > 0) { const v = buf[tk + 4]; const off = tk + 4 + (v === 1 ? 88 : 76); r.width = buf.readUInt32BE(off) >> 16; r.height = buf.readUInt32BE(off + 4) >> 16; }
  return r;
}

if (mode === 'names') {
  const names = (process.env.NAMES || 'Kira,Ben,Aria,Leo,Mia,Zz_not_a_name').split(',');
  for (const n of names) {
    const s = open(n);
    const ok = await Promise.race([s.ready, sleep(12000).then(() => 'timeout')]);
    console.log(JSON.stringify({ avatar: n, shape: SHAPE, ok, setupMs: s.setupMs, close: s.close, error: s.error }));
    try { s.ws.close(); } catch {}
    await sleep(500);
  }
  process.exit(0);
}

// talk
const s = open(avatarArg);
const ok = await Promise.race([s.ready, sleep(15000).then(() => 'timeout')]);
if (ok !== true) { console.log(JSON.stringify({ avatar: avatarArg, ok, close: s.close, error: s.error })); process.exit(1); }
const sentAt = Date.now() - s.t0;
s.ws.send(JSON.stringify({ clientContent: { turns: [{ role: 'user', parts: [{ text: 'გამარჯობა! ერთი მოკლე წინადადებით მითხარი, ვინ ხარ.' }] }], turnComplete: true } }));
let turnDoneAt = -1;
for (let i = 0; i < 250; i++) {
  await sleep(100);
  const done = s.msgs.find((x) => x.m.serverContent?.turnComplete);
  if (done && turnDoneAt < 0) turnDoneAt = done.t;
  if (turnDoneAt > 0 && Date.now() - s.t0 > turnDoneAt + 6000) break; // keep 6 s after the turn to see idle frames
  if (s.close) break;
}
try { s.ws.close(); } catch {}
await sleep(300);

const video = []; const parts = []; let usage = null; let firstVideoMs = -1; let text = '';
for (const { t, m, bytes } of s.msgs) {
  if (m.usageMetadata) usage = m.usageMetadata;
  const sc = m.serverContent;
  if (sc?.outputTranscription?.text) text += sc.outputTranscription.text;
  for (const p of sc?.modelTurn?.parts ?? []) {
    if (p.inlineData) {
      const buf = Buffer.from(p.inlineData.data, 'base64');
      if (p.inlineData.mimeType?.startsWith('video') && firstVideoMs < 0) firstVideoMs = t - sentAt;
      if (p.inlineData.mimeType?.startsWith('video')) video.push(buf);
      parts.push({ t, mime: p.inlineData.mimeType, bytes: buf.length, boxes: boxes(buf) });
    } else if (p.text) parts.push({ t, text: p.text.slice(0, 120) });
  }
  if (!sc?.modelTurn) parts.push({ t, keys: Object.keys(m), sc: sc ? Object.keys(sc) : undefined, wsBytes: bytes });
}
const all = Buffer.concat(video);
writeFileSync(here(`out-${avatarArg}.mp4`), all);
const afterTurn = parts.filter((p) => p.mime && turnDoneAt > 0 && p.t > turnDoneAt);
const report = {
  avatar: avatarArg, location: LOCATION, model: MODEL, shape: SHAPE, bitrate: BITRATE,
  setupMs: s.setupMs, firstVideoMs, turnDoneAt, close: s.close,
  videoBytes: all.length, videoChunks: video.length, chunksAfterTurnComplete: afterTurn.length,
  codecs: codecs(all), firstParts: parts.slice(0, 12), lastParts: parts.slice(-6),
  mimeTypes: [...new Set(parts.map((p) => p.mime).filter(Boolean))],
  transcript: text.slice(0, 300), usage,
};
writeFileSync(here(`report-${avatarArg}.json`), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...report, firstParts: undefined, lastParts: undefined }, null, 2));
