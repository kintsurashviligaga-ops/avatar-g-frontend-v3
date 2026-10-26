// TEST-ONLY probe (never merged): does the Live call answer in the language the user speaks?
// Usage: node run.mjs <variant.json> [reps]   env: TOKEN (gcloud auth print-access-token), PROJECT, LOCATION
// Audio: <turn>.pcm for each name in TURNS (default en1,ru1,ru2) in this folder (16 kHz, 16-bit, mono, little-endian, no header).
import { readFileSync, appendFileSync } from 'node:fs';
import WebSocket from 'ws';

const [, , variantPath, repsArg] = process.argv;
const reps = Number(repsArg || 2);
const { TOKEN, PROJECT = 'gen-lang-client-0671348730', LOCATION = 'europe-west4' } = process.env;
const url = `wss://${LOCATION}-aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1.LlmBidiService/BidiGenerateContent`;
const msg = JSON.parse(readFileSync(variantPath, 'utf8'));
msg.setup.model = `projects/${PROJECT}/locations/${LOCATION}/publishers/google/models/gemini-live-2.5-flash-native-audio`;
const TURNS = (process.env.TURNS || 'en1,ru1,ru2').split(',');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lang = (t) => {
  const ka = (t.match(/[Ⴀ-ჿ]/g) || []).length, ru = (t.match(/[Ѐ-ӿ]/g) || []).length, en = (t.match(/[A-Za-z]/g) || []).length;
  const max = Math.max(ka, ru, en);
  return max === 0 ? '?' : max === ka ? 'ka' : max === ru ? 'ru' : 'en';
};

async function session(rep) {
  const ws = new WebSocket(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
  let turn = { in: '', out: '', done: null, firstAudioMs: -1, t0: 0 };
  let ready; const setupDone = new Promise((r) => (ready = r));
  let tokens = 0;
  ws.on('message', (raw) => {
    const m = JSON.parse(raw.toString());
    if (m.setupComplete) ready();
    const sc = m.serverContent;
    if (sc?.inputTranscription?.text) turn.in += sc.inputTranscription.text;
    if (sc?.outputTranscription?.text) turn.out += sc.outputTranscription.text;
    if (sc?.modelTurn?.parts?.some((p) => p.inlineData) && turn.firstAudioMs < 0) turn.firstAudioMs = Date.now() - turn.t0;
    if (sc?.turnComplete && turn.done) turn.done();
    if (m.usageMetadata?.totalTokenCount) tokens = m.usageMetadata.totalTokenCount;
  });
  ws.on('error', (e) => console.error('ws error', e.message));
  await new Promise((r, j) => { ws.once('open', r); ws.once('error', j); });
  ws.send(JSON.stringify(msg));
  await Promise.race([setupDone, sleep(10000).then(() => { throw new Error('no setupComplete'); })]);
  const rows = [];
  for (const name of TURNS) {
    const pcm = readFileSync(new URL(`./${name}.pcm`, import.meta.url));
    turn = { in: '', out: '', done: null, firstAudioMs: -1, t0: 0 };
    const finished = new Promise((r) => (turn.done = r));
    const CH = 3200; // 100 ms
    for (let i = 0; i < pcm.length; i += CH) {
      ws.send(JSON.stringify({ realtimeInput: { audio: { data: pcm.subarray(i, i + CH).toString('base64'), mimeType: 'audio/pcm;rate=16000' } } }));
      await sleep(100);
    }
    turn.t0 = Date.now();
    const silence = Buffer.alloc(CH);
    let stop = false; finished.then(() => (stop = true));
    (async () => { for (let k = 0; k < 300 && !stop; k++) { ws.send(JSON.stringify({ realtimeInput: { audio: { data: silence.toString('base64'), mimeType: 'audio/pcm;rate=16000' } } })); await sleep(100); } })();
    await Promise.race([finished, sleep(30000)]);
    stop = true;
    rows.push({ turn: name, heard: turn.in.trim(), replyLang: lang(turn.out), firstAudioMs: turn.firstAudioMs, reply: turn.out.trim().slice(0, 160) });
    await sleep(1500);
  }
  ws.close();
  return { rep, tokens, rows };
}

const variant = variantPath.split('/').pop().replace('.json', '');
for (let rep = 1; rep <= reps; rep++) {
  try {
    const r = await session(rep);
    const line = `${variant} rep${rep} tokens=${r.tokens} ` + r.rows.map((x) => `${x.turn}→${x.replyLang}`).join(' ');
    console.log(line);
    for (const x of r.rows) console.log('   ', JSON.stringify(x));
    appendFileSync(new URL('./results.txt', import.meta.url), line + '\n' + r.rows.map((x) => '    ' + JSON.stringify(x)).join('\n') + '\n');
  } catch (e) { console.log(`${variant} rep${rep} FAILED ${e.message}`); }
}
