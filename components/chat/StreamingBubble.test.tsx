/**
 * @jest-environment jsdom
 *
 * StreamingBubble: the only subscriber to the chat stream store.
 *
 * ⚠️ WHAT THESE PIN.
 *  - A burst of chunks re-renders the bubble once per frame and does NOT re-render the host or its other
 *    children. That is the whole point of moving the text out of OmniStudio's state.
 *  - The model-badge row exists before the first token, as the same DOM node, so nothing shifts when the
 *    answer starts.
 *  - A failure renders the localized message (never an empty bubble), with Retry only when retrying can help.
 *
 * MarkdownView is replaced by a recorder here; its own rendering is covered in MarkdownView.test.tsx.
 */
import { act, fireEvent, render } from '@testing-library/react';
import { memo, useState } from 'react';
import { createChatStreamStore, type ChatStreamStore } from './chatStreamStore';

interface MockMdProps {
  source: string;
  streaming?: boolean;
  locale?: string;
}

function mockMdRenders(): MockMdProps[] {
  const g = globalThis as unknown as { __mdBubbleRenders?: MockMdProps[] };
  g.__mdBubbleRenders ??= [];
  return g.__mdBubbleRenders;
}

// A relative path: next/jest's SWC rewrites `@/` in imports but not inside jest.mock().
jest.mock('./MarkdownView', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createElement } = require('react') as typeof import('react');
  return {
    __esModule: true,
    MarkdownView: (props: MockMdProps) => {
      mockMdRenders().push(props);
      return createElement('div', { 'data-testid': 'md', 'data-streaming': String(!!props.streaming) }, props.source);
    },
  };
});

import { StreamingBubble, formatModelBadge } from './StreamingBubble';

function manualFrames() {
  const queue: Array<() => void> = [];
  return {
    schedule: (cb: () => void) => {
      queue.push(cb);
      return cb;
    },
    cancel: (h: unknown) => {
      const i = queue.indexOf(h as () => void);
      if (i >= 0) queue.splice(i, 1);
    },
    run: () => {
      for (const cb of queue.splice(0, queue.length)) cb();
    },
  };
}

beforeEach(() => {
  mockMdRenders().length = 0;
});

describe('StreamingBubble — render isolation', () => {
  it('30 chunks in one frame: one bubble render, zero host renders', () => {
    const frames = manualFrames();
    const store = createChatStreamStore({ schedule: frames.schedule, cancel: frames.cancel });
    const counts = { host: 0, sibling: 0 };

    const Sibling = memo(function Sibling() {
      counts.sibling += 1;
      return <div>history</div>;
    });
    function Host({ s }: { s: ChatStreamStore }) {
      counts.host += 1;
      const [draft] = useState('');
      return (
        <div>
          <Sibling />
          <StreamingBubble store={s} locale="en" />
          <textarea readOnly value={draft} />
        </div>
      );
    }

    const { getByTestId } = render(<Host s={store} />);
    let w!: ReturnType<ChatStreamStore['begin']>;
    act(() => {
      w = store.begin('t');
    });
    const host0 = counts.host;
    const sib0 = counts.sibling;
    const md0 = mockMdRenders().length;

    act(() => {
      w.setMeta({ provider: 'gemini', model: 'gemini-3.8-flash' });
      for (let i = 0; i < 30; i++) w.appendText(`t${i} `);
    });
    expect(mockMdRenders().length).toBe(md0); // nothing until the frame
    act(() => frames.run());

    expect(counts.host).toBe(host0);
    expect(counts.sibling).toBe(sib0);
    expect(mockMdRenders().length).toBe(md0 + 1);
    expect(getByTestId('md').textContent).toBe(Array.from({ length: 30 }, (_, i) => `t${i} `).join(''));
    expect(getByTestId('md').getAttribute('data-streaming')).toBe('true');
  });
});

describe('StreamingBubble — no layout jump', () => {
  it('reserves the model-badge row before the first token, as the same node', () => {
    const frames = manualFrames();
    const store = createChatStreamStore({ schedule: frames.schedule, cancel: frames.cancel });
    const { container } = render(<StreamingBubble store={store} locale="en" />);
    expect(container.firstChild).toBeNull(); // idle: nothing rendered

    let w!: ReturnType<ChatStreamStore['begin']>;
    act(() => {
      w = store.begin();
    });
    const slot = container.querySelector('[data-model-badge]')!;
    expect(slot).toBeTruthy();
    expect(slot.textContent).toBe(' '); // holds the line height
    expect(slot.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelector('[role="status"]')).toBeTruthy(); // typing dots while waiting

    act(() => {
      w.setMeta({ provider: 'gemini', model: 'gemini-3.8-flash' });
      w.appendText('Hi');
      frames.run();
    });
    expect(container.querySelector('[data-model-badge]')).toBe(slot); // same node, filled in place
    expect(slot.textContent).toBe('gemini-3.8-flash');
    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  it('stops the caret when the stream ends', () => {
    const store = createChatStreamStore({ schedule: () => null, cancel: () => undefined });
    const { getByTestId } = render(<StreamingBubble store={store} />);
    act(() => {
      const w = store.begin();
      w.appendText('done text');
      w.finish();
    });
    expect(getByTestId('md').getAttribute('data-streaming')).toBe('false');
    expect(getByTestId('md').textContent).toBe('done text');
  });
});

describe('StreamingBubble — failures, sources and hooks', () => {
  it('shows the localized error under the partial text, with Retry when retryable', () => {
    const store = createChatStreamStore({ schedule: () => null, cancel: () => undefined });
    const onRetry = jest.fn();
    const { getByRole, getByTestId } = render(<StreamingBubble store={store} locale="ru" onRetry={onRetry} />);
    act(() => {
      const w = store.begin();
      w.appendText('частично');
      w.fail({ code: 'network', retryable: true, message: 'Проблема с подключением.', reason: 'network' });
    });
    expect(getByTestId('md').textContent).toBe('частично');
    expect(getByRole('alert').textContent).toContain('Проблема с подключением.');
    fireEvent.click(getByRole('button', { name: 'Повторить' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('offers no Retry for a failure retrying cannot fix', () => {
    const store = createChatStreamStore({ schedule: () => null, cancel: () => undefined });
    const { queryByRole, getByRole } = render(<StreamingBubble store={store} locale="en" onRetry={() => undefined} />);
    act(() => {
      store.begin().fail({ code: 'safety', retryable: false, message: 'Blocked.', reason: 'frame' });
    });
    expect(getByRole('alert').textContent).toContain('Blocked.');
    expect(queryByRole('button')).toBeNull();
  });

  it('renders grounding sources as chips', () => {
    const store = createChatStreamStore({ schedule: () => null, cancel: () => undefined });
    const { container } = render(<StreamingBubble store={store} locale="en" />);
    act(() => {
      const w = store.begin();
      w.appendText('answer');
      w.setSources([{ url: 'https://www.bbc.com/news/1', title: 'Story' }]);
      w.finish();
    });
    const chip = container.querySelector('[data-sources] a')!;
    expect(chip.getAttribute('href')).toBe('https://www.bbc.com/news/1');
    expect(chip.textContent).toContain('bbc.com');
  });

  it('applies `transform` to the text and calls onCommit once per committed frame', () => {
    const frames = manualFrames();
    const store = createChatStreamStore({ schedule: frames.schedule, cancel: frames.cancel });
    const onCommit = jest.fn();
    const { getByTestId } = render(
      <StreamingBubble store={store} transform={(t) => t.replace(/\{"service".*$/s, '')} onCommit={onCommit} />,
    );
    let w!: ReturnType<ChatStreamStore['begin']>;
    act(() => {
      w = store.begin();
    });
    onCommit.mockClear();
    act(() => {
      w.appendText('Sure. ');
      w.appendText('{"service":"ima');
      frames.run();
    });
    expect(getByTestId('md').textContent).toBe('Sure. ');
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit.mock.calls[0]![0]).toMatchObject({ status: 'streaming', text: 'Sure. {"service":"ima' });
  });
});

describe('StreamingBubble — stop', () => {
  it('renders nothing when stopped before the first word', () => {
    const store = createChatStreamStore({ schedule: () => null, cancel: () => undefined });
    const { container } = render(<StreamingBubble store={store} />);
    act(() => {
      store.begin().abort();
    });
    expect(container.firstChild).toBeNull();
  });
});

describe('formatModelBadge', () => {
  it('labels Gemini by model, marks a fallback, and hides the budget notice', () => {
    expect(formatModelBadge({ provider: 'gemini', model: 'gemini-3.8-flash' })).toBe('gemini-3.8-flash');
    expect(formatModelBadge({ provider: 'anthropic', model: 'claude-haiku-4-5' })).toBe('⚠ claude-haiku-4-5 (fallback)');
    expect(formatModelBadge({ provider: 'budget', model: 'none' })).toBeNull();
    expect(formatModelBadge(null)).toBeNull();
  });
});
