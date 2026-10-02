/** @jest-environment node */
/**
 * The first-run tour's anchors are promises the owning components make in their own source (OmniStudio is 9k lines
 * behind a dynamic import, so — like the other studio suites — these read the SOURCE for the lines each promise
 * hangs on):
 *  · the composer pill carries data-tour="composer", with the composer textarea inside it;
 *  · every sidebar tool row and collapsed-rail button carries data-tour="tool-<id>" (step 2 points at tool-avatar);
 *  · the twin entry is an anchor ONLY behind NEXT_PUBLIC_TWIN_ENABLED;
 *  · ServiceHub mounts the tour once, on the studio surface, through next/dynamic (never in the first load).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..', '..');
const read = (...p: string[]) => readFileSync(join(root, ...p), 'utf8');
const omni = read('components', 'studio', 'OmniStudio.tsx');
const chrome = read('components', 'studio', 'ChatChrome.tsx');
const hub = read('components', 'studio', 'ServiceHub.tsx');

describe('tour anchors', () => {
  it('the composer pill is the composer anchor, and the composer textarea sits inside it', () => {
    expect(omni.match(/data-tour="composer"/g)).toHaveLength(1);
    const pill = omni.indexOf('<div data-tour="composer"');
    const box = omni.indexOf('data-testid="composer-input"');
    expect(pill).toBeGreaterThan(0);
    expect(box).toBeGreaterThan(pill);
    // Nothing but the pill's own className between them: the textarea is the pill's first element child.
    const between = omni.slice(pill, box);
    expect(between.match(/<div /g)).toHaveLength(1);
    expect(between).toContain('<textarea');
  });

  it('every sidebar tool row and every collapsed-rail tool button is a tool-<id> anchor', () => {
    expect(chrome.match(/data-tour=\{`tool-\$\{id\}`\}/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('the twin entry is an anchor only with NEXT_PUBLIC_TWIN_ENABLED on', () => {
    expect(chrome).toContain("data-tour={TWIN_ENABLED ? 'twin' : undefined}");
    expect(chrome).not.toMatch(/data-tour="twin"/);
  });
});

describe('the mount', () => {
  it('is next/dynamic with ssr: false, so the tour is never in the dashboard\'s first load', () => {
    expect(hub).toMatch(/const OnboardingTour = dynamic\(\(\) => import\('@\/components\/onboarding\/OnboardingTour'\), \{ ssr: false \}\);/);
    expect(hub).not.toMatch(/import OnboardingTour from/);
  });

  it('is one line, on the studio surface only', () => {
    expect(hub.match(/<OnboardingTour /g)).toHaveLength(1);
    expect(hub).toContain("{service === 'omni' && <OnboardingTour locale={lang} />}");
  });
});
