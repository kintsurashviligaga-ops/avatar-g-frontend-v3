import { mergeAvatarScript, splitAvatarScript } from './scriptSplit';

describe('splitAvatarScript — the avatar speaks only its words, never its stage directions', () => {
  it('GG\'s Production request (2026-10-16)', () => {
    expect(splitAvatarScript('ავატარი ემოციურად, ჟესტებით და ეფექტურად ამბობს: გადადი მაიავატარ.ჯიზე და შექმენი შენი ავატარი')).toEqual({
      speech: 'გადადი მაიავატარ.ჯიზე და შექმენი შენი ავატარი',
      direction: 'ავატარი ემოციურად, ჟესტებით და ეფექტურად',
    });
  });

  it('GG\'s Production order (2026-10-17): the language word before the colon, and the order itself is not a direction', () => {
    expect(splitAvatarScript('შექმენი ავატარი რომელიც ამბობს ქართულად: გადადი მაი ავატარ ჯიზე და დაიწყე')).toEqual({
      speech: 'გადადი მაი ავატარ ჯიზე და დაიწყე',
      direction: '',
    });
    expect(splitAvatarScript('შექმენი ავატარი, რომელიც ღიმილით ამბობს ქართულად: გამარჯობა')).toEqual({ speech: 'გამარჯობა', direction: 'ღიმილით' });
    expect(splitAvatarScript('Make an avatar that says in English: "Welcome aboard"')).toEqual({ speech: 'Welcome aboard', direction: '' });
    expect(splitAvatarScript('Создай аватар, который спокойно говорит по-русски: Добро пожаловать')).toEqual({ speech: 'Добро пожаловать', direction: 'спокойно' });
  });

  it('a quoted line after "says" (en · ru), and a quote with no marker', () => {
    expect(splitAvatarScript('Smiling warmly, she says "Welcome to MyAvatar.ge"')).toEqual({ speech: 'Welcome to MyAvatar.ge', direction: 'Smiling warmly, she' });
    expect(splitAvatarScript('Спокойно и уверенно говорит: «Добро пожаловать»')).toEqual({ speech: 'Добро пожаловать', direction: 'Спокойно и уверенно' });
    expect(splitAvatarScript('იღიმება და ხელს გვიქნევს, „გამარჯობა ყველას“')).toEqual({ speech: 'გამარჯობა ყველას', direction: 'იღიმება და ხელს გვიქნევს' });
  });

  it('stage directions in brackets or asterisks are never spoken', () => {
    expect(splitAvatarScript('(smiles) Hello everyone, *waves* welcome to the studio')).toEqual({ speech: 'Hello everyone, welcome to the studio', direction: 'smiles; waves' });
  });

  it('a plain script stays whole, including one that merely mentions saying', () => {
    expect(splitAvatarScript('გამარჯობა, მე ვარ თქვენი ასისტენტი')).toEqual({ speech: 'გამარჯობა, მე ვარ თქვენი ასისტენტი', direction: '' });
    expect(splitAvatarScript('The avatar says hello to everyone')).toEqual({ speech: 'The avatar says hello to everyone', direction: '' });
    expect(splitAvatarScript('')).toEqual({ speech: '', direction: '' });
  });

  it('GG 2026-10-18: an order is never the script — a bare order has no speech at all', () => {
    expect(splitAvatarScript('შემიქმენი ავატარი')).toEqual({ speech: '', direction: '' });
    expect(splitAvatarScript('create my avatar')).toEqual({ speech: '', direction: '' });
    expect(splitAvatarScript('შემიქმენი ჩემი ავატარი')).toEqual({ speech: '', direction: '' });
    expect(splitAvatarScript('Создай мой аватар')).toEqual({ speech: '', direction: '' });
  });

  it('GG 2026-10-18: after an order the verb alone (no colon) splits look from line', () => {
    expect(splitAvatarScript('შემიქმენი ავატარი ქალი, შავი თმით, თქვას გამარჯობა')).toEqual({ speech: 'გამარჯობა', direction: 'ქალი, შავი თმით' });
    expect(splitAvatarScript('make me an avatar of a young woman saying hello everyone')).toEqual({ speech: 'hello everyone', direction: 'a young woman' });
    expect(splitAvatarScript('Сделай аватар, который скажет добро пожаловать')).toEqual({ speech: 'добро пожаловать', direction: '' });
    // An order with a look and no line: the look is direction, nothing is spoken.
    expect(splitAvatarScript('შემიქმენი ავატარი ქალი, შავი თმით')).toEqual({ speech: '', direction: 'ქალი, შავი თმით' });
    // A colon right after the order marks the words.
    expect(splitAvatarScript('შექმენი ავატარი: გამარჯობა ყველას')).toEqual({ speech: 'გამარჯობა ყველას', direction: '' });
  });

  it('"says:" with a colon still works after the fix', () => {
    expect(splitAvatarScript('Create an avatar of a man who says: Welcome to the shop')).toEqual({ speech: 'Welcome to the shop', direction: 'a man who' });
    expect(splitAvatarScript('შექმენი ავატარი რომელიც ამბობს: გამარჯობა')).toEqual({ speech: 'გამარჯობა', direction: '' });
  });

  it('only stage directions: nothing to speak', () => {
    expect(splitAvatarScript('(smiles)')).toEqual({ speech: '', direction: 'smiles' });
  });
});

describe('mergeAvatarScript — the answer to "what should it say?"', () => {
  it('a bare order + the answer is the answer alone', () => {
    expect(mergeAvatarScript('შემიქმენი ავატარი', 'გამარჯობა ყველას')).toBe('გამარჯობა ყველას');
  });
  it('the look stays a direction, never spoken', () => {
    const merged = mergeAvatarScript('შემიქმენი ავატარი ქალი, შავი თმით', 'გამარჯობა ყველას');
    expect(splitAvatarScript(merged)).toEqual({ speech: 'გამარჯობა ყველას', direction: 'ქალი, შავი თმით' });
  });
  it('a thin line from the base is kept and the answer follows it', () => {
    expect(splitAvatarScript(mergeAvatarScript('hello', 'and welcome to the studio'))).toEqual({ speech: 'hello and welcome to the studio', direction: '' });
  });
  it('a look alone stays without speech', () => {
    expect(splitAvatarScript(mergeAvatarScript('create my avatar', 'a woman with black hair'.replace(/^/, '(') + ')'))).toEqual({ speech: '', direction: 'a woman with black hair' });
  });
});
