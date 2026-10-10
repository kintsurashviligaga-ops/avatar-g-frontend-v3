/**
 * Local loopback: REAL WebRTC (ICE, DTLS-SRTP, RTP) and REAL Opus between two peers in this process. One plays
 * WhatsApp (offers, sends a 440 Hz "caller" tone, receives), the other is the bridge's own weriftPeer (answers like it
 * would answer Meta). Then the caller's audio goes through the bridge's 48→16 kHz path and a 24 kHz "Agent G" tone
 * through 24→48 kHz → Opus → back to the "phone". No Meta, no Google, no network beyond 127.0.0.1 / this host.
 *
 * Proves the media plumbing and measures it. It does NOT prove Meta's interoperability (their SDP, their ICE servers)
 * or real speech: that needs a real call.
 */
import { RTCPeerConnection, RTCRtpCodecParameters, RtpHeader, RtpPacket } from 'werift';
import { FRAME_48K, fromLiveOutput, rms, toLiveInput } from '@/lib/calls/bridge/pcm';
import { weriftPeer } from '../src/weriftPeer';
import { OpusCodec } from '../src/opus';

const zeroCrossHz = (x: Int16Array, rate: number) => {
  let c = 0;
  for (let i = 1; i < x.length; i += 1) if ((x[i - 1]! < 0) !== (x[i]! < 0)) c += 1;
  return Math.round((c / 2) * (rate / x.length));
};
const tone = (hz: number, rate: number, n: number, phase0: number, amp = 9000) => {
  const x = new Int16Array(n);
  for (let i = 0; i < n; i += 1) x[i] = Math.round(amp * Math.sin((2 * Math.PI * hz * (phase0 + i)) / rate));
  return x;
};
const concat = (xs: Int16Array[]) => { const n = xs.reduce((a, x) => a + x.length, 0); const o = new Int16Array(n); let k = 0; for (const x of xs) { o.set(x, k); k += x.length; } return o; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const cpu0 = process.cpuUsage();
  const t0 = Date.now();

  // ── The "phone" (WhatsApp side): offerer ──
  const phone = new RTCPeerConnection({ codecs: { audio: [new RTCRtpCodecParameters({ mimeType: 'audio/opus', clockRate: 48000, channels: 2 })] }, iceServers: [] });
  const phoneTr = phone.addTransceiver('audio', { direction: 'sendrecv' });
  const phoneCodec = new OpusCodec();
  const heardOnPhone: Int16Array[] = [];
  phoneTr.onTrack.subscribe((track) => track.onReceiveRtp.subscribe((rtp) => { const p = phoneCodec.decode(rtp.payload); if (p.length) heardOnPhone.push(p); }));
  await phone.setLocalDescription(await phone.createOffer());
  const offer = phone.localDescription!.sdp;

  // ── The bridge's peer: answerer ──
  const bridge = weriftPeer({ stunUrl: null });
  const states: string[] = [];
  const fromCaller: Array<{ pcm: Int16Array; at: number }> = [];
  bridge.onState = (s) => states.push(s);
  bridge.onAudio = (pcm, at) => fromCaller.push({ pcm, at });
  const answer = await bridge.answer(offer);
  await phone.setRemoteDescription({ type: 'answer', sdp: answer });

  for (let i = 0; i < 100 && !states.includes('connected'); i += 1) await sleep(50);
  const connectMs = Date.now() - t0;
  if (!states.includes('connected')) throw new Error(`no connection (states: ${states.join(',')})`);

  // ── 2 s of caller speech (440 Hz) phone → bridge, paced at 20 ms ──
  const steady0 = process.cpuUsage();
  let seq = 1000; let ts = 5000;
  const sentAt: number[] = [];
  for (let f = 0; f < 100; f += 1) {
    const header = new RtpHeader({ sequenceNumber: seq++ & 0xffff, timestamp: ts, marker: false });
    ts += FRAME_48K;
    sentAt.push(Date.now());
    await phoneTr.sender.sendRtp(new RtpPacket(header, phoneCodec.encode(tone(440, 48000, FRAME_48K, f * FRAME_48K))));
    await sleep(20);
  }
  await sleep(300);

  // ── 2 s of Agent G (24 kHz, 1 kHz tone) bridge → phone, through the bridge's 24→48 kHz path ──
  const up = fromLiveOutput();
  const agent48 = up.process(tone(1000, 24000, 48000, 0));
  for (let i = 0; i + FRAME_48K <= agent48.length; i += FRAME_48K) { bridge.sendFrame(agent48.slice(i, i + FRAME_48K)); await sleep(20); }
  const steadyCpu = process.cpuUsage(steady0);
  await sleep(300);

  // ── Results ──
  const caller48 = concat(fromCaller.map((x) => x.pcm));
  const caller16 = toLiveInput().process(caller48);
  const steady48 = caller48.slice(9600, caller48.length - 4800);
  const steady16 = caller16.slice(3200, caller16.length - 1600);
  const phoneHeard = concat(heardOnPhone);
  const steadyPhone = phoneHeard.slice(9600, phoneHeard.length - 4800);
  const oneWay = fromCaller.length ? fromCaller.slice(10, 90).map((x, i) => x.at - sentAt[i + 10]!).sort((a, b) => a - b) : [];
  const cpu = process.cpuUsage(cpu0);

  // Steady-state media work for ONE call-second (both directions): Opus decode + 48→16 kHz, 24→48 kHz + Opus encode.
  // 30 s of audio, after the warm-up above. SRTP and sockets are not in this number (they were in the run above).
  const benchDec = new OpusCodec();
  const benchEnc = new OpusCodec();
  const down = toLiveInput();
  const up2 = fromLiveOutput();
  const packets = Array.from({ length: 50 }, (_, f) => benchEnc.encode(tone(300, 48000, FRAME_48K, f * FRAME_48K)));
  const agentChunk = tone(500, 24000, 480, 0);
  const b0 = process.cpuUsage();
  for (let sec = 0; sec < 30; sec += 1) {
    for (let f = 0; f < 50; f += 1) {
      down.process(benchDec.decode(packets[f]!));
      benchEnc.encode(up2.process(agentChunk));
    }
  }
  const b = process.cpuUsage(b0);
  const mediaCpuMsPerCallSecond = (b.user + b.system) / 1000 / 30;
  benchDec.close();
  benchEnc.close();
  const wallS = (Date.now() - t0) / 1000;
  const audioS = 4; // 2 s each way
  const result = {
    connected: states.includes('connected'),
    connect_ms: connectMs,
    caller_frames_received: fromCaller.length,
    caller_hz_at_48k: zeroCrossHz(steady48, 48000),
    caller_hz_after_16k_path: zeroCrossHz(steady16, 16000),
    caller_level_ratio: Number((rms(steady48) / rms(tone(440, 48000, 48000, 0))).toFixed(3)),
    agent_frames_heard_on_phone: heardOnPhone.length,
    agent_hz_on_phone: zeroCrossHz(steadyPhone, 48000),
    agent_level_ratio: Number((rms(steadyPhone) / rms(tone(1000, 24000, 24000, 0))).toFixed(3)),
    one_way_ms_p50: oneWay[Math.floor(oneWay.length / 2)] ?? null,
    whole_run_cpu_ms_per_audio_second: Math.round((cpu.user + cpu.system) / 1000 / audioS),
    // Both peers live in this process (phone + bridge, SRTP both ways), so one bridge call is about half of this.
    steady_cpu_ms_per_audio_second_both_peers: Math.round((steadyCpu.user + steadyCpu.system) / 1000 / 4.6),
    media_cpu_ms_per_call_second: Number(mediaCpuMsPerCallSecond.toFixed(1)),
    calls_per_vcpu_at_60pct: Math.floor(600 / Math.max(1, mediaCpuMsPerCallSecond * 1.5)),
    wall_s: Number(wallS.toFixed(1)),
  };
  console.log(JSON.stringify(result, null, 2));
  bridge.close();
  await phone.close();
  phoneCodec.close();
  const ok = result.connected && result.caller_frames_received >= 95 && Math.abs(result.caller_hz_at_48k - 440) <= 10 && Math.abs(result.caller_hz_after_16k_path - 440) <= 10
    && result.agent_frames_heard_on_phone >= 95 && Math.abs(result.agent_hz_on_phone - 1000) <= 15;
  console.log(ok ? 'LOOPBACK PASS' : 'LOOPBACK FAIL');
  process.exit(ok ? 0 : 1);
}

main().catch((e) => { console.error('LOOPBACK ERROR', e instanceof Error ? e.message : e); process.exit(1); });
