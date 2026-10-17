/** georgianToLatin — the line Veo says, so its face moves like someone saying the Georgian words (lib/avatar/veoAvatar). */
import { georgianToLatin } from './georgianLatin';

describe('georgianToLatin', () => {
  it('reads the Production line in Latin letters, punctuation and spaces kept', () => {
    expect(georgianToLatin('გადადი მაი ავატარ ჯიზე და დაიწყე')).toBe('gadadi mai avatar jize da daitsqe');
    expect(georgianToLatin('გამარჯობა, მე ვარ შენი ავატარი!')).toBe('gamarjoba, me var sheni avatari!');
  });
  it('covers the digraph letters and Mtavruli capitals; Latin and digits pass through', () => {
    expect(georgianToLatin('ჟღერს ხმა ძალიან ჭკვიანი წყალი ცხრა')).toBe('zhghers khma dzalian chkviani tsqali tskhra');
    expect(georgianToLatin('ᲒᲐᲛᲐᲠᲯᲝᲑᲐ')).toBe('gamarjoba');
    expect(georgianToLatin('MyAvatar.ge 2026')).toBe('MyAvatar.ge 2026');
  });
});
