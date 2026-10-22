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
    expect(lip).toContain('JSON.stringify({ text: spoken, orientation: lipOrientation, gender: voiceGender })');
    expect(lip).toContain('...(spoken ? { text: spoken } : {})');
    expect(lip).not.toMatch(/\.\.\.\(text \? \{ text \} : \{\}\)/);
  });
  it('the card, Veo, presenter and dub use the same resolved voice; auto never reaches a voice API', () => {
    expect(src).toContain('avatarVoiceGender(lipGender, hintText)');
    expect(src).toContain('gender: resolveLipGender(promptText)');
    expect(src).toContain('gender: resolveLipGender(text)');
    expect(lip).toContain('const voiceGender = resolveLipGender(text);');
    expect(lip).toContain('aspect: veoAspect, voiceGender,');
    expect(lip).toContain('...(lipMyVoice && hasTrainedVoice ? { useMyVoice: true } : { gender: voiceGender })');
    expect(lip).not.toContain('gender: lipGender');
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

describe('Veo avatar wiring (GG chose Veo, 2026-10-16)', () => {
  it('a photo with words tries the Google Veo avatar first and polls the scene status route; 423 falls back', () => {
    expect(lip).toContain("fetch('/api/avatar/veo'");
    expect(lip).toContain('if (veoRes.status !== 423)');
    expect(lip).toContain('/api/genjutsu/status?id=');
    expect(lip).toMatch(/if \(!audioUrl && spoken && /);
  });
});

describe('a talking avatar ordered with no photo, in the chat or the avatar tool (GG, 2026-10-17 07:39Z)', () => {
  const send = src.slice(src.indexOf('const send = useCallback(async'), src.indexOf("if (effMode === 'lipsync') {"));
  it('no photo and no preset: a ready presenter where the Veo avatar is open; HeyGen only when it is closed', () => {
    expect(lip).toContain('const veoDoor = !faceAtt && !lipPreset && text && !audioAtt ? await readVeoAvatarDoor() : null;');
    expect(lip).toContain('const lipFace = lipPreset ?? (veoDoor?.open ? stockAvatarFace(voiceGender, veoAspect) : null);');
    expect(lip).toContain('if (!faceAtt && !lipFace && text) {');
    expect(lip).toContain('const chosenPreset = lipFace;');
  });
  it('Veo gets the voice’s gender, the frame and the price on screen; a video face stays a dub', () => {
    expect(lip).toMatch(/if \(!audioUrl && spoken && \(!faceAtt \|\| isImage\(faceAtt\.mimeType\)\)\)/);
    expect(lip).toContain('aspect: veoAspect, voiceGender,');
    expect(lip).toContain('expectedCredits: veoDoorRef.current.credits');
  });
  it('every avatar price on screen is Veo’s where its door is open (the card said 20, Veo charges 25)', () => {
    expect(src).toContain("const avatarCredits = veoAvatarDoor?.open ? veoAvatarDoor.credits : quoteCredits({ tool: 'avatar' });");
    expect(src).toContain("if (tool === 'avatar') return avatarCredits || undefined;");
    expect(src).toContain("const composerQuote = activeTool === 'avatar' ? avatarCredits || null");
    expect(send).toContain("gateMode === 'avatar' ? (door?.open ? door.credits : quoteCredits({ tool: 'avatar' }))");
  });
  it('GG 2026-10-18: a closed door gets words, not a priced card, in the composer gate, the panel’s Generate and the chat', () => {
    const gate = send.slice(send.indexOf("const door = gateMode === 'avatar' ? await readVeoAvatarDoor() : null;"));
    const say = gate.indexOf("const say = !door?.open ? avatarUnavailableText(locale)");
    expect(say).toBeGreaterThan(0);
    // The words are said and the send returns BEFORE the card (its price, its Create) is built.
    expect(say).toBeLessThan(gate.indexOf('const card: AgentGCardState = { kind: verdict.kind'));
    expect(gate.slice(say, gate.indexOf('const credits = gateMode'))).toMatch(/agentSays\(say\);\s*return;/);
    expect(send).toMatch(/if \(gateMode === 'avatar' && !\(await readVeoAvatarDoor\(\)\)\?\.open\) \{\s*gatePendingRef\.current = null;\s*agentSays\(avatarUnavailableText\(locale\)\);\s*return;/);
    expect(send).toContain('const say = !avatarDoor.open ? avatarUnavailableText(locale)');
  });
  it('GG 2026-10-18: an order with no line asks for it; a line past the clip is asked to be shortened — before any card', () => {
    expect(send).toContain(': !line.speech && !hasAudio ? avatarAskLineText(locale)');
    expect(send).toContain(': fit && !fit.fits ? avatarShortenText(fit.seconds, locale) : null;');
    expect(send).toContain(': !avatarLine.speech ? avatarAskLineText(locale)');
    // The answer joins as a script (never „ავატარი, <line>"), and a bare „კი" to the question is not a script.
    expect(send).toContain('mergePrompt(pending.base, text, gateMode)');
    expect(send).toContain("!(pending.mode === 'avatar' && !splitAvatarScript(pending.base).speech)");
  });
  it('GG 2026-10-18: the Veo avatar is polled for as long as the server keeps the job (its 12-min cap), not 6 min', () => {
    expect(lip).toContain('const veoPollUntil = Date.now() + GENJUTSU_HARD_CAP_MS + 60_000;');
    expect(lip).toContain('while (Date.now() < veoPollUntil && vj.jobId && !veoUrl && !veoFail) {');
    expect(lip).not.toMatch(/for \(let i = 0; i < 60 && vj\.jobId/);
  });
  it('in the chat the order gets Agent G’s card, and its yes renders it as the avatar tool’s — no chat route reads it again', () => {
    expect(send).toContain("kind: 'confirm', target: 'avatar', prompt: text, credits: avatarDoor.credits, madeIn: 'chat', aspect,");
    expect(send).toContain("const chatAvatar = mode === 'chat' && opts?.confirmed === true && opts.target === 'avatar';");
    expect(send).toContain("if (chatAvatar) effMode = 'lipsync';");
    expect(send).toContain("const studio = mode === 'chat' && !chatAvatar ? detectStudioIntent(text) : null;");
    expect(send).toContain("const chatIntent = mode === 'chat' && !chatAvatar && text && isGenerativeCommand(text) ? detectIntent(text) : null;");
  });
});
