/**
 * @jest-environment jsdom
 *
 * The 3D chat card with a mocked /api/studio3d: the price is shown before the tap, a text request draws the reference
 * and waits for "Yes, build", the steps show ✓ / now / next, failures say the credits came back, and a finished model
 * opens the viewer with the GLB download.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { act, fireEvent, render, screen } from '@testing-library/react';

jest.mock('next/dynamic', () => () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createElement } = require('react') as typeof import('react');
  return (p: { url: string }) => createElement('div', { 'data-testid': 'viewer', 'data-url': p.url });
});

import Studio3dCard, { priceLine } from './Studio3dCard';

const view = (over: Record<string, unknown>) => ({ ok: true, id: '00000000-0000-4000-8000-000000000001', mode: 'text', step: 'awaiting_approval', quote: [{ action: 'reference', credits: 8 }, { action: 'model', credits: 14 }], ...over });
const res = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as unknown as Response;

it('prices every step before the tap', () => {
  expect(priceLine('text', false, 'en')).toBe('✦8 + ✦14 = ✦22 · downloads and video are free');
  expect(priceLine('image', true, 'en')).toBe('✦20 · downloads and video are free');
  expect(priceLine('retexture', false, 'ka')).toBe('✦8 + ✦13 = ✦21 · გადმოწერა და ვიდეო უფასოა');
  render(<Studio3dCard locale="en" />);
  expect(screen.getByText(/✦8 \+ ✦14 = ✦22/)).toBeTruthy();
  fireEvent.click(screen.getByRole('checkbox'));
  expect(screen.getByText(/✦8 \+ ✦20 = ✦28/)).toBeTruthy();
});

it('text → reference → approve sends the right calls', async () => {
  const calls: any[] = [];
  const fetchImpl = jest.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if (url === '/api/studio3d') return res(view({ referenceUrl: 'https://signed/ref.png' }), 201);
    return res(view({ step: 'shape' }));
  }) as unknown as typeof fetch;
  render(<Studio3dCard locale="en" fetchImpl={fetchImpl} />);
  const send = screen.getByRole('button', { name: '3D Studio' }) as HTMLButtonElement;
  expect(send.disabled).toBe(true);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'a red vintage car' } });
  await act(async () => { fireEvent.click(send); });
  expect(JSON.parse(calls[0].init.body)).toEqual({ mode: 'text', prompt: 'a red vintage car', detail: 'standard' });
  expect(screen.getByRole('img', { name: 'Drawing the reference picture' }).getAttribute('src')).toBe('https://signed/ref.png');
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Yes, build the 3D model · ✦14/ })); });
  expect(calls[1].url).toBe('/api/studio3d/00000000-0000-4000-8000-000000000001');
  expect(JSON.parse(calls[1].init.body)).toEqual({ action: 'approve' });
  const items = screen.getAllByRole('listitem');
  expect(items.map((li) => li.dataset.state)).toEqual(['done', 'done', 'done', 'done', 'now', 'next', 'next']);
});

it('image mode needs the attached photo', () => {
  render(<Studio3dCard locale="en" initial={{ imageUrl: 'https://zwksnayknzggdcenqqxy.supabase.co/storage/v1/object/sign/u/p.png' }} />);
  expect(screen.getByRole('tab', { name: 'From a picture' }).getAttribute('aria-selected')).toBe('true');
  expect((screen.getByRole('button', { name: '3D Studio' }) as HTMLButtonElement).disabled).toBe(false);
  expect(screen.queryByRole('tab', { name: 'Retexture' })).toBeNull();
});

it('a failure says the credits came back', () => {
  render(<Studio3dCard locale="ka" job={view({ mode: 'image', step: 'failed', error: 'worker_failed' }) as any} />);
  expect(screen.getByRole('alert').textContent).toContain('კრედიტი დაბრუნდა');
});

it('a finished model opens the viewer and the GLB download', () => {
  render(<Studio3dCard locale="en" job={view({ mode: 'image', step: 'done', model: { glbUrl: 'https://signed/model.glb' } }) as any} />);
  expect(screen.getByTestId('viewer').dataset.url).toBe('https://signed/model.glb');
  expect(screen.getByRole('link', { name: 'Download GLB' }).getAttribute('href')).toBe('/api/studio3d/00000000-0000-4000-8000-000000000001/download?format=glb');
  expect(screen.getAllByRole('listitem').every((li) => li.dataset.state === 'done')).toBe(true);
});

it('server refusals are shown in words', async () => {
  const fetchImpl = (async () => res({ ok: false, error: 'user_busy' }, 429)) as unknown as typeof fetch;
  render(<Studio3dCard locale="en" fetchImpl={fetchImpl} />);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'a lamp' } });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '3D Studio' })); });
  expect(screen.getByRole('alert').textContent).toBe('One model is already being built — wait for it to finish');
});
