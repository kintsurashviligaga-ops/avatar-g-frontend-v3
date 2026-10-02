/**
 * @jest-environment jsdom
 *
 * ToolSheet — what the composer's „+" opens. The chat takes everything a person may bring (photos, a video, the
 * camera, files), and each tile shows only when the active tool can take it.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { Film } from 'lucide-react';
import { ToolSheet } from './ToolSheet';

const tools = [{ id: 'chat', Icon: Film, title: 'Chat', sub: 'Ask anything' }];

function sheet(props: Partial<React.ComponentProps<typeof ToolSheet>> = {}) {
  const onClose = jest.fn();
  const utils = render(
    <ToolSheet open onClose={onClose} locale="en" tools={tools} activeId="chat" onTool={jest.fn()} {...props} />,
  );
  return { onClose, ...utils };
}

const tileNames = () => {
  const dialog = screen.getByRole('dialog');
  // The tiles are the buttons outside the tools lists.
  return within(dialog).getAllByRole('button').filter((b) => !b.closest('ul')).map((b) => b.textContent?.trim());
};

test('the chat\'s four tiles, in order: Photos, Video, Camera, Files', () => {
  sheet({ onPhotos: jest.fn(), onVideo: jest.fn(), onCamera: jest.fn(), onFiles: jest.fn() });
  expect(tileNames().slice(0, 4)).toEqual(['Photos', 'Video', 'Camera', 'Files']);
});

test('each tile calls its own handler and closes the sheet', () => {
  const h = { onPhotos: jest.fn(), onVideo: jest.fn(), onCamera: jest.fn(), onFiles: jest.fn() };
  const { onClose } = sheet(h);
  fireEvent.click(screen.getByRole('button', { name: 'Video' }));
  expect(h.onVideo).toHaveBeenCalledTimes(1);
  expect(h.onPhotos).not.toHaveBeenCalled();
  expect(onClose).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Files' }));
  expect(h.onFiles).toHaveBeenCalledTimes(1);
});

test('a tile shows only when the active tool can take it (a remix takes a video file, never a photo)', () => {
  sheet({ onFiles: jest.fn() });
  expect(tileNames()).toEqual(['Files']);
});

test('no tile at all when the tool takes nothing (a studio): the tools list is the whole sheet', () => {
  sheet();
  expect(screen.queryByRole('button', { name: 'Photos' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Video' })).toBeNull();
});

test.each([
  ['ka', ['ფოტოები', 'ვიდეო', 'კამერა', 'ფაილები']],
  ['ru', ['Фото', 'Видео', 'Камера', 'Файлы']],
] as const)('the tiles are named in %s', (locale, names) => {
  sheet({ locale, onPhotos: jest.fn(), onVideo: jest.fn(), onCamera: jest.fn(), onFiles: jest.fn() });
  const dialog = screen.getByRole('dialog');
  for (const n of names) expect(within(dialog).getByRole('button', { name: n })).toBeTruthy();
});

// ── extras: the rows that DO something instead of switching the tool (Deep Research, Connectors) ──────────────────
test('no extras -> nothing extra is drawn (the default for every deployment without the feature)', () => {
  sheet();
  expect(screen.queryByTestId('tool-sheet-extras')).toBeNull();
});

test('extras are rows after the tools: each calls its own handler (not onTool) and closes the sheet', () => {
  const onPick = jest.fn();
  const otherPick = jest.fn();
  const onTool = jest.fn();
  const { onClose } = sheet({
    onTool,
    extras: [
      { id: 'research', Icon: Film, title: 'Deep Research', sub: 'Searches the web', onPick },
      { id: 'connectors', Icon: Film, title: 'Connectors', sub: 'Your documents', onPick: otherPick },
    ],
  });
  const extras = screen.getByTestId('tool-sheet-extras');
  expect(within(extras).getAllByRole('button').map((b) => b.textContent)).toEqual(['Deep ResearchSearches the web', 'ConnectorsYour documents']);
  // They come after the tools list, in the same dialog.
  const lists = within(screen.getByRole('dialog')).getAllByRole('list');
  expect(lists[0]!.textContent).toContain('Chat');
  expect(lists[1]).toBe(extras);
  fireEvent.click(screen.getByTestId('tool-extra-research'));
  expect(onPick).toHaveBeenCalledTimes(1);
  expect(otherPick).not.toHaveBeenCalled();
  expect(onTool).not.toHaveBeenCalled();
  expect(onClose).toHaveBeenCalledTimes(1);
});
