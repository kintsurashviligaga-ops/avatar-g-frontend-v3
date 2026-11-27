/** @jest-environment node */
import { labelValue, labelsValid, safetyIdFor, vertexRequestLabels, SAFETY_SECRET_MIN_CHARS } from './safetyId';

const SECRET = 's'.repeat(SAFETY_SECRET_MIN_CHARS);
const ON = { SAFETY_LABELS: 'on', SAFETY_ID_SECRET: SECRET };
const UID = '3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90';

test('stable per user, different across users, never the raw id, and inside Google’s label rules', () => {
  const a = safetyIdFor(UID, ON)!;
  expect(a).toBe(safetyIdFor(UID, ON));
  expect(a).not.toBe(safetyIdFor('another-user', ON));
  expect(a).not.toContain(UID.slice(0, 8));
  expect(a).toMatch(/^u[0-9a-f]{40}$/);
  expect(labelsValid({ sid: a })).toBe(true);
});

test('a new secret gives new ids (rotation)', () => {
  expect(safetyIdFor(UID, ON)).not.toBe(safetyIdFor(UID, { ...ON, SAFETY_ID_SECRET: 't'.repeat(40) }));
});

test('no secret, a short secret or no user → no id at all (fail closed)', () => {
  expect(safetyIdFor(UID, {})).toBeNull();
  expect(safetyIdFor(UID, { SAFETY_ID_SECRET: 'short' })).toBeNull();
  expect(safetyIdFor('', ON)).toBeNull();
  expect(safetyIdFor(null, ON)).toBeNull();
});

test('labels: empty when the flag is off', () => {
  expect(vertexRequestLabels({ userId: UID, capability: 'chat' }, { SAFETY_ID_SECRET: SECRET })).toEqual({ labels: {} });
});

test('labels: signed in → sid + cap; anonymous → sid=anon; no secret → cap only and a problem, never the raw id', () => {
  const signed = vertexRequestLabels({ userId: UID, capability: 'Video / Omni 1.2' }, ON);
  expect(signed.labels).toEqual({ sid: safetyIdFor(UID, ON), cap: 'video_omni_1_2' });
  expect(labelsValid(signed.labels)).toBe(true);
  expect(vertexRequestLabels({ capability: 'chat' }, ON).labels).toEqual({ sid: 'anon', cap: 'chat' });
  const broken = vertexRequestLabels({ userId: UID, capability: 'chat' }, { SAFETY_LABELS: 'on' });
  expect(broken).toEqual({ labels: { cap: 'chat' }, problem: 'no_secret' });
  expect(JSON.stringify(broken)).not.toContain(UID);
});

test('label values are normalised into Google’s alphabet and length', () => {
  expect(labelValue('Music — ლირია 3')).toBe('music_3');
  expect(labelValue('x'.repeat(100))).toHaveLength(63);
  expect(labelValue('***')).toBeNull();
});
