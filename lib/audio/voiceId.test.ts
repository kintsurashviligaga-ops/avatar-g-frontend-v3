import { isElevenLabsVoiceId, requestedVoiceId } from './voiceId';

describe('isElevenLabsVoiceId', () => {
  test.each(['21m00Tcm4TlvDq8ikWAM', '9jZPhI8VfIo3Mx8pl6OF', 'a', 'A'.repeat(64)])('accepts %s', (id) => {
    expect(isElevenLabsVoiceId(id)).toBe(true);
  });

  test.each([
    '',
    'A'.repeat(65),
    '../voices/abc/settings/edit',
    'abc?x=1',
    'abc#frag',
    'abc/stream',
    'abc%2F..',
    ' abc',
    'abc ',
    'voice-ka-test',
    'ab.cd',
    'აბგ',
  ])('refuses %p', (id) => {
    expect(isElevenLabsVoiceId(id)).toBe(false);
  });

  test.each([undefined, null, 42, {}, ['abc']])('refuses a non-string (%p)', (v) => {
    expect(isElevenLabsVoiceId(v)).toBe(false);
  });
});

describe('requestedVoiceId', () => {
  test('no voice named: absent, null or blank → undefined (the route picks its default)', () => {
    expect(requestedVoiceId(undefined)).toBeUndefined();
    expect(requestedVoiceId(null)).toBeUndefined();
    expect(requestedVoiceId('')).toBeUndefined();
    expect(requestedVoiceId('   ')).toBeUndefined();
  });

  test('a well-formed id comes back trimmed', () => {
    expect(requestedVoiceId(' 21m00Tcm4TlvDq8ikWAM ')).toBe('21m00Tcm4TlvDq8ikWAM');
  });

  test('anything else → null (the route answers 400)', () => {
    expect(requestedVoiceId('../user')).toBeNull();
    expect(requestedVoiceId('abc?x=1')).toBeNull();
    expect(requestedVoiceId(123)).toBeNull();
    expect(requestedVoiceId({ id: 'abc' })).toBeNull();
  });
});
