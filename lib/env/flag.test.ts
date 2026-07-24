import { isTruthyFlag, isEnabledByDefault } from './flag';

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

describe('isEnabledByDefault — opt-OUT flag (ON unless explicitly falsy)', () => {
  it('is ON when unset / empty / any non-falsy value', () => {
    for (const v of [undefined, null, '', '  ', '1', 'true', 'yes', 'on', 'anything']) {
      expect(isEnabledByDefault(v)).toBe(true);
    }
  });

  it('is OFF only for the explicit kill-switch spellings', () => {
    for (const v of ['0', 'false', 'FALSE', ' off ', 'no', 'No', 'OFF']) {
      expect(isEnabledByDefault(v)).toBe(false);
    }
  });
});
