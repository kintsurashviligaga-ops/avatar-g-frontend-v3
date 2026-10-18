/**
 * lib/studio/pendingEdit — a Library file carried to the studio's editor.
 * Pinned: each Library kind opens its own editor and a 3D model none; the kept file comes back once; older than 30 min,
 * malformed, an unknown kind or an unsafe link comes back as nothing; a blocked sessionStorage never throws.
 */
import { PENDING_EDIT_MAX_AGE_MS, editKindFor, stashPendingEdit, takePendingEdit } from './pendingEdit';

const T0 = 1_791_500_000_000;
const SIGNED = 'https://ours.supabase.co/storage/v1/object/sign/renders/a.mp4?token=t';
beforeEach(() => window.sessionStorage.clear());

it('opens films and avatar videos in the video editor, pictures and 3D-plan renders in the image one, songs in the audio one', () => {
  expect(editKindFor('film', SIGNED)).toBe('video');
  expect(editKindFor('avatar', SIGNED)).toBe('video');
  expect(editKindFor('image', 'https://x.co/p.png')).toBe('image');
  expect(editKindFor('interior', 'https://x.co/room.png')).toBe('image');
  expect(editKindFor('music', 'https://x.co/s.mp3')).toBe('audio');
  expect(editKindFor('voice', 'https://x.co/v.mp3')).toBe('audio');
});

it('offers no editor for a 3D model (filed as an image) or an unknown kind', () => {
  expect(editKindFor('image', 'https://x.co/m.glb?token=t')).toBeNull();
  expect(editKindFor('something', 'https://x.co/a.png')).toBeNull();
});

it('gives back the file and its editor exactly once', () => {
  expect(stashPendingEdit(SIGNED, 'video', T0)).toBe(true);
  expect(takePendingEdit(T0 + 60_000)).toEqual({ url: SIGNED, kind: 'video', at: T0 });
  expect(takePendingEdit(T0 + 61_000)).toBeNull();
});

it('expires after 30 minutes, and refuses a time in the future', () => {
  stashPendingEdit(SIGNED, 'image', T0);
  expect(takePendingEdit(T0 + PENDING_EDIT_MAX_AGE_MS + 1)).toBeNull();
  stashPendingEdit(SIGNED, 'image', T0);
  expect(takePendingEdit(T0 - 1)).toBeNull();
  stashPendingEdit(SIGNED, 'audio', T0);
  expect(takePendingEdit(T0 + PENDING_EDIT_MAX_AGE_MS)?.kind).toBe('audio');
});

it('keeps only an https or same-origin link', () => {
  for (const bad of ['javascript:alert(1)', 'data:image/png;base64,AAAA', '//evil.example/a.mp4', 'http://plain.example/a.mp4', '']) {
    expect(stashPendingEdit(bad, 'video', T0)).toBe(false);
    expect(takePendingEdit(T0)).toBeNull();
  }
  expect(stashPendingEdit('/brand/v1/card-image.jpg', 'image', T0)).toBe(true);
  expect(takePendingEdit(T0)?.url).toBe('/brand/v1/card-image.jpg');
});

it('refuses a hand-written stash with an unsafe link or an unknown kind', () => {
  window.sessionStorage.setItem('myavatar:pending-edit', JSON.stringify({ url: 'javascript:alert(1)', kind: 'video', at: T0 }));
  expect(takePendingEdit(T0)).toBeNull();
  window.sessionStorage.setItem('myavatar:pending-edit', JSON.stringify({ url: SIGNED, kind: 'model', at: T0 }));
  expect(takePendingEdit(T0)).toBeNull();
  window.sessionStorage.setItem('myavatar:pending-edit', '{not json');
  expect(takePendingEdit(T0)).toBeNull();
});

it('never throws when sessionStorage is blocked', () => {
  const spy = jest.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => { throw new Error('blocked'); });
  try {
    expect(stashPendingEdit(SIGNED, 'video', T0)).toBe(false);
    expect(takePendingEdit(T0)).toBeNull();
  } finally {
    spy.mockRestore();
  }
});
