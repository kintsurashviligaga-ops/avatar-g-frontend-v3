/**
 * The call screen's activity strip: what is searched (with its pages as links that open in a new tab), each tool
 * step and its state, generations still rendering — and nothing at all when there is nothing to show.
 */
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import LiveActivityFeed from './LiveActivityFeed';
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

test('generations still rendering show their progress; a queued one says so', () => {
  render(<LiveActivityFeed activity={[]} locale="en" jobs={[{ id: 'j1', label: 'Video: sunset', pct: 42 }, { id: 'j2', label: 'Music', pct: null }]} />);
  expect(screen.getByText('In progress')).toBeInTheDocument();
  expect(screen.getByText('Video: sunset')).toBeInTheDocument();
  expect(screen.getByText('42%')).toBeInTheDocument();
  expect(screen.getByText('Queued')).toBeInTheDocument();
});
