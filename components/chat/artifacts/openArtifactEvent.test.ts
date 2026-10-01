/**
 * The `myavatar:open-artifact` contract: the detail is untrusted (a Live tool's arguments are model output), so it is
 * re-validated and bounded before anything opens, and a malformed one never throws back into the producer.
 */
import { MAX_ARTIFACT_CODE_BYTES } from './artifactSpec';
import { OPEN_ARTIFACT_EVENT, dispatchOpenArtifact, validateOpenArtifactDetail } from './openArtifactEvent';

describe('validateOpenArtifactDetail', () => {
  it('the event name is the published contract', () => {
    expect(OPEN_ARTIFACT_EVENT).toBe('myavatar:open-artifact');
  });

  it('accepts {title?, language, code} and normalizes the language', () => {
    expect(validateOpenArtifactDetail({ title: 'Clock', language: 'HTML', code: '<p>12:00</p>' })).toEqual({
      id: 'html:clock',
      title: 'Clock',
      language: 'html',
      code: '<p>12:00</p>',
    });
    expect(validateOpenArtifactDetail({ language: 'js', code: 'alert(1)' })?.language).toBe('javascript');
  });

  it('rejects non-objects, a language off the allowlist, a missing or blank code', () => {
    for (const bad of [null, undefined, 'html', 42, ['html', 'x'], () => 0]) expect(validateOpenArtifactDetail(bad)).toBeNull();
    expect(validateOpenArtifactDetail({ language: 'exe', code: 'MZ' })).toBeNull();
    expect(validateOpenArtifactDetail({ language: 'html' })).toBeNull();
    expect(validateOpenArtifactDetail({ language: 'html', code: '' })).toBeNull();
    expect(validateOpenArtifactDetail({ language: 'html', code: { toString: () => '<p>x</p>' } })).toBeNull();
  });

  it('bounds the code at 200 KB (UTF-8) and the title at one 120-character line', () => {
    expect(validateOpenArtifactDetail({ language: 'text', code: 'x'.repeat(MAX_ARTIFACT_CODE_BYTES + 1) })).toBeNull();
    expect(validateOpenArtifactDetail({ language: 'text', code: 'ქ'.repeat(70_000) })).toBeNull();
    const long = validateOpenArtifactDetail({ title: `a\nb${'c'.repeat(500)}`, language: 'text', code: 'ok' });
    expect(long?.title.startsWith('a b')).toBe(true);
    expect(long?.title.length).toBe(120);
  });

  it('a non-string title falls back to the derived one', () => {
    expect(validateOpenArtifactDetail({ title: 7, language: 'python', code: 'pass' })?.title).toBe('Python');
  });

  it('never throws: a throwing getter or a revoked proxy is just invalid', () => {
    const hostile = {
      language: 'html',
      get code(): string {
        throw new Error('boom');
      },
    };
    expect(validateOpenArtifactDetail(hostile)).toBeNull();
    const { proxy, revoke } = Proxy.revocable({ language: 'html', code: '<p/>' }, {});
    revoke();
    expect(validateOpenArtifactDetail(proxy)).toBeNull();
  });

  it('reads each field once, so a getter cannot pass the check with one value and deliver another', () => {
    let reads = 0;
    const flip = {
      language: 'text',
      get code(): string {
        reads += 1;
        return reads === 1 ? 'small' : 'x'.repeat(MAX_ARTIFACT_CODE_BYTES * 2);
      },
    };
    expect(validateOpenArtifactDetail(flip)?.code).toBe('small');
    expect(reads).toBe(1);
  });
});

describe('dispatchOpenArtifact', () => {
  it('dispatches the event for a valid detail and refuses an invalid one without dispatching', () => {
    const seen: unknown[] = [];
    const onEvent = (e: Event) => seen.push((e as CustomEvent).detail);
    window.addEventListener(OPEN_ARTIFACT_EVENT, onEvent);
    try {
      expect(dispatchOpenArtifact({ language: 'svg', code: '<svg/>' })).toBe(true);
      expect(dispatchOpenArtifact({ language: 'exe', code: 'MZ' })).toBe(false);
    } finally {
      window.removeEventListener(OPEN_ARTIFACT_EVENT, onEvent);
    }
    expect(seen).toEqual([{ language: 'svg', code: '<svg/>' }]);
  });
});
