/**
 * The WhatsApp side of a call: WebRTC (ICE, DTLS-SRTP, RTP/Opus) in pure TypeScript (werift), PCM in and out.
 *
 * Meta's `connect` webhook carries an SDP OFFER; we are the answerer. Our answer carries every ICE candidate (no
 * trickle: the answer goes to Meta once, inside pre_accept/accept). On a cloud VM the public address is reached through
 * 1:1 NAT, so it is added as a host candidate (PUBLIC_IP) and STUN finds it too; the UDP port range must be open.
 */
import { RTCPeerConnection, RTCRtpCodecParameters, RtpHeader, RtpPacket, type RTCRtpTransceiver } from 'werift';
import type { MediaPeer, PeerState } from '@/lib/calls/bridge/callBridge';
import { FRAME_48K } from '@/lib/calls/bridge/pcm';
import { OpusCodec } from './opus';

export interface WeriftPeerOptions {
  publicIp?: string;
  portRange?: [number, number];
  stunUrl?: string | null;
}

const rand = (bits: 16 | 32) => Math.floor(Math.random() * 2 ** bits) >>> 0;

export function weriftPeer(opts: WeriftPeerOptions = {}): MediaPeer {
  const pc = new RTCPeerConnection({
    codecs: { audio: [new RTCRtpCodecParameters({ mimeType: 'audio/opus', clockRate: 48000, channels: 2 })] },
    iceServers: opts.stunUrl === null ? [] : [{ urls: opts.stunUrl ?? 'stun:stun.l.google.com:19302' }],
    ...(opts.publicIp ? { iceAdditionalHostAddresses: [opts.publicIp] } : {}),
    ...(opts.portRange ? { icePortRange: opts.portRange } : {}),
  });
  const codec = new OpusCodec();
  let tr: RTCRtpTransceiver | null = null;
  let seq = rand(16) & 0xffff;
  let ts = rand(32);
  let closed = false;

  const peer: MediaPeer = {
    onAudio: null,
    onState: null,
    async answer(sdpOffer: string): Promise<string> {
      await pc.setRemoteDescription({ type: 'offer', sdp: sdpOffer });
      tr = pc.getTransceivers().find((t) => t.kind === 'audio') ?? null;
      if (!tr) throw new Error('offer has no audio');
      tr.setDirection('sendrecv');
      await pc.setLocalDescription(await pc.createAnswer());
      const sdp = pc.localDescription?.sdp;
      if (!sdp || !/a=candidate:/.test(sdp)) throw new Error('no ICE candidates gathered');
      return sdp;
    },
    sendFrame(pcm48: Int16Array): void {
      if (!tr || closed || pcm48.length !== FRAME_48K) return;
      const header = new RtpHeader({ sequenceNumber: seq, timestamp: ts, marker: false });
      seq = (seq + 1) & 0xffff;
      ts = (ts + FRAME_48K) >>> 0;
      void tr.sender.sendRtp(new RtpPacket(header, codec.encode(pcm48))).catch(() => undefined);
    },
    close(): void {
      if (closed) return;
      closed = true;
      void pc.close().catch(() => undefined);
      codec.close();
    },
  };

  // Subscribed before the offer is applied: werift raises the remote track while applying an offer that names its SSRC.
  pc.onTrack.subscribe((track) => {
    if (track.kind !== 'audio') return;
    track.onReceiveRtp.subscribe((rtp) => {
      const at = Date.now();
      const pcm = codec.decode(rtp.payload);
      if (pcm.length) peer.onAudio?.(pcm, at);
    });
  });

  pc.connectionStateChange.subscribe((s) => {
    const map: Partial<Record<typeof s, PeerState>> = { connected: 'connected', disconnected: 'disconnected', failed: 'failed', closed: 'closed' };
    const st = map[s];
    if (st) peer.onState?.(st);
  });
  return peer;
}
