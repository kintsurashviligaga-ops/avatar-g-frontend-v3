/**
 * components/studio/ServiceSearchResults — the services the sidebar search finds (§51).
 * Pinned: a usable service is a button that hands the SERVICE (not just its tool) to the caller; a coming-soon service
 * is listed as unavailable and opens nothing; labels are in the UI language; no results, no block.
 */
import { fireEvent, render } from '@testing-library/react';
import { ServiceSearchResults } from './ServiceSearchResults';
import { getService, searchServices } from '@/lib/catalog/services';

const ROW = 'row';

test('lists what the catalog search finds, in the UI language, and opens the service that was clicked', () => {
  const onOpen = jest.fn();
  const services = searchServices('მუს');
  const { container } = render(<ServiceSearchResults services={services} lang="ka" onOpen={onOpen} rowClassName={ROW} />);
  expect(container.textContent).toContain('სერვისები');
  expect(container.textContent).toContain('მუსიკის შექმნა');
  expect(container.textContent).toContain('მუსიკალური ვიდეო');
  fireEvent.click(container.querySelector('[data-service="video.music-video"]') as HTMLElement);
  expect(onOpen).toHaveBeenCalledTimes(1);
  expect(onOpen.mock.calls[0][0].id).toBe('video.music-video');
});

test('a coming-soon service is shown as unavailable and opens nothing', () => {
  const onOpen = jest.fn();
  const { container } = render(<ServiceSearchResults services={searchServices('remix')} lang="en" onOpen={onOpen} rowClassName={ROW} />);
  const soon = container.querySelector('[data-service="music.remix"]') as HTMLElement;
  expect(soon.tagName).toBe('DIV');
  expect(soon.getAttribute('aria-disabled')).toBe('true');
  expect(soon.textContent).toContain('Soon');
  fireEvent.click(soon);
  expect(onOpen).not.toHaveBeenCalled();
  expect((container.querySelector('[data-service="video.remix"]') as HTMLElement).tagName).toBe('BUTTON');
});

test('Russian labels, and the row style of the menu', () => {
  const { container } = render(<ServiceSearchResults services={[getService('voice.dubbing')!]} lang="ru" onOpen={() => {}} rowClassName={ROW} />);
  expect(container.textContent).toContain('Сервисы');
  expect(container.textContent).toContain('Дубляж');
  expect(container.querySelector('button')?.className).toBe(ROW);
});

test('nothing found → nothing drawn', () => {
  const { container } = render(<ServiceSearchResults services={[]} lang="ka" onOpen={() => {}} rowClassName={ROW} />);
  expect(container.innerHTML).toBe('');
});
