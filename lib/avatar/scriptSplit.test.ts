import { splitAvatarScript } from './scriptSplit';

describe('splitAvatarScript — the avatar speaks only its words, never its stage directions', () => {
  it('GG\'s Production request (2026-10-16)', () => {
    expect(splitAvatarScript('ავატარი ემოციურად, ჟესტებით და ეფექტურად ამბობს: გადადი მაიავატარ.ჯიზე და შექმენი შენი ავატარი')).toEqual({
      speech: 'გადადი მაიავატარ.ჯიზე და შექმენი შენი ავატარი',
      direction: 'ავატარი ემოციურად, ჟესტებით და ეფექტურად',
    });
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
});
