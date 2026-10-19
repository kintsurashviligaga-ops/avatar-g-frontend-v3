/**
 * SurgicalEditor — a file handed to it (a result's ✂ in the chat, a Library file's „edit") lands as its clip.
 * Pinned: it lands under React Strict Mode too, which mounts every effect twice (the dev server and the browser specs
 * run that way): the first, cancelled run used to keep the link marked as loaded and the editor stayed empty.
 */
import { StrictMode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import SurgicalEditor from './SurgicalEditor';

const PICTURE = 'https://ours.supabase.co/storage/v1/object/sign/renders/p.png?token=t';
let fetched: string[] = [];

beforeEach(() => {
  fetched = [];
  global.fetch = jest.fn(async (url: RequestInfo | URL) => {
    fetched.push(String(url));
    return { ok: true, blob: async () => new Blob(['png'], { type: 'image/png' }) } as unknown as Response;
  }) as typeof fetch;
  URL.createObjectURL = jest.fn(() => 'blob:clip');
  URL.revokeObjectURL = jest.fn();
});

it('opens a handed-over picture as its clip, under Strict Mode too', async () => {
  const asset = { url: PICTURE, kind: 'image' as const };
  render(<StrictMode><SurgicalEditor locale="en" onExit={() => {}} initialAsset={asset} /></StrictMode>);
  await waitFor(() => expect(document.querySelectorAll('button[title^="import-"][title$=".png"]')).toHaveLength(1));
  // No workspace chooser over a file that is already there.
  expect(screen.queryByText('Select Workspace Mode')).toBeNull();
  expect(fetched.every((u) => u === PICTURE)).toBe(true);
});

it('loads the same link once when it is handed over again', async () => {
  const { rerender } = render(<SurgicalEditor locale="en" onExit={() => {}} initialAsset={{ url: PICTURE, kind: 'image' }} />);
  await waitFor(() => expect(document.querySelectorAll('button[title^="import-"]')).toHaveLength(1));
  rerender(<SurgicalEditor locale="en" onExit={() => {}} initialAsset={{ url: PICTURE, kind: 'image' }} />);
  await new Promise((r) => setTimeout(r, 20));
  expect(document.querySelectorAll('button[title^="import-"]')).toHaveLength(1);
  expect(fetched).toHaveLength(1);
});

it('a negated video instruction leaves the preview unchanged and asks to rephrase at the real command box', async () => {
  const asset = { url: 'https://ours.supabase.co/storage/v1/object/sign/renders/clip.mp4', kind: 'video' as const };
  render(<SurgicalEditor locale="en" onExit={() => {}} initialAsset={asset} />);
  const input = await screen.findByPlaceholderText('split, mute…');
  await waitFor(() => expect(document.querySelector('video')).not.toBeNull());
  const video = document.querySelector('video')!;
  expect(video.style.filter).toContain('brightness(100%)');
  fireEvent.change(input, { target: { value: 'არ გაანათო' } });
  fireEvent.click(screen.getByRole('button', { name: 'Run', exact: true }));
  expect(video.style.filter).toContain('brightness(100%)');
  expect(screen.getByText('Didn’t catch that command — try rephrasing')).not.toBeNull();
  expect(fetched).toEqual([asset.url]); // loading the clip is the only IO; no paid edit/render/model call
});

it('the real video command box darkens without selecting slow playback', async () => {
  const asset = { url: 'https://ours.supabase.co/storage/v1/object/sign/renders/clip.mp4', kind: 'video' as const };
  render(<SurgicalEditor locale="en" onExit={() => {}} initialAsset={asset} />);
  const input = await screen.findByPlaceholderText('split, mute…');
  fireEvent.change(input, { target: { value: 'დააბნელე' } });
  fireEvent.click(screen.getByRole('button', { name: 'Run', exact: true }));
  expect(document.querySelector('video')!.style.filter).toContain('brightness(70%)');
  expect(screen.getByRole('button', { name: '1×', exact: true }).classList.contains('bg-app-accent')).toBe(true);
  expect(fetched).toEqual([asset.url]);
});
