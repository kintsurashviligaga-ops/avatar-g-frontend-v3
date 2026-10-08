/**
 * PersonaPicker — the persona sheet is a real dialog: focus moves into it, Tab stays inside, Escape closes it and focus
 * returns to the control that opened it (hooks/useDialogA11y).
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import PersonaPicker from './PersonaPicker';

function Host({ onClose }: { onClose: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>open personas</button>
      <PersonaPicker locale="en" open={open} onClose={() => { onClose(); setOpen(false); }} onSelect={() => undefined} />
    </>
  );
}

test('focus moves in, Tab stays inside, Escape closes and focus returns to the opener', async () => {
  const onClose = jest.fn();
  render(<Host onClose={onClose} />);
  const opener = screen.getByRole('button', { name: 'open personas' });
  opener.focus();
  fireEvent.click(opener);
  const dialog = screen.getByRole('dialog');
  await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
  const focusables = Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),textarea:not([disabled])'));
  focusables[focusables.length - 1]!.focus();
  fireEvent.keyDown(window, { key: 'Tab' });
  expect(dialog.contains(document.activeElement)).toBe(true);
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(onClose).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(document.activeElement).toBe(opener);
});
