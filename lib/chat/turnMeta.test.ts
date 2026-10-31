/**
 * A chat's turns in the account's history (./turnMeta): the owner on 2026-10-11 opened on the computer a chat run on the
 * iPhone and saw one lone question — no files, no card, no video. What a turn holds beyond its words is now saved and
 * read back, and a chat opened again takes what another device added.
 */
import {
  cardSignature, isResultTurn, mergeServerTurns, readTurnMeta, resultRowText, resultSignature, resultUrlOf, savedTurnText, turnMetaOf,
  TURN_META_MAX_CHARS, type MergeTurn,
} from './turnMeta';

const RUNNING = { phase: 'running', quote: { jobId: 'job-1', totalSec: 20 }, names: ['a.mp4', 's.mp3'], t0: 1 };
const DONE = { ...RUNNING, phase: 'done', stage: 'completed', t1: 2 };

describe('saving a turn', () => {
  test('a user turn keeps its files; a card keeps its id, its card and its result; a plain reply saves nothing extra', () => {
    expect(turnMetaOf({ files: [{ kind: 'video', name: 'a.mp4', path: 'omni-uploads/u/a.mp4' }] }))
      .toEqual({ v: 1, files: [{ kind: 'video', name: 'a.mp4', path: 'omni-uploads/u/a.mp4' }] });
    expect(turnMetaOf({ id: 'agm-1', montage: DONE, videoUrl: 'https://x.supabase.co/v.mp4', orientation: 'vertical' }))
      .toEqual({ v: 1, id: 'agm-1', montage: DONE, videoUrl: 'https://x.supabase.co/v.mp4', orientation: 'vertical' });
    expect(turnMetaOf({})).toBeNull();
  });

  test('a link that is not https is never saved; a card too big keeps its result and drops the card', () => {
    expect(turnMetaOf({ videoUrl: 'javascript:alert(1)' })).toBeNull();
    expect(turnMetaOf({ imageUrl: 'blob:https://a/b' })).toBeNull();
    const huge = { ...DONE, quote: { jobId: 'j', manifest: 'x'.repeat(TURN_META_MAX_CHARS) } };
    expect(turnMetaOf({ id: 'agm-2', montage: huge, videoUrl: 'https://x/v.mp4' })).toEqual({ v: 1, videoUrl: 'https://x/v.mp4' });
  });
});

describe('reading a turn back', () => {
  test('what was saved comes back', () => {
    const meta = turnMetaOf({ id: 'agm-1', montage: DONE, videoUrl: 'https://x/v.mp4', noRetry: true });
    expect(readTurnMeta(JSON.parse(JSON.stringify(meta)))).toEqual({ id: 'agm-1', montage: DONE, videoUrl: 'https://x/v.mp4', noRetry: true });
  });

  test('anything malformed is dropped: an unknown version, a phase that does not exist, a card without its id, a bad link', () => {
    expect(readTurnMeta({ v: 2, montage: DONE, id: 'a' })).toEqual({});
    expect(readTurnMeta(null)).toEqual({});
    expect(readTurnMeta({ v: 1, id: 'a', montage: { phase: 'exploded' } })).toEqual({});
    expect(readTurnMeta({ v: 1, montage: DONE })).toEqual({});
    expect(readTurnMeta({ v: 1, id: 'a b<script>', montage: DONE })).toEqual({});
    expect(readTurnMeta({ v: 1, videoUrl: 'data:video/mp4;base64,AAAA' })).toEqual({});
    expect(readTurnMeta({ v: 1, files: [{ kind: 'video', name: 'a.mp4', path: '../etc' }] })).toEqual({ files: [{ kind: 'video', name: 'a.mp4' }] });
  });
});

test('a card row is rewritten when its phase or its result changes, not on every percent', () => {
  const a = cardSignature({ montage: { ...RUNNING, pct: 10 }, text: 'cutting…' });
  const b = cardSignature({ montage: { ...RUNNING, pct: 90, stage: 'stitch' }, text: 'joining…' });
  expect(a).toBe(b);
  expect(cardSignature({ montage: DONE, text: 'Ready', videoUrl: 'https://x/v.mp4' })).not.toBe(a);
  expect(cardSignature({ text: 'hi' })).toBe('');
});

describe('a chat opened again', () => {
  const u = (text: string, extra: Partial<MergeTurn> = {}): MergeTurn => ({ role: 'user', text, ...extra });
  const a = (text: string, extra: Partial<MergeTurn> = {}): MergeTurn => ({ role: 'assistant', text, ...extra });

  test('the turns another device added after the last shared one come at the end; nothing here is dropped', () => {
    const local = [u('hi'), a('hello'), a('⚠️ a notice only this device has', { notice: true } as Partial<MergeTurn>)];
    const server = [u('hi'), a('hello'), u('cut these to the ad'), a('Ready: 30 s', { id: 'agm-1', montage: DONE, cloudRowId: 'r1' })];
    const out = mergeServerTurns(local, server);
    expect(out.map((m) => m.text)).toEqual(['hi', 'hello', '⚠️ a notice only this device has', 'cut these to the ad', 'Ready: 30 s']);
    expect(out[4]).toMatchObject({ id: 'agm-1', cloudRowId: 'r1' });
  });

  test('a card that ended on the other device takes its end here; one still running here is not set back', () => {
    const local = [u('cut'), a('Starting…', { id: 'agm-1', montage: RUNNING })];
    const server = [u('cut'), a('Ready', { id: 'agm-1', montage: DONE, videoUrl: 'https://x/v.mp4', cloudRowId: 'r1' })];
    const out = mergeServerTurns(local, server);
    expect(out).toHaveLength(2);
    expect(out[1]).toMatchObject({ text: 'Ready', montage: { phase: 'done' }, videoUrl: 'https://x/v.mp4', cloudRowId: 'r1' });
    const back = mergeServerTurns([u('cut'), a('Ready', { id: 'agm-1', montage: DONE })], [u('cut'), a('Starting…', { id: 'agm-1', montage: RUNNING })]);
    expect(back[1]).toMatchObject({ text: 'Ready', montage: { phase: 'done' } });
  });

  test('the same copy changes nothing; copies that share no turn keep this device\'s; an empty one fills from the saved', () => {
    const local = [u('hi'), a('hello')];
    expect(mergeServerTurns(local, [u('hi'), a('hello')])).toBe(local);
    expect(mergeServerTurns(local, [u('other'), a('thread')])).toBe(local);
    expect(mergeServerTurns([], [u('hi'), a('hello')])).toEqual([u('hi'), a('hello')]);
  });

  test('a reply saved in other words than its bubble is not taken for a new one; a reply this device never got comes in', () => {
    const local = [u('hi'), a('hello! {"service":"image"}')];
    expect(mergeServerTurns(local, [u('hi'), a('hello!')])).toBe(local);
    expect(mergeServerTurns([u('hi')], [u('hi'), a('hello')])).toEqual([u('hi'), a('hello')]);
    const later = mergeServerTurns(local, [u('hi'), a('hello!'), u('and now?'), a('now this')]);
    expect(later.map((m) => m.text)).toEqual(['hi', 'hello! {"service":"image"}', 'and now?', 'now this']);
  });
});

describe('a delivered result in the history (GG 2026-10-26 20:14Z: a chat opened again showed no videos)', () => {
  const CLIP = 'https://x.supabase.co/storage/v1/object/sign/renders/video-clip/1/omni.mp4?token=a';
  const JOB = 'interactions/abc-1::9:16::1761500000000::o8~gj1.eyJ1IjoiMSJ9.mac_-';

  test('a wordless clip is a result; a card, a user turn, a plain reply or a link that is not https is not', () => {
    expect(isResultTurn({ role: 'assistant', videoUrl: CLIP })).toBe(true);
    expect(isResultTurn({ role: 'assistant', audioUrl: 'https://x/a.mp3', coverUrl: 'https://x/c.jpg' })).toBe(true);
    expect(isResultTurn({ role: 'assistant', id: 'agm-1', montage: DONE, videoUrl: CLIP })).toBe(false);
    expect(isResultTurn({ role: 'user', videoUrl: CLIP })).toBe(false);
    expect(isResultTurn({ role: 'assistant' })).toBe(false);
    expect(isResultTurn({ role: 'assistant', imageUrl: 'data:image/png;base64,AA' })).toBe(false);
    expect(resultUrlOf({ coverUrl: 'https://x/c.jpg' })).toBeNull();
  });

  test('its row has words (its own, or a mark a voice call can read), and reads back as the same wordless bubble', () => {
    expect(resultRowText({ text: '', videoUrl: CLIP })).toBe('[video]');
    expect(resultRowText({ text: '', imageUrl: 'https://x/i.png' })).toBe('[image]');
    expect(resultRowText({ text: '', audioUrl: 'https://x/a.mp3' })).toBe('[audio]');
    expect(resultRowText({ text: 'Your 3D model', glbUrl: 'https://x/m.glb' })).toBe('Your 3D model');
    const meta = readTurnMeta(JSON.parse(JSON.stringify(turnMetaOf({ videoUrl: CLIP, orientation: 'vertical', omniJob: JOB }))));
    expect(meta).toEqual({ videoUrl: CLIP, orientation: 'vertical', omniJob: JOB });
    expect(savedTurnText('[video]', meta)).toBe('');
    expect(savedTurnText('Your 3D model', { glbUrl: 'https://x/m.glb' })).toBe('Your 3D model');
    // A card saved without words reads back without the mark too; a plain reply keeps every word.
    expect(savedTurnText('…', { id: 'agm-1', montage: DONE })).toBe('');
    expect(savedTurnText('[video]', {})).toBe('[video]');
    expect(savedTurnText('…', {})).toBe('…');
  });

  test('a PDF Agent G wrote is a result too: its link, name and facts survive a reopen', () => {
    const PDF = 'https://x.supabase.co/storage/v1/object/sign/renders/documents/u1/2026-10-30-a.pdf?token=t';
    const m = { role: 'assistant' as const, text: '', docUrl: PDF, docName: 'ანგარიში.pdf', docInfo: '5 გვერდი · 120 KB' };
    expect(isResultTurn(m)).toBe(true);
    expect(resultRowText(m)).toBe('[PDF]');
    const back = readTurnMeta(JSON.parse(JSON.stringify(turnMetaOf(m))));
    expect(back).toEqual({ docUrl: PDF, docName: 'ანგარიში.pdf', docInfo: '5 გვერდი · 120 KB' });
    expect(savedTurnText('[PDF]', back)).toBe('');
    // A blob: copy (Storage refused the file) lives on this device only and is never saved as a result.
    expect(isResultTurn({ role: 'assistant', docUrl: 'blob:https://myavatar.ge/1' })).toBe(false);
  });

  test('an Omni clip keeps its job id, so „გააგრძელე" in the chat opened again continues it; a malformed one is dropped', () => {
    expect(turnMetaOf({ videoUrl: CLIP, omniJob: JOB })).toMatchObject({ omniJob: JOB });
    expect(readTurnMeta({ v: 1, videoUrl: CLIP, omniJob: 'a b' })).toEqual({ videoUrl: CLIP });
    expect(readTurnMeta({ v: 1, videoUrl: CLIP, omniJob: '"><script>' })).toEqual({ videoUrl: CLIP });
    expect(readTurnMeta({ v: 1, videoUrl: CLIP, omniJob: 'x'.repeat(4_001) })).toEqual({ videoUrl: CLIP });
  });

  test('its row is rewritten when it changes (a cover, a film scene shot again), not when nothing it holds did', () => {
    const a = resultSignature({ text: '', audioUrl: 'https://x/a.mp3' });
    expect(resultSignature({ text: '', audioUrl: 'https://x/a.mp3', cloudRowId: 'r1' } as never)).toBe(a);
    expect(resultSignature({ text: '', audioUrl: 'https://x/a.mp3', coverUrl: 'https://x/c.jpg' })).not.toBe(a);
    expect(resultSignature({ text: '', videoUrl: CLIP })).not.toBe(resultSignature({ text: '', videoUrl: `${CLIP}2` }));
  });

  const u = (text: string): MergeTurn => ({ role: 'user', text });
  const clip = (url: string, extra: Partial<MergeTurn> = {}): MergeTurn => ({ role: 'assistant', text: '', videoUrl: url, ...extra });

  test('a clip the other device made comes in, though this device already shows a wordless clip of its own', () => {
    // Made here: the first clip. Then on the phone: „გააგრძელე" and its clip. Both clips have no words.
    const local = [u('a boy on a horse'), clip('https://x/1.mp4')];
    const server = [u('a boy on a horse'), clip('https://x/1.mp4', { cloudRowId: 'r1' }), u('გააგრძელე'), clip('https://x/2.mp4', { cloudRowId: 'r2', omniJob: JOB })];
    const out = mergeServerTurns(local, server);
    expect(out.map((m) => m.videoUrl ?? m.text)).toEqual(['a boy on a horse', 'https://x/1.mp4', 'გააგრძელე', 'https://x/2.mp4']);
    // The clip both copies show takes its saved row; the new one comes with its row and its job id.
    expect(out[1]).toMatchObject({ cloudRowId: 'r1' });
    expect(out[3]).toMatchObject({ cloudRowId: 'r2', omniJob: JOB });
  });

  test('the same clips change nothing; a chat this device never had fills from the saved copy, clips and all', () => {
    const local = [u('a boy on a horse'), clip('https://x/1.mp4', { cloudRowId: 'r1' })];
    expect(mergeServerTurns(local, [u('a boy on a horse'), clip('https://x/1.mp4', { cloudRowId: 'r1' })])).toBe(local);
    expect(mergeServerTurns([], [u('a boy on a horse'), clip('https://x/1.mp4', { cloudRowId: 'r1' })])).toHaveLength(2);
  });
});
