/**
 * @jest-environment jsdom
 *
 * ToolSheet — what the composer's „+" opens: the tools. Files are attached with the composer's paperclip beside „+"
 * (owner, 2026-10-03), so the sheet carries no attach row.
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

test('the sheet is the tools only: no attach row — files are the paperclip beside „+"', () => {
  sheet();
  expect(screen.queryByTestId('attach')).toBeNull();
  const dialog = screen.getByRole('dialog');
  const outside = within(dialog).getAllByRole('button').filter((b) => !b.closest('ul'));
  expect(outside).toHaveLength(0);
  for (const old of ['Attach files', 'Photos', 'Camera', 'Files']) expect(screen.queryByRole('button', { name: old })).toBeNull();
});

test.each([
  ['ka', 'ხელსაწყოები'],
  ['en', 'Tools'],
  ['ru', 'Инструменты'],
] as const)('in %s the sheet is named for what it holds — the tools', (locale, name) => {
  sheet({ locale });
  expect(screen.getByRole('dialog', { name })).toBeInTheDocument();
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

// ── sections: the studio passes the service catalog's categories (lib/catalog/nav.ts) ──────────────────────────────
test('sections draw one heading per catalog category, skip an empty one, and put the extras after the first', () => {
  const onPick = jest.fn();
  sheet({
    tools: [],
    sections: [
      { id: 'agent-g', label: 'Agent G', tools },
      { id: 'video', label: 'Video', tools: [{ id: 'video', Icon: Film, title: 'Video', sub: 'A film' }] },
      { id: 'music', label: 'Music', tools: [] },
    ],
    extras: [{ id: 'research', Icon: Film, title: 'Deep Research', sub: 'Searches the web', onPick }],
  });
  expect(screen.getByTestId('tool-section-agent-g')).toBeInTheDocument();
  expect(screen.getByTestId('tool-section-video')).toBeInTheDocument();
  expect(screen.queryByTestId('tool-section-music')).toBeNull();
  expect(within(screen.getByTestId('tool-section-agent-g')).getByTestId('tool-sheet-extras')).toBeInTheDocument();
  expect(within(screen.getByTestId('tool-section-video')).getByRole('list', { name: 'Video' })).toBeInTheDocument();
});
