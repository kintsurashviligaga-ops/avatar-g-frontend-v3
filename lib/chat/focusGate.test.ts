/** @jest-environment node */
import { classifyFocusInput, gateButtons, gateMessage, isAffirmation, isConversational, mergePrompt, type GateMode } from './focusGate';

const verdict = (text: string, mode: GateMode = 'image', extra: { hasAttachments?: boolean; explicit?: boolean } = {}) =>
  classifyFocusInput({ text, mode, ...extra });
const kind = (text: string, mode: GateMode = 'image', extra: { hasAttachments?: boolean; explicit?: boolean } = {}) =>
  verdict(text, mode, extra).kind;

describe('THE BUG: talking to Agent G in a focus mode must never become a paid generation', () => {
  test.each([
    // the exact report
    'აქ ხარ?', 'აქ ხარ', 'ხარ აქ?', 'ხარ?',
    // presence
    'Are you here?', 'are you there', 'you there?', 'anyone here?', 'can you hear me', 'ты тут?', 'ты здесь', 'слышишь?', 'მისმენ?', 'გესმის?', 'ping', 'test',
    // greetings (any script, any punctuation, with an address)
    'hello', 'Hello!', 'hi', 'Hey there', 'good morning', 'hello agent g', 'hi bro', 'გამარჯობა', 'გამარჯობა აგენტ ჯი', 'სალამი!', 'დილა მშვიდობისა', 'привет', 'Привет!', 'здравствуйте', '👋', '???', '...',
    // smalltalk, thanks, acknowledgements
    'how are you', 'How are you?', 'როგორ ხარ?', 'რას აკეთებ', 'რა ხდება', 'как дела?', 'что делаешь', "what's up", 'thanks', 'thank you!', 'მადლობა', 'გმადლობ', 'спасибо', 'ok', 'okay', 'კარგი', 'ჰო', 'bye', 'ნახვამდის', 'пока',
    // who are you / what can you do
    'who are you', 'what can you do', 'ვინ ხარ?', 'რა შეგიძლია', 'кто ты', 'что ты умеешь?', 'help me', 'დამეხმარე',
    // any question
    'why is the sky blue?', 'how does this work', 'what do you think of cats', 'what is this?', 'რა არის ეს?', 'როგორ მუშაობს ეს?', 'როდის დასრულდება?', 'почему небо голубое?', 'сколько это стоит?',
    // greeting + question
    'hi, how are you?', 'hello, are you there?', 'გამარჯობა, როგორ ხარ?',
  ])('%p → chat', (text) => {
    for (const mode of ['image', 'video', 'music'] as const) {
      expect(kind(text, mode)).toBe('chat');
      // …and not even the panel's own Generate button may turn a greeting into a render
      expect(kind(text, mode, { explicit: true })).toBe('chat');
    }
  });
});

describe('a real prompt is NOT chat — it is confirmed (image · music) or planned (video)', () => {
  test.each([
    'a red fox in the snow, cinematic light',
    'ზღვა მზის ჩასვლისას, კინემატოგრაფიული სინათლე',
    'закат над морем в стиле аниме',
    'a cozy cabin in a pine forest at dawn',
    'What a beautiful sunset over the sea',          // an exclamation, not a question
    'nice sunset over the old harbour',               // starts with an acknowledgement word, is a prompt
    'no smoking sign on a brick wall',
    'test pattern grid on a CRT screen',
    'hello kitty on a skateboard in tokyo',           // greeting word + real content
    'hi, draw a red fox sitting in a snowy forest',   // greeting + an order
  ])('%p → confirm (image)', (text) => {
    expect(kind(text, 'image')).toBe('confirm');
  });

  test('an order phrased as a polite question is still an order, not chat', () => {
    expect(kind('can you draw a red fox sitting in a snowy forest?', 'image')).toBe('confirm');
    expect(kind('could you make a poster of a lighthouse at night', 'image')).toBe('confirm');
  });

  test('music needs less text than a picture; a video already has its storyboard approval', () => {
    expect(kind('lofi beat', 'music')).toBe('confirm');
    expect(kind('jazz', 'music')).toBe('clarify');
    expect(kind('a fox runs through a snowy forest at dawn, slow camera', 'video')).toBe('go');
  });
});

describe('a thin prompt gets questions, not a render', () => {
  test.each(['cat', 'კატა', 'кот', 'red fox', 'draw a cat', 'დახატე კატა'])('%p → clarify (image)', (text) => {
    expect(kind(text, 'image')).toBe('clarify');
  });
  test('a thin film brief is clarified too', () => {
    expect(kind('a dog running', 'video')).toBe('clarify');
  });
  test('a reference file means the words are an instruction about it — thin is fine', () => {
    expect(kind('make it vintage', 'image', { hasAttachments: true })).toBe('confirm');
  });
});

describe('the panel\'s own Generate button is the confirmation (its price is on it)', () => {
  test('a prompt — thin or full — goes straight through', () => {
    expect(kind('cat', 'image', { explicit: true })).toBe('go');
    expect(kind('a red fox in the snow, cinematic light', 'image', { explicit: true })).toBe('go');
    expect(kind('lofi beat', 'music', { explicit: true })).toBe('go');
  });
});

describe('isAffirmation — "yes, go ahead" in three languages', () => {
  test.each(['yes', 'Yes!', 'ok', 'go ahead', 'do it', 'create it', 'კი', 'ჰო', 'დიახ', 'ასე შექმენი', 'გააკეთე', 'да', 'давай', 'создавай'])('%p', (t) => {
    expect(isAffirmation(t)).toBe(true);
  });
  test.each(['hello', 'a red fox in the snow', 'no', 'არა', 'нет', 'yes but make it blue and bigger please now'])('%p is not', (t) => {
    expect(isAffirmation(t)).toBe(false);
  });
});

test('mergePrompt joins the thin prompt and the answer cleanly', () => {
  expect(mergePrompt('a red fox.', 'in a snowy forest, cinematic')).toBe('a red fox, in a snowy forest, cinematic');
  expect(mergePrompt('კატა', 'ფოტორეალისტური')).toBe('კატა, ფოტორეალისტური');
  expect(mergePrompt('', 'only the answer')).toBe('only the answer');
});

describe('Agent G\'s words', () => {
  test('every mode × language has a clarify text with questions, and a confirm that quotes the prompt', () => {
    for (const locale of ['ka', 'en', 'ru']) {
      for (const mode of ['image', 'video', 'music'] as const) {
        const ask = gateMessage({ kind: 'clarify', mode, prompt: 'x', locale });
        expect(ask.split('\n').filter((l) => l.startsWith('•')).length).toBeGreaterThanOrEqual(2);
        const sure = gateMessage({ kind: 'confirm', mode, prompt: 'a red fox', locale });
        expect(sure).toContain('a red fox');
      }
      const b = gateButtons(locale);
      expect(b.create && b.asIs && b.edit && b.stale).toBeTruthy();
    }
  });
  test('a very long prompt is shortened in the card, never dropped', () => {
    const long = 'word '.repeat(200);
    expect(gateMessage({ kind: 'confirm', mode: 'image', prompt: long, locale: 'en' }).length).toBeLessThan(500);
  });
});

describe('isConversational — the same verdict for the other doors (WhatsApp, Telegram)', () => {
  test.each(['აქ ხარ?', 'hello', 'how are you?', 'ты тут?', 'thanks', 'who are you', 'why is the sky blue?'])('%p is talk', (t) => {
    expect(isConversational(t)).toBe(true);
  });
  test.each(['a red fox in the snow, cinematic light', 'draw a cat', 'make a song about the sea', 'დახატე კატა მთაში'])('%p is an order, not talk', (t) => {
    expect(isConversational(t)).toBe(false);
  });
});

describe('avatar — the words are the script the presenter speaks', () => {
  test.each(['აქ ხარ?', 'გამარჯობა', 'hello', 'are you there?', 'Ты здесь?', 'როგორ ხარ?'])('“%s” is talk: answered in words, no video', (t) => {
    expect(kind(t, 'avatar')).toBe('chat');
  });
  test('a real script is confirmed first, with the line quoted as what the avatar will SAY', () => {
    expect(kind('Welcome to my channel, today we cook khachapuri together', 'avatar')).toBe('confirm');
    const msg = gateMessage({ kind: 'confirm', mode: 'avatar', prompt: 'Welcome to my channel', locale: 'en' });
    expect(msg).toContain('make the avatar say');
    expect(msg).toContain('Welcome to my channel');
  });
  test('a one-word script gets questions; the panel’s own Generate button goes straight through', () => {
    expect(kind('Welcome', 'avatar')).toBe('clarify');
    expect(gateMessage({ kind: 'clarify', mode: 'avatar', prompt: 'Welcome', locale: 'ka' })).toContain('🎙️');
    expect(kind('Welcome everyone to the show', 'avatar', { explicit: true })).toBe('go');
  });
});
