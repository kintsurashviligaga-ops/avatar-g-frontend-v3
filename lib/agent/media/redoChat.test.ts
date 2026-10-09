import { agentRedo, attachmentKind } from './redoChat';

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

test('attachmentKind reads the MIME family', () => {
  expect(['video/mp4', 'audio/mpeg', 'image/png', 'application/pdf'].map(attachmentKind)).toEqual(['video', 'audio', 'image', 'other']);
});
