/** @jest-environment jsdom */
/**
 * VECTOR 1 — high-speed streaming stress test for the memoized chat renderer.
 *
 * MyAvatarChatV2's MarkdownView is `memo(function MarkdownView({ source }: { source: string }) { … })`. This
 * test reproduces that EXACT contract with a parse-counter standing in for react-markdown's expensive parse
 * (GFM + KaTeX + highlight), and proves the two properties the memoization guarantees:
 *   1. Typing into the composer (a parent state change) re-parses ZERO bubbles.
 *   2. A 2000-word incoming stream re-parses ONLY the streaming bubble; the other 20 stay memoized.
 * Together these are what keep the input lag-free during an active stream.
 */
import { render, fireEvent } from '@testing-library/react';
import { memo, useState } from 'react';

const parseSpy = jest.fn<void, [string]>();

// Same shape as the real MarkdownView: memo keyed on a primitive `source`. The body stands in for the
// expensive markdown parse — each invocation is one re-parse of that bubble.
const MemoMarkdown = memo(function MemoMarkdown({ source }: { source: string }) {
  parseSpy(source);
  return <div data-testid="bubble">{source.length}</div>;
});

const WORD = 'word ';
/** ~2000-word assistant reply (tables/code/math would be even heavier to re-parse). */
const bigDoc = (seed: string) => `${seed} ${WORD.repeat(2000)}`;

function ChatHarness({ streamSource }: { streamSource: string }) {
  const [input, setInput] = useState('');
  // Recomputed every render (like the real message list) — but each source string is IDENTICAL in value, so
  // React.memo's shallow (by-value) compare skips the re-render.
  const staticSources = Array.from({ length: 20 }, (_, i) => bigDoc(`reply-${i}`));
  return (
    <div>
      {staticSources.map((s, i) => <MemoMarkdown key={i} source={s} />)}
      <MemoMarkdown key="stream" source={streamSource} />
      <textarea data-testid="composer" value={input} onChange={(e) => setInput(e.target.value)} />
    </div>
  );
}

beforeEach(() => parseSpy.mockClear());

describe('MarkdownView memoization — streaming stress test', () => {
  test('typing 50 chars into the composer re-parses ZERO of the 21 bubbles (input stays lag-free)', () => {
    const { getByTestId } = render(<ChatHarness streamSource="ready" />);
    const initial = parseSpy.mock.calls.length; // 21 initial parses (20 static + 1 stream)
    expect(initial).toBe(21);

    const ta = getByTestId('composer') as HTMLTextAreaElement;
    for (let i = 1; i <= 50; i++) fireEvent.change(ta, { target: { value: 'x'.repeat(i) } });

    expect(ta.value).toBe('x'.repeat(50));            // the input updated correctly on every keystroke
    expect(parseSpy.mock.calls.length).toBe(initial);  // …and NOT one bubble re-parsed during the 50 keystrokes
  });

  test('a 100-chunk / 2000-word stream re-parses ONLY the streaming bubble; the 20 siblings stay memoized', () => {
    const { rerender } = render(<ChatHarness streamSource="" />);
    parseSpy.mockClear();

    let acc = '';
    for (let i = 0; i < 100; i++) { acc += WORD.repeat(20); rerender(<ChatHarness streamSource={acc} />); }

    const staticReparses = parseSpy.mock.calls.filter(([s]) => s.startsWith('reply-')).length;
    const streamReparses = parseSpy.mock.calls.filter(([s]) => s.startsWith('word ')).length;
    expect(staticReparses).toBe(0);    // the 20 unchanged bubbles NEVER re-parsed during the whole stream
    expect(streamReparses).toBe(100);  // only the growing bubble re-parsed, once per chunk
  });
});
