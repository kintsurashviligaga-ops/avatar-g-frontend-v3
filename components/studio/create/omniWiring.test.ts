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
      'count={imgCount} onCount={setImgCount}',
      'style={imgStyle} onStyle={setImgStyle}',
      'negative={imgNegative} onNegative={setImgNegative}',
      'prompt={input}',
      'activeTemplate={activeImagePreset}',
      'onPickTemplate={applyImagePreset}',
    ]) expect(mounted).toContain(bound);
    // The quality a template sets rides in the request (imgQuality); the screen neither shows nor takes it (GG 2026-10-23, "Hide").
    expect(mounted).not.toMatch(/\bquality=|onQuality=/);
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

describe('the phone: settings open on demand and the composer remains available while closed', () => {
  test('the settings button opens the Create sheet and exposes its current state', () => {
    expect(src).toContain('setOptionsOpen((v) => !v)');
    expect(src).toContain('aria-expanded={isDesktop ? panelOpen : optionsOpen}');
    expect(src).not.toContain('startChip');
  });

  test('the empty chat keeps the current service picker without the removed quick buttons', () => {
    expect(studio).not.toContain('<HomeQuickStart');
    expect(src).toContain('setToolPickOnly(true); setToolSheetOpen(true);');
  });

  test('"edit this image" opens the screen that holds the prompt and focuses ITS box', () => {
    const edit = /const startImageEdit = useCallback\(\(url: string\) => \{([\s\S]*?)\}, \[\]\);/.exec(src)?.[1] ?? '';
    expect(edit).toContain('setOptionsOpen(true)');
    expect(edit).toContain('imgPromptRef.current ?? taRef.current');
  });

  test('the composer textarea steps aside only while Image or Music settings are open', () => {
    expect(src).toContain("`${composerTextHidden ? 'hidden ' : ''}max-h-40 min-h-[28px] w-full resize-none");
    expect(src).toMatch(/const composerTextHidden = \(imageCreate \|\| mode === 'music'\)\s*&& \(isDesktop \? panelOpen : optionsOpen\);/);
  });

  test('VIDEO keeps the box and its priced Send beside the open panel: the prompt lives only in the chat (GG, 2026-10-18)', () => {
    // The box is never hidden for video, so its Send (not set aside) is the film's one button.
    expect(src).not.toMatch(/const composerTextHidden = [^;]*activeTool === 'video'/);
    expect(src).toMatch(/const composerRunAside = composerTextHidden;/);
    // Its price is the film's quote for the length, tier and mode on the panel (the number the panel's Generate showed).
    expect(src).toMatch(/\? videoQuote\(\{ seconds: videoDuration, tier: veoPlan\.tier, mode: videoMode \}\) \|\| null/);
    expect(src).toContain('onClick={runComposer} aria-label={runAria} title={runAria} data-testid="run-button" data-price={composerQuote ?? undefined}');
    // A balance known to be short opens the top-up (never the film); the trial slot (one clip ≤ 8 s) is never blocked;
    // a guest (balance unknown) goes on to runTool's own sign-in gate.
    expect(src).toContain("const short = !freeSlotApplies(videoFreeFilms, videoDuration) && videoBalanceCredits !== null && videoBalanceCredits < composerQuote;");
    expect(src).toContain("if (short) { window.dispatchEvent(new CustomEvent('myavatar:open-credits')); return; }");
    expect(src).toMatch(/activeTool === 'video' && mode === 'video' && videoTab === 'cinema'\s*\? videoQuote/);
    // The panel carries no prompt box and no Generate of its own; script, voice details and camera are gone from it.
    const panel = /<VideoCreatePanel([\s\S]*?)\n {12}\/>/.exec(src)?.[1] ?? '';
    expect(panel).not.toMatch(/\bprompt=|onPrompt=|onGenerate|story=\{|voice=\{|advanced=\{|VeoParametersPanel|master-script-input|video-templates/);
  });

  test('a hidden box is not measured (0 px would stick as its inline height in the next tool)', () => {
    expect(src).toMatch(/if \(el\.offsetParent === null\) \{ el\.style\.height = ''; return; \}/);
    expect(src).toMatch(/\}, \[input, mode\]\);/);
  });

  test('the sheet\'s generic header gives way to the panel\'s own (tool name ▾ · ✕) — not rendered, because a hidden ✕ would swallow the dialog\'s initial focus', () => {
    expect(src).toMatch(/\{!imageCreate && !videoCreate && \(\s*<div data-testid="panel-header" className=\{`\$\{shootActive \? 'hidden ' : ''\}flex h-14/);
    // The Image screen's own ✕ closes the settings layer at every width.
    expect(mounted).toContain('onClose={() => (isDesktop ? setPanelOpen(false) : setOptionsOpen(false))}');
    // …and it is a real removal, never a `hidden` class on the header.
    expect(studio).not.toMatch(/imageCreate \? 'hidden'/);
  });
});

describe('the unified composer (GG 2026-10-25): one conversation on screen, settings anchored to the composer', () => {
  test('outside the layer: a phone\'s backdrop catches the tap; a desktop closes on pointerdown without eating the click', () => {
    expect(src).toContain('{settingsLayerOpen && settingsAnchor && !isDesktop && (');
    expect(src).toMatch(/if \(!settingsLayerOpen \|\| !isDesktop\) return;\s*const onDown = \(e: PointerEvent\) => \{/);
    expect(src).toContain(`if (t.closest('[role="dialog"]') || composerRef.current?.contains(t)) return;`);
  });

  test('a run, a reply or a card put the settings layer away on a desktop too — it sits over the thread the answer lands in', () => {
    expect(src).not.toContain('if (!isDesktop) setOptionsOpen(false);');
    expect((src.match(/closeSettingsLayer\(\);/g) ?? []).length).toBeGreaterThanOrEqual(19);
    expect(src).toContain('onStarted: () => closeSettingsLayer(),');
  });

  test('the panel gets the desktop flag (templates open, popovers)', () => {
    expect(mounted).toContain('desktop={isDesktop}');
  });

  test('no desk replaces the thread: results and their buttons are in the conversation', () => {
    expect(src).not.toContain('<ImageDesk');
    expect(src).not.toContain('<VideoStage');
    expect(src).not.toContain('<MusicCentrePane');
    // The thread's own image bubble carries every action the desk had: upscale, re-roll, save, edit, a tile's retry, the batch's re-roll.
    for (const handler of ['void upscale(m.imageUrl!)', 'void regenerate(m.regen!)', "saveLibButton(m.imageUrl, 'image'", "editButton(m.imageUrl, 'image')", 'void runImageBatch(m.batch!.spec, 1)', 'void runImageBatch(m.batch!.spec, m.batch!.tiles.length)', 'startImageEdit', 'sendImageToVideo']) {
      expect(src).toContain(handler);
    }
    expect(src).toContain("${imageWorkspace ? 'hidden ' : ''}min-h-0 overflow-y-auto overscroll-contain touch-pan-y");
    expect(src).toContain('{showJump && !imageWorkspace && messages.length > 0 && (');
  });

  test('the settings are one layer above the composer — no right column, no sheet hiding the composer', () => {
    expect(src).toContain("className={`${settingsLayerOpen ? 'flex' : 'hidden'} fixed z-[95] flex-col`}");
    expect(src).toMatch(/maxHeight: `min\(60dvh, /);
    expect(src).not.toMatch(/w-\[300px\] shrink-0 flex-col border-l/);
    expect(src).toContain("className={imageWorkspace ? 'hidden' : 'shrink-0 pt-1'}");
    expect(src).toContain('useDialogA11y<HTMLDivElement>(settingsLayerOpen, closeSettingsLayer, { trap: false })');
    expect(src).not.toContain('data-testid="settings-panel-toggle"');
  });

  test('a language switch keeps the composer: stashed before the empty-chat return, taken once before the deep link', () => {
    const keep = studio.indexOf('const keep = () => {');
    expect(studio.indexOf('stashComposerHandoff(composerSnapshotRef.current());', keep)).toBeGreaterThan(keep);
    expect(studio.indexOf('stashComposerHandoff(composerSnapshotRef.current());', keep)).toBeLessThan(studio.indexOf('if (!msgs.length', keep));
    const take = studio.indexOf('const h = takeComposerHandoff();');
    expect(take).toBeGreaterThan(0);
    expect(take).toBeLessThan(studio.indexOf("const tl = url.searchParams.get('tool');"));
    expect(studio).toContain('if (h.draft.trim()) setInput((prev) => (prev.trim() ? prev : h.draft));');
  });
});

describe('the panel stays a view', () => {
  test('it imports no studio state, no network and no billing — only the quote it prints', () => {
    expect(panel).not.toMatch(/OmniStudio|fetch\(|supabase|deductCredits|useJobQueue|from '@\/lib\/billing/);
    expect(panel).toMatch(/from '@\/lib\/studio\/imageCreate'/);
    expect(panel).toMatch(/imageCredits\(p\.count\)/);
  });
});
