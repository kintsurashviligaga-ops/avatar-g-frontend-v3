/**
 * Connectors — deleting a local file (Phase 7.8): the button spins while the delete runs and ignores a second tap, and a
 * failure says the file could not be DELETED (it used to say the upload failed).
 */
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';

let finishRemove: (ok: boolean) => void = () => {};
const mockRemove = jest.fn(() => new Promise<boolean>((done) => { finishRemove = done; }));
jest.mock('./api', () => ({
  TEXT_FILE_RE: /\.(txt|md)$/i,
  addFile: jest.fn(),
  extractFileText: jest.fn(),
  fetchConnectors: jest.fn(async () => ({ ok: true, connectors: [{ id: 'local_files', status: 'ready' }], limits: null })),
  fetchFiles: jest.fn(async () => ({ ok: true, files: [{ id: 'f1', name: 'notes.txt', chars: 120 }], limits: null })),
  removeFile: () => mockRemove(),
}));
jest.mock('./DriveConnector', () => ({ DriveConnector: () => null }));

import { ConnectorsBody } from './ConnectorsBody';

beforeEach(() => mockRemove.mockClear());

test('a delete in flight spins, ignores a second tap, and a failure says it could not be deleted', async () => {
  await act(async () => { render(<ConnectorsBody locale="en" authed />); });
  const btn = await screen.findByRole('button', { name: 'Delete notes.txt' });
  await act(async () => { fireEvent.click(btn); });
  expect(btn).toBeDisabled();
  expect(btn).toHaveAttribute('aria-busy', 'true');
  await act(async () => { fireEvent.click(btn); });
  expect(mockRemove).toHaveBeenCalledTimes(1);
  await act(async () => { finishRemove(false); });
  expect(screen.getByText('The file could not be deleted. Try again.')).toBeTruthy();
  expect(screen.queryByText('The file could not be uploaded.')).toBeNull();
  expect(btn).not.toBeDisabled();
  expect(screen.getByText('notes.txt')).toBeTruthy();
});

test('a delete that succeeds takes the file off the list', async () => {
  await act(async () => { render(<ConnectorsBody locale="en" authed />); });
  await act(async () => { fireEvent.click(await screen.findByRole('button', { name: 'Delete notes.txt' })); });
  await act(async () => { finishRemove(true); });
  expect(screen.queryByText('notes.txt')).toBeNull();
});
