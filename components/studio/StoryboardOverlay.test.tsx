import { fireEvent, render, screen } from '@testing-library/react';

// OmniStudio pulls in ESM-only markdown renderers the board never uses.
jest.mock('../chat/MarkdownView', () => ({ __esModule: true, default: () => null, MarkdownView: () => null }));
jest.mock('next-intl', () => ({ useLocale: () => 'en', useTranslations: () => (k: string) => k }));
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn() }), usePathname: () => '/en/dashboard', useSearchParams: () => new URLSearchParams() }));
import { COPY, StoryboardOverlay } from './OmniStudio';

// 2026-10-16: on a wide window the dark margins beside the storyboard are its backdrop, and one stray click there
// closed the board and aborted every frame still drawing. The board closes only from its own X / Cancel.
describe('StoryboardOverlay — a click outside the board does not close it', () => {
  const noop = () => undefined;
  const sb = {
    filmPrompt: 'ad', refs: [], orientation: 'vertical' as const, seed: 1, clipSec: 8, pending: [2],
    scenes: [
      { uid: 'a', ordinal: 1, beat: 'Establishing', prompt: 'Scene one', frameUrl: 'https://example.test/1.png' },
      { uid: 'b', ordinal: 2, beat: 'Close-Up', prompt: 'Scene two', frameUrl: null },
    ],
  };
  const renderBoard = (onCancel: () => void) => render(
    <StoryboardOverlay
      sb={sb as never} t={COPY.en} locale="en" busy={false} regenningOrdinal={null}
      onGenerate={noop} onRegenerate={noop} onRegenScene={noop} onEditScene={noop} onView={noop} onCancel={onCancel}
      onDelete={noop} onMove={noop} onReorder={noop} onAddScene={noop}
    />,
  );

  test('clicking the backdrop leaves the board open', () => {
    const onCancel = jest.fn();
    renderBoard(onCancel);
    fireEvent.click(screen.getByTestId('storyboard-overlay'));
    expect(onCancel).not.toHaveBeenCalled();
  });

  test('the X still closes it', () => {
    const onCancel = jest.fn();
    renderBoard(onCancel);
    fireEvent.click(screen.getAllByRole('button', { name: COPY.en.sbCancel })[0]!);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
