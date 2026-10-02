/**
 * @jest-environment jsdom
 *
 * The Connectors · Plugins · Skills hub against a mocked network: the tabs (ARIA pattern), the Connectors tab's honest states
 * (the two cards owned by other work — drawn when they render, a plain "not on yet" when they render nothing — and a Telegram
 * status with NO connect button), the Plugins switches (guest, table missing, optimistic save, coalescing, refusal), the menus'
 * hidden-tools hook, the Skills tab's states, and the host's account handling.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { resetResearchStoreForTests } from '@/components/studio/research/store';
import { PRIMARY_TOOLS } from '@/lib/studio/tools';
import { HubHost, HUB_OPEN_EVENT } from './HubHost';
import { HubSheet } from './HubSheet';
import { getHubState, hubActions, resetHubStoreForTests, setPluginSaveDelayForTests, useHiddenTools } from './store';
import { visibleToolIds } from '@/lib/plugins/catalog';

let mockWa: (p: { locale?: string }) => JSX.Element | null = () => null;
let mockPush: () => JSX.Element | null = () => null;
jest.mock('../../agent-g/WhatsAppLinkCard', () => ({ WhatsAppLinkCard: (p: { locale?: string }) => mockWa(p) }));
jest.mock('../../notifications/PushPermissionCard', () => ({ PushPermissionCard: () => mockPush() }));

type Reply = { status?: number; body: unknown } | undefined;
type Handler = (url: string, init?: RequestInit) => Reply | Promise<Reply>;
const calls: Array<{ url: string; method: string; body: unknown }> = [];

function network(handler: Handler) {
  calls.length = 0;
  (global as unknown as { fetch: typeof fetch }).fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push({ url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : null });
    const r = (await handler(url, init)) ?? { status: 404, body: {} };
    const status = r.status ?? 200;
    return { status, ok: status < 400, json: async () => r.body } as Response;
  }) as unknown as typeof fetch;
}

const CONNECTORS = {
  connectors: [
    { id: 'local_files', label: 'Local files', status: 'ready', fileCount: 0 },
    { id: 'google_drive', label: 'Google Drive', status: 'soon' },
    { id: 'onedrive', label: 'OneDrive', status: 'soon' },
    { id: 'notion', label: 'Notion', status: 'soon' },
    { id: 'dropbox', label: 'Dropbox', status: 'soon' },
  ],
  limits: { maxFiles: 10, maxFileChars: 30000, maxAttach: 5, maxContextChars: 40000 },
};
const channels = (telegramReady: boolean, whatsappReady = false) => ({
  status: 'success',
  data: {
    guest: false,
    channels: [{ type: 'whatsapp', status: 'connected', external_id: '+995555123456' }],
    runtime_status: [
      { type: 'web', connected: true, ready: true, note: 'Primary channel' },
      { type: 'telegram', connected: true, ready: telegramReady, note: telegramReady ? 'Webhook ready' : 'Token set, missing TELEGRAM_WEBHOOK_SECRET' },
      { type: 'whatsapp', connected: whatsappReady, ready: whatsappReady, note: 'Connected, missing WHATSAPP_APP_SECRET' },
    ],
  },
});
const CAPS = { available: true, credits: 120, filesAvailable: true, maxActive: 1 };

interface Server { plugins: unknown; putStatus: number; putBodies: unknown[]; tg: boolean; channelsFail: boolean; caps: unknown }
function server(over: Partial<Server> = {}): Server {
  const s: Server = { plugins: { available: true, disabledTools: [] }, putStatus: 200, putBodies: [], tg: true, channelsFail: false, caps: CAPS, ...over };
  network((url, init) => {
    if (url.includes('/api/plugins')) {
      if (init?.method === 'PUT') {
        const b = JSON.parse(String(init.body)) as { disabledTools: string[] };
        s.putBodies.push(b);
        if (s.putStatus !== 200) return { status: s.putStatus, body: { error: 'save_failed' } };
        s.plugins = { available: true, disabledTools: b.disabledTools };
        return { body: s.plugins };
      }
      return { body: s.plugins };
    }
    if (url.includes('/api/agent-g/channels')) return s.channelsFail ? { status: 500, body: { status: 'error' } } : { body: channels(s.tg) };
    if (url.includes('/api/research/capabilities')) return { body: s.caps };
    if (url.includes('/api/connectors/files')) return { body: { files: [], limits: CONNECTORS.limits } };
    if (url.includes('/api/connectors')) return { body: CONNECTORS };
    return undefined;
  });
  return s;
}

const puts = () => calls.filter((c) => c.method === 'PUT');

beforeEach(() => {
  resetHubStoreForTests();
  resetResearchStoreForTests();
  setPluginSaveDelayForTests(0);
  mockWa = () => null;
  mockPush = () => null;
  document.documentElement.dataset.authed = '1';
});
afterEach(() => jest.restoreAllMocks());

function openHub(tab: 'connectors' | 'plugins' | 'skills', props: { locale?: string; authed?: boolean } = {}) {
  act(() => hubActions.open(tab));
  return render(<HubSheet locale={props.locale ?? 'en'} authed={props.authed ?? true} />);
}

/** Both of the documents body's reads have landed (so no state update arrives after the test). */
async function documentsLoaded() {
  await screen.findByText(/No files yet\.|ფაილები ჯერ არ გაქვს\./);
}

async function signIn(owner = 'u1') {
  await act(async () => { hubActions.syncUser(owner); });
  await waitFor(() => expect(getHubState().plugins.status).not.toBe('loading'));
}

describe('the sheet and its tabs', () => {
  test('three tabs; click and arrow keys move the selection and the panel; one Tab stop', async () => {
    server();
    openHub('connectors');
    await documentsLoaded();
    const sheet = await screen.findByTestId('hub-sheet');
    expect(sheet.getAttribute('aria-label')).toBe('Connectors & plugins');
    const tabs = within(sheet).getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['Connectors', 'Plugins', 'Skills']);
    expect(tabs.map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false']);
    expect(tabs.map((t) => t.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);
    const panel = screen.getByRole('tabpanel');
    expect(panel.getAttribute('aria-labelledby')).toBe(tabs[0]!.id);

    fireEvent.click(screen.getByTestId('hub-tab-plugins'));
    expect(screen.getByTestId('hub-panel-plugins')).toBeTruthy();
    expect(screen.getByTestId('hub-tab-plugins').getAttribute('aria-selected')).toBe('true');

    fireEvent.keyDown(screen.getByTestId('hub-tab-plugins'), { key: 'ArrowRight' });
    expect(screen.getByTestId('hub-panel-skills')).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByTestId('hub-tab-skills'));
    fireEvent.keyDown(screen.getByTestId('hub-tab-skills'), { key: 'ArrowRight' });
    expect(screen.getByTestId('hub-panel-connectors')).toBeTruthy();
    fireEvent.keyDown(screen.getByTestId('hub-tab-connectors'), { key: 'End' });
    expect(getHubState().tab).toBe('skills');
    fireEvent.keyDown(screen.getByTestId('hub-tab-skills'), { key: 'Home' });
    expect(getHubState().tab).toBe('connectors');
    await documentsLoaded();
  });

  test('Georgian by default', async () => {
    server();
    openHub('connectors', { locale: 'ka' });
    await documentsLoaded();
    const tabs = within(await screen.findByTestId('hub-sheet')).getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['კონექტორები', 'პლაგინები', 'უნარები']);
  });

  test('the close button closes the hub', async () => {
    server();
    openHub('skills');
    fireEvent.click(within(await screen.findByTestId('hub-sheet')).getByRole('button', { name: 'Close' }));
    expect(getHubState().open).toBe(false);
  });
});

describe('Connectors tab', () => {
  test('documents (the research body), then Notifications, WhatsApp and Telegram — honest when the cards render nothing', async () => {
    server({ tg: true });
    openHub('connectors');
    await documentsLoaded();
    expect(await screen.findByTestId('connector-local')).toBeTruthy();
    expect(screen.getAllByTestId('connector-soon')).toHaveLength(4);

    // Push: the card draws its own title, so the hub adds none — while it renders nothing, its name + "not switched on yet".
    const notif = screen.getByTestId('hub-notifications');
    expect(within(notif).getByTestId('hub-push-slot-empty').textContent).toContain('Notifications');
    expect(within(notif).getByTestId('hub-push-slot-empty').textContent).toContain('Not switched on yet.');
    expect(notif.querySelectorAll('button, a, [role="button"]')).toHaveLength(0);

    // WhatsApp: the card draws its own title, so the hub adds none — while it renders nothing, a plain „Soon" row stands in.
    const wa = screen.getByTestId('hub-whatsapp');
    expect(within(wa).getByTestId('hub-whatsapp-slot-empty').textContent).toContain('WhatsApp');
    expect(within(wa).getByTestId('hub-whatsapp-slot-empty').textContent).toContain('Soon');
    expect(wa.querySelectorAll('button, a, [role="button"]')).toHaveLength(0);

    // Telegram: the bot runs here, linking is not ready — and there is NOTHING to press.
    await waitFor(() => expect(screen.getByTestId('hub-telegram').getAttribute('data-state')).toBe('bot'));
    const tg = screen.getByTestId('hub-telegram');
    expect(tg.textContent).toContain('linking it to your account is not ready yet');
    expect(tg.textContent).toContain('Soon');
    expect(tg.querySelectorAll('button, a, [role="button"]')).toHaveLength(0);
    // Never "connected"; never the operator notes or a linked number from the channels route.
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/\bconnected\b/i);
    expect(text).not.toContain('WHATSAPP_APP_SECRET');
    expect(text).not.toContain('+995555123456');
    expect(calls.some((c) => c.url.includes('/api/agent-g/telegram/connect-code'))).toBe(false);
  });

  test('when the cards render, they are drawn as they are (WhatsApp gets the locale) and no fallback shows', async () => {
    server();
    mockWa = (p) => <section data-testid="wa-card">WhatsApp card · {p.locale}</section>;
    mockPush = () => <div data-testid="push-card">Push opt-in</div>;
    openHub('connectors');
    await documentsLoaded();
    expect((await screen.findByTestId('wa-card')).textContent).toBe('WhatsApp card · en');
    expect(screen.getByTestId('push-card')).toBeTruthy();
    expect(screen.queryByTestId('hub-whatsapp-slot-empty')).toBeNull();
    expect(screen.queryByTestId('hub-push-slot-empty')).toBeNull();
  });

  test('Telegram off here → says so; the status failing to load → one line and a retry that asks again', async () => {
    const s = server({ tg: false });
    openHub('connectors');
    await documentsLoaded();
    await waitFor(() => expect(screen.getByTestId('hub-telegram').getAttribute('data-state')).toBe('off'));
    expect(screen.getByTestId('hub-telegram').textContent).toContain('not switched on here yet');

    s.channelsFail = true;
    await act(async () => { await hubActions.loadChannels(true); });
    expect(screen.getByTestId('hub-telegram').getAttribute('data-state')).toBe('failed');
    s.channelsFail = false;
    s.tg = true;
    fireEvent.click(within(screen.getByTestId('hub-telegram')).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.getByTestId('hub-telegram').getAttribute('data-state')).toBe('bot'));
  });
});

describe('Plugins tab', () => {
  test('a guest sees the whole list, every switch disabled, and a sign-in prompt — no request is made', async () => {
    server();
    const heard = jest.fn();
    window.addEventListener('myavatar:auth-required', heard);
    openHub('plugins', { authed: false });
    expect(screen.getByTestId('plugins-tab').getAttribute('data-status')).toBe('guest');
    for (const sw of screen.getAllByRole('switch')) {
      expect(sw.hasAttribute('disabled')).toBe(true);
      expect(sw.getAttribute('aria-checked')).toBe('true');
    }
    fireEvent.click(within(screen.getByTestId('plugins-signin')).getByRole('button', { name: 'Sign in' }));
    window.removeEventListener('myavatar:auth-required', heard);
    expect(heard).toHaveBeenCalledTimes(1);
    expect(calls.some((c) => c.url.includes('/api/plugins'))).toBe(false);
  });

  test('the table is not migrated → switches disabled and one "opening soon" line, never an error; a tap saves nothing', async () => {
    server({ plugins: { available: false } });
    await signIn();
    openHub('plugins');
    expect(screen.getByTestId('plugins-soon').textContent).toBe('Choosing your tools opens soon.');
    expect(screen.queryByRole('alert')).toBeNull();
    const music = screen.getByTestId('plugin-switch-music');
    expect(music.hasAttribute('disabled')).toBe(true);
    fireEvent.click(music);
    await new Promise((r) => setTimeout(r, 20));
    expect(puts()).toHaveLength(0);
  });

  test('every tool has a switch except the chat („always on"); a tap flips at once and saves the whole list', async () => {
    const s = server({ plugins: { available: true, disabledTools: ['remix'] } });
    await signIn();
    openHub('plugins');
    const chat = screen.getByTestId('plugin-row-chat');
    expect(chat.textContent).toContain('Always on');
    expect(chat.querySelectorAll('button, [role="switch"]')).toHaveLength(0);
    expect(screen.getAllByRole('switch')).toHaveLength(16);
    expect(screen.getByTestId('plugin-switch-remix').getAttribute('aria-checked')).toBe('false');

    const music = screen.getByRole('switch', { name: 'Music' });
    expect(music.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(music);
    expect(music.getAttribute('aria-checked')).toBe('false');
    await waitFor(() => expect(s.putBodies).toHaveLength(1));
    expect(s.putBodies[0]).toEqual({ disabledTools: ['music', 'remix'] });
    await waitFor(() => expect(screen.getByTestId('plugins-save-status').textContent).toBe('Saved'));

    fireEvent.click(screen.getByTestId('plugin-switch-remix'));
    await waitFor(() => expect(s.putBodies).toHaveLength(2));
    expect(s.putBodies[1]).toEqual({ disabledTools: ['music'] });
  });

  test('quick taps coalesce into one save', async () => {
    const s = server();
    setPluginSaveDelayForTests(40);
    await signIn();
    openHub('plugins');
    fireEvent.click(screen.getByTestId('plugin-switch-music'));
    fireEvent.click(screen.getByTestId('plugin-switch-video'));
    fireEvent.click(screen.getByTestId('plugin-switch-dubbing'));
    await waitFor(() => expect(s.putBodies).toHaveLength(1));
    expect(s.putBodies[0]).toEqual({ disabledTools: ['video', 'music', 'dubbing'] });
    await new Promise((r) => setTimeout(r, 80));
    expect(s.putBodies).toHaveLength(1);
  });

  test('a refused save puts the switch back and says so', async () => {
    server({ putStatus: 503 });
    await signIn();
    openHub('plugins');
    const music = screen.getByTestId('plugin-switch-music');
    fireEvent.click(music);
    expect(music.getAttribute('aria-checked')).toBe('false');
    await waitFor(() => expect(screen.getByTestId('plugins-save-failed').textContent).toContain('could not be saved'));
    expect(music.getAttribute('aria-checked')).toBe('true');
    expect(getHubState().plugins.disabled).toEqual([]);
  });

  test('a failed read → one line and a retry; nothing is hidden meanwhile', async () => {
    let fail = true;
    network((url) => (url.includes('/api/plugins') ? (fail ? { status: 503, body: { error: 'read_failed' } } : { body: { available: true, disabledTools: ['music'] } }) : undefined));
    await signIn();
    openHub('plugins');
    expect(screen.getByTestId('plugins-failed').textContent).toContain('could not be loaded');
    fail = false;
    fireEvent.click(within(screen.getByTestId('plugins-failed')).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.getByTestId('plugin-switch-music').getAttribute('aria-checked')).toBe('false'));
  });
});

describe('the menus (useHiddenTools)', () => {
  function Menu({ active }: { active?: 'music' }) {
    const hidden = useHiddenTools();
    return <ul data-testid="menu">{visibleToolIds(PRIMARY_TOOLS, hidden, active).map((id) => <li key={id}>{id}</li>)}</ul>;
  }
  const items = () => Array.from(screen.getByTestId('menu').querySelectorAll('li')).map((l) => l.textContent);

  test('hide what the server says is off — but never the active tool; a sign-out or another account starts clean', async () => {
    server({ plugins: { available: true, disabledTools: ['music', 'remix'] } });
    const { rerender } = render(<Menu />);
    expect(items()).toEqual([...PRIMARY_TOOLS]);
    await signIn('u1');
    expect(items()).not.toContain('music');
    expect(items()).not.toContain('remix');
    rerender(<Menu active="music" />);
    expect(items()).toContain('music');

    act(() => hubActions.syncUser(null));
    rerender(<Menu />);
    expect(items()).toEqual([...PRIMARY_TOOLS]);

    server({ plugins: { available: true, disabledTools: [] } });
    await signIn('u2');
    expect(items()).toEqual([...PRIMARY_TOOLS]);
    expect(calls.filter((c) => c.url.includes('/api/plugins'))).toHaveLength(1);
  });

  test('the table missing or the read failing hides nothing', async () => {
    server({ plugins: { available: false } });
    render(<Menu />);
    await signIn();
    expect(items()).toEqual([...PRIMARY_TOOLS]);
  });
});

describe('Skills tab', () => {
  test('rows follow the signals: research available, Telegram „soon" with the bot note, a hidden generator noted', async () => {
    server({ plugins: { available: true, disabledTools: ['music'] } });
    await signIn();
    openHub('skills');
    await waitFor(() => expect(screen.getByTestId('skill-research').getAttribute('data-state')).toBe('available'));
    expect(screen.getByTestId('skill-docs').getAttribute('data-state')).toBe('available');
    await waitFor(() => expect(screen.getByTestId('skill-telegram').getAttribute('data-state')).toBe('soon'));
    expect(screen.getByTestId('skill-telegram').textContent).toContain('account linking soon');
    expect(screen.getByTestId('skill-whatsapp').getAttribute('data-state')).toBe('soon');
    expect(screen.getByTestId('skill-music').getAttribute('data-state')).toBe('available');
    expect(screen.getByTestId('skill-music').textContent).toContain('Hidden from your menus');
    expect(screen.getByTestId('skill-web').getAttribute('data-state')).toBe('available');
    // Read-only: nothing to press in the whole tab.
    expect(screen.getByTestId('skills-tab').querySelectorAll('button, a, [role="switch"]')).toHaveLength(0);
  });

  test('a guest is told which skills need an account; research off here → soon', async () => {
    server({ caps: { available: false, reason: 'schema', credits: 120, filesAvailable: false, maxActive: 1 } });
    openHub('skills', { authed: false });
    await waitFor(() => expect(screen.getByTestId('skill-research').getAttribute('data-state')).toBe('soon'));
    expect(screen.getByTestId('skill-chat').getAttribute('data-state')).toBe('available');
    expect(screen.getByTestId('skill-chat').textContent).toContain('without an account');
    expect(screen.getByTestId('skill-image').getAttribute('data-state')).toBe('account');
    expect(screen.getByTestId('skill-image').textContent).toContain('With an account');
  });
});

describe('HubHost', () => {
  test('reads the list when someone signs in, and opens on a tab from the window event', async () => {
    server({ plugins: { available: true, disabledTools: ['remix'] } });
    render(<HubHost locale="en" authed userId="u1" />);
    await waitFor(() => expect(getHubState().plugins.status).toBe('ready'));
    expect(getHubState().plugins).toMatchObject({ owner: 'u1', disabled: ['remix'] });
    act(() => { window.dispatchEvent(new CustomEvent(HUB_OPEN_EVENT, { detail: 'skills' })); });
    expect(await screen.findByTestId('hub-panel-skills')).toBeTruthy(); // the lazily loaded sheet
    expect(getHubState()).toMatchObject({ open: true, tab: 'skills' });
    act(() => { window.dispatchEvent(new CustomEvent(HUB_OPEN_EVENT, { detail: 'nonsense' })); });
    expect(getHubState().tab).toBe('skills');
  });

  test('a guest is never asked for a list', async () => {
    server();
    document.documentElement.dataset.authed = '0';
    render(<HubHost locale="en" authed={false} userId={null} />);
    await new Promise((r) => setTimeout(r, 20));
    expect(calls.some((c) => c.url.includes('/api/plugins'))).toBe(false);
    expect(getHubState().plugins.status).toBe('idle');
  });
});
