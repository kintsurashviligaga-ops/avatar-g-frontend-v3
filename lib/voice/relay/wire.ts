/**
 * lib/voice/relay/wire.ts — the relay's own frames, shared by the relay (lib/voice/relay/session) and the browser
 * (lib/voice/geminiLive). No imports: the browser bundle must not pull the relay's Node code in.
 *
 * ⚠️ GG's iPhone, 2026-10-25/26: on half the call attempts the socket opened, the browser handed the 35 KB setup frame
 * to the network (WebSocket.bufferedAmount 0 at the deadline), and the relay received it only 1–2 ms before the
 * browser's own close, 2–3 s later — every time through iCloud Private Relay. Writing the close frame let the held
 * setup through. So the relay now says what it has seen, and the browser can write again while it waits:
 *
 *   relay → browser  {"relayHello":{"nudge":1}}  right after the upgrade: this relay drops nudges and acks the setup;
 *   relay → browser  {"relaySetupAck":{}}        the setup frame arrived and passed the ticket's lock;
 *   browser → relay  {"relayNudge":{}}           a tiny write after the setup, dropped by the relay, never forwarded.
 *
 * An older browser ignores both relay frames (unknown server frames parse to nothing); a browser sends a nudge only to
 * a relay that said hello, so an older relay never sees one (it would close on an unknown frame).
 */
export const RELAY_HELLO_FRAME = '{"relayHello":{"nudge":1}}';
export const RELAY_SETUP_ACK_FRAME = '{"relaySetupAck":{}}';
export const RELAY_NUDGE_FRAME = '{"relayNudge":{}}';

export type RelayControl = 'hello' | 'setupAck' | 'nudge';

/** The relay control frame a parsed message is, or null for any other frame (a frame with other keys is not one). */
export function relayControlOf(msg: unknown): RelayControl | null {
  if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return null;
  const keys = Object.keys(msg);
  if (keys.length !== 1) return null;
  switch (keys[0]) {
    case 'relayHello': return 'hello';
    case 'relaySetupAck': return 'setupAck';
    case 'relayNudge': return 'nudge';
    default: return null;
  }
}
