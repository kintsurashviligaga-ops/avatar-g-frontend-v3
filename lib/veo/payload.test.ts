/** @jest-environment node */
import { buildGeminiPayload, buildVertexPayload, VeoPayloadError, type VeoPayloadField } from './payload';
import type { PersonGeneration, VeoClipRequest, VeoMedia, VertexCameraControl } from './types';

/**
 * Locks the exact request JSON each Veo transport receives (docs/VEO_ENGINE.md §5 "payload.ts") and every contract
 * rule the builders enforce. The builders are pure — no fetch is involved, so nothing here can reach Google.
 */

const FIRST_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB';
const LAST_B64 = '/9j/4AAQSkZJRgABAQAAAQABAAD';
const SECRET_URL = 'https://cdn.example.com/frame.png?X-Goog-Signature=SECRET-SIGNATURE';

const bytes = (base64: string, mimeType = 'image/png'): VeoMedia => ({ kind: 'bytes', base64, mimeType });
const gcs = (uri: string, mimeType = 'image/jpeg'): VeoMedia => ({ kind: 'gcs', uri, mimeType });
const url = (u = SECRET_URL): VeoMedia => ({ kind: 'url', url: u });

const PROMPT = 'A lighthouse keeper climbs the spiral stairs at dusk. Slow dolly in. Keeper says: The lamp is lit.';

function clip(over: Partial<VeoClipRequest> = {}): VeoClipRequest {
  return {
    prompt: PROMPT,
    aspect: '16:9',
    durationSec: 8,
    resolution: '1080p',
    tier: 'standard',
    generateAudio: true,
    ...over,
  };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const v of Object.values(value)) deepFreeze(v);
    Object.freeze(value);
  }
  return value;
}

/** Runs `fn`, asserts it threw a VeoPayloadError for `field`, and returns it for message checks. */
function payloadError(fn: () => unknown, field: VeoPayloadField): VeoPayloadError {
  let caught: unknown;
  try {
    fn();
  } catch (e) {
    caught = e;
  }
  expect(caught).toBeInstanceOf(VeoPayloadError);
  const err = caught as VeoPayloadError;
  expect(err.field).toBe(field);
  return err;
}

const TRANSPORTS = [
  ['vertex', (req: VeoClipRequest) => buildVertexPayload(req, {})],
  ['gemini', (req: VeoClipRequest) => buildGeminiPayload(req)],
] as const;

describe('VeoPayloadError', () => {
  it('is an Error with a stable name, the offending field, and the field in its message', () => {
    const err = payloadError(() => buildVertexPayload(clip({ aspect: '1:1' as never })), 'aspect');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('VeoPayloadError');
    expect(err.message.startsWith('aspect: ')).toBe(true);
  });
});

describe('buildVertexPayload — full bodies', () => {
  it('text-to-video: every parameter in place, one sample, enhancePrompt off, bucket output', () => {
    const body = buildVertexPayload(
      clip({ seed: 588875549, negativePrompt: 'watermark, subtitles, extra fingers' }),
      { storageUri: 'gs://myavatar-veo/veo/sess-1/0-abc/' },
    );
    expect(body).toStrictEqual({
      instances: [{ prompt: PROMPT }],
      parameters: {
        aspectRatio: '16:9',
        durationSeconds: 8,
        resolution: '1080p',
        sampleCount: 1,
        seed: 588875549,
        negativePrompt: 'watermark, subtitles, extra fingers',
        personGeneration: 'allow_adult',
        generateAudio: true,
        enhancePrompt: false,
        storageUri: 'gs://myavatar-veo/veo/sess-1/0-abc/',
      },
    });
  });

  it('minimal text-to-video: optional keys are ABSENT, not undefined; no opts argument needed', () => {
    const body = buildVertexPayload(clip({ aspect: '9:16', durationSec: 4, resolution: '720p' }));
    expect(body).toStrictEqual({
      instances: [{ prompt: PROMPT }],
      parameters: {
        aspectRatio: '9:16',
        durationSeconds: 4,
        resolution: '720p',
        sampleCount: 1,
        personGeneration: 'allow_adult',
        generateAudio: true,
        enhancePrompt: false,
      },
    });
    const wire = JSON.stringify(body);
    for (const key of ['seed', 'negativePrompt', 'storageUri', 'image', 'lastFrame', 'referenceImages', 'cameraControl']) {
      expect(wire).not.toContain(`"${key}"`);
    }
  });

  it('image-to-video from a GCS object → image { gcsUri, mimeType }', () => {
    const body = buildVertexPayload(clip({ startImage: gcs('gs://myavatar-veo/inputs/sess-1/frame-0.jpg') }));
    expect(body.instances).toStrictEqual([
      { prompt: PROMPT, image: { gcsUri: 'gs://myavatar-veo/inputs/sess-1/frame-0.jpg', mimeType: 'image/jpeg' } },
    ]);
  });

  it('image-to-video from inline bytes → image { bytesBase64Encoded, mimeType }', () => {
    const body = buildVertexPayload(clip({ durationSec: 6, resolution: '720p', startImage: bytes(FIRST_B64) }));
    expect(body).toStrictEqual({
      instances: [{ prompt: PROMPT, image: { bytesBase64Encoded: FIRST_B64, mimeType: 'image/png' } }],
      parameters: {
        aspectRatio: '16:9',
        durationSeconds: 6,
        resolution: '720p',
        sampleCount: 1,
        personGeneration: 'allow_adult',
        generateAudio: true,
        enhancePrompt: false,
      },
    });
  });

  it('first + last frame: both images, each in its own storage shape', () => {
    const body = buildVertexPayload(
      clip({ startImage: gcs('gs://myavatar-veo/inputs/s/first.png', 'image/png'), lastFrame: bytes(LAST_B64, 'image/jpeg') }),
      { storageUri: 'gs://myavatar-veo' },
    );
    expect(body).toStrictEqual({
      instances: [{
        prompt: PROMPT,
        image: { gcsUri: 'gs://myavatar-veo/inputs/s/first.png', mimeType: 'image/png' },
        lastFrame: { bytesBase64Encoded: LAST_B64, mimeType: 'image/jpeg' },
      }],
      parameters: {
        aspectRatio: '16:9',
        durationSeconds: 8,
        resolution: '1080p',
        sampleCount: 1,
        personGeneration: 'allow_adult',
        generateAudio: true,
        enhancePrompt: false,
        storageUri: 'gs://myavatar-veo',
      },
    });
  });

  it('asset references: up to three, each { image, referenceType: "asset" }, no image/lastFrame', () => {
    const body = buildVertexPayload(clip({
      referenceImages: [
        gcs('gs://myavatar-veo/inputs/s/hero.jpg'),
        bytes(FIRST_B64),
        gcs('gs://myavatar-veo/inputs/s/prop.png', 'image/png'),
      ],
    }));
    expect(body.instances).toStrictEqual([{
      prompt: PROMPT,
      referenceImages: [
        { image: { gcsUri: 'gs://myavatar-veo/inputs/s/hero.jpg', mimeType: 'image/jpeg' }, referenceType: 'asset' },
        { image: { bytesBase64Encoded: FIRST_B64, mimeType: 'image/png' }, referenceType: 'asset' },
        { image: { gcsUri: 'gs://myavatar-veo/inputs/s/prop.png', mimeType: 'image/png' }, referenceType: 'asset' },
      ],
    }]);
  });

  it('camera control (opt-in) rides on the instance next to the first frame', () => {
    const body = buildVertexPayload(clip({ startImage: gcs('gs://b/inputs/f.jpg'), cameraControl: 'push_in' }));
    expect(body.instances).toStrictEqual([
      { prompt: PROMPT, image: { gcsUri: 'gs://b/inputs/f.jpg', mimeType: 'image/jpeg' }, cameraControl: 'push_in' },
    ]);
  });

  it('every documented cameraControl value is accepted with a first frame', () => {
    const all: VertexCameraControl[] = [
      'fixed', 'pan_left', 'pan_right', 'tilt_up', 'tilt_down',
      'truck_left', 'truck_right', 'pedestal_up', 'pedestal_down', 'push_in', 'pull_out',
    ];
    for (const cameraControl of all) {
      const body = buildVertexPayload(clip({ startImage: bytes(FIRST_B64), cameraControl }));
      expect(body.instances[0].cameraControl).toBe(cameraControl);
    }
  });

  it('video-only render and an explicit enhancePrompt reach the parameters verbatim', () => {
    const { parameters } = buildVertexPayload(clip({ generateAudio: false, enhancePrompt: true }));
    expect(parameters.generateAudio).toBe(false);
    expect(parameters.enhancePrompt).toBe(true);
  });

  it('4k on an 8 s clip is passed through', () => {
    expect(buildVertexPayload(clip({ resolution: '4k' })).parameters.resolution).toBe('4k');
  });

  it('personGeneration: the request wins, then the transport default, then allow_adult', () => {
    const def: PersonGeneration = 'dont_allow';
    expect(buildVertexPayload(clip({ personGeneration: 'allow_all' }), { personGeneration: def }).parameters.personGeneration).toBe('allow_all');
    expect(buildVertexPayload(clip(), { personGeneration: def }).parameters.personGeneration).toBe('dont_allow');
    expect(buildVertexPayload(clip(), {}).parameters.personGeneration).toBe('allow_adult');
  });

  it('trims the prompt and the negative prompt; a blank negative prompt is omitted', () => {
    const trimmed = buildVertexPayload(clip({ prompt: `  ${PROMPT}\n`, negativePrompt: '  blur, watermark  ' }));
    expect(trimmed.instances[0].prompt).toBe(PROMPT);
    expect(trimmed.parameters.negativePrompt).toBe('blur, watermark');
    expect('negativePrompt' in buildVertexPayload(clip({ negativePrompt: '   ' })).parameters).toBe(false);
  });

  it('seed boundaries: 0 is a real seed (not "unset"), uint32 max is accepted', () => {
    expect(buildVertexPayload(clip({ seed: 0 })).parameters.seed).toBe(0);
    expect(buildVertexPayload(clip({ seed: 0xffff_ffff })).parameters.seed).toBe(4294967295);
  });

  it('an empty referenceImages array means "none" — no exclusivity error, no key in the body', () => {
    const body = buildVertexPayload(clip({ durationSec: 4, resolution: '720p', startImage: bytes(FIRST_B64), referenceImages: [] }));
    expect('referenceImages' in body.instances[0]).toBe(false);
    expect(body.instances[0].image).toStrictEqual({ bytesBase64Encoded: FIRST_B64, mimeType: 'image/png' });
  });

  it('never mutates the request (a deep-frozen request builds) and the body survives a JSON round trip', () => {
    const req = deepFreeze(clip({ seed: 7, startImage: gcs('gs://b/inputs/a.jpg'), lastFrame: bytes(LAST_B64) }));
    const body = buildVertexPayload(req, { storageUri: 'gs://b/out' });
    expect(JSON.parse(JSON.stringify(body))).toStrictEqual(body);
    expect(req).toStrictEqual(clip({ seed: 7, startImage: gcs('gs://b/inputs/a.jpg'), lastFrame: bytes(LAST_B64) }));
  });
});

describe('buildGeminiPayload — full bodies (the production-proven shape)', () => {
  it('text-to-video: allow_all, no Vertex-only keys', () => {
    const body = buildGeminiPayload(clip({ seed: 588875549, negativePrompt: 'watermark, subtitles' }));
    expect(body).toStrictEqual({
      instances: [{ prompt: PROMPT }],
      parameters: {
        aspectRatio: '16:9',
        resolution: '1080p',
        durationSeconds: 8,
        personGeneration: 'allow_all',
        seed: 588875549,
        negativePrompt: 'watermark, subtitles',
      },
    });
  });

  it('minimal text-to-video: optional keys absent', () => {
    expect(buildGeminiPayload(clip({ aspect: '9:16', durationSec: 6, resolution: '720p' }))).toStrictEqual({
      instances: [{ prompt: PROMPT }],
      parameters: { aspectRatio: '9:16', resolution: '720p', durationSeconds: 6, personGeneration: 'allow_all' },
    });
  });

  it('image-to-video: image { bytesBase64Encoded, mimeType } — never inlineData / imageBytes (both 400 live)', () => {
    const body = buildGeminiPayload(clip({ startImage: bytes(FIRST_B64) }));
    expect(body.instances).toStrictEqual([{ prompt: PROMPT, image: { bytesBase64Encoded: FIRST_B64, mimeType: 'image/png' } }]);
    const wire = JSON.stringify(body);
    expect(wire).not.toContain('inlineData');
    expect(wire).not.toContain('imageBytes');
  });

  it('first + last frame use the same image shape', () => {
    expect(buildGeminiPayload(clip({ startImage: bytes(FIRST_B64), lastFrame: bytes(LAST_B64, 'image/jpeg') }))).toStrictEqual({
      instances: [{
        prompt: PROMPT,
        image: { bytesBase64Encoded: FIRST_B64, mimeType: 'image/png' },
        lastFrame: { bytesBase64Encoded: LAST_B64, mimeType: 'image/jpeg' },
      }],
      parameters: { aspectRatio: '16:9', resolution: '1080p', durationSeconds: 8, personGeneration: 'allow_all' },
    });
  });

  it('asset references use the same image shape', () => {
    const body = buildGeminiPayload(clip({ tier: 'fast', referenceImages: [bytes(FIRST_B64), bytes(LAST_B64, 'image/jpeg')] }));
    expect(body.instances).toStrictEqual([{
      prompt: PROMPT,
      referenceImages: [
        { image: { bytesBase64Encoded: FIRST_B64, mimeType: 'image/png' }, referenceType: 'asset' },
        { image: { bytesBase64Encoded: LAST_B64, mimeType: 'image/jpeg' }, referenceType: 'asset' },
      ],
    }]);
  });

  it('Vertex-only fields are never sent: cameraControl, generateAudio, enhancePrompt; personGeneration is always allow_all', () => {
    const body = buildGeminiPayload(clip({
      startImage: bytes(FIRST_B64),
      cameraControl: 'pan_left',
      generateAudio: false,
      enhancePrompt: true,
      personGeneration: 'dont_allow',
    }));
    expect(body).toStrictEqual({
      instances: [{ prompt: PROMPT, image: { bytesBase64Encoded: FIRST_B64, mimeType: 'image/png' } }],
      parameters: { aspectRatio: '16:9', resolution: '1080p', durationSeconds: 8, personGeneration: 'allow_all' },
    });
    const wire = JSON.stringify(body);
    for (const key of ['cameraControl', 'generateAudio', 'enhancePrompt', 'storageUri', 'sampleCount']) {
      expect(wire).not.toContain(`"${key}"`);
    }
  });

  it('cameraControl without a first frame is not an error on Gemini — it is simply not part of this API', () => {
    expect(() => buildGeminiPayload(clip({ cameraControl: 'fixed' }))).not.toThrow();
  });

  it('trims the prompt, drops a blank negative prompt, keeps seed 0', () => {
    const body = buildGeminiPayload(clip({ prompt: `\t${PROMPT} `, negativePrompt: ' \n ', seed: 0 }));
    expect(body.instances[0].prompt).toBe(PROMPT);
    expect('negativePrompt' in body.parameters).toBe(false);
    expect(body.parameters.seed).toBe(0);
  });

  it('never mutates the request', () => {
    const req = deepFreeze(clip({ startImage: bytes(FIRST_B64), lastFrame: bytes(LAST_B64) }));
    expect(() => buildGeminiPayload(req)).not.toThrow();
  });
});

describe.each(TRANSPORTS)('%s — shared contract violations', (_name, build) => {
  it('prompt: empty or whitespace-only', () => {
    payloadError(() => build(clip({ prompt: '' })), 'prompt');
    payloadError(() => build(clip({ prompt: '  \n\t ' })), 'prompt');
  });

  it.each(['1:1', '4:5', '4:3', '', '21:9'])('aspect %p is not a Veo aspect', (aspect) => {
    payloadError(() => build(clip({ aspect: aspect as never })), 'aspect');
  });

  it.each([0, 5, 7, 10, 8.5, Number.NaN])('durationSec %p is not in {4, 6, 8}', (durationSec) => {
    payloadError(() => build(clip({ durationSec: durationSec as never, resolution: '720p' })), 'durationSec');
  });

  it.each(['480p', '2k', '1080P', ''])('resolution %p is unknown', (resolution) => {
    payloadError(() => build(clip({ resolution: resolution as never })), 'resolution');
  });

  it.each([
    ['1080p', 4], ['1080p', 6], ['4k', 4], ['4k', 6],
  ] as const)('%s on a %i s clip — above 720p requires 8 s', (resolution, durationSec) => {
    const err = payloadError(() => build(clip({ resolution, durationSec })), 'resolution');
    expect(err.message).toContain('8 s');
  });

  it.each([-1, 1.5, 0x1_0000_0000, Number.NaN, Number.POSITIVE_INFINITY])('seed %p is not a uint32', (seed) => {
    payloadError(() => build(clip({ seed })), 'seed');
  });

  it('referenceImages: more than three', () => {
    const four = [bytes('QQ=='), bytes('Qg=='), bytes('Qw=='), bytes('RA==')];
    const err = payloadError(() => build(clip({ referenceImages: four })), 'referenceImages');
    expect(err.message).toContain('3');
  });

  it('referenceImages are exclusive with startImage', () => {
    payloadError(() => build(clip({ referenceImages: [bytes(FIRST_B64)], startImage: bytes(FIRST_B64) })), 'referenceImages');
  });

  it('referenceImages are exclusive with lastFrame (even without a startImage)', () => {
    payloadError(() => build(clip({ referenceImages: [bytes(FIRST_B64)], lastFrame: bytes(LAST_B64) })), 'referenceImages');
  });

  it('referenceImages require an 8 s clip', () => {
    payloadError(() => build(clip({ referenceImages: [bytes(FIRST_B64)], durationSec: 6, resolution: '720p' })), 'referenceImages');
  });

  it('referenceImages are not accepted by Veo 3.1 Lite', () => {
    payloadError(() => build(clip({ tier: 'lite', referenceImages: [bytes(FIRST_B64)] })), 'referenceImages');
  });

  it('lastFrame requires startImage', () => {
    payloadError(() => build(clip({ lastFrame: bytes(LAST_B64) })), 'lastFrame');
  });

  it('inline bytes must be non-empty raw base64 with a mimeType', () => {
    payloadError(() => build(clip({ startImage: bytes('') })), 'startImage');
    payloadError(() => build(clip({ startImage: bytes('   ') })), 'startImage');
    payloadError(() => build(clip({ startImage: bytes(FIRST_B64), lastFrame: bytes(LAST_B64, '') })), 'lastFrame');
    payloadError(() => build(clip({ referenceImages: [bytes(FIRST_B64, '  ')] })), 'referenceImages');
  });

  it('a data: URL in the base64 field is refused — and its payload is not echoed', () => {
    const dataUrl = `data:image/png;base64,${FIRST_B64}`;
    const err = payloadError(() => build(clip({ startImage: bytes(dataUrl) })), 'startImage');
    expect(err.message).not.toContain(FIRST_B64);
  });
});

describe('buildVertexPayload — Vertex-only violations', () => {
  it.each(['startImage', 'lastFrame', 'referenceImages'] as const)('a url input in %s is refused, and the URL is never echoed', (field) => {
    const req =
      field === 'startImage' ? clip({ startImage: url() })
        : field === 'lastFrame' ? clip({ startImage: gcs('gs://b/inputs/a.jpg'), lastFrame: url() })
          : clip({ referenceImages: [gcs('gs://b/inputs/a.jpg'), url()] });
    const err = payloadError(() => buildVertexPayload(req), field);
    expect(err.message).toContain('GCS');
    expect(err.message).not.toContain('SECRET');
    expect(err.message).not.toContain('cdn.example.com');
  });

  it.each([
    'https://storage.googleapis.com/b/inputs/a.jpg',
    'gs://',
    'gs://bucket-only',
    'gs://bucket/',
    'b/inputs/a.jpg',
    '',
  ])('a gcs input must be gs://bucket/object (%p is not)', (uri) => {
    payloadError(() => buildVertexPayload(clip({ startImage: gcs(uri) })), 'startImage');
  });

  it('a gcs input needs a mimeType too', () => {
    payloadError(() => buildVertexPayload(clip({ startImage: gcs('gs://b/inputs/a.jpg', '') })), 'startImage');
  });

  it('cameraControl requires startImage', () => {
    const err = payloadError(() => buildVertexPayload(clip({ cameraControl: 'push_in' })), 'cameraControl');
    expect(err.message).toContain('startImage');
  });

  it('cameraControl with references is refused — references exclude the first frame cameraControl needs', () => {
    payloadError(() => buildVertexPayload(clip({ cameraControl: 'fixed', referenceImages: [bytes(FIRST_B64)] })), 'cameraControl');
  });

  it('an unknown cameraControl value (e.g. the prompt-only "orbit") is refused', () => {
    payloadError(() => buildVertexPayload(clip({ startImage: bytes(FIRST_B64), cameraControl: 'orbit' as never })), 'cameraControl');
  });

  it.each(['https://storage.googleapis.com/b', 'gs://', 'bucket/prefix', '', ' gs://b'])('storageUri %p is not a gs:// location', (storageUri) => {
    payloadError(() => buildVertexPayload(clip(), { storageUri }), 'storageUri');
  });

  it('storageUri accepts a bare bucket, a prefix, and a trailing slash', () => {
    for (const storageUri of ['gs://b', 'gs://b/veo', 'gs://b/veo/s/0-x/']) {
      expect(buildVertexPayload(clip(), { storageUri }).parameters.storageUri).toBe(storageUri);
    }
  });

  it('personGeneration must be one of the three documented values (an env typo does not reach Google)', () => {
    payloadError(() => buildVertexPayload(clip(), { personGeneration: 'ALLOW_ADULT' as never }), 'personGeneration');
    payloadError(() => buildVertexPayload(clip({ personGeneration: 'everyone' as never })), 'personGeneration');
  });

  it('generateAudio must be a boolean', () => {
    payloadError(() => buildVertexPayload(clip({ generateAudio: undefined as never })), 'generateAudio');
    payloadError(() => buildVertexPayload(clip({ generateAudio: 'false' as never })), 'generateAudio');
  });

  it('an unknown media kind is refused', () => {
    payloadError(() => buildVertexPayload(clip({ startImage: { kind: 'file', path: '/tmp/x' } as never })), 'startImage');
  });
});

describe('buildGeminiPayload — Gemini-only violations', () => {
  it.each([
    ['gcs', gcs('gs://b/inputs/a.jpg')],
    ['url', url()],
  ] as const)('a %s startImage is refused — the Gemini API takes inline bytes only', (kind, media) => {
    const err = payloadError(() => buildGeminiPayload(clip({ startImage: media })), 'startImage');
    expect(err.message).toContain(kind);
    expect(err.message).not.toContain('SECRET');
    expect(err.message).not.toContain('gs://b/inputs');
  });

  it('a gcs lastFrame is refused', () => {
    payloadError(() => buildGeminiPayload(clip({ startImage: bytes(FIRST_B64), lastFrame: gcs('gs://b/inputs/z.jpg') })), 'lastFrame');
  });

  it('a url reference image is refused even when the others are bytes', () => {
    payloadError(() => buildGeminiPayload(clip({ referenceImages: [bytes(FIRST_B64), url()] })), 'referenceImages');
  });
});
