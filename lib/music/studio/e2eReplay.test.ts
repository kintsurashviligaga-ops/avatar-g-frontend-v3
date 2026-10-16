/** @jest-environment node */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { LYRIA_REPLAY_FILE, LYRIA_REPLAY_SHA256 } from './e2eProvider';

jest.mock('server-only', () => ({}));

test('the committed live Lyria capture is byte-identical to what the Preview build received from Vertex', () => {
  const bytes = readFileSync(LYRIA_REPLAY_FILE);
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(LYRIA_REPLAY_SHA256);
  expect(bytes.byteLength).toBe(746248);
});
