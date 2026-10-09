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
  });

  it('nothing sits under the chat composer — no disclaimer, no explanation (the premium-minimal home)', () => {
    expect(omni).not.toContain('chat-disclaimer');
    expect(omni).not.toContain('MyAvatar ხელოვნური ინტელექტია და შეიძლება შეცდეს.');
    expect(omni).not.toContain('MyAvatar is AI and can make mistakes.');
    // …and no price caption either: a tool's price is on its Generate button, never a line under the box.
    expect(omni).not.toContain('data-testid="price-tag"');
    expect(omni).not.toContain('const priceTag');
  });
});

describe('the chat takes everything a person can bring', () => {
  it('its „+" has ONE attach button: the chat\'s picker takes every kind (photos, video, audio, documents) at once', () => {
    expect(omni).toMatch(/activeTool === 'chat' \? \{ onAttach: \(\) => fileRef\.current\?\.click\(\) \}/);
    // that one input accepts images, audio, video, PDFs and text/code — several at once — and goes through the one intake
    // (audio as AUDIO_ACCEPT, which names .mp3/.m4a: an iPhone's picker ignores a bare audio/* and hid the owner's tracks)
    expect(omni).toMatch(/<input ref=\{fileRef\} type="file" multiple accept=\{`image\/\*,\$\{AUDIO_ACCEPT\},video\/\*,application\/pdf,text\/\*/);
    // the video input still exists for the attachment e2e tests (and goes through the same intake)
    expect(omni).toMatch(/<input ref=\{videoPickRef\} type="file" multiple accept="video\/\*"/);
  });

  it('a file that would overflow the platform\'s request body is refused at the picker, not at Send', () => {
    expect(omni).toContain("import { DEFAULT_TOTAL_CAP_BYTES, PER_FILE_CAP_BYTES,");
    expect(omni).toMatch(/kind !== 'video' && inlineBytesRef\.current \+ dataUrl\.length > DEFAULT_TOTAL_CAP_BYTES/);
    expect(omni).toContain("rejectionMessage('total_too_large'");
  });
});

describe('the chat can USE what it is given', () => {
  it('a video + a question (or no words) is read as frames + soundtrack; only an edit request reaches the paid remix', () => {
    expect(omni).toMatch(/if \(mode === 'chat' && attachments\.some\(\(a\) => isVideo\(a\.mimeType\)\) && !isVideoEditRequest\(text\)\) \{/);
    expect(omni).toContain('digest = await captureVideoDigest(await (await fetch(videoAtt.dataUrl)).blob())');
    // the analysis turn is answered by the chat stream, and the remix branch comes AFTER it
    expect(omni.indexOf('VIDEO UNDERSTANDING (chat-attached)')).toBeGreaterThan(0);
    expect(omni.indexOf('VIDEO UNDERSTANDING (chat-attached)')).toBeLessThan(omni.indexOf('VIDEO REMIX (chat-attached)'));
    expect(omni).toContain('await streamChat([...messages, videoTurn]);');
  });

  it('the model gets the digest, the bubble keeps the clip: payloads read modelMedias first, and it is never persisted', () => {
    expect(omni).toContain('...((m.modelMedias ?? m.medias)?.length ? { medias: (m.modelMedias ?? m.medias)! } : {}),');
    const lean = omni.slice(omni.indexOf('function leanMessages'), omni.indexOf('function leanMessages') + 1400);
    expect(lean).not.toContain('modelMedias');
    expect(lean).not.toContain('medias:');
  });

  it('Word and text files are read as text, and the tray names every document with its size', () => {
    expect(omni).toContain("const doc = await documentToText(f, kind, { readText: (file) => file.text(), readDataUrl: fileToDataUrl, fetch: (...a) => fetch(...a) });");
    expect(omni).toContain('{formatBytes(a.size)}');
    expect(omni).toContain('size: f.size');
  });

  it('the Files picker offers documents, data and source text — not only the five formats it used to list', () => {
    expect(omni).toMatch(/accept=\{`image\/\*,\$\{AUDIO_ACCEPT\},video\/\*,application\/pdf,text\/\*,\.txt,\.md,\.pdf,\.docx,\.doc,\.rtf,\.csv,\.tsv,\.json/);
  });
});

describe('the price is on the button that spends', () => {
  it('the composer\'s run button prints the quote for the tools without a Generate button of their own', () => {
    expect(omni).toMatch(/const composerQuote = activeTool === 'avatar' \|\| activeTool === 'product' \|\| activeTool === 'swap' \|\| activeTool === 'remix'\s*\? quoteCredits\(\{ tool: activeTool \}\)/);
    expect(omni).toContain('data-price={composerQuote ?? undefined}');
    // the accessible name says the price too, from the same function the route charges with
    expect(omni).toContain('${runLabel} — ${creditsLabel(composerQuote, locale)}');
  });

  it('and there is still no caption anywhere under a composer', () => {
    expect(omni).not.toContain('data-testid="price-tag"');
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

  it('the studio opens on the chat, and „New session“ keeps whatever tool you were on', () => {
    expect(hub).toContain("setRestartTool(isToolId(active) && active !== 'chat' ? active : undefined)");
    expect(hub).toContain('<OmniStudio key={chatResetKey} locale={lang} initialTool={restartTool} />');
    expect(omni).toContain("useState<'chat' | 'image' | 'music' | 'video' | 'lipsync' | 'remix' | 'surgical' | 'photo'>('chat')");
    expect(omni).toContain("if (initialTool && initialTool !== 'chat') { selectTool(initialTool); return; }");
  });
});
