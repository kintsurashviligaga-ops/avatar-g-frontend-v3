/** @jest-environment node */
/**
 * OmniStudio ↔ the Image Create screen: the wiring that no component test can see, pinned on the source (the studio is one
 * 9,000-line client component; a source pin is the cheapest way to say "this connection exists, and the old one is gone").
 *
 * Each assertion is a way the screen could silently stop being what the owner asked for: the price on the button not being the
 * route's quote, a tap on "Top up" not reaching the one top-up the studio has, the old panel surviving beside the new one, the
 * composer's text box mirroring the prompt card on a phone, the desktop centre not showing the result.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(process.cwd(), 'components/studio/OmniStudio.tsx'), 'utf8');
const panelSrc = readFileSync(join(process.cwd(), 'components/studio/create/ImageCreatePanel.tsx'), 'utf8');

/** Source without comments: the fixes' own explanations quote the code they replaced. */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
const panel = code(panelSrc);
const studio = code(src);

/** The `<ImageCreatePanel … />` element as written in OmniStudio. */
const mounted = (() => {
  const at = src.indexOf('<ImageCreatePanel');
  const end = src.indexOf('\n          />', at);
  return at >= 0 && end > at ? src.slice(at, end) : '';
})();

describe('the Create screen is mounted in the studio\'s settings, in place of the old image controls', () => {
  test('the panel is imported and rendered for the image tool', () => {
    expect(src).toMatch(/import \{ ImageCreatePanel \} from '@\/components\/studio\/create\/ImageCreatePanel'/);
    expect(mounted).not.toBe('');
    expect(src).toMatch(/\{mode === 'image' && !imageWorkspace && \(\s*<ImageCreatePanel/);
  });

  test('the old inline controls are GONE (no second set of ratios, sizes or style chips beside the new one)', () => {
    expect(studio).not.toMatch(/IMG_ASPECTS\.map|IMG_QUALITIES\.map|IMG_STYLES\.map/);
    expect(studio).not.toContain('imgNegativeOpen');
    // …and the lists live in one place, with the price.
    expect(studio).not.toMatch(/const IMG_ASPECTS|const IMG_QUALITIES|const IMG_STYLES/);
    expect(src).toMatch(/from '@\/lib\/studio\/imageCreate'/);
  });

  test('no generic "service card" for any tool: the panel\'s ONE header is the tool switcher (the Image screen draws its own)', () => {
    expect(src).not.toContain("<span className=\"shrink-0 text-[12.5px] font-medium text-app-accent\">{locale === 'en' ? 'Change' : locale === 'ru' ? 'Сменить' : 'შეცვლა'}</span>");
    expect(src).toContain('data-testid="panel-tool-switch"');
    expect(mounted).toMatch(/onOpenTools=\{\(\) => \{ setToolPickOnly\(true\); setToolSheetOpen\(true\); \}\}/);
  });

  test('every control is bound to the studio\'s EXISTING state — nothing new to generate with', () => {
    for (const bound of [
      'aspect={imgAspect} onAspect={setImgAspect}',
      'quality={imgQuality} onQuality={setImgQuality}',
      'count={imgCount} onCount={setImgCount}',
      'style={imgStyle} onStyle={setImgStyle}',
      'negative={imgNegative} onNegative={setImgNegative}',
      'prompt={input}',
      'activeTemplate={activeImagePreset}',
      'onPickTemplate={applyImagePreset}',
    ]) expect(mounted).toContain(bound);
  });

  test('the prompt card IS the composer\'s prompt: typing marks dictation like the composer does', () => {
    expect(mounted).toMatch(/onPrompt=\{\(v\) => \{ dictation\.markTyped\(\); setInput\(v\); \}\}/);
    expect(mounted).toContain('promptRef={imgPromptRef}');
  });

  test('Generate runs the composer\'s own run (so guests are stopped, the queue and the price gate are the same) and never re-implements it', () => {
    // `true` = the panel's own button: its price is on it, so that press IS the confirmation Agent G would otherwise ask for.
    expect(mounted).toContain("onGenerate={() => runTool(true, 'panel')}");
    expect(mounted).not.toMatch(/runImageJob|runImageBatch|fetch\(/);
  });

  test('the balance is the header chip\'s number, and Top up is the ONE top-up the studio has', () => {
    expect(src).toMatch(/useCreditsBalance\(\(s\) => s\.balance\)/);
    expect(mounted).toContain('balance={creditsBalance}');
    expect(mounted).toContain("window.dispatchEvent(new CustomEvent('myavatar:open-credits'))");
    expect(readFileSync(join(process.cwd(), 'components/studio/ChatChrome.tsx'), 'utf8')).toContain("addEventListener('myavatar:open-credits'");
  });

  test('one reference picture REPLACES the one in the tray (the route reads one), and non-image files are named, not sent', () => {
    expect(mounted).toMatch(/onAddReference=\{\(files\) => \{ setAttachments\(\(prev\) => prev\.filter\(\(a\) => !isImage\(a\.mimeType\)\)\); void ingestFiles\(files, \{ scriptInVideo: false \}\); \}\}/);
    expect(mounted).toContain('foreignFileCount={attachments.filter((a) => !isImage(a.mimeType)).length}');
  });

  test('Script → Storyboard is slotted into Advanced, unchanged (its handlers are still the studio\'s)', () => {
    expect(mounted).toContain('advancedExtra={(');
    for (const kept of ['generateImageStoryboard()', 'exportImageStoryboardToVideo', 'setImgBoardScript', 'setImgBoardDuration']) expect(src).toContain(kept);
    expect(mounted).toContain('advancedExtraDirty={!!imgBoardScript.trim()}');
  });
});

describe('the phone: the sheet opens by itself and the composer\'s text box steps aside', () => {
  test('choosing the Image tool (sidebar, "+", deep link) opens the Create sheet — the old start chips stay gone', () => {
    expect(src).toMatch(/id === 'motion' \|\| id === 'image'( \|\| id === 'vfx')?\) setOptionsOpen\(true\)/);
    expect(src).not.toContain('startChip');
  });

  test('the EMPTY chat has the four quick buttons under its box (GG, 2026-10-18); a tap opens the tool like any other pick', () => {
    expect(src).toMatch(/\{chatOnly && messages\.length === 0 && \(\s*<HomeQuickStart locale=\{locale\} onPick=\{\(id\) => selectTool\(id, 'quick-start'\)\} \/>\s*\)\}/);
  });

  test('"edit this image" opens the screen that holds the prompt and focuses ITS box', () => {
    const edit = /const startImageEdit = useCallback\(\(url: string\) => \{([\s\S]*?)\}, \[\]\);/.exec(src)?.[1] ?? '';
    expect(edit).toContain('setOptionsOpen(true)');
    expect(edit).toContain('imgPromptRef.current ?? taRef.current');
  });

  test('the composer\'s textarea steps aside while the Create screen holds the description: below lg in image and music, on a desktop while their panel is open (GG, 2026-10-18)', () => {
    expect(src).toContain("`${composerTextHidden ? 'hidden ' : ''}max-h-40 min-h-[28px] w-full resize-none");
    expect(src).toMatch(/const composerTextHidden = \(imageCreate \|\| mode === 'music'\)\s*&& \(isDesktop \? panelOpen : true\);/);
  });

  test('VIDEO keeps the box and its priced Send beside the open panel: the prompt lives only in the chat (GG, 2026-10-18)', () => {
    // The box is never hidden for video, so its Send (not set aside) is the film's one button.
    expect(src).not.toMatch(/const composerTextHidden = [^;]*activeTool === 'video'/);
    expect(src).toMatch(/const composerRunAside = composerTextHidden && isDesktop;/);
    // Its price is the film's quote for the length, tier and mode on the panel (the number the panel's Generate showed).
    expect(src).toMatch(/\? videoQuote\(\{ seconds: videoDuration, tier: veoPlan\.tier, mode: videoMode \}\) \|\| null/);
    expect(src).toContain('onClick={runComposer} aria-label={runAria} title={runAria} data-testid="run-button" data-price={composerQuote ?? undefined}');
    // A balance known to be short opens the top-up (never the film); the trial slot (one clip ≤ 8 s) is never blocked;
    // a guest (balance unknown) goes on to runTool's own sign-in gate. A Higgsfield pick shows no Veo number.
    expect(src).toContain("const short = !freeSlotApplies(videoFreeFilms, videoDuration) && videoBalanceCredits !== null && videoBalanceCredits < composerQuote;");
    expect(src).toContain("if (short) { window.dispatchEvent(new CustomEvent('myavatar:open-credits')); return; }");
    expect(src).toMatch(/activeTool === 'video' && mode === 'video' && videoTab === 'cinema' && !videoHfPicked\s*\? videoQuote/);
    // The panel carries no prompt box and no Generate of its own; script, voice details and camera are gone from it.
    const panel = /<VideoCreatePanel([\s\S]*?)\n {12}\/>/.exec(src)?.[1] ?? '';
    expect(panel).toContain('prompt={input}');
    expect(panel).not.toMatch(/onPrompt=|onGenerate|story=\{|voice=\{|advanced=\{|VeoParametersPanel|master-script-input|video-templates/);
  });

  test('a hidden box is not measured (0 px would stick as its inline height in the next tool)', () => {
    expect(src).toMatch(/if \(el\.offsetParent === null\) \{ el\.style\.height = ''; return; \}/);
    expect(src).toMatch(/\}, \[input, mode\]\);/);
  });

  test('the sheet\'s generic header gives way to the panel\'s own (tool name ▾ · ✕) — not rendered, because a hidden ✕ would swallow the dialog\'s initial focus', () => {
    expect(src).toMatch(/\{!imageCreate && !videoCreate && \(\s*<div data-testid="panel-header" className=\{`\$\{shootActive \? 'hidden ' : ''\}\$\{isDesktop/);
    // The Image screen's own ✕ closes the panel on a desktop and the sheet on a phone.
    expect(mounted).toContain('onClose={() => (isDesktop ? setPanelOpen(false) : setOptionsOpen(false))}');
    // …and it is a real removal, never a `hidden` class on the header.
    expect(studio).not.toMatch(/imageCreate \? 'hidden'/);
  });
});

describe('the desktop: the centre is the Result pane, the right column is the same panel', () => {
  test('the panel gets the desktop flag (templates open, popovers)', () => {
    expect(mounted).toContain('desktop={isDesktop}');
  });

  test('the Result pane + Models & prices stand where the thread would, fed by the same messages and handlers', () => {
    expect(src).toMatch(/const imageDesk = imageCreate && isDesktop && !imageWorkspace;/);
    expect(src).toMatch(/const imageDeskResults = imageDesk \? deriveImageResults\(messages, \{ busy \}\) : \[\];/);
    expect(src).toMatch(/\{imageDesk && imageDeskActions && \(\s*<div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-3">\s*<ImageDesk/);
    for (const handler of ['regenerate(spec)', 'cancelBubbleJob(m)', 'runImageBatch(b.spec', 'startImageEdit', 'sendImageToVideo', "saveLibButton(u, 'image'", "editButton(u, 'image')", 'void upscale(u)', "dl(u, 'myavatar-image.png')"]) {
      expect(src).toContain(handler);
    }
    expect(src).toContain('conversation={messageList}');
  });

  test('the thread is hidden, never mounted twice: the feed keeps its node, renders nothing, and the jump button waits', () => {
    expect(src).toContain("${imageDesk || imageWorkspace ? 'hidden ' : ''}min-h-0 overflow-y-auto overscroll-contain touch-pan-y");
    expect(src).toContain(') : imageDesk || imageWorkspace ? null : messages.length === 0 && !musicPane ? (');
    expect(src).toContain('{showJump && !imageDesk && !imageWorkspace && messages.length > 0 && (');
  });
});

describe('the panel stays a view', () => {
  test('it imports no studio state, no network and no billing — only the quote it prints', () => {
    expect(panel).not.toMatch(/OmniStudio|fetch\(|supabase|deductCredits|useJobQueue|from '@\/lib\/billing/);
    expect(panel).toMatch(/from '@\/lib\/studio\/imageCreate'/);
    expect(panel).toMatch(/imageCredits\(p\.count\)/);
  });
});
