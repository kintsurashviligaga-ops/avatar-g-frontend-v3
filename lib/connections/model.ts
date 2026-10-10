/**
 * lib/connections/model.ts — what Settings → Connections shows for each channel, decided on the SERVER from facts.
 *
 * Pure. The route (app/api/agent-g/channels) gathers the facts; this turns them into the one word the person reads.
 * The owner's rules (Omnichannel PART A3 / B, 2026-10-10):
 *   • only four words: „Connect" (you can), „Connected" (you did, and it was proven), „Temporarily unavailable" (it
 *     cannot work here right now), and „Disconnect" (an action inside a connected channel);
 *   • never „Connected" because a key exists: WhatsApp is connected only when the person's own number sent the one-time
 *     code and the Meta-signed webhook bound it; a deployment with the keys but without the link tables is „unavailable";
 *   • Web chat and Live Voice are the app itself, not rows here;
 *   • no technical reason reaches the browser (no env names, no table names). Reasons stay in the server logs.
 */

export const CONNECTION_IDS = ['phone', 'whatsapp', 'telegram', 'notifications'] as const;
export type ConnectionId = (typeof CONNECTION_IDS)[number];

/** `signin` = a guest: the channel exists, but only an account can link it. `on` = notifications (always on for a member). */
export type ConnectionState = 'connect' | 'connected' | 'unavailable' | 'signin' | 'on';

export interface ConnectionView {
  id: ConnectionId;
  state: ConnectionState;
  /** WhatsApp: the linked number, masked (+995 5•• ••• •12). Never the full number. */
  detail?: string;
}

export interface ConnectionFacts {
  signedIn: boolean;
  /** `ready` = the platform can receive and send (keys + webhook secrets). `storage` = the link tables answer. */
  whatsapp: { ready: boolean; storage: boolean; linkedMasked: string | null };
  /** `bindingLive` = the one-time deep-link binding is built and consumed by the bot (PART F). */
  telegram: { ready: boolean; bindingLive: boolean; storage: boolean; linked: boolean };
  /** A phone provider that can really ring and answer (PART C). */
  phone: { ready: boolean };
}

function channel(ready: boolean, signedIn: boolean, linked: boolean): ConnectionState {
  if (!ready) return 'unavailable';
  if (!signedIn) return 'signin';
  return linked ? 'connected' : 'connect';
}

export function buildConnections(f: ConnectionFacts): ConnectionView[] {
  const wa = channel(f.whatsapp.ready && f.whatsapp.storage, f.signedIn, Boolean(f.whatsapp.linkedMasked));
  const tg = channel(f.telegram.ready && f.telegram.bindingLive && f.telegram.storage, f.signedIn, f.telegram.linked);
  return [
    { id: 'phone', state: channel(f.phone.ready, f.signedIn, false) },
    wa === 'connected' ? { id: 'whatsapp', state: wa, detail: f.whatsapp.linkedMasked ?? undefined } : { id: 'whatsapp', state: wa },
    { id: 'telegram', state: tg },
    { id: 'notifications', state: f.signedIn ? 'on' : 'signin' },
  ];
}
