/**
 * @jest-environment jsdom
 *
 * The 3D model form is shown and locked (the owner's PRD, 2026-10-18; lib/studio/model3dLock). Pinned: the form says
 * „მალე“ and why, every field in it is disabled, Create is disabled, and nothing is posted — not even when the
 * description arrives from the chat, which used to make Create usable at once.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

jest.mock('../../lib/observability/report-error', () => ({ reportError: jest.fn() }));
jest.mock('next/dynamic', () => () => function MockGlbViewer(): ReactNode { return null; });

import { ServiceParamsPanel } from './ServiceParamsPanel';
import { MODEL3D_LOCKED } from '../../lib/studio/model3dLock';

let fetchMock: jest.Mock;
beforeEach(() => {
  fetchMock = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }) as unknown as Response);
  (globalThis as { fetch: unknown }).fetch = fetchMock;
});

test('the lock is on', () => {
  expect(MODEL3D_LOCKED).toBe(true);
});

test('the form says „მალე“, every field is disabled and Create posts nothing', () => {
  render(<ServiceParamsPanel service="model3d" locale="ka" onClose={() => {}} prefill={{ topic: 'ძველი თიხის დოქი' }} />);
  const note = screen.getByTestId('model3d-locked');
  expect(note.textContent).toContain('მალე');
  expect(note.textContent).toContain('3D მოდელები მალე ჩაირთვება');
  const form = screen.getByTestId('model3d-form') as HTMLFieldSetElement;
  expect(form.disabled).toBe(true);
  for (const el of form.querySelectorAll<HTMLButtonElement | HTMLTextAreaElement | HTMLInputElement>('button, textarea, input')) {
    expect(el.matches(':disabled')).toBe(true);
  }
  const create = screen.getByTestId('model3d-generate') as HTMLButtonElement;
  expect(create.disabled).toBe(true);
  fireEvent.click(create);
  expect(fetchMock.mock.calls.filter(([u]) => String(u).includes('/api/v2/model3d'))).toHaveLength(0);
});

test('English and Russian say it too', () => {
  const { rerender } = render(<ServiceParamsPanel service="model3d" locale="en" onClose={() => {}} />);
  expect(screen.getByTestId('model3d-locked').textContent).toContain('coming soon');
  rerender(<ServiceParamsPanel service="model3d" locale="ru" onClose={() => {}} />);
  expect(screen.getByTestId('model3d-locked').textContent).toContain('скоро');
});
