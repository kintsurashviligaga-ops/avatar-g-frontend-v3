/**
 * lib/connections/model.ts — what Settings → Connections shows for each channel, decided on the SERVER from facts.
 */

export const CONNECTION_IDS = ['phone', 'whatsapp', 'telegram', 'notifications'] as const;
export type ConnectionId = (typeof CONNECTION_IDS)[number];
export type ConnectionState = 'connect' | 'connected' | 'unavailable' | 'signin' | 'on';

export interface ConnectionView {
  id: ConnectionId;
  state: ConnectionState;
  detail?: string;
}

export interface ConnectionFacts {
  signedIn: boolean;
  whatsapp: { ready: boolean; storage: boolean; linkedMasked: string | null };
  telegram: { ready: boolean; bindingLive: boolean; storage: boolean; linked: boolean };
  phone: { ready: boolean; linkedMasked?: string | null; enabled?: boolean };
}

function channel(ready: boolean, signedIn: boolean, linked: boolean): ConnectionState {
  if (!ready) return 'unavailable';
  if (!signedIn) return 'signin';
  return linked ? 'connected' : 'connect';
}

export function buildConnections(f: ConnectionFacts): ConnectionView[] {
  const wa = channel(f.whatsapp.ready && f.whatsapp.storage, f.signedIn, Boolean(f.whatsapp.linkedMasked));
  const tg = channel(f.telegram.ready && f.telegram.bindingLive && f.telegram.storage, f.signedIn, f.telegram.linked);
  const phone = channel(f.phone.ready, f.signedIn, Boolean(f.phone.linkedMasked && f.phone.enabled));
  return [
    phone === 'connected'
      ? { id: 'phone', state: phone, detail: f.phone.linkedMasked ?? undefined }
      : { id: 'phone', state: phone, detail: f.phone.linkedMasked ?? undefined },
    wa === 'connected' ? { id: 'whatsapp', state: wa, detail: f.whatsapp.linkedMasked ?? undefined } : { id: 'whatsapp', state: wa },
    { id: 'telegram', state: tg },
    { id: 'notifications', state: f.signedIn ? 'on' : 'signin' },
  ];
}
