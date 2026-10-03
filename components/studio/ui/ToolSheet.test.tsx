/**
 * @jest-environment jsdom
 *
 * ToolSheet — what the composer's „+" opens: one attach button (the phone's picker offers photos, the camera and
 * files from it), drawn only when the active tool takes files, then the tools.
 */
import '@testing-library/jest-dom';
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

test('ONE attach button (not four tiles): it opens the picker and closes the sheet', () => {
  const onAttach = jest.fn();
  const { onClose } = sheet({ onAttach });
  const dialog = screen.getByRole('dialog');
  const outside = within(dialog).getAllByRole('button').filter((b) => !b.closest('ul'));
  expect(outside).toHaveLength(1);
  expect(outside[0]).toHaveTextContent('Attach files');
  expect(outside[0]).toHaveTextContent('Photos, videos, camera, documents, audio');
  for (const old of ['Photos', 'Video', 'Camera', 'Files']) expect(screen.queryByRole('button', { name: old })).toBeNull();
  fireEvent.click(screen.getByTestId('attach'));
  expect(onAttach).toHaveBeenCalledTimes(1);
  expect(onClose).toHaveBeenCalledTimes(1);
});

test('the line under the button says what the open tool takes', () => {
  sheet({ onAttach: jest.fn(), attachHint: 'A video' });
  expect(screen.getByTestId('attach')).toHaveTextContent('A video');
});

test('no attach button when the tool takes no files (a studio): the tools list is the whole sheet', () => {
  sheet();
  expect(screen.queryByTestId('attach')).toBeNull();
});

test.each([
  ['ka', 'ფაილის მიმაგრება'],
  ['ru', 'Прикрепить файлы'],
] as const)('the attach button is named in %s', (locale, name) => {
  sheet({ locale, onAttach: jest.fn() });
  expect(screen.getByTestId('attach')).toHaveTextContent(name);
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
