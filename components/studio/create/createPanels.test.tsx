/**
 * The Interior designer's and the Photographer's panels, driven by their real hook (useShootStudio) with the network and the
 * photo decoder stood in for: the order of the pieces (the reference's), a carousel pick lighting its card and writing the
 * chip state, the price ON the button being the function the route charges with, and the sign-in / top-up gates that stop a
 * press before anything is submitted. No provider, no ledger, no spend.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { creditCostFor } from '@/lib/credits/pricing';
import { useCreditsBalance } from '@/store/useCreditsBalance';
import { useJobQueue } from '@/store/useJobQueue';
import { InteriorCreatePanel } from './InteriorCreatePanel';
import { PhotoshootCreatePanel } from './PhotoshootCreatePanel';
import { useShootStudio } from './newtools/useShootStudio';

jest.mock('./newtools/photoFiles', () => ({
  ...jest.requireActual('./newtools/photoFiles'),
  readPhoto: jest.fn(async () => ({ src: 'data:image/jpeg;base64,AAAA', w: 748, h: 1600 })),
}));

function Harness({ tool }: { tool: 'interior' | 'photoshoot' }) {
  const shoot = useShootStudio({ locale: 'en', notifyCredit: jest.fn(), onWalkthrough: jest.fn() });
  return tool === 'interior'
    ? <InteriorCreatePanel {...shoot.interiorProps} onClose={jest.fn()} onSwitchTool={jest.fn()} />
    : <PhotoshootCreatePanel {...shoot.photoshootProps} onClose={jest.fn()} onSwitchTool={jest.fn()} />;
}

const photo = () => new File([new Uint8Array(8)], 'room.jpg', { type: 'image/jpeg' });
let fetchMock: jest.Mock;
const events: string[] = [];
const onEvent = (e: Event) => events.push(e.type);
const renders = () => fetchMock.mock.calls.filter(([u]) => String(u).includes('nanobanana'));

beforeEach(() => {
  events.length = 0;
  document.documentElement.dataset.authed = '1';
  useCreditsBalance.setState({ balance: null, fetchedAt: 0, inflight: null });
  fetchMock = jest.fn(async (url: string) => {
    if (String(url).includes('/api/credits/balance')) return new Response(JSON.stringify({ balance: null }), { status: 200 });
    // A render that never answers: the tile stays in flight, nothing is "generated" in this test.
    return new Promise<Response>(() => undefined);
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  for (const n of ['myavatar:auth-required', 'myavatar:open-credits']) window.addEventListener(n, onEvent);
  window.localStorage.clear();
});
afterEach(() => {
  for (const n of ['myavatar:auth-required', 'myavatar:open-credits']) window.removeEventListener(n, onEvent);
  delete document.documentElement.dataset.authed;
  act(() => { for (const j of useJobQueue.getState().jobs) useJobQueue.getState().cancel(j.id); });
});

const before = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

test('interior: the reference\'s order — header · upload · room · styles · prompt · chips · Generate', () => {
  render(<Harness tool="interior" />);
  const order = ['interior-header', 'interior-upload', 'interior-room', 'interior-styles', 'interior-prompt', 'interior-chips', 'interior-generate']
    .map((id) => screen.getByTestId(id));
  for (let i = 0; i < order.length - 1; i++) expect({ i, ok: before(order[i]!, order[i + 1]!) }).toEqual({ i, ok: true });
  // The header names the tool, offers the switcher and a ✕; the upload card is dashed and says its limit.
  expect(within(screen.getByTestId('interior-header')).getByRole('button', { name: /Interior designer/ })).toBeTruthy();
  expect(screen.getByTestId('interior-close')).toBeTruthy();
  expect(screen.getByTestId('interior-dropzone').className).toMatch(/border-dashed/);
  expect(screen.getByTestId('interior-dropzone').textContent).toContain('up to 3');
  // At least 10 styles, each a radio.
  expect(within(screen.getByTestId('interior-styles')).getAllByRole('radio').length).toBeGreaterThanOrEqual(10);
});

test('photoshoot: header · upload · presets · camera · prompt · chips · Generate, with 12+ presets and the four camera groups', () => {
  render(<Harness tool="photoshoot" />);
  const order = ['photoshoot-header', 'photoshoot-upload', 'photoshoot-presets', 'photoshoot-camera', 'photoshoot-prompt', 'photoshoot-chips', 'photoshoot-generate']
    .map((id) => screen.getByTestId(id));
  for (let i = 0; i < order.length - 1; i++) expect({ i, ok: before(order[i]!, order[i + 1]!) }).toEqual({ i, ok: true });
  expect(within(screen.getByTestId('photoshoot-presets')).getAllByRole('radio').length).toBeGreaterThanOrEqual(12);
  for (const g of ['lens', 'light', 'angle', 'dof']) expect(screen.getByTestId(`photoshoot-${g}`)).toBeTruthy();
  expect(within(screen.getByTestId('photoshoot-lens')).getAllByRole('radio').map((r) => r.textContent)).toEqual(['Preset', '24 mm', '35 mm', '50 mm', '85 mm']);
});

test('a style pick lights its card and shows its Adds line; a second tap lets it go', () => {
  render(<Harness tool="interior" />);
  const card = () => screen.getByRole('radio', { name: 'Scandinavian' });
  expect(card().getAttribute('aria-checked')).toBe('false');
  expect(screen.getByTestId('interior-styles-adds').textContent).toMatch(/Pick a style/);
  fireEvent.click(card());
  expect(card().getAttribute('aria-checked')).toBe('true');
  expect(screen.getByTestId('interior-styles-adds').textContent).toBe('Adds: Pale oak, white walls, soft linen');
  fireEvent.click(card());
  expect(card().getAttribute('aria-checked')).toBe('false');
});

test('a photoshoot preset pick writes the aspect chip (its suggested shape); the chip stays free to change', () => {
  render(<Harness tool="photoshoot" />);
  const aspect = () => screen.getByTestId('photoshoot-chip-aspect').textContent;
  expect(aspect()).toBe('1:1');
  fireEvent.click(screen.getByRole('radio', { name: 'Headshot / LinkedIn' }));
  expect(aspect()).toBe('4:5');
  fireEvent.click(screen.getByRole('radio', { name: 'Real-estate exterior' }));
  expect(aspect()).toBe('3:2');
  fireEvent.click(screen.getByTestId('photoshoot-chip-aspect'));
  fireEvent.click(within(screen.getByTestId('photoshoot-options-aspect')).getByRole('radio', { name: '16:9' }));
  expect(aspect()).toBe('16:9');
});

test('the price ON the button is the image route\'s function: photos x renders x creditCostFor(image)', async () => {
  render(<Harness tool="interior" />);
  const btn = () => screen.getByTestId('interior-generate');
  expect(btn().getAttribute('data-price')).toBe(String(creditCostFor('image'))); // 2, one render
  fireEvent.click(screen.getByTestId('interior-chip-count'));
  expect(within(screen.getByTestId('interior-options-count')).getAllByRole('radio').map((r) => r.textContent)).toEqual([
    '1 image2 credits', '2 images4 credits', '3 images6 credits', '4 images8 credits', // every row carries its price
  ]);
  fireEvent.click(within(screen.getByTestId('interior-options-count')).getByRole('radio', { name: /3 images/ }));
  expect(btn().getAttribute('data-price')).toBe(String(creditCostFor('image', { count: 3 })));
  // Two photos x three renders = six renders = 12 credits.
  const input = screen.getByTestId('interior-file') as HTMLInputElement;
  await act(async () => { fireEvent.change(input, { target: { files: [photo(), photo()] } }); });
  await waitFor(() => expect(screen.getAllByTestId('interior-photo')).toHaveLength(2));
  expect(btn().getAttribute('data-price')).toBe(String(creditCostFor('image', { count: 6 })));
  expect(btn().getAttribute('data-price')).toBe('12');
});

test('a guest is sent to sign-in before ANYTHING is submitted — no request, no job', () => {
  document.documentElement.dataset.authed = '0';
  render(<Harness tool="interior" />);
  fireEvent.click(screen.getByRole('radio', { name: 'Industrial loft' }));
  fireEvent.click(screen.getByTestId('interior-generate'));
  expect(events).toEqual(['myavatar:auth-required']);
  expect(renders()).toHaveLength(0);
  expect(useJobQueue.getState().jobs).toHaveLength(0);
});

test('a short balance turns the button into Top up, and the tap opens the top-up instead of a render', () => {
  useCreditsBalance.setState({ balance: 0.1, fetchedAt: Date.now(), inflight: null }); // 0.1 GEL = 1 credit < 2
  render(<Harness tool="photoshoot" />);
  fireEvent.click(screen.getByRole('radio', { name: 'Food' }));
  const btn = screen.getByTestId('photoshoot-generate');
  expect(btn.textContent).toContain('Top up');
  expect(btn.getAttribute('data-price')).toBe('2'); // the price stays visible
  fireEvent.click(btn);
  expect(events).toEqual(['myavatar:open-credits']);
  expect(useJobQueue.getState().jobs).toHaveLength(0);
});

test('an empty form cannot be pressed (nothing to go on) and says what to add', () => {
  render(<Harness tool="interior" />);
  expect((screen.getByTestId('interior-generate') as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByTestId('interior-need').textContent).toMatch(/Add a photo, pick a style or describe the room/);
});

test('a signed-in press submits one job per render, each POSTing ONE reference and the studio ids — never a price', async () => {
  render(<Harness tool="interior" />);
  await act(async () => { fireEvent.change(screen.getByTestId('interior-file'), { target: { files: [photo()] } }); });
  await waitFor(() => expect(screen.getAllByTestId('interior-photo')).toHaveLength(1));
  fireEvent.click(screen.getByRole('radio', { name: 'Japandi' }));
  fireEvent.click(screen.getByTestId('interior-chip-count'));
  fireEvent.click(within(screen.getByTestId('interior-options-count')).getByRole('radio', { name: /2 images/ }));
  await act(async () => { fireEvent.click(screen.getByTestId('interior-generate')); });
  await waitFor(() => expect(renders()).toHaveLength(2));
  const bodies = renders().map(([, init]) => JSON.parse((init as RequestInit).body as string) as Record<string, unknown>);
  for (const [i, b] of bodies.entries()) {
    expect(b.studio).toEqual({ kind: 'interior', template: 'japandi', room: 'auto' });
    expect(b.referenceImage).toBe('data:image/jpeg;base64,AAAA');
    expect(b.aspectRatio).toBe('9:16'); // "Auto" = the photo's own shape (748x1600)
    expect(b.batchTile).toBe(i);
    expect(b.prompt).toBe('Interior design, Japandi');
    expect(Object.keys(b).filter((k) => /credit|price|cost|amount/i.test(k))).toEqual([]);
  }
  expect(new Set(bodies.map((b) => b.jobId)).size).toBe(2);
});
