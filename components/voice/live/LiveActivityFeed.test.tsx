/**
 * The call screen's activity strip: what is searched (with its pages as links that open in a new tab), each tool
 * step and its state, generations still rendering — and nothing at all when there is nothing to show.
 */
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import LiveActivityFeed, { liveCurrentStep } from './LiveActivityFeed';
import type { LiveActivityItem } from './liveActivity';

const SEARCH: LiveActivityItem = {
  id: 'search:1', kind: 'search', state: 'done', queries: ['weather Tbilisi'],
  sources: [{ title: 'weather.ge', uri: 'https://weather.ge/tbilisi' }, { title: 'bbc.com', uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/x' }],
};

test('nothing to show → renders nothing', () => {
  const { container } = render(<LiveActivityFeed activity={[]} locale="en" />);
  expect(container).toBeEmptyDOMElement();
});

test('a finished search: its query and its pages (new tab, no referrer); a grounding redirect shows the publisher', () => {
  render(<LiveActivityFeed activity={[SEARCH]} locale="en" />);
  expect(screen.getByRole('group', { name: 'What the agent is doing' })).toHaveTextContent('Searched the web');
  expect(screen.getByText(/‘weather Tbilisi’/)).toBeInTheDocument();
  const link = screen.getByRole('link', { name: /weather\.ge/ });
  expect(link).toHaveAttribute('href', 'https://weather.ge/tbilisi');
  expect(link).toHaveAttribute('target', '_blank');
  expect(link.getAttribute('rel')).toMatch(/noopener/);
  expect(screen.getByRole('link', { name: /bbc\.com/ })).toBeInTheDocument();
});

test('tool steps, newest first, in Georgian; a failed step says so', () => {
  render(
    <LiveActivityFeed
      locale="ka"
      activity={[
        { id: 'c1', kind: 'tool', state: 'done', name: 'prepare_generation' },
        { id: 'c2', kind: 'tool', state: 'running', name: 'show_code' },
        { id: 'c3', kind: 'tool', state: 'failed', name: 'open_studio' },
      ]}
    />,
  );
  const rows = screen.getAllByText(/სტუდია|კოდს/).map((n) => n.textContent);
  expect(rows[0]).toMatch(/სტუდიას ვხსნი — ვერ შესრულდა/);
  expect(rows[1]).toMatch(/კოდს ეკრანზე ვწერ…/);
  expect(rows[2]).toMatch(/სტუდია მზადაა/);
});

test('the newest step is the one the agent is on NOW: lifted, with a running bar while it runs; older ones step back', () => {
  render(
    <LiveActivityFeed
      locale="en"
      activity={[
        { id: 'c1', kind: 'tool', state: 'done', name: 'get_screen_state' },
        { id: 'c2', kind: 'tool', state: 'running', name: 'chat_send' },
      ]}
    />,
  );
  const rows = Array.from(document.querySelectorAll('[data-kind="tool"]'));
  expect(rows[0]).toHaveAttribute('data-now', 'true');
  expect(rows[0]).toHaveTextContent('Writing in the chat…');
  expect(rows[0]!.querySelector('[data-mark="running"]')).not.toBeNull();
  expect(rows[0]!.querySelector('[data-testid="live-step-progress"]')).not.toBeNull();
  expect(rows[0]!.className).toMatch(/ring-app-accent/);
  expect(rows[1]).not.toHaveAttribute('data-now');
  expect(rows[1]!.className).toMatch(/opacity-70/);
  expect(rows[1]!.querySelector('[data-mark="done"]')).not.toBeNull();
  expect(rows[1]!.querySelector('[data-testid="live-step-progress"]')).toBeNull();
});

test('liveCurrentStep: the running step (with its query), else the newest with how it ended; null before any', () => {
  expect(liveCurrentStep([], 'en')).toBeNull();
  expect(liveCurrentStep([
    { id: 'c1', kind: 'tool', state: 'running', name: 'prepare_generation' },
    { id: 'c2', kind: 'tool', state: 'done', name: 'open_url' },
  ], 'en')).toEqual({ id: 'c1', kind: 'tool', name: 'prepare_generation', state: 'running', text: 'Preparing the studio…' });
  expect(liveCurrentStep([{ id: 'c2', kind: 'tool', state: 'done', name: 'open_url' }], 'ka'))
    .toMatchObject({ state: 'done', text: 'ბმული ეკრანზეა — შეეხე' });
  expect(liveCurrentStep([{ id: 's', kind: 'search', state: 'running', queries: ['კატები'] }], 'ru'))
    .toMatchObject({ kind: 'search', state: 'running', text: 'Ищу в интернете: ‘კატები’' });
  expect(liveCurrentStep([{ id: 'x', kind: 'tool', state: 'failed', name: 'show_code' }], 'en'))
    .toMatchObject({ state: 'failed', text: 'Putting code on screen — Didn’t work' });
});

test('generations still rendering show their progress; a queued one says so', () => {
  render(<LiveActivityFeed activity={[]} locale="en" jobs={[{ id: 'j1', label: 'Video: sunset', pct: 42 }, { id: 'j2', label: 'Music', pct: null }]} />);
  expect(screen.getByText('In progress')).toBeInTheDocument();
  expect(screen.getByText('Video: sunset')).toBeInTheDocument();
  expect(screen.getByText('42%')).toBeInTheDocument();
  expect(screen.getByText('Queued')).toBeInTheDocument();
});
