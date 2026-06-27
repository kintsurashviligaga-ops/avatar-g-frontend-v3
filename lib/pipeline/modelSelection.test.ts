import { selectClipVideoModel } from './modelSelection';

describe('selectClipVideoModel — preview-tier gate', () => {
  test('signed-in user keeps their premium Kling/Hailuo pick', () => {
    expect(selectClipVideoModel({ requested: 'kling', isSignedIn: true })).toBe('kling');
    expect(selectClipVideoModel({ requested: 'hailuo', isSignedIn: true })).toBe('hailuo');
  });

  test('anonymous render is forced to the cheap LTX default (undefined)', () => {
    expect(selectClipVideoModel({ requested: 'kling', isSignedIn: false })).toBeUndefined();
    expect(selectClipVideoModel({ requested: 'hailuo', isSignedIn: false })).toBeUndefined();
  });

  test('explicit preview quality drops the premium model even for a signed-in user', () => {
    expect(selectClipVideoModel({ requested: 'kling', isSignedIn: true, preview: true })).toBeUndefined();
  });

  test('a non-premium / absent request is always undefined (LTX default)', () => {
    expect(selectClipVideoModel({ requested: null, isSignedIn: true })).toBeUndefined();
    expect(selectClipVideoModel({ requested: 'ltx', isSignedIn: true })).toBeUndefined();
    expect(selectClipVideoModel({ requested: undefined, isSignedIn: false })).toBeUndefined();
  });
});
