/** @jest-environment node */
/**
 * The chat is Gemini's (docs/DESIGN.md §12) — the wiring a unit test of one component cannot see.
 *
 * OmniStudio is 9k lines behind a dynamic import, ChatChrome needs Supabase and the router, and the contracts between
 * them are window events and a data attribute. So, as the other studio suites here do, these read the SOURCE for the
 * few lines each promise hangs on; tests/chat-streaming.spec.ts drives the same promises in a real browser.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const omni = readFileSync(join(__dirname, 'OmniStudio.tsx'), 'utf8');
const chrome = readFileSync(join(__dirname, 'ChatChrome.tsx'), 'utf8');
const hub = readFileSync(join(__dirname, 'ServiceHub.tsx'), 'utf8');

/** The part of OmniStudio that runs before the `mode === 'surgical'` early return — every hook must live here. */
const beforeSurgicalReturn = omni.slice(0, omni.indexOf("if (mode === 'surgical') {"));

describe('the model reaches the request', () => {
  it('streamChat reads the chosen mode AT SEND TIME and sends it as a mode', () => {
    // Read inside streamChat, next to the persona — so a switch applies to the very next turn with no stale closure.
    expect(omni).toContain('const chatMode = getChatMode();');
    expect(omni).toMatch(/protocol: 2,\s*mode: chatMode,/);
  });

  it('never sends a tier or a model id, and the dead per-component model state is gone', () => {
    expect(omni).not.toMatch(/tier: 'pro'/);
    expect(omni).not.toContain('chatTier');
    expect(omni).not.toContain('chatLang');
  });

  it('stores who answered as data (id + mode), not a preformatted badge above the reply', () => {
    expect(omni).toContain('chatModelId: answered.model, chatMode: answeredMode');
    expect(omni).not.toContain('title="answering engine"');
    expect(omni).toContain('data-testid="reply-model"');
  });
});

describe('pure chat has no settings (keyed on the TOOL, never on the mode)', () => {
  it('derives chat from the active tool — dubbing, 3D and presentation park mode at chat and keep their panel', () => {
    expect(omni).toContain("const chatOnly = activeTool === 'chat';");
    expect(omni).not.toMatch(/const chatOnly = mode ===/);
  });

  it('hides the settings surface with classes and keeps it mounted', () => {
    expect(omni).toContain("${panelOpen && !chatOnly ? 'flex' : 'hidden'}");
    expect(omni).toContain("${optionsOpen && !chatOnly ? 'flex' : 'hidden'}");
    expect(omni.match(/id="studio-settings"/g)).toHaveLength(1);
    // panelOpen is the user's choice: nothing in the chat switch writes it.
    expect(omni).not.toMatch(/if \(chatOnly\)[^\n]*setPanelOpen/);
  });

  it('renders no settings toggle and no tool chip in the chat', () => {
    expect(omni).toMatch(/\{!chatOnly && \(\s*<button type="button" onClick=\{\(\) => setPanelOpen\(\(v\) => !v\)\}/);
    expect(omni).toMatch(/\{!chatOnly && \(\s*<button type="button" onClick=\{\(\) => \(isDesktop \? setPanelOpen/);
  });

  it('puts the model switcher in the desktop title bar, which stays ONE <header>', () => {
    expect(omni).toContain('<ModelSwitcher variant="desktop" locale={locale} />');
    expect(omni.match(/<header /g)).toHaveLength(1);
  });
});

describe('the Gemini chat surface', () => {
  it('declares its new hooks above the surgical early return (a hook below it is React error #300)', () => {
    for (const hook of ['useMicRelease(', 'const activePersona = useActivePersona(', 'const [composerWrapped, setComposerWrapped] = useState(false)']) {
      expect(beforeSurgicalReturn).toContain(hook);
    }
  });

  it('adds every new binding the message list reads to its dependency list', () => {
    const deps = omni.slice(omni.indexOf('), [busy, streamingId, chat.store'), omni.indexOf('// ⚠️ `pending` WAS IN THIS ARRAY'));
    expect(deps).toContain('shareReply');
  });

  it('the reply action row has no scale-on-hover and no bouncing dots anywhere', () => {
    const row = omni.slice(omni.indexOf("The reply's action row, in Gemini's order"), omni.indexOf('{/* Retry — the last reply errored'));
    expect(row).not.toMatch(/(hover|active):scale-/);
    expect(omni).not.toContain('animate-bounce');
  });

  it('the chat composer is the pill; its textarea is never re-parented', () => {
    // One textarea with the composer's test id, and the one-row shape is made with `contents` + `order`.
    expect(omni.match(/data-testid="composer-input"/g)).toHaveLength(1);
    expect(omni).toContain("<div className={chatSingleRow ? 'contents' :");
    expect(omni).toContain("'ჰკითხე MyAvatar-ს'");
    expect(omni).toContain('MyAvatar ხელოვნური ინტელექტია და შეიძლება შეცდეს.');
  });
});

describe('Live gets the microphone', () => {
  it('the Live chip primes Live INSIDE the tap, before it asks ChatChrome to open, and never for a guest', () => {
    expect(omni).toMatch(/if \(document\.documentElement\.dataset\.authed !== '0'\) primeLive\(\);\s*window\.dispatchEvent\(new CustomEvent\('myavatar:voice-open'\)\);/);
  });

  it('the music voice-sample recorder lets go of the mic when Live asks', () => {
    expect(omni).toMatch(/useMicRelease\(\(\) => \{ if \(voiceStreamRef\.current\) stopVoiceRecording\(\); \}, 'music'\);/);
  });

  it('the ?voice=1 deep link releases other holders before it opens', () => {
    expect(chrome).toMatch(/if \(data\.user\) \{ requestMicRelease\('live'\);[^\n]*setVoiceOpen\(true\);/);
  });

  it('an auth flicker cannot swap Live for the fallback mid-call: the user id is latched while the call is open', () => {
    expect(chrome).toContain('const liveUid = voiceUid ?? userId;');
    expect(chrome).toContain('<GeminiLiveConversation userId={liveUid}');
    expect(chrome).not.toMatch(/<GeminiLiveConversation userId=\{userId\}/);
  });
});

describe('ChatChrome and ServiceHub', () => {
  it('the phone header IS the model switcher in the chat, and the persona row opens the picker', () => {
    expect(chrome).toContain("const chatHeader = onStudioHome && activeTool === 'chat' && !showBack && !title;");
    expect(chrome).toContain('<ModelSwitcher variant="phone"');
    expect(chrome).toMatch(/const onOpen = \(\) => \{ setSidebarOpen\(false\); setPersonaOpen\(true\); \};/);
    expect(chrome).toContain('window.addEventListener(OPEN_PERSONA_EVENT, onOpen);');
  });

  it('publishes the first name for the greeting like data-uid, and removes it on sign-out', () => {
    expect(chrome).toContain('root.dataset.firstName = firstName;');
    expect(chrome).toContain('delete root.dataset.firstName;');
  });

  it('„New session“ in the chat restarts on the chat', () => {
    expect(hub).toContain("document.documentElement.dataset.tool === 'chat' ? 'chat' : undefined");
    expect(hub).toContain('<OmniStudio key={chatResetKey} locale={lang} initialTool={restartTool} />');
    expect(omni).toContain("useState<'chat' | 'image' | 'music' | 'video' | 'lipsync' | 'remix' | 'surgical'>(() => (initialTool === 'chat' ? 'chat' : 'video'))");
  });
});
