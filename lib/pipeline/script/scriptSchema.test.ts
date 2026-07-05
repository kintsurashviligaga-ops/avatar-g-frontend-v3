/** @jest-environment node */
import { parseScript, dialogueSpans, hasDialogueInWindow, type Script } from './scriptSchema';

const valid = {
  title: 'ის დილა',
  totalDurationSec: 20,
  segments: [
    { kind: 'narrator', text: 'ყველაფერი იწყება ერთი იდეით', startSec: 0, endSec: 5 },
    { kind: 'dialogue', character: 'GIORGI', text: 'რას ხედავ?', startSec: 6, endSec: 8 },
  ],
};

describe('parseScript', () => {
  it('accepts a valid script', () => {
    const r = parseScript(valid);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.script.segments).toHaveLength(2);
  });

  it('rejects endSec < startSec', () => {
    const r = parseScript({ ...valid, segments: [{ kind: 'dialogue', character: 'A', text: 'x', startSec: 8, endSec: 6 }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/endSec must be ≥ startSec/);
  });

  it('rejects a segment past totalDurationSec', () => {
    const r = parseScript({ totalDurationSec: 5, segments: [{ kind: 'narrator', text: 'x', startSec: 0, endSec: 9 }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/exceeds totalDurationSec/);
  });

  it('rejects an unknown segment kind + empty segments', () => {
    expect(parseScript({ totalDurationSec: 5, segments: [{ kind: 'sfx', startSec: 0, endSec: 1 }] }).ok).toBe(false);
    expect(parseScript({ totalDurationSec: 5, segments: [] }).ok).toBe(false);
    expect(parseScript(null).ok).toBe(false);
  });

  it('requires a character on dialogue and text on both', () => {
    expect(parseScript({ totalDurationSec: 5, segments: [{ kind: 'dialogue', text: 'x', startSec: 0, endSec: 1 }] }).ok).toBe(false);
    expect(parseScript({ totalDurationSec: 5, segments: [{ kind: 'narrator', text: '', startSec: 0, endSec: 1 }] }).ok).toBe(false);
  });
});

describe('helpers', () => {
  const script = (parseScript(valid) as { ok: true; script: Script }).script;
  it('dialogueSpans extracts only dialogue', () => {
    expect(dialogueSpans(script)).toEqual([{ startSec: 6, endSec: 8, character: 'GIORGI' }]);
  });
  it('hasDialogueInWindow detects overlap', () => {
    expect(hasDialogueInWindow(script, 6, 8)).toBe(true);
    expect(hasDialogueInWindow(script, 7, 9)).toBe(true);
    expect(hasDialogueInWindow(script, 0, 5)).toBe(false);
  });
});
