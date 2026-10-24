/**
 * PooledVideo (§4.2.5, §4.2.6): a Library film card's <video> outlives the card. The same work's card gets the same
 * element back, its link untouched, so nothing is read again; a failed one is never handed back; a card only gives its
 * element a link once it is near the screen.
 */
import { act, fireEvent, render } from '@testing-library/react';
import { useRef } from 'react';
import { PooledVideo } from './PooledVideo';
import { keptVideoCount, releaseKeptVideosExcept } from '../../lib/library/videoPool';

const LINK = 'https://ours.supabase.co/storage/v1/object/sign/renders/f1.mp4?token=t#t=0.1';

// IntersectionObserver as a browser has it, driven by the test.
let observers: { cb: IntersectionObserverCallback; els: Element[]; options?: IntersectionObserverInit; gone: boolean }[] = [];
class FakeObserver {
  private entry: (typeof observers)[number];
  constructor(cb: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.entry = { cb, els: [], options, gone: false };
    observers.push(this.entry);
  }
  observe(el: Element) { this.entry.els.push(el); }
  disconnect() { this.entry.gone = true; }
  unobserve() {}
  takeRecords() { return []; }
}
function scrollNear() {
  for (const o of observers.filter((x) => !x.gone)) {
    o.cb(o.els.map((target) => ({ target, isIntersecting: true }) as IntersectionObserverEntry), o as unknown as IntersectionObserver);
  }
}

let load: jest.SpyInstance;
beforeEach(() => {
  observers = [];
  (window as unknown as { IntersectionObserver?: unknown }).IntersectionObserver = FakeObserver;
  load = jest.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  releaseKeptVideosExcept(null); // what the previous test's cards set aside
  load.mockClear();
});
afterEach(() => {
  delete (window as unknown as { IntersectionObserver?: unknown }).IntersectionObserver;
  load.mockRestore();
});

test('a card off screen gives its film no link until it comes within 300 px', async () => {
  const { container } = render(<PooledVideo poolKey="user-a:f1" src={LINK} className="h-full w-full object-cover" controls />);
  const video = container.querySelector('video')!;
  expect(video).toBeTruthy();
  expect(video.hasAttribute('src')).toBe(false); // nothing read yet
  expect(video.preload).toBe('metadata');
  expect(video.playsInline).toBe(true);
  expect(video.controls).toBe(true);
  expect(video.className).toBe('h-full w-full object-cover');
  expect(observers[0]!.options).toEqual({ rootMargin: '300px' });

  await act(async () => { scrollNear(); });
  expect(video.getAttribute('src')).toBe(LINK);
  expect(observers[0]!.gone).toBe(true); // watched no longer
});

test('without IntersectionObserver the link is given at once', () => {
  delete (window as unknown as { IntersectionObserver?: unknown }).IntersectionObserver;
  const { container } = render(<PooledVideo poolKey="user-a:f1" src={LINK} />);
  expect(container.querySelector('video')!.getAttribute('src')).toBe(LINK);
});

test('the same work\'s card gets the same element back, link untouched: nothing is read again', async () => {
  const first = render(<PooledVideo poolKey="user-a:f1" src={LINK} />);
  await act(async () => { scrollNear(); });
  const video = first.container.querySelector('video')!;
  first.unmount();
  expect(keptVideoCount()).toBe(1);
  expect(video.isConnected).toBe(false);

  const setAttribute = jest.spyOn(video, 'setAttribute');
  const onLoadedMetadata = jest.fn();
  const onLoadedData = jest.fn();
  // Loaded before it was set aside: its first frame and length are known.
  Object.defineProperty(video, 'readyState', { configurable: true, get: () => 2 });
  Object.defineProperty(video, 'duration', { configurable: true, get: () => 7.5 });
  observers = [];
  const again = render(<PooledVideo poolKey="user-a:f1" src={LINK} onLoadedMetadata={(v) => onLoadedMetadata(v.duration)} onLoadedData={onLoadedData} />);
  expect(again.container.querySelector('video')).toBe(video);
  expect(setAttribute).not.toHaveBeenCalledWith('src', expect.anything());
  expect(load).not.toHaveBeenCalled();
  expect(observers).toHaveLength(0); // it already has its link: no need to wait for the screen
  expect(onLoadedMetadata).toHaveBeenCalledWith(7.5); // told at once, as the event will not come again
  expect(onLoadedData).toHaveBeenCalledTimes(1);
  expect(keptVideoCount()).toBe(0);
});

test('another work\'s card never gets it, and a new link for the same work is given to the element', async () => {
  const first = render(<PooledVideo poolKey="user-a:f1" src={LINK} />);
  await act(async () => { scrollNear(); });
  const video = first.container.querySelector('video')!;
  first.unmount();

  const other = render(<PooledVideo poolKey="user-a:f2" src={LINK.replace('f1', 'f2')} />);
  expect(other.container.querySelector('video')).not.toBe(video);
  other.unmount();

  const fresh = LINK.replace('token=t', 'token=fresh');
  const again = render(<PooledVideo poolKey="user-a:f1" src={fresh} />);
  expect(again.container.querySelector('video')).toBe(video);
  await act(async () => { scrollNear(); });
  expect(video.getAttribute('src')).toBe(fresh);
});

test('a film that would not load says so, and its element is not handed back', async () => {
  const onError = jest.fn();
  const first = render(<PooledVideo poolKey="user-a:f1" src={LINK} onError={onError} />);
  await act(async () => { scrollNear(); });
  const video = first.container.querySelector('video')!;
  fireEvent.error(video);
  expect(onError).toHaveBeenCalledTimes(1);
  first.unmount();
  expect(keptVideoCount()).toBe(0);
  expect(video.hasAttribute('src')).toBe(false); // released

  const again = render(<PooledVideo poolKey="user-a:f1" src={LINK} />);
  expect(again.container.querySelector('video')).not.toBe(video);
});

test('events reach the latest handlers; the ref follows the element; a click plays through the card', async () => {
  function Card({ label }: { label: string }) {
    const ref = useRef<HTMLVideoElement | null>(null);
    return (
      <div>
        <PooledVideo poolKey="user-a:f1" src={LINK} videoRef={ref} onEnded={() => log.push(`ended ${label}`)} onClick={() => log.push(`click ${label} ${ref.current?.tagName}`)} />
      </div>
    );
  }
  const log: string[] = [];
  const view = render(<Card label="one" />);
  view.rerender(<Card label="two" />);
  const video = view.container.querySelector('video')!;
  fireEvent.click(video);
  fireEvent.ended(video);
  expect(log).toEqual(['click two VIDEO', 'ended two']);
  view.unmount();
  fireEvent.click(video); // set aside: no card to tell
  expect(log).toHaveLength(2);
});
