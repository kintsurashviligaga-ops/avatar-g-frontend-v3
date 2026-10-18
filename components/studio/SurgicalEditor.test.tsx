/**
 * SurgicalEditor — a file handed to it (a result's ✂ in the chat, a Library file's „edit") lands as its clip.
 * Pinned: it lands under React Strict Mode too, which mounts every effect twice (the dev server and the browser specs
 * run that way): the first, cancelled run used to keep the link marked as loaded and the editor stayed empty.
 */
import { StrictMode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
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
