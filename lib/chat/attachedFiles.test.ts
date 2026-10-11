import { attachedEarlierNote, attachedKind, clock, readAttachedFiles, toAttachedFile } from './attachedFiles';

describe('a turn keeps what it carried after its bytes are gone', () => {
  const sent = [
    { mimeType: 'video/mp4', name: 'clipA.mp4', size: 14_400_000, durationSec: 9.04, storagePath: 'omni-uploads/u1/171-clipA.mp4' },
    { mimeType: 'video/quicktime', name: 'IMG_0042.MOV', size: 22_000_000, durationSec: 11.2, storagePath: 'omni-uploads/u1/172-IMG_0042.mov' },
    { mimeType: 'video/mp4', name: 'clipC.mp4', size: 9_000_000, durationSec: 6 },
    { mimeType: 'audio/mpeg', name: 'track.mp3', size: 721_000, durationSec: 30, storagePath: 'omni-uploads/u1/173-track.mp3' },
  ];

  it('each file by kind, name, size, length and its checked storage path', () => {
    expect(sent.map(toAttachedFile)).toEqual([
      { kind: 'video', name: 'clipA.mp4', size: 14_400_000, durationSec: 9, path: 'omni-uploads/u1/171-clipA.mp4' },
      { kind: 'video', name: 'IMG_0042.MOV', size: 22_000_000, durationSec: 11.2, path: 'omni-uploads/u1/172-IMG_0042.mov' },
      { kind: 'video', name: 'clipC.mp4', size: 9_000_000, durationSec: 6 },
      { kind: 'audio', name: 'track.mp3', size: 721_000, durationSec: 30, path: 'omni-uploads/u1/173-track.mp3' },
    ]);
  });

  it('never keeps a URL, a blob, a traversal or a foreign path as the stored copy', () => {
    for (const storagePath of ['https://x.supabase.co/storage/v1/object/sign/uploads/a.mp4?token=t', 'blob:https://myavatar.ge/1', 'omni-uploads/u1/../u2/a.mp4', 'renders/x.mp4', 'omni-uploads/u1/a.mp4?token=1']) {
      expect(toAttachedFile({ mimeType: 'video/mp4', storagePath }).path).toBeUndefined();
    }
  });

  it('the model is told every file by number, name, kind and length', () => {
    expect(attachedEarlierNote(sent.map(toAttachedFile), ['video', 'video', 'video', 'audio'])).toBe(
      '[attached earlier: 1. clipA.mp4 (video, 0:09); 2. IMG_0042.MOV (video, 0:11); 3. clipC.mp4 (video, 0:06); 4. track.mp3 (audio, 0:30) — no longer available to you]',
    );
  });

  it('a chat saved before names were kept still says the kinds; nothing at all says nothing', () => {
    expect(attachedEarlierNote(undefined, ['image', 'PDF'])).toBe('[attached earlier: image, PDF — no longer available to you]');
    expect(attachedEarlierNote([], [])).toBe('');
  });

  it('a saved list is read back defensively', () => {
    expect(readAttachedFiles('x')).toBeUndefined();
    expect(readAttachedFiles([{ kind: 'video', name: 'a.mp4', path: 'omni-uploads/u1/a.mp4' }, { name: 'no kind' }, null, { kind: 'PDF', size: -1 }])).toEqual([
      { kind: 'video', name: 'a.mp4', path: 'omni-uploads/u1/a.mp4' },
      { kind: 'PDF' },
    ]);
  });

  it('kinds and clock', () => {
    expect(['image/heic', 'video/webm', 'audio/x-m4a', 'application/pdf', 'text/plain'].map(attachedKind)).toEqual(['image', 'video', 'audio', 'PDF', 'file']);
    expect(clock(0)).toBe('0:00');
    expect(clock(125.4)).toBe('2:05');
  });
});
