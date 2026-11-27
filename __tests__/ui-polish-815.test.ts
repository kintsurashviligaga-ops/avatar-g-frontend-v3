/**
 * Phase 8.15 polish contract (static): keyboard focus stays visible, small icon buttons get a 44 px touch area,
 * and the screen-reader names fixed in this pass do not drift back to hard-coded English.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const css = read('app/globals.css');

test('a global :focus-visible ring exists for buttons and links', () => {
  expect(css).toMatch(/:focus-visible\s*\{\s*outline:\s*2px solid/);
  expect(css).toMatch(/button:focus-visible,\s*a:focus-visible\s*\{/);
});

test('inputs, textareas and selects show a focus state (border and ring) instead of a bare outline: none', () => {
  expect(css).toMatch(/textarea:focus,\s*select:focus\s*\{\s*border-color: var\(--input-focus\);\s*box-shadow:/);
});

test('.ag-hit gives a 44x44 hit area on touch screens', () => {
  const block = css.slice(css.indexOf('44 px touch targets (Phase 8.15)'));
  expect(block).toMatch(/@media \(pointer: coarse\)/);
  expect(block).toMatch(/width: max\(100%, 44px\)/);
  expect(block).toMatch(/height: max\(100%, 44px\)/);
});

const FIXED: Array<[string, RegExp]> = [
  ['components/dashboard/command-center/InlineMedia.tsx', /aria-label="(Close|Expand)"|title="HTML preview"/],
  ['components/dashboard/command-center/MediaActions.tsx', /alt="character preview"|<button className="ma-modal-close" onClick=\{onClose\}>/],
  ['components/memory/MemoryPanel.tsx', /aria-label="(Edit|Delete) memory"|^\s+What Agent G remembers about you\.$/m],
  ['components/studio/ChatChrome.tsx', /aria-label="(Language|close|Change photo)"/],
  ['components/studio/OmniStudio.tsx', /alt="(attachment|product|shot 1|fullscreen)"/],
  ['components/studio/StudioLibraryGrid.tsx', /aria-label="Play"/],
  ['components/studio/StudioSheet.tsx', /aria-label="Close"/],
  ['components/studio/SurgicalEditor.tsx', /aria-label="seek"/],
  ['components/studio/TrackPlayer.tsx', /aria-label="Track information"|>Generated with \{/],
  ['components/twin/TwinCapture.tsx', /aria-label="level"/],
  ['components/voice/LiveAvatarEnroll.tsx', /aria-label="close"/],
  ['components/ClientErrorBoundary.tsx', /System Interruption|Retry System Process/],
];

test.each(FIXED)('%s has no hard-coded English screen-reader name', (file, rx) => {
  expect(read(file)).not.toMatch(rx);
});
