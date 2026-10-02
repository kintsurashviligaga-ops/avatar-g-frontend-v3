/**
 * @jest-environment jsdom
 *
 * EmptyState / Skeleton — the studio's two "not yet" faces:
 *  · an empty surface says one line and offers ONE next step, and that step can put the caret in the composer;
 *  · a loading surface is announced once as a status, while its blocks stay out of the accessibility tree;
 *  · the pulse is motion-safe only (prefers-reduced-motion keeps the blocks still).
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { MessageSquare } from 'lucide-react';
import { EmptyState, LOADING_LABEL, Skeleton, SkeletonList, WorkspaceSkeleton, focusComposer } from './EmptyState';

afterEach(() => { document.body.innerHTML = ''; });

describe('EmptyState', () => {
  it('shows its line and one action, and the action runs', () => {
    const onAction = jest.fn();
    render(<EmptyState icon={MessageSquare} line="No conversations yet" actionLabel="Start a chat" onAction={onAction} />);
    expect(screen.getByText('No conversations yet')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Start a chat' }));
    expect(onAction).toHaveBeenCalledTimes(1);
    // The icon is decoration: hidden from assistive tech, never announced as an unlabelled image.
    expect(screen.getByTestId('empty-state').querySelector('svg')?.closest('[aria-hidden="true"]')).toBeTruthy();
  });

  it('without an action it is a statement only — no empty button', () => {
    render(<EmptyState icon={MessageSquare} line="Nothing here yet" />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('the action is a 44 px target in both sizes', () => {
    const { rerender } = render(<EmptyState icon={MessageSquare} line="x" actionLabel="Go" onAction={() => {}} />);
    expect(screen.getByRole('button', { name: 'Go' }).className).toContain('min-h-[44px]');
    rerender(<EmptyState icon={MessageSquare} line="x" actionLabel="Go" onAction={() => {}} compact />);
    expect(screen.getByRole('button', { name: 'Go' }).className).toContain('min-h-[44px]');
  });
});

describe('Skeleton', () => {
  it('is hidden from assistive tech, token-coloured, and pulses only when motion is allowed', () => {
    const { container } = render(<Skeleton className="h-11 w-full" />);
    const block = container.firstElementChild as HTMLElement;
    expect(block.getAttribute('aria-hidden')).toBe('true');
    expect(block.className).toContain('bg-app-elevated');
    expect(block.className).toContain('motion-safe:animate-pulse');
    expect(block.className).not.toMatch(/(^|\s)animate-pulse/);
    expect(block.className).toContain('h-11 w-full'); // the caller's final size
  });

  it.each([
    ['ka', LOADING_LABEL.ka],
    ['en', LOADING_LABEL.en],
    ['ru', LOADING_LABEL.ru],
  ])('a list is ONE status announcing "loading" (%s), with its rows hidden', (locale, label) => {
    render(<SkeletonList count={4} locale={locale} />);
    const status = screen.getByRole('status');
    expect(status.textContent).toBe(label);
    expect(status.querySelectorAll('[data-skeleton]')).toHaveLength(4);
    status.querySelectorAll('[data-skeleton]').forEach((row) => expect(row.getAttribute('aria-hidden')).toBe('true'));
  });

  it('a workspace placeholder fills the panel instead of a blank strip', () => {
    render(<WorkspaceSkeleton locale="en" />);
    const panel = screen.getByRole('status');
    expect(panel.className).toContain('h-full');
    expect(panel.textContent).toBe('Loading…');
  });

  it('as a next/dynamic loader (no props) it speaks the page language', () => {
    document.documentElement.lang = 'ru';
    try {
      render(<WorkspaceSkeleton />);
      expect(screen.getByRole('status').textContent).toBe(LOADING_LABEL.ru);
    } finally {
      document.documentElement.lang = '';
    }
  });

  it("OmniStudio's two full-panel workspaces (montage editor, photo culling) load behind it, not a blank 96 px strip", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { join } = require('node:path') as typeof import('node:path');
    const omni = readFileSync(join(__dirname, '..', 'OmniStudio.tsx'), 'utf8');
    for (const name of ['SurgicalEditor', 'PhotoWorkspace']) {
      const line = omni.split('\n').find((l) => l.startsWith(`const ${name} = dynamic(`)) ?? '';
      expect(line).toContain('loading: () => <WorkspaceSkeleton />');
    }
  });
});

describe('focusComposer', () => {
  it('focuses the textarea inside the composer anchor, and reports it', () => {
    document.body.innerHTML = '<div data-tour="composer"><textarea></textarea></div><button>x</button>';
    expect(focusComposer()).toBe(true);
    expect(document.activeElement?.tagName).toBe('TEXTAREA');
  });

  it('does nothing off the studio (no composer) or while the box is disabled', () => {
    document.body.innerHTML = '<textarea></textarea>';
    expect(focusComposer()).toBe(false);
    document.body.innerHTML = '<div data-tour="composer"><textarea disabled></textarea></div>';
    expect(focusComposer()).toBe(false);
  });
});
