/** @jest-environment node */
/**
 * Avatar send path (Production 2026-10-16, GG's iPhone report):
 *  - a start the server refuses (503 google_only) was retried 3× and ended in "re-attach the photo";
 *  - "the avatar, emotionally, says: …" was read out whole, direction included.
 * OmniStudio is too large to mount, so these pin the wiring in its source.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const src = readFileSync(join(__dirname, 'OmniStudio.tsx'), 'utf8');
const lip = src.slice(src.indexOf("if (effMode === 'lipsync') {"), src.indexOf('// ── CHAT (multimodal Gemini)'));

describe('avatar send wiring', () => {
  it('a refused start stops the retries and shows its own reason', () => {
    expect(lip).toMatch(/refusal = startRefusal\(startJson\);\s*if \(refusal\) break;/);
    expect(lip).toContain('describeGenerationFailure(refusal.body, locale, t.lipsyncFailed)');
  });
  it('only the spoken words reach the voice, in both the presenter and the photo path', () => {
    expect(lip).toContain('splitAvatarScript(text).speech');
    expect(lip).toContain('JSON.stringify({ text: spoken, orientation: lipOrientation, gender: lipGender })');
    expect(lip).toContain('...(spoken ? { text: spoken } : {})');
    expect(lip).not.toMatch(/\.\.\.\(text \? \{ text \} : \{\}\)/);
  });
});

describe('avatar panel and Live hand-off wiring (GG 2026-10-16)', () => {
  it('the gallery opens with the user\'s own photo, and "My audio" offers upload and record', () => {
    expect(src).toContain("id: OWN_PHOTO_CARD_ID");
    expect(src).toContain("if (id === OWN_PHOTO_CARD_ID) { lipsyncFaceRef.current?.click(); return; }");
    expect(src).toContain('data-testid="avatar-my-audio"');
    expect(src).toContain("onClick={() => lipAudioRef.current?.click()}");
    expect(src).toContain("startVoiceRecording('avatar')");
    expect(src).toContain("(target === 'avatar' ? addAvatarAudio : addVoiceMedia)");
  });
  it('a Live prepare_generation for the avatar sets its format and voice', () => {
    const live = src.slice(src.indexOf('const applyLiveSettings'), src.indexOf('const liveResults'));
    expect(live).toContain("tool === 'avatar'");
    expect(live).toContain('setLipFormat(f)');
    expect(live).toContain("setLipGender(female ? 'female' : 'male')");
  });
});
