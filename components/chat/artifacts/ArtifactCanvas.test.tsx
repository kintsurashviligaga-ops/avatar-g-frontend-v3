/**
 * @jest-environment jsdom
 *
 * ArtifactCanvas: the right-hand panel (desktop) / bottom sheet (phone) that shows an artifact.
 *
 * ⚠️ WHAT THESE PIN.
 *  - The Preview iframe's sandbox is EXACTLY "allow-scripts" — never allow-same-origin (an about:srcdoc frame
 *    inherits our origin, so the pair would hand model script the app), nor forms / popups / top-navigation.
 *  - The CSP meta is in the srcdoc, at the head of the document, before the model's markup.
 *  - Only html / svg get a Preview tab; other languages are Code only.
 *  - A load after the first is the page navigating itself away: the frame is put back, and it gives up eventually.
 *  - The `myavatar:open-artifact` event opens a valid detail and ignores an invalid one; the canvas registers itself
 *    as a host (that is what makes code blocks offer "Open in canvas").
 *
 * MarkdownView's HighlightedCode is replaced by a plain <pre>: its rendering is covered in MarkdownView.test.tsx,
 * and the real one pulls in ESM-only react-markdown.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const mockCopyText = jest.fn(async (_text: string) => true);
// A relative path: next/jest's SWC rewrites `@/` in imports but not inside jest.mock().
jest.mock('../MarkdownView', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createElement } = require('react') as typeof import('react');
  return {
    __esModule: true,
    copyText: (text: string) => mockCopyText(text),
    HighlightedCode: ({ code, language }: { code: string; language: string }) =>
      createElement('pre', { 'data-testid': 'code', 'data-language': language }, code),
  };
});

import { ArtifactCanvas, DESKTOP_QUERY, MAX_PREVIEW_RESETS } from './ArtifactCanvas';
import { resetArtifactStore, useArtifactStore } from './artifactStore';
import { OPEN_ARTIFACT_EVENT } from './openArtifactEvent';
import { PREVIEW_CSP } from './previewDocument';

let desktop = true;
let warnSpy: jest.SpyInstance;

/** jsdom's Blob has no `.text()`. */
function blobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

beforeAll(() => {
  // Reduced motion on: every transition is 0 s, so AnimatePresence exits settle without real time.
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches: query === DESKTOP_QUERY ? desktop : /prefers-reduced-motion/.test(query),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
});

beforeEach(() => {
  desktop = true;
  resetArtifactStore();
  mockCopyText.mockClear();
  // framer-motion announces "You have Reduced Motion enabled" once; the canvas's own warnings are asserted below.
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => warnSpy.mockRestore());

const open = (input: { title?: string; language: string; code: string }, tab?: 'code' | 'preview') =>
  act(() => {
    useArtifactStore.getState().openArtifact(input, tab ? { tab } : undefined);
  });

const PAGE = '<!DOCTYPE html><html><head><title>Clock</title></head><body><p id="t">12:00</p><script>document.title="x"</script></body></html>';

describe('mounting', () => {
  it('renders nothing until an artifact opens, and registers itself as a host while mounted', () => {
    const { container, unmount } = render(<ArtifactCanvas locale="en" />);
    expect(container.innerHTML).toBe('');
    expect(useArtifactStore.getState().hosts).toBe(1);
    unmount();
    expect(useArtifactStore.getState().hosts).toBe(0);
  });
});

describe('desktop panel', () => {
  it('is a right-hand aside (45 %) with the title, language and the toolbar', () => {
    const { container } = render(<ArtifactCanvas locale="en" />);
    open({ language: 'python', code: 'print("hi")' });
    const aside = container.querySelector('aside[data-artifact-canvas="desktop"]')!;
    expect(aside).toBeTruthy();
    expect(aside.className).toContain('w-[45%]');
    expect(within(aside as HTMLElement).getByRole('heading', { name: 'Python' })).toBeTruthy();
    for (const name of ['Copy', 'Download', 'Close']) expect(screen.getByRole('button', { name })).toBeTruthy();
  });

  it('a non-previewable language has only the Code tab and no iframe', () => {
    const { container } = render(<ArtifactCanvas locale="en" />);
    open({ language: 'python', code: 'print("hi")' }, 'preview');
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Code']);
    expect(container.querySelector('iframe')).toBeNull();
    expect(screen.getByTestId('code').textContent).toBe('print("hi")');
    expect(screen.getByTestId('code').getAttribute('data-language')).toBe('python');
  });

  it('html previews in an iframe whose sandbox is exactly "allow-scripts", with the CSP in its srcdoc', () => {
    const { container } = render(<ArtifactCanvas locale="en" />);
    open({ language: 'html', code: PAGE });
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Code', 'Preview']);
    expect(screen.getByRole('tab', { name: 'Preview' }).getAttribute('aria-selected')).toBe('true');
    const frame = container.querySelector('iframe')!;
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts');
    expect(frame.getAttribute('sandbox')).not.toMatch(/same-origin|forms|popups|top-navigation|modals/);
    expect(frame.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(frame.getAttribute('src')).toBeNull();
    const srcdoc = frame.getAttribute('srcdoc')!;
    const meta = `<meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}">`;
    expect(srcdoc.startsWith(`<!doctype html><html><head>${meta}`)).toBe(true);
    expect(srcdoc.indexOf(meta)).toBeLessThan(srcdoc.indexOf('<script>'));
    expect(srcdoc).toContain(PAGE);
    // The title came from the page's own <title>.
    expect(screen.getByRole('heading', { name: 'Clock' })).toBeTruthy();
  });

  it('svg previews the same way', () => {
    const { container } = render(<ArtifactCanvas locale="en" />);
    open({ language: 'svg', code: '<svg xmlns="http://www.w3.org/2000/svg"><rect width="4" height="4"/></svg>' });
    const frame = container.querySelector('iframe')!;
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts');
    expect(frame.getAttribute('srcdoc')).toContain(`content="${PREVIEW_CSP}"`);
  });

  it('switches between Code and Preview (click and arrow keys)', () => {
    const { container } = render(<ArtifactCanvas locale="en" />);
    open({ language: 'html', code: PAGE });
    fireEvent.click(screen.getByRole('tab', { name: 'Code' }));
    expect(container.querySelector('iframe')).toBeNull();
    expect(screen.getByTestId('code').textContent).toBe(PAGE);
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight' });
    expect(container.querySelector('iframe')).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Preview' }));
  });

  it('copies the code and downloads it with the right name and type', async () => {
    const created: Blob[] = [];
    const createObjectURL = jest.fn((b: Blob) => {
      created.push(b);
      return 'blob:artifact';
    });
    const revokeObjectURL = jest.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const clicks: Array<{ href: string; download: string }> = [];
    const clickSpy = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicks.push({ href: this.getAttribute('href') ?? '', download: this.download });
    });
    try {
      render(<ArtifactCanvas locale="en" />);
      open({ title: 'Clock page', language: 'html', code: PAGE });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
      });
      expect(mockCopyText).toHaveBeenCalledWith(PAGE);
      expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy();

      fireEvent.click(screen.getByRole('button', { name: 'Download' }));
      expect(clicks).toEqual([{ href: 'blob:artifact', download: 'Clock-page.html' }]);
      expect(created[0]!.type).toBe('text/html;charset=utf-8');
      // The download is the code as written — never the preview's CSP wrapper.
      expect(await blobText(created[0]!)).toBe(PAGE);
    } finally {
      clickSpy.mockRestore();
    }
  });

  it('Close and Escape close it', async () => {
    const { container } = render(<ArtifactCanvas locale="en" />);
    open({ language: 'css', code: 'p{color:red}' });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(useArtifactStore.getState().open).toBe(false);
    await waitFor(() => expect(container.querySelector('aside')).toBeNull());

    open({ language: 'css', code: 'p{color:blue}' });
    fireEvent.keyDown(screen.getByRole('button', { name: 'Copy' }), { key: 'Escape' });
    expect(useArtifactStore.getState().open).toBe(false);
    await waitFor(() => expect(container.querySelector('aside')).toBeNull());
  });

  it('steps between versions of the same artifact', () => {
    render(<ArtifactCanvas locale="en" />);
    open({ title: 'Todo', language: 'html', code: '<p>v1</p>' }, 'code');
    expect(screen.queryByRole('button', { name: 'Previous version' })).toBeNull(); // one version: no switcher
    open({ title: 'Todo', language: 'html', code: '<p>v2</p>' }, 'code');
    expect(screen.getByTestId('code').textContent).toBe('<p>v2</p>');
    expect(screen.getByLabelText('Version 2 of 2')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Next version' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Previous version' }));
    expect(screen.getByTestId('code').textContent).toBe('<p>v1</p>');
  });

  it('localizes its chrome (Georgian by default)', () => {
    render(<ArtifactCanvas />);
    open({ language: 'html', code: PAGE });
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['კოდი', 'გადახედვა']);
    for (const name of ['კოპირება', 'ჩამოტვირთვა', 'დახურვა']) expect(screen.getByRole('button', { name })).toBeTruthy();
  });
});

describe('the preview cannot be navigated away', () => {
  it('a second load puts the original document back in a fresh frame, then gives up after MAX_PREVIEW_RESETS', () => {
    const { container } = render(<ArtifactCanvas locale="en" />);
    open({ language: 'html', code: PAGE });
    const first = container.querySelector('iframe')!;
    fireEvent.load(first); // our own srcdoc
    expect(container.querySelector('iframe')).toBe(first);
    expect(screen.queryByText(/tried to leave the preview/)).toBeNull();

    fireEvent.load(first); // the page navigated itself
    const second = container.querySelector('iframe')!;
    expect(second).not.toBe(first);
    expect(second.getAttribute('sandbox')).toBe('allow-scripts');
    expect(second.getAttribute('srcdoc')).toContain(PREVIEW_CSP);
    expect(screen.getByText(/tried to leave the preview/)).toBeTruthy();

    let frame = second;
    for (let i = 1; i <= MAX_PREVIEW_RESETS; i++) {
      fireEvent.load(frame);
      fireEvent.load(frame);
      frame = container.querySelector('iframe')!;
    }
    expect(container.querySelector('iframe')).toBeNull();
    expect(screen.getByText(/Preview stopped/)).toBeTruthy();
  });
});

describe('phone sheet', () => {
  it('is a modal dialog at the bottom; the backdrop closes it', async () => {
    desktop = false;
    const { container } = render(<ArtifactCanvas locale="en" />);
    open({ language: 'svg', code: '<svg/>' });
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(container.querySelector('aside')).toBeNull();
    expect(container.querySelector('[data-artifact-canvas="phone"]')!.className).toContain('fixed');
    expect(within(dialog).getByRole('tab', { name: 'Preview' })).toBeTruthy();
    fireEvent.click(container.querySelector('[data-artifact-canvas="phone"] > [aria-hidden="true"]')!);
    expect(useArtifactStore.getState().open).toBe(false);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

describe('the myavatar:open-artifact event', () => {
  it('opens a valid detail and ignores an invalid one', () => {
    render(<ArtifactCanvas locale="en" />);
    act(() => {
      window.dispatchEvent(new CustomEvent(OPEN_ARTIFACT_EVENT, { detail: { language: 'exe', code: 'MZ' } }));
    });
    expect(useArtifactStore.getState().open).toBe(false);
    expect(warnSpy.mock.calls.some(([m]) => /myavatar:open-artifact ignored/.test(String(m)))).toBe(true);

    act(() => {
      window.dispatchEvent(new CustomEvent(OPEN_ARTIFACT_EVENT, { detail: { title: 'Voice page', language: 'html', code: '<p>hi</p>' } }));
    });
    expect(useArtifactStore.getState().current).toMatchObject({ title: 'Voice page', language: 'html', code: '<p>hi</p>' });
    expect(screen.getByRole('heading', { name: 'Voice page' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Preview' }).getAttribute('aria-selected')).toBe('true');
  });

  it('stops listening once unmounted', () => {
    const { unmount } = render(<ArtifactCanvas locale="en" />);
    unmount();
    window.dispatchEvent(new CustomEvent(OPEN_ARTIFACT_EVENT, { detail: { language: 'html', code: '<p>x</p>' } }));
    expect(useArtifactStore.getState().open).toBe(false);
  });
});
