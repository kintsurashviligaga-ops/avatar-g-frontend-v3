import { agentRedo, attachmentKind, cardRetry } from './redoChat';

const clip = (n: number) => ({ mimeType: 'video/mp4', dataUrl: `blob:clip-${n}`, name: `clip-${n}.mp4` });
const track = { mimeType: 'audio/mpeg', dataUrl: 'blob:track', name: 'track-120bpm.mp3' };
const OPEN = { montage: true, audio: true };
const MONTAGE_TEXT = 'ეს კლიპები მუსიკის რიტმზე დაამონტაჟე';
const LINK = 'https://raw.githubusercontent.com/mdn/shared-assets/main/videos/flower.mp4';
const user = (text: string, medias?: Array<{ mimeType: string; dataUrl: string; name: string }>) => ({ role: 'user', text, ...(medias ? { medias } : {}) });

describe('agentRedo: ↻ under an Agent G reply asks Agent G again, never the chat model', () => {
  test('a plain chat reply keeps the usual regenerate', () => {
    expect(agentRedo({}, user('hello'), OPEN)).toEqual({ kind: 'chat' });
  });

  // The Preview run of 2026-10-09: Stop on a running montage, then ↻ — the chat model got the clips and answered with advice.
  test.each(['cancelled', 'done', 'failed', 'dismissed'] as const)('a %s montage is asked again with the same clips and track', (phase) => {
    const files = [clip(1), clip(2), clip(3), track];
    expect(agentRedo({ montage: { phase } }, user(MONTAGE_TEXT, files), OPEN)).toEqual({ kind: 'montage', text: MONTAGE_TEXT, files });
  });

  test.each(['reading', 'quoted', 'running'] as const)('an open montage card (%s) has no ↻: its own buttons are the way', (phase) => {
    expect(agentRedo({ montage: { phase } }, user(MONTAGE_TEXT, [clip(1), clip(2), track]), OPEN)).toEqual({ kind: 'none' });
  });

  test('no ↻ when the files are gone (a reloaded thread keeps no bytes) or the route is closed', () => {
    expect(agentRedo({ montage: { phase: 'cancelled' } }, user(MONTAGE_TEXT), OPEN)).toEqual({ kind: 'none' });
    expect(agentRedo({ montage: { phase: 'cancelled' } }, user(MONTAGE_TEXT, [clip(1), clip(2), track]), { montage: false, audio: true })).toEqual({ kind: 'none' });
    expect(agentRedo({ montage: { phase: 'cancelled' } }, undefined, OPEN)).toEqual({ kind: 'none' });
    expect(agentRedo({ montage: { phase: 'cancelled' } }, { role: 'assistant', text: MONTAGE_TEXT, medias: [clip(1), track] }, OPEN)).toEqual({ kind: 'none' });
  });

  // Agent G PART 1: „მუსიკა 5 წამიდან დაიწყე" under a waiting plan re-quotes it from the card's words plus the change; the
  // turn above the new card holds only the change. ↻ must ask with what the card was planned from, not with „5 წამიდან".
  test('a plan changed in the chat is asked again with the card\'s own words', () => {
    const files = [clip(1), clip(2), track];
    const merged = `${MONTAGE_TEXT}\nმუსიკა 5 წამიდან დაიწყე`;
    expect(agentRedo({ montage: { phase: 'cancelled', prompt: merged } }, user('მუსიკა 5 წამიდან დაიწყე', files), OPEN))
      .toEqual({ kind: 'montage', text: merged, files });
    expect(agentRedo({ montage: { phase: 'done', prompt: '  ' } }, user(MONTAGE_TEXT, files), OPEN))
      .toEqual({ kind: 'montage', text: MONTAGE_TEXT, files });
  });

  test('an MP3 from a link is asked again from the same link', () => {
    const text = `${LINK} ამ ვიდეოდან MP3 ამოიღე`;
    expect(agentRedo({ audioJob: { phase: 'cancelled' } }, user(text), OPEN)).toEqual({ kind: 'audio', text, ask: { source: 'link', url: LINK } });
  });

  test('an MP3 from a file is asked again with the same file', () => {
    const file = clip(1);
    expect(agentRedo({ audioJob: { phase: 'done' } }, user('ამ ფაილიდან MP3 ამოიღე', [file]), OPEN))
      .toEqual({ kind: 'audio', text: 'ამ ფაილიდან MP3 ამოიღე', ask: { source: 'file' }, file });
  });

  test('an MP3 card has no ↻ while open, without its file, or with the route closed', () => {
    const text = `${LINK} ამ ვიდეოდან MP3 ამოიღე`;
    expect(agentRedo({ audioJob: { phase: 'checking' } }, user(text), OPEN)).toEqual({ kind: 'none' });
    expect(agentRedo({ audioJob: { phase: 'running' } }, user(text), OPEN)).toEqual({ kind: 'none' });
    expect(agentRedo({ audioJob: { phase: 'failed' } }, user('ამ ფაილიდან MP3 ამოიღე'), OPEN)).toEqual({ kind: 'none' });
    expect(agentRedo({ audioJob: { phase: 'failed' } }, user(text), { montage: true, audio: false })).toEqual({ kind: 'none' });
  });
});

describe('the edit card is asked again with its own edits, never handed to the chat model', () => {
  const OPEN_E = { montage: true, audio: true, edit: true };
  const noir = [{ op: 'grade' as const, style: 'noir' as const }];
  test('an edit of an attached video: the same edits of the same file', () => {
    const file = clip(1);
    expect(agentRedo({ editJob: { phase: 'failed', source: 'file', ask: { edits: noir } } }, user('make it black and white', [file]), OPEN_E))
      .toEqual({ kind: 'edit', source: 'file', edits: noir, file });
  });
  test('an edit of Agent G\'s own last video: the same edits of the same link', () => {
    expect(agentRedo({ editJob: { phase: 'cancelled', source: 'previous', ask: { edits: noir, url: 'https://x/m.mp4' } } }, user('make it black and white'), OPEN_E))
      .toEqual({ kind: 'edit', source: 'previous', edits: noir, url: 'https://x/m.mp4' });
  });
  test('none without the edits, the file, the link, or with the route closed; none while open', () => {
    expect(agentRedo({ editJob: { phase: 'failed', source: 'file' } }, user('x', [clip(1)]), OPEN_E)).toEqual({ kind: 'none' });
    expect(agentRedo({ editJob: { phase: 'failed', source: 'file', ask: { edits: noir } } }, user('x'), OPEN_E)).toEqual({ kind: 'none' });
    expect(agentRedo({ editJob: { phase: 'failed', source: 'previous', ask: { edits: noir } } }, user('x'), OPEN_E)).toEqual({ kind: 'none' });
    expect(agentRedo({ editJob: { phase: 'failed', source: 'file', ask: { edits: noir } } }, user('x', [clip(1)]), OPEN)).toEqual({ kind: 'none' });
    expect(agentRedo({ editJob: { phase: 'running', source: 'file', ask: { edits: noir } } }, user('x', [clip(1)]), OPEN_E)).toEqual({ kind: 'none' });
  });
});

describe('cardRetry: the card\'s own Retry', () => {
  const files = [clip(1), clip(2), track];
  test('a stopped card, or one that failed while it ran (it had a plan), is asked again', () => {
    expect(cardRetry({ montage: { phase: 'cancelled' } }, user(MONTAGE_TEXT, files), OPEN)).toEqual({ kind: 'montage', text: MONTAGE_TEXT, files });
    expect(cardRetry({ montage: { phase: 'failed', quote: { jobId: 'j' } } }, user(MONTAGE_TEXT, files), OPEN)).toEqual({ kind: 'montage', text: MONTAGE_TEXT, files });
  });
  test('refused before a plan, finished, dropped, still open, or not an Agent G card: no Retry', () => {
    expect(cardRetry({ montage: { phase: 'failed' } }, user(MONTAGE_TEXT, files), OPEN)).toEqual({ kind: 'none' });
    expect(cardRetry({ montage: { phase: 'done', quote: {} } }, user(MONTAGE_TEXT, files), OPEN)).toEqual({ kind: 'none' });
    expect(cardRetry({ montage: { phase: 'dismissed', quote: {} } }, user(MONTAGE_TEXT, files), OPEN)).toEqual({ kind: 'none' });
    expect(cardRetry({ montage: { phase: 'running', quote: {} } }, user(MONTAGE_TEXT, files), OPEN)).toEqual({ kind: 'none' });
    expect(cardRetry({}, user('hello'), OPEN)).toEqual({ kind: 'none' });
  });
});

test('attachmentKind reads the MIME family', () => {
  expect(['video/mp4', 'audio/mpeg', 'image/png', 'application/pdf'].map(attachmentKind)).toEqual(['video', 'audio', 'image', 'other']);
});

describe('↻ under a run card or an analysis', () => {
  test('a run is carried on by its own Retry and „continue", never by ↻; an analysis is asked again once it has ended', () => {
    const turn = { role: 'user', text: 'Use the audio from the first video and cut the other clips to it', medias: [{ mimeType: 'video/mp4' }] };
    expect(agentRedo({ runJob: { phase: 'ended' } }, turn, { montage: true, audio: true, edit: true })).toEqual({ kind: 'none' });
    expect(agentRedo({ runJob: { phase: 'running' } }, turn, { montage: true, audio: true })).toEqual({ kind: 'none' });
    expect(agentRedo({ analyzeJob: { phase: 'reading' } }, turn, { montage: true, audio: true })).toEqual({ kind: 'none' });
    expect(agentRedo({ analyzeJob: { phase: 'done' } }, turn, { montage: true, audio: true })).toEqual({ kind: 'chat' });
  });
});
