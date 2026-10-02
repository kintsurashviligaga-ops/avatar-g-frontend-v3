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
