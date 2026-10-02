/** @jest-environment node */
import { deriveImageResults, latestNotice, type ImageMsgLike } from './imageResults';

const user = (text: string): ImageMsgLike => ({ role: 'user', text });
const spec = { kind: 'image', prompt: 'a red fox', aspect: '4:5', quality: 'ultra' };

describe('deriveImageResults — the Result pane reads the thread', () => {
  test('an empty or chat-only thread has no result', () => {
    expect(deriveImageResults([])).toEqual([]);
    expect(deriveImageResults([user('hi'), { role: 'assistant', text: 'hello' }])).toEqual([]);
  });

  test('a finished picture is `ready` with its own prompt, ratio and size, and can be re-rolled when it has a spec', () => {
    const [r] = deriveImageResults([user('a red fox'), { role: 'assistant', text: '', id: 'img_1', imageUrl: 'https://x/fox.png', regen: spec }]);
    expect(r).toMatchObject({ state: 'ready', key: 'img_1', index: 1, url: 'https://x/fox.png', aspect: '4:5', quality: 'ultra', prompt: 'a red fox', canReroll: true });
  });

  test('an upscaled picture has no spec: it is still a result, with the defaults, and cannot be re-rolled', () => {
    const [r] = deriveImageResults([{ role: 'assistant', text: '', imageUrl: 'https://x/hd.png' }]);
    expect(r).toMatchObject({ state: 'ready', key: 'm0', aspect: '1:1', quality: 'high', canReroll: false });
  });

  test('a job in flight is `rendering` — the prompt comes from the user bubble before it', () => {
    const [r] = deriveImageResults([user('a blue door'), { role: 'assistant', text: '', id: 'img_2', genKind: 'image', jobId: 'job9' }]);
    expect(r).toMatchObject({ state: 'rendering', key: 'img_2', jobId: 'job9', prompt: 'a blue door' });
  });

  test('a ×2/×4 batch is one result with its tiles, pending until every tile has landed or failed', () => {
    const batch = { spec: { prompt: 'cats', aspect: '16:9', quality: 'high' }, tiles: [{ status: 'done' as const, url: 'u1' }, { status: 'pending' as const }] };
    const [r] = deriveImageResults([user('cats'), { role: 'assistant', text: '', id: 'b1', genKind: 'image', batch }]);
    expect(r).toMatchObject({ state: 'batch', pending: true, aspect: '16:9', prompt: 'cats' });
    const [done] = deriveImageResults([{ role: 'assistant', text: '', id: 'b2', batch: { ...batch, tiles: [{ status: 'done', url: 'u1' }, { status: 'failed', error: 'x' }] } }]);
    expect(done).toMatchObject({ state: 'batch', pending: false });
  });

  test('a refused job is `failed`: the ⚠️ is stripped, topUp is carried (a refusal for want of credits)', () => {
    const [r] = deriveImageResults([user('p'), { role: 'assistant', text: '⚠️ Not enough credits', id: 'f1', genKind: 'image', topUp: true, regen: spec }]);
    expect(r).toMatchObject({ state: 'failed', message: 'Not enough credits', topUp: true, canReroll: true });
  });

  test('results come back oldest first, so the LAST one is the latest', () => {
    const out = deriveImageResults([
      user('one'), { role: 'assistant', text: '', id: 'a', imageUrl: 'u-a', regen: { ...spec, prompt: 'one' } },
      user('two'), { role: 'assistant', text: '', id: 'b', genKind: 'image' },
    ]);
    expect(out.map((r) => [r.key, r.state])).toEqual([['a', 'ready'], ['b', 'rendering']]);
  });

  test('a 3D reference picture, a cover and a poster are NOT image results', () => {
    expect(deriveImageResults([
      { role: 'assistant', text: 'model', glbUrl: 'x.glb', imageUrl: 'ref.png' },
      { role: 'assistant', text: '', audioUrl: 'a.mp3', imageUrl: 'cover.png' },
      { role: 'assistant', text: '', videoUrl: 'v.mp4', imageUrl: 'poster.png' },
    ])).toEqual([]);
  });
});

describe('latestNotice — a refusal that is not an image bubble', () => {
  test('a failed re-roll or upscale (a plain ⚠️ line after the latest result) is surfaced', () => {
    const msgs: ImageMsgLike[] = [
      { role: 'assistant', text: '', id: 'a', imageUrl: 'u', regen: spec },
      { role: 'assistant', text: '⚠️ Upscaling failed', topUp: false },
    ];
    expect(latestNotice(msgs, deriveImageResults(msgs))).toEqual({ text: 'Upscaling failed', topUp: false });
  });

  test('one that is OLDER than the latest result, or an image job\'s own failure, is not repeated as a notice', () => {
    const older: ImageMsgLike[] = [{ role: 'assistant', text: '⚠️ old' }, { role: 'assistant', text: '', id: 'a', imageUrl: 'u' }];
    expect(latestNotice(older, deriveImageResults(older))).toBeNull();
    const own: ImageMsgLike[] = [{ role: 'assistant', text: '⚠️ boom', genKind: 'image' }];
    expect(latestNotice(own, deriveImageResults(own))).toBeNull();
  });
});
