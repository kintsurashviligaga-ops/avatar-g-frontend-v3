import { newRequestId, RequestIdKeeper } from './requestId';

const OK = /^[A-Za-z0-9_-]{8,100}$/; // lib/research/request.ts REQUEST_ID_RE

test('a generated key always passes the server\'s shape check', () => {
  for (let i = 0; i < 20; i++) expect(newRequestId()).toMatch(OK);
});

test('an unsettled attempt with the same request reuses its key (a double press replays, never double-charges)', () => {
  const k = new RequestIdKeeper();
  const a = k.get('q|files|120');
  k.settle(false); // network dropped: outcome unknown
  expect(k.get('q|files|120')).toBe(a);
});

test('a definite answer ends the attempt: the next press is a new key', () => {
  const k = new RequestIdKeeper();
  const a = k.get('q|files|120');
  k.settle(true);
  expect(k.get('q|files|120')).not.toBe(a);
});

test('a changed request never reuses a key', () => {
  const k = new RequestIdKeeper();
  const a = k.get('q1|files|120');
  expect(k.get('q2|files|120')).not.toBe(a);
});
