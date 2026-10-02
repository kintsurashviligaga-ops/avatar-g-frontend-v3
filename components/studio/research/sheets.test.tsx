/**
 * @jest-environment jsdom
 *
 * The thread card, the start sheet (the price on the button, nothing charged before the press) and the Connectors sheet
 * (Local files works; four „Soon" rows with no connect button), against a mocked network.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ConnectorsSheet } from './ConnectorsSheet';
import { ResearchCard } from './ResearchCard';
import { StartSheet } from './StartSheet';
import { getResearchState, researchActions, resetResearchStoreForTests } from './store';
import { resetEnsureJobForTests } from './useEnsureJob';
import { done, job } from './testing';

type Handler = (url: string, init?: RequestInit) => { status?: number; body: unknown } | undefined;
const calls: Array<{ url: string; method: string; body: unknown }> = [];

function network(handler: Handler) {
  calls.length = 0;
  (global as unknown as { fetch: typeof fetch }).fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push({ url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : null });
    const r = handler(url, init) ?? { status: 404, body: {} };
    const status = r.status ?? 200;
    return { status, ok: status < 400, json: async () => r.body } as Response;
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  resetResearchStoreForTests();
  resetEnsureJobForTests();
  document.documentElement.dataset.authed = '1';
});
afterEach(() => jest.restoreAllMocks());

const FILES = { files: [{ id: 'f1', name: 'notes.pdf', mimeType: 'application/pdf', chars: 5200, bytes: 90000, truncated: false, createdAt: null }], limits: { maxFiles: 10, maxFileChars: 30000, maxAttach: 5, maxContextChars: 40000 } };

describe('ResearchCard', () => {
  test('running: progress, the "you can close this" line, searches and elapsed time', () => {
    network(() => undefined);
    const threeMinAgo = new Date(Date.now() - 3 * 60_000 - 5_000).toISOString();
    act(() => researchActions.upsertJob(job({ id: 'r', startedAt: threeMinAgo, createdAt: threeMinAgo, progress: { summary: 'Reading three registries', searches: 14 } })));
    render(<ResearchCard id="r" locale="en" />);
    const card = screen.getByTestId('research-card');
    expect(card.getAttribute('data-state')).toBe('running');
    expect(card.textContent).toContain('Researching…');
    expect(card.textContent).toContain('Reading three registries');
    expect(card.textContent).toContain('14 searches');
    expect(card.textContent).toContain('You can close this');
    expect(card.textContent).toMatch(/3 min/);
  });

  test('cancel is two steps (a nearly done report is not lost to a stray tap) and calls the cancel route', async () => {
    network((url) => (url.endsWith('/cancel') ? { body: { job: job({ id: 'r', status: 'canceled', errorCode: 'user_canceled', refunded: true }) } } : undefined));
    act(() => researchActions.upsertJob(job({ id: 'r' })));
    render(<ResearchCard id="r" locale="en" />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(calls).toHaveLength(0);
    expect(screen.getByText('Stop this research? Your credits go back.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Keep going' }));
    expect(calls).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Stop it' }));
    await waitFor(() => expect(screen.getByTestId('research-card').getAttribute('data-state')).toBe('canceled'));
    expect(calls[0]).toMatchObject({ method: 'POST' });
    expect(calls[0]!.url).toContain('/api/research/r/cancel');
    expect(screen.getByTestId('research-card').textContent).toContain('Research canceled. Your credits were returned.');
  });

  test('ready: sources count + Open, which opens the report', () => {
    network(() => undefined);
    act(() => researchActions.upsertJob(done({ id: 'd', sourcesCount: 7 })));
    render(<ResearchCard id="d" locale="en" />);
    expect(screen.getByTestId('research-card').getAttribute('data-state')).toBe('ready');
    expect(screen.getByTestId('research-card').textContent).toContain('Report ready · 7 sources');
    fireEvent.click(screen.getByTestId('research-card-open'));
    expect(getResearchState().viewer).toBe('d');
  });

  test('failed and refunded: what happened and what happened to the money, in Georgian', () => {
    network(() => undefined);
    act(() => researchActions.upsertJob(job({ id: 'x', status: 'failed', errorCode: 'provider_failed', refunded: true })));
    render(<ResearchCard id="x" locale="ka" />);
    expect(screen.getByTestId('research-card').textContent).toContain('კრედიტი დაგიბრუნდა');
  });

  test('after a reload the job is fetched by id; a job the server does not know says so', async () => {
    network((url) => (url.includes('/api/research/known') ? { body: { job: done({ id: 'known' }) } } : { status: 404, body: { error: 'not_found' } }));
    const { unmount } = render(<ResearchCard id="known" locale="en" />);
    expect(screen.getByTestId('research-card').getAttribute('data-state')).toBe('loading');
    await waitFor(() => expect(screen.getByTestId('research-card').getAttribute('data-state')).toBe('ready'));
    unmount();
    render(<ResearchCard id="gone" locale="en" />);
    await waitFor(() => expect(screen.getByTestId('research-card').getAttribute('data-state')).toBe('missing'));
    expect(screen.getByTestId('research-card').textContent).toContain('could not find');
  });
});

describe('StartSheet — nothing is charged before the press, and the price is on the button', () => {
  const caps = { available: true, credits: 120, filesAvailable: true, maxActive: 1 };
  const open = async (prompt = 'A question', authed = true) => {
    act(() => {
      researchActions.openStart(prompt);
    });
    await act(async () => { researchActions.setCredits(0); });
    render(<StartSheet locale="en" authed={authed} />);
  };
  beforeEach(() => {
    // seed capabilities the way the server would have answered them
    network((url, init) => {
      if (url.includes('/api/research/capabilities')) return { body: caps };
      if (url.includes('/api/connectors/files')) return { body: FILES };
      if (url.includes('/api/research/start')) {
        const b = JSON.parse(String(init?.body));
        return { status: 201, body: { job: job({ id: 'started', prompt: b.prompt }), replayed: false } };
      }
      return undefined;
    });
  });

  test('the exact price on the button, in no sentence, and opening the sheet orders nothing', async () => {
    await act(async () => { await researchActions.ensureCapabilities(); });
    await open('How will EV adoption evolve?');
    const btn = await screen.findByTestId('research-start-button');
    expect(btn.getAttribute('data-price')).toBe('120');
    expect(btn.getAttribute('aria-label')).toBe('Start research — 120 credits');
    const dialog = screen.getByRole('dialog');
    expect((dialog.textContent ?? '').replace(btn.textContent ?? '', '')).not.toMatch(/120|\d\s*credits?/i);
    expect((screen.getByTestId('research-prompt') as HTMLTextAreaElement).value).toBe('How will EV adoption evolve?');
    expect(calls.some((c) => c.url.includes('/start'))).toBe(false);
  });

  test('the press sends the question with the number the user SAW, a request id and the language — and announces the job', async () => {
    await act(async () => { await researchActions.ensureCapabilities(); });
    const heard = jest.fn();
    window.addEventListener('research:started', heard);
    await open('How will EV adoption evolve?');
    fireEvent.click(await screen.findByTestId('research-start-button'));
    await waitFor(() => expect(heard).toHaveBeenCalledTimes(1));
    window.removeEventListener('research:started', heard);
    const start = calls.find((c) => c.url.includes('/api/research/start'))!;
    expect(start.method).toBe('POST');
    expect(start.body).toMatchObject({ prompt: 'How will EV adoption evolve?', confirmedCredits: 120, locale: 'en', fileIds: [] });
    expect(String((start.body as { requestId: string }).requestId)).toMatch(/^[A-Za-z0-9_-]{8,100}$/);
    expect(getResearchState().start).toBeNull();
    expect(getResearchState().jobs.started).toBeDefined();
  });

  test('a question shorter than three characters cannot be started', async () => {
    await act(async () => { await researchActions.ensureCapabilities(); });
    await open('hi');
    const btn = (await screen.findByTestId('research-start-button')) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.change(screen.getByTestId('research-prompt'), { target: { value: 'hello there' } });
    expect(btn.disabled).toBe(false);
  });

  test('attached documents are listed from Connectors and sent by id (at most the server\'s attach limit)', async () => {
    await act(async () => { await researchActions.ensureCapabilities(); });
    await open('Use my notes');
    const chip = await screen.findByRole('button', { name: /notes\.pdf/ });
    expect(chip.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(chip);
    expect(chip.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByTestId('research-start-button'));
    await waitFor(() => expect(calls.some((c) => c.url.includes('/api/research/start'))).toBe(true));
    expect(calls.find((c) => c.url.includes('/api/research/start'))!.body).toMatchObject({ fileIds: ['f1'] });
  });

  test('a refusal shows the server\'s sentence, keeps the sheet and the question, and offers top-up for missing credits', async () => {
    await act(async () => { await researchActions.ensureCapabilities(); });
    network((url) => {
      if (url.includes('/api/research/start')) return { status: 402, body: { error: 'insufficient_credits', message: 'You do not have enough credits for Deep Research. Top up and try again.' } };
      if (url.includes('/api/connectors/files')) return { body: FILES };
      return undefined;
    });
    const topUp = jest.fn();
    window.addEventListener('myavatar:open-credits', topUp);
    await open('Too expensive');
    fireEvent.click(await screen.findByTestId('research-start-button'));
    const err = await screen.findByTestId('research-start-error');
    expect(err.textContent).toContain('not have enough credits');
    expect(getResearchState().start).not.toBeNull();
    expect((screen.getByTestId('research-prompt') as HTMLTextAreaElement).value).toBe('Too expensive');
    fireEvent.click(within(err).getByRole('button', { name: 'Top up' }));
    window.removeEventListener('myavatar:open-credits', topUp);
    expect(topUp).toHaveBeenCalledTimes(1);
  });

  test('price_changed shows the new number on the button and starts nothing', async () => {
    await act(async () => { await researchActions.ensureCapabilities(); });
    network((url) => {
      if (url.includes('/api/research/start')) return { status: 409, body: { error: 'price_changed', credits: 150, message: 'The price changed — review it and confirm again. You have not been charged.' } };
      if (url.includes('/api/connectors/files')) return { body: FILES };
      return undefined;
    });
    await open('Q for a new price');
    fireEvent.click(await screen.findByTestId('research-start-button'));
    await screen.findByTestId('research-start-error');
    await waitFor(() => expect(screen.getByTestId('research-start-button').getAttribute('data-price')).toBe('150'));
    expect(getResearchState().jobs).toEqual({});
  });

  test('a guest is sent to sign-in and nothing is sent', async () => {
    await act(async () => { await researchActions.ensureCapabilities(); });
    const heard = jest.fn();
    window.addEventListener('myavatar:auth-required', heard);
    await open('A question', false);
    fireEvent.click(await screen.findByTestId('research-start-button'));
    window.removeEventListener('myavatar:auth-required', heard);
    expect(heard).toHaveBeenCalledTimes(1);
    expect(calls.some((c) => c.url.includes('/api/research/start'))).toBe(false);
  });
});

describe('ConnectorsSheet', () => {
  const states = {
    connectors: [
      { id: 'local_files', label: 'Local files', status: 'ready', fileCount: 1 },
      { id: 'google_drive', label: 'Google Drive', status: 'soon' },
      { id: 'onedrive', label: 'OneDrive', status: 'soon' },
      { id: 'notion', label: 'Notion', status: 'soon' },
      { id: 'dropbox', label: 'Dropbox', status: 'soon' },
    ],
    limits: FILES.limits,
  };

  test('Local files works (list + add); the other four are "Soon" and have nothing to press', async () => {
    network((url) => (url.includes('/api/connectors/files') ? { body: FILES } : url.includes('/api/connectors') ? { body: states } : undefined));
    render(<ConnectorsSheet locale="en" authed />);
    expect(await screen.findByTestId('connector-files')).toBeTruthy();
    expect(screen.getByTestId('connector-local').textContent).toContain('Local files');
    expect(screen.getByTestId('connector-files').textContent).toContain('notes.pdf');
    expect(screen.getByTestId('connector-add').hasAttribute('disabled')).toBe(false);
    const soon = screen.getAllByTestId('connector-soon');
    expect(soon.map((s) => s.textContent)).toEqual(['Google DriveSoon', 'OneDriveSoon', 'NotionSoon', 'DropboxSoon']);
    for (const row of soon) expect(row.querySelectorAll('button, a, [role="button"]')).toHaveLength(0);
  });

  test('a text file is read in the browser and its TEXT is what is posted', async () => {
    network((url, init) => {
      if (url.includes('/api/connectors/files') && init?.method === 'POST') {
        const b = JSON.parse(String(init.body));
        return { status: 201, body: { file: { id: 'n1', name: b.name, mimeType: b.mimeType, chars: b.text.length, bytes: b.bytes, truncated: false, createdAt: null }, limits: FILES.limits } };
      }
      if (url.includes('/api/connectors/files')) return { body: { files: [], limits: FILES.limits } };
      if (url.includes('/api/connectors')) return { body: states };
      return undefined;
    });
    render(<ConnectorsSheet locale="en" authed />);
    await screen.findByTestId('connector-add');
    const file = new File(['Compare the three markets.'], 'brief.txt', { type: 'text/plain' });
    Object.defineProperty(file, 'text', { value: async () => 'Compare the three markets.' });
    fireEvent.change(screen.getByTestId('connector-file-input'), { target: { files: [file] } });
    await waitFor(() => expect(screen.getByTestId('connector-files').textContent).toContain('brief.txt'));
    const post = calls.find((c) => c.method === 'POST')!;
    expect(post.body).toMatchObject({ name: 'brief.txt', text: 'Compare the three markets.', locale: 'en' });
  });

  test('a PDF goes through the extractor first; an unreadable one is explained and never posted', async () => {
    network((url, init) => {
      if (url.includes('/api/utils/extract-text')) return { body: { text: '' } };
      if (url.includes('/api/connectors/files') && init?.method === 'POST') return { status: 201, body: {} };
      if (url.includes('/api/connectors/files')) return { body: { files: [], limits: FILES.limits } };
      if (url.includes('/api/connectors')) return { body: states };
      return undefined;
    });
    render(<ConnectorsSheet locale="en" authed />);
    await screen.findByTestId('connector-add');
    const pdf = new File([new Uint8Array([37, 80, 68, 70, 45])], 'scan.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByTestId('connector-file-input'), { target: { files: [pdf] } });
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('could not find readable text'));
    expect(calls.some((c) => c.url.includes('/api/utils/extract-text'))).toBe(true);
    expect(calls.some((c) => c.method === 'POST' && c.url.includes('/api/connectors/files'))).toBe(false);
  });

  test('storage not switched on: said plainly, the four Soon rows still show', async () => {
    network((url) => {
      if (url.includes('/api/connectors/files')) return { status: 503, body: { error: 'unavailable' } };
      if (url.includes('/api/connectors')) return { body: { ...states, connectors: [{ id: 'local_files', label: 'Local files', status: 'unavailable' }, ...states.connectors.slice(1)] } };
      return undefined;
    });
    render(<ConnectorsSheet locale="en" authed />);
    expect((await screen.findByTestId('connector-local-unavailable')).textContent).toContain('not switched on');
    expect(screen.getAllByTestId('connector-soon')).toHaveLength(4);
    expect(screen.queryByTestId('connector-add')).toBeNull();
  });

  test('a guest is asked to sign in; the Soon rows are still shown', async () => {
    network((url) => (url.includes('/api/connectors') ? { body: states } : undefined));
    render(<ConnectorsSheet locale="en" authed={false} />);
    expect(await screen.findByText('Sign in to add files.')).toBeTruthy();
    expect(screen.queryByTestId('connector-add')).toBeNull();
    expect(screen.getAllByTestId('connector-soon')).toHaveLength(4);
  });

  test.each([
    ['ka', 'ლოკალური ფაილები', 'მალე'],
    ['ru', 'Локальные файлы', 'Скоро'],
  ] as const)('%s copy', async (locale, local, soon) => {
    network((url) => (url.includes('/api/connectors/files') ? { body: FILES } : url.includes('/api/connectors') ? { body: states } : undefined));
    render(<ConnectorsSheet locale={locale} authed />);
    await screen.findByTestId('connector-files');
    expect(screen.getByTestId('connector-local').textContent).toContain(local);
    expect(screen.getAllByTestId('connector-soon')[0]!.textContent).toContain(soon);
  });
});
