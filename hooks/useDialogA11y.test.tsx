/**
 * @jest-environment jsdom
 *
 * Stacked dialogs: only the top one answers Escape. A sheet opened FROM another sheet (the studio's settings →
 * „შეცვლა“ → the tool list) used to close both on one key press.
 */
import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useDialogA11y } from './useDialogA11y';

function Dialog({ name, open, onClose, children }: { name: string; open: boolean; onClose: () => void; children?: React.ReactNode }) {
  const ref = useDialogA11y<HTMLDivElement>(open, onClose);
  if (!open) return null;
  return <div ref={ref} role="dialog" aria-label={name}><button type="button">{name}</button>{children}</div>;
}

function Stack() {
  const [outer, setOuter] = useState(true);
  const [inner, setInner] = useState(true);
  return (
    <Dialog name="settings" open={outer} onClose={() => setOuter(false)}>
      <Dialog name="tools" open={inner} onClose={() => setInner(false)} />
    </Dialog>
  );
}

describe('useDialogA11y — stacked dialogs', () => {
  it('Escape closes the top dialog only; the next Escape closes the one under it', () => {
    render(<Stack />);
    expect(screen.getAllByRole('dialog')).toHaveLength(2);
    act(() => { fireEvent.keyDown(window, { key: 'Escape' }); });
    expect(screen.getAllByRole('dialog').map((d) => d.getAttribute('aria-label'))).toEqual(['settings']);
    act(() => { fireEvent.keyDown(window, { key: 'Escape' }); });
    expect(screen.queryAllByRole('dialog')).toHaveLength(0);
  });
});

function Siblings() {
  // The studio's real shape: the tool sheet is a SIBLING portal opened after the settings sheet.
  const [a, setA] = useState(true);
  const [b, setB] = useState(false);
  return (
    <>
      <Dialog name="settings" open={a} onClose={() => setA(false)}><button type="button" onClick={() => setB(true)}>change</button></Dialog>
      <Dialog name="tools" open={b} onClose={() => setB(false)} />
    </>
  );
}

describe('useDialogA11y — a sheet opened from a sheet', () => {
  it('the later one is on top', () => {
    render(<Siblings />);
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'change' })); });
    expect(screen.getAllByRole('dialog')).toHaveLength(2);
    act(() => { fireEvent.keyDown(window, { key: 'Escape' }); });
    expect(screen.getAllByRole('dialog').map((d) => d.getAttribute('aria-label'))).toEqual(['settings']);
  });
});
