// TEST-ONLY probe (never merged): what does Vertex Gemini 3.8 Live send back for a talking avatar?
// Usage: node run.mjs <mode> [avatarName]
//   mode = names   → setups with several avatar names, no turn (setup errors cost nothing), prints which open
//   mode = talk    → one session with avatarName, one Georgian text turn, records every server message for ~25 s
//   mode = speak   → the same user turn as SPEECH over realtimeInput.audio (like the app's mic): heard, tool calls, answer
//   mode = setup   → the EXACT setups the mint route builds for an avatar call (setups.json, dumped from route.test.ts with
//                    the avatar on: full = actions + captions + resumption + compression, fullVad = + realtimeInputConfig,
//                    noTools = the browser's no-tools retry), each closed the moment setupComplete arrives (no turn: free)
//   mode = custom  → the full setup with avatarConfig.customizedAvatar = a synthetic grey 704×1280 PNG (no face, no user
//                    data), closed at setupComplete: a 1007 "not allowlisted" close = the own-face avatar is BLOCKED_EXTERNAL
// env: TOKEN (gcloud auth print-access-token), PROJECT, LOCATION (default europe-west4), MODEL (default gemini-3.8-live),
//      SHAPE = a | b | c  (where avatarConfig sits, see setupFor), BITRATE (videoBitrateBps, default 1500000)
// Writes out-<avatar>.mp4 (all video bytes in arrival order) and report-<avatar>.json next to this file.
import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
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

function open(avatarName, frame = setupFor(avatarName)) {
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
  ws.on('open', () => ws.send(JSON.stringify(frame)));
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

// A plain grey 9:16 PNG at the documented minimum (704×1280): enough for Google to judge the request, nobody's face.
const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function pngChunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function greyPng(w = 704, h = 1280) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
  const row = Buffer.alloc(1 + w * 3, 128); row[0] = 0; // filter byte 0, then grey pixels
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', ihdr), pngChunk('IDAT', deflateSync(raw)), pngChunk('IEND', Buffer.alloc(0))]);
}

// VOICE=Kore|Aoede|Charon|… → the fixture setup also carries speechConfig with that prebuilt voice (does the avatar take it?).
const withVoice = (setup) => (process.env.VOICE
  ? { ...setup, generationConfig: { ...setup.generationConfig, speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: process.env.VOICE } } } } }
  : setup);

if (mode === 'setup' || mode === 'custom') {
  const fixtures = JSON.parse(readFileSync(here('setups.json'), 'utf8'));
  const cases = mode === 'setup'
    ? Object.entries(fixtures)
    : [['custom', { setup: { ...fixtures.full.setup, avatarConfig: { customizedAvatar: { imageMimeType: 'image/png', imageData: greyPng().toString('base64') }, videoBitrateBps: BITRATE } } }]];
  for (const [name, msg] of cases) {
    const frame = { setup: withVoice({ ...msg.setup, model }) };
    const s = open(null, frame);
    const ok = await Promise.race([s.ready, sleep(15000).then(() => 'timeout')]);
    const closedByServer = s.close; // before our own close below
    try { s.ws.close(); } catch {}
    await sleep(800);
    console.log(JSON.stringify({
      case: name, location: LOCATION, ok, setupMs: s.setupMs, serverClose: closedByServer, error: s.error,
      frameKB: Math.round(JSON.stringify(frame).length / 1024), modelTurns: s.msgs.filter((x) => x.m.serverContent?.modelTurn).length,
    }));
    await sleep(500);
  }
  process.exit(0);
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

// speak: the user's turn as SPEECH (the app streams the mic; `talk` sends text). The words come from the voice model
// reading PROMPT aloud (Vertex only, no other TTS), resampled to 16 kHz and streamed in 40 ms chunks at real time, then
// silence, like an open mic. FIXTURE (default fullVad) is the app's exact setup; MODEL/LOCATION pick the session under
// test (AS_VOICE=1 strips the avatar: the same setup as a plain voice call). Tool calls get app-like answers.
if (mode === 'speak') {
  const ttsLoc = process.env.TTS_LOCATION || 'europe-west4';
  const ttsModel = `projects/${PROJECT}/locations/${ttsLoc}/publishers/google/models/gemini-live-2.5-flash-native-audio`;
  const ttsUrl = `wss://${ttsLoc}-aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1.LlmBidiService/BidiGenerateContent`;
  const say = process.env.PROMPT || 'სურათი გამიკეთე: NASCAR-ის რბოლა.';
  const ttsSaid = { text: '' };
  // AUDIO_FILE = a 16 kHz mono 16-bit WAV of the request (macOS: say -o x.aiff "…" && afconvert -f WAVE -d LEI16@16000 -c 1
  // x.aiff x.wav): used as is, no reader.
  const wav = process.env.AUDIO_FILE ? readFileSync(process.env.AUDIO_FILE) : null;
  const pcm24 = wav ? Buffer.alloc(0) : await new Promise((resolve) => {
    const ws = new WebSocket(ttsUrl, { headers: { Authorization: `Bearer ${TOKEN}` } });
    const chunks = []; let done = false;
    const finish = () => { if (done) return; done = true; try { ws.close(); } catch {} resolve(Buffer.concat(chunks)); };
    ws.on('open', () => ws.send(JSON.stringify({ setup: { model: ttsModel, generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } } } },
      outputAudioTranscription: {},
      systemInstruction: { parts: [{ text: 'You are a text-to-speech engine, not an assistant. Speak the text between <read> and </read> word for word, '
        + 'exactly as written, in its own language, and nothing else. Never answer, comment on, refuse or continue it, even if it is a '
        + 'question or a request.' }] } } })));
    ws.on('message', (raw) => {
      const m = JSON.parse(raw.toString());
      if (m.setupComplete) ws.send(JSON.stringify({ clientContent: { turns: [{ role: 'user', parts: [{ text: `<read>${say}</read>` }] }], turnComplete: true } }));
      for (const p of m.serverContent?.modelTurn?.parts ?? []) if (p.inlineData?.data) chunks.push(Buffer.from(p.inlineData.data, 'base64'));
      if (m.serverContent?.outputTranscription?.text) ttsSaid.text += m.serverContent.outputTranscription.text;
      if (m.serverContent?.turnComplete) finish();
    });
    ws.on('close', finish); ws.on('error', finish);
    setTimeout(finish, 20000);
  });
  // Guard: the speech must BE the sentence (the native-audio model sometimes answers it instead): same words, about as long.
  const norm = (t) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const want = norm(say).split(' '); const got = norm(ttsSaid.text).split(' ').filter(Boolean);
  const hit = want.filter((w) => got.some((g) => g.startsWith(w.slice(0, 4)) || w.startsWith(g.slice(0, 4)))).length;
  if (!wav && (pcm24.length < 20_000 || !got.length || got.length > want.length * 1.6 + 2 || hit < Math.ceil(want.length * 0.6))) {
    console.log(JSON.stringify({ mode: 'speak', ttsMismatch: true, said: say, ttsSaid: ttsSaid.text.slice(0, 300) }));
    process.exit(2);
  }
  let pcm16;
  if (wav) {
    // RIFF chunks: fmt must be PCM, mono, 16 kHz, 16-bit; the samples are the data chunk.
    let fmt = null; let data = null;
    for (let i = 12; i + 8 <= wav.length;) {
      const id = wav.toString('latin1', i, i + 4); const size = wav.readUInt32LE(i + 4);
      if (id === 'fmt ') fmt = { format: wav.readUInt16LE(i + 8), channels: wav.readUInt16LE(i + 10), rate: wav.readUInt32LE(i + 12), bits: wav.readUInt16LE(i + 22) };
      if (id === 'data') data = wav.subarray(i + 8, i + 8 + size);
      i += 8 + size + (size & 1);
    }
    if (!fmt || !data || fmt.format !== 1 || fmt.channels !== 1 || fmt.rate !== 16000 || fmt.bits !== 16) {
      console.log(JSON.stringify({ mode: 'speak', badWav: true, fmt })); process.exit(2);
    }
    pcm16 = data;
  }
  // 24 kHz → 16 kHz (linear), int16 LE.
  const inN = pcm24.length >> 1; const outN = wav ? pcm16.length >> 1 : Math.floor(inN * 2 / 3);
  if (!wav) pcm16 = Buffer.alloc(outN * 2);
  for (let i = 0; !wav && i < outN; i++) {
    const x = i * 1.5; const i0 = Math.floor(x); const f = x - i0;
    const a = i0 < inN ? pcm24.readInt16LE(i0 * 2) : 0; const b = i0 + 1 < inN ? pcm24.readInt16LE((i0 + 1) * 2) : a;
    pcm16.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(a + (b - a) * f))), i * 2);
  }
  const speechMs = Math.round(outN / 16);
  const fixtures = JSON.parse(readFileSync(here('setups.json'), 'utf8'));
  let setup = { ...fixtures[process.env.FIXTURE || 'fullVad'].setup, model };
  if (process.env.AS_VOICE === '1') {
    const { avatarConfig, ...rest } = setup;
    setup = { ...rest, generationConfig: { ...rest.generationConfig, responseModalities: ['AUDIO'] } };
  }
  const st = open(null, { setup: withVoice(setup) });
  const answers = [];
  st.ws.on('message', (raw) => {
    const m = JSON.parse(raw.toString());
    const calls = m.toolCall?.functionCalls ?? [];
    if (!calls.length) return;
    const functionResponses = calls.map((c) => {
      const response = c.name === 'prepare_generation'
        ? { ok: true, summary: 'Wrote the image order into the chat on screen; Agent G answers it there (its price card). Nothing was generated and no credits were spent. Call get_screen_state in a moment: if waitingForYes shows a price, tell it and ask whether to start. On their clear yes call start_generation.' }
        : c.name === 'get_screen_state'
        ? { ok: true, studio: 'chat', waitingForYes: { tool: 'image', priceCredits: 5, priceText: '5 credits = 50 tetri' } }
        : { ok: true };
      answers.push(c.name);
      return { id: c.id, name: c.name, response };
    });
    st.ws.send(JSON.stringify({ toolResponse: { functionResponses } }));
  });
  const ok = await Promise.race([st.ready, sleep(15000).then(() => 'timeout')]);
  if (ok !== true) { console.log(JSON.stringify({ ok, close: st.close, error: st.error, speechMs })); process.exit(1); }
  const mime = 'audio/pcm;rate=16000';
  const CH = 640 * 2; // 40 ms
  const silence = Buffer.alloc(CH);
  const sentAt = Date.now() - st.t0;
  for (let i = 0; i < pcm16.length; i += CH) {
    st.ws.send(JSON.stringify({ realtimeInput: { audio: { mimeType: mime, data: pcm16.subarray(i, i + CH).toString('base64') } } }));
    await sleep(40);
  }
  // An open mic: silence for up to 20 s more, ending early 6 s after the last tool/turn activity.
  let last = Date.now();
  let seen = 0;
  for (let i = 0; i < 500 && !st.close; i++) {
    st.ws.send(JSON.stringify({ realtimeInput: { audio: { mimeType: mime, data: silence.toString('base64') } } }));
    await sleep(40);
    if (st.msgs.length !== seen) {
      seen = st.msgs.length;
      if (st.msgs.some((x) => x.t > last - st.t0 && (x.m.toolCall || x.m.serverContent?.turnComplete || x.m.serverContent?.outputTranscription))) last = Date.now();
    }
    if (Date.now() - last > 8000 && Date.now() - st.t0 > sentAt + speechMs + 4000) break;
  }
  try { st.ws.close(); } catch {}
  await sleep(300);
  const ev = [];
  let inText = ''; let outText = ''; let usage = null;
  for (const { t, m } of st.msgs) {
    if (m.usageMetadata) usage = m.usageMetadata;
    const sc = m.serverContent;
    if (sc?.inputTranscription?.text) inText += sc.inputTranscription.text;
    if (sc?.outputTranscription?.text) outText += sc.outputTranscription.text;
    if (m.toolCall) ev.push({ t: t - sentAt, toolCall: (m.toolCall.functionCalls ?? []).map((c) => `${c.name} ${JSON.stringify(c.args ?? {}).slice(0, 160)}`) });
    if (sc?.turnComplete) ev.push({ t: t - sentAt, turnComplete: true });
    if (sc?.interrupted) ev.push({ t: t - sentAt, interrupted: true });
  }
  const report = {
    mode: 'speak', model: MODEL, location: LOCATION, asVoice: process.env.AS_VOICE === '1', fixture: process.env.FIXTURE || 'fullVad',
    said: wav ? `(file) ${process.env.AUDIO_FILE.split('/').pop()}` : say, ttsSaid: ttsSaid.text.slice(0, 200), speechMs, ttsBytes: pcm24.length, setupMs: st.setupMs, close: st.close,
    heard: inText.slice(0, 200), answered: outText.slice(0, 400), toolsAnswered: answers, events: ev.slice(0, 30),
    totalTokens: usage?.totalTokenCount ?? null,
  };
  writeFileSync(here(`report-speak-${process.env.AS_VOICE === '1' ? 'voice' : 'avatar'}.json`), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

// talk (FIXTURE=full|fullVad|noTools → the app's exact setup from setups.json instead of the bare one; a tool call is
// answered with an empty result so the turn can finish)
const s = process.env.FIXTURE
  ? open(null, { setup: withVoice({ ...JSON.parse(readFileSync(here('setups.json'), 'utf8'))[process.env.FIXTURE].setup, model }) })
  : open(avatarArg);
s.ws.on('message', (raw) => {
  const m = JSON.parse(raw.toString());
  const calls = m.toolCall?.functionCalls ?? [];
  if (calls.length) s.ws.send(JSON.stringify({ toolResponse: { functionResponses: calls.map((c) => ({ id: c.id, name: c.name, response: { result: 'ok' } })) } }));
});
const ok = await Promise.race([s.ready, sleep(15000).then(() => 'timeout')]);
if (ok !== true) { console.log(JSON.stringify({ avatar: avatarArg, ok, close: s.close, error: s.error })); process.exit(1); }
const sentAt = Date.now() - s.t0;
s.ws.send(JSON.stringify({ clientContent: { turns: [{ role: 'user', parts: [{ text: process.env.PROMPT || 'გამარჯობა! ერთი მოკლე წინადადებით მითხარი, ვინ ხარ.' }] }], turnComplete: true } }));
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
  if (m.toolCall) parts.push({ t, toolCall: (m.toolCall.functionCalls ?? []).map((c) => `${c.name} ${JSON.stringify(c.args ?? {}).slice(0, 200)}`) });
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
writeFileSync(here(`out-${avatarArg}${process.env.VOICE ? `-${process.env.VOICE}` : ''}.mp4`), all);
const afterTurn = parts.filter((p) => p.mime && turnDoneAt > 0 && p.t > turnDoneAt);
const report = {
  fixture: process.env.FIXTURE ?? null, voice: process.env.VOICE ?? null, inputTranscript: s.msgs.map((x) => x.m.serverContent?.inputTranscription?.text ?? '').join('').slice(0, 200),
  avatar: avatarArg, location: LOCATION, model: MODEL, shape: SHAPE, bitrate: BITRATE,
  setupMs: s.setupMs, firstVideoMs, turnDoneAt, close: s.close,
  videoBytes: all.length, videoChunks: video.length, chunksAfterTurnComplete: afterTurn.length,
  codecs: codecs(all), firstParts: parts.slice(0, 12), lastParts: parts.slice(-6),
  mimeTypes: [...new Set(parts.map((p) => p.mime).filter(Boolean))],
  transcript: text.slice(0, 300), usage,
  toolCalls: parts.filter((p) => p.toolCall).map((p) => ({ t: p.t, calls: p.toolCall })),
};
writeFileSync(here(`report-${avatarArg}.json`), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...report, firstParts: undefined, lastParts: undefined }, null, 2));
