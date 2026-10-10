/**
 * Connections model — the four words, decided from facts. „Connected" only for a proven link; a key alone is never it.
 */
import { buildConnections, type ConnectionFacts } from './model';

const facts = (over: Partial<ConnectionFacts> = {}): ConnectionFacts => ({
  signedIn: true,
  whatsapp: { ready: true, storage: true, linkedMasked: null },
  telegram: { ready: true, bindingLive: true, storage: true, linked: false },
  phone: { ready: false },
  ...over,
});
const map = (f: ConnectionFacts) => Object.fromEntries(buildConnections(f).map((c) => [c.id, c]));

test('order is phone, WhatsApp, Telegram, notifications', () => {
  expect(buildConnections(facts()).map((c) => c.id)).toEqual(['phone', 'whatsapp', 'telegram', 'notifications']);
});

test('WhatsApp: connect → connected (with the masked number) → unavailable when keys or tables are missing', () => {
  expect(map(facts()).whatsapp).toEqual({ id: 'whatsapp', state: 'connect' });
  expect(map(facts({ whatsapp: { ready: true, storage: true, linkedMasked: '+995 ••• ••456' } })).whatsapp).toEqual({ id: 'whatsapp', state: 'connected', detail: '+995 ••• ••456' });
  expect(map(facts({ whatsapp: { ready: true, storage: false, linkedMasked: null } })).whatsapp.state).toBe('unavailable');
  // keys missing but a stale link row → still unavailable, never „connected"
  expect(map(facts({ whatsapp: { ready: false, storage: true, linkedMasked: '+995 ••• ••456' } })).whatsapp).toEqual({ id: 'whatsapp', state: 'unavailable' });
});

test('Telegram is unavailable until the binding is built, whatever the keys', () => {
  expect(map(facts({ telegram: { ready: true, bindingLive: false, storage: true, linked: true } })).telegram.state).toBe('unavailable');
  expect(map(facts()).telegram.state).toBe('connect');
});

test('phone: unavailable until a provider can really ring', () => {
  expect(map(facts()).phone.state).toBe('unavailable');
  expect(map(facts({ phone: { ready: true } })).phone.state).toBe('connect');
});

test('a guest: existing channels say sign in; notifications too', () => {
  const g = map(facts({ signedIn: false }));
  expect(g.whatsapp.state).toBe('signin');
  expect(g.notifications.state).toBe('signin');
  expect(g.phone.state).toBe('unavailable');
  expect(map(facts()).notifications.state).toBe('on');
});
