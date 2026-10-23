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
  // MASTER TASK v3.1 PR 9 (GG, 2026-10-22: built-in avatars only): the HeyGen presenter and the /api/video/lipsync dub,
  // which the Google-only boundary refused (their 3× retry of a 503 ended in "re-attach the photo", 2026-10-16), are gone.
  it('the avatar calls the Veo avatar only: no HeyGen presenter, no lip-sync dub, no upload of the face', () => {
    expect(lip).toContain("fetch('/api/avatar/veo'");
    expect(lip).not.toContain('/api/heygen/');
    expect(lip).not.toContain('/api/video/lipsync');
    expect(lip).not.toContain('uploadBigFile(');
  });
  it('only the spoken words reach the voice', () => {
    expect(lip).toContain('const spoken = splitAvatarScript(text).speech || text;');
    expect(lip).toContain('avatar: lipFace, speech: spoken, direction: splitAvatarScript(text).direction, aspect: veoAspect, voiceGender,');
    expect(lip).not.toMatch(/speech: text[,\s]/);
  });
  it('the card and Veo use the same resolved voice; auto never reaches a voice API', () => {
    expect(src).toContain('avatarVoiceGender(lipGender, hintText)');
    expect(src).toContain('gender: resolveLipGender(promptText)');
    expect(src).toContain('gender: resolveLipGender(text)');
    expect(lip).toContain('const voiceGender = resolveLipGender(text);');
    expect(lip).toContain('aspect: veoAspect, voiceGender,');
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
  it('a built-in face with words goes to the Google Veo avatar and polls the scene status route; 423 is said, not fallen back from', () => {
    expect(lip).toContain("fetch('/api/avatar/veo'");
    expect(lip).toContain('/api/genjutsu/status?id=');
    expect(lip).toContain(': veoRes.status === 423 ? avatarUnavailableText(locale) : describeGenerationFailure(vj, locale, t.lipsyncFailed);');
    expect(lip).not.toContain('veoRes.status !== 423');
  });
});

describe('built-in avatars only (GG, 2026-10-22; MASTER TASK v3.1 PR 9)', () => {
  const send = src.slice(src.indexOf('const send = useCallback(async'), src.indexOf("if (effMode === 'lipsync') {"));
  const sayGap = "setMessages((prev) => [...prev, { role: 'assistant', text: customAvatarText(locale, { kept: true }), notice: true }]);";
  it('the face is the picked preset or a ready presenter, and only a built-in face is named to the server', () => {
    expect(lip).toContain('const lipFace = curatedAvatarFace(lipPreset ?? stockAvatarFace(voiceGender, veoAspect));');
    expect(lip).toContain("const ownFace = cardFace || attachments.some((a) => isImage(a.mimeType) || isVideo(a.mimeType) || isAudio(a.mimeType));");
  });
  it('an own photo, video, voice or twin face says the gap and returns BEFORE the draft is cleared or anything is sent', () => {
    const gate = lip.indexOf('if (ownFace || !lipFace) {');
    expect(gate).toBeGreaterThan(0);
    expect(lip.slice(gate, gate + 220)).toContain(sayGap);
    expect(lip.slice(gate, gate + 220)).toMatch(/notice: true \}\]\);\s*return;/);
    expect(gate).toBeLessThan(lip.indexOf("setInput(''); setAttachments([]); setBusy(true);"));
    expect(gate).toBeLessThan(lip.indexOf("fetch('/api/avatar/veo'"));
  });
  it('the composer gate and the chat order say the same gap before any card or price, keeping the draft', () => {
    const gate = send.slice(send.indexOf("if (gateMode === 'avatar') {"));
    expect(gate).toContain("const customFace = hasAudio || attachments.some((a) => isImage(a.mimeType) || isVideo(a.mimeType)) || (!!lipPreset && !curatedAvatarFace(lipPreset));");
    expect(gate.indexOf(sayGap)).toBeLessThan(gate.indexOf('const card: AgentGCardState = { kind: verdict.kind'));
    expect(src).toMatch(/if \(customFace && avatarDoor\?\.open\) \{\s*gatePendingRef\.current = null;\s*setMessages\(\(prev\) => \[\.\.\.prev, \{ role: 'assistant', text: customAvatarText\(locale, \{ kept: true \}\), notice: true \}\]\);\s*return;/);
    // No card offers "your photo" any more, and no retake carries one.
    expect(src).not.toContain("? 'photo' : lipPreset ? 'preset' : 'stock'");
    expect(src).not.toContain('refImage: spec.photo');
    expect(src).not.toContain('refImage: photo.dataUrl');
  });
});

describe('a talking avatar ordered with no photo, in the chat or the avatar tool (GG, 2026-10-17 07:39Z)', () => {
  const send = src.slice(src.indexOf('const send = useCallback(async'), src.indexOf("if (effMode === 'lipsync') {"));
  it('Veo gets the voice’s gender, the frame and the price on screen', () => {
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
    expect(send).toContain("kind: 'confirm', target: 'avatar', prompt: text, credits: avatarDoor.credits, madeIn: 'chat', aspect };");
    expect(send).toContain("const chatAvatar = mode === 'chat' && opts?.confirmed === true && opts.target === 'avatar';");
    expect(send).toContain("if (chatAvatar) effMode = 'lipsync';");
    expect(send).toContain("const studio = mode === 'chat' && !chatAvatar ? detectStudioIntent(text) : null;");
    expect(send).toContain("const chatIntent = mode === 'chat' && !chatAvatar && text && isGenerativeCommand(text) ? detectIntent(text) : null;");
  });
});
