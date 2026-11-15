/** Agent G's presentation ask (ka / en / ru) → one Studio request and plan, before anything is charged. */
import { extractScript, parseStudioAsk, planAgentPresentation } from './agent';
import { OMNI_PRESENTERS } from './catalog';
import { offerToVideo, resetStudioClips, studioClips, takeStudioClip } from './videoHandoff';
import { studioChatClientOn } from './flag';

const KA = 'გამარჯობა, მე ვარ თქვენი ვირტუალური წამყვანი. დღეს გაჩვენებთ, როგორ ქმნის მაიავატარი პრეზენტაციას რამდენიმე წუთში.';
const EN = 'Hello and welcome. Today I will show you how one script becomes a short presentation with a presenter.';

describe('parseStudioAsk', () => {
  it('reads an English ask with the script after a colon', () => {
    const a = parseStudioAsk(`Make a presentation from this script: ${EN}`)!;
    expect(a.request).toMatchObject({ script: EN, presenterId: 'live-kira', voiceId: 'Kore' });
  });
  it('reads a Georgian ask with a male presenter and Algieba', () => {
    const a = parseStudioAsk(`გააკეთე პრეზენტაცია ამ ტექსტით, კაცი წამყვანით და Algieba ხმით:\n${KA}`)!;
    expect(a.request).toMatchObject({ script: KA, presenterId: 'live-ben', voiceId: 'Algieba' });
    expect(a.hints).toEqual(['male', 'voice:Algieba']);
  });
  it('reads a Russian ask, vertical, cinematic', () => {
    const a = parseStudioAsk(`Сделай кино презентацию по этому тексту, вертикально: «${EN}»`)!;
    expect(a.request).toMatchObject({ script: EN, presenterId: OMNI_PRESENTERS[0]!.id, voiceId: null, format: '9:16' });
  });
  it('a casual presenter is Leo', () => {
    expect(parseStudioAsk(`casual presentation from this text: ${EN}`)!.request.presenterId).toBe('live-leo');
  });
  it('is not an ask without a presentation word or without a script word', () => {
    expect(parseStudioAsk('make a video of a cat')).toBeNull();
    expect(parseStudioAsk('the presentation went well')).toBeNull();
  });
  it('asks with no script yet → empty script', () => {
    expect(parseStudioAsk('make a presentation from my script')!.request.script).toBe('');
  });
  it('a too-short tail is not a script', () => {
    expect(extractScript('presentation from this script: hi')).toBeNull();
  });
});

describe('planAgentPresentation', () => {
  it('plans the storyboard with prices', () => {
    const r = planAgentPresentation(`Make a presentation from this script: ${EN}`, { book: 'v8' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.plan.scenes.length).toBe(1);
      expect(r.plan.quote.total).toBeGreaterThan(0);
    }
  });
  it('says what is missing', () => {
    expect(planAgentPresentation('hello', { book: 'v8' })).toEqual({ ok: false, reason: 'not_presentation' });
    expect(planAgentPresentation('make a presentation from my script', { book: 'v8' })).toMatchObject({ ok: false, reason: 'no_script' });
  });
});

describe('Use in Video hand-off', () => {
  beforeEach(() => resetStudioClips());
  it('offers a clip, replaces the same scene, and is taken once', () => {
    expect(offerToVideo({ key: 'p:0', url: 'https://s.example/a.mp4', durationSec: 10, title: 'Scene 1', text: 'a', format: '16:9', at: 1 })).toBe(true);
    offerToVideo({ key: 'p:0', url: 'https://s.example/b.mp4', durationSec: 11, title: 'Scene 1', text: 'b', format: '16:9', at: 2 });
    offerToVideo({ key: 'p:1', url: 'https://s.example/c.mp4', durationSec: 9, title: 'Scene 2', text: 'c', format: '16:9', at: 3 });
    expect(studioClips().map((c) => c.url)).toEqual(['https://s.example/c.mp4', 'https://s.example/b.mp4']);
    expect(takeStudioClip('p:0')!.url).toBe('https://s.example/b.mp4');
    expect(takeStudioClip('p:0')).toBeNull();
  });
  it('refuses a non-https link or no length', () => {
    expect(offerToVideo({ key: 'x', url: 'javascript:alert(1)', durationSec: 5, title: '', text: '', format: '16:9' })).toBe(false);
    expect(offerToVideo({ key: 'x', url: 'https://s.example/a.mp4', durationSec: 0, title: '', text: '', format: '16:9' })).toBe(false);
  });
});

describe('chat flag', () => {
  it('only admin or everyone shows the chat card', () => {
    expect(studioChatClientOn('admin')).toBe(true);
    expect(studioChatClientOn('everyone')).toBe(true);
    expect(studioChatClientOn('1')).toBe(false);
    expect(studioChatClientOn(undefined)).toBe(false);
  });
});
