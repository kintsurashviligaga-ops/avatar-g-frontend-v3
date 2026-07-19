import { isTruthyFlag } from './flag';

describe('isTruthyFlag — tolerant boolean-env parsing', () => {
  it('accepts every common truthy spelling (the deploy footgun this fixes)', () => {
    for (const v of ['1', 'true', 'TRUE', 'True', ' true ', 'yes', 'on', 'ON']) {
      expect(isTruthyFlag(v)).toBe(true);
    }
  });

  it('treats unset / empty / explicit-false spellings as off', () => {
    for (const v of [undefined, null, '', '  ', '0', 'false', 'FALSE', 'off', 'no', 'disabled', 'nope']) {
      expect(isTruthyFlag(v)).toBe(false);
    }
  });
});
