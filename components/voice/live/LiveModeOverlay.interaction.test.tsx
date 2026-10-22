import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import LiveModeOverlay from './LiveModeOverlay';
import type { LiveActionCard } from './liveActions';

const handlers = () => ({ onToggleMute: jest.fn(), onToggleCamera: jest.fn(), onEnd: jest.fn() });
const card: LiveActionCard = { id: 'prepared', action: { type: 'prepare_generation', tool: 'video', prompt: 'A red fox' } };

test('prepared actions remain visible without captions and open only on the user tap', () => {
  const open = jest.fn();
  render(<LiveModeOverlay locale="en" status="listening" captions={[]} showCaptions={false} muted={false} cameraOn={false}
    {...handlers()} actions={[card]} onOpenAction={open} />);
  expect(screen.getByText('Prepared a video prompt')).toBeVisible();
  expect(open).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Open in the studio and end the call' }));
  expect(open).toHaveBeenCalledWith(card);
});

test('caption visibility is view state: it hides both speakers without losing the real transcript', () => {
  const { rerender } = render(<LiveModeOverlay locale="en" status="listening" muted={false} cameraOn={false} {...handlers()}
    captions={[{ id: 'u', role: 'user', text: 'My question', final: true }, { id: 'a', role: 'assistant', text: 'The answer', final: true }]} />);
  const toggle = screen.getByRole('button', { name: 'Captions' });
  expect(screen.getByText('My question')).toBeVisible();
  expect(screen.getByText('The answer')).toBeVisible();
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute('aria-pressed', 'false');
  expect(screen.queryByText('My question')).toBeNull();
  expect(screen.queryByText('The answer')).toBeNull();
  fireEvent.click(toggle);
  expect(screen.getByText('The answer')).toBeVisible();
  rerender(<LiveModeOverlay locale="en" status="listening" captions={[]} showCaptions={false} muted={false} cameraOn={false} {...handlers()} />);
  expect(screen.queryByRole('button', { name: 'Captions' })).toBeNull();
});

test('an error hides stale actions and host controls; returning to the call restores them', () => {
  const props = { locale: 'en' as const, captions: [], muted: false, cameraOn: false, ...handlers(), actions: [card], onOpenAction: jest.fn(), extraControls: <button>Voice choice</button> };
  const { rerender } = render(<LiveModeOverlay {...props} status="error" error="connection_lost" />);
  expect(screen.queryByText('Prepared a video prompt')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Voice choice' })).toBeNull();
  rerender(<LiveModeOverlay {...props} status="listening" />);
  expect(screen.getByText('Prepared a video prompt')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Voice choice' })).toBeVisible();
});
