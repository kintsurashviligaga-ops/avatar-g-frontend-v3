import { formatPhone, looksLikePhone, normalizePhone, parseIdentifier } from './identifier';

describe('the one sign-in field', () => {
  it('reads an email, lower-cased', () => {
    expect(parseIdentifier('  Giorgi@Example.GE ', { phone: true })).toEqual({ kind: 'email', email: 'giorgi@example.ge' });
    expect(parseIdentifier('giorgi@example', { phone: true })).toEqual({ kind: 'invalid' });
  });

  it('reads an address copied from a mail link (mailto:) as the address', () => {
    expect(parseIdentifier('mailto:kintsurashviligaga+ru@gmail.com', { phone: false }))
      .toEqual({ kind: 'email', email: 'kintsurashviligaga+ru@gmail.com' });
    expect(parseIdentifier(' MAILTO: Giorgi@Example.GE ', { phone: true })).toEqual({ kind: 'email', email: 'giorgi@example.ge' });
    expect(parseIdentifier('mailto:', { phone: true })).toEqual({ kind: 'invalid' });
  });

  it('reads a Georgian mobile however it is typed', () => {
    for (const typed of ['599 12 34 56', '599123456', '599-12-34-56', '(599) 12 34 56', '+995 599 12 34 56', '995599123456', '00995599123456', '0599123456']) {
      expect(parseIdentifier(typed, { phone: true })).toEqual({ kind: 'phone', phone: '+995599123456' });
    }
  });

  it('reads an international number with its +', () => {
    expect(normalizePhone('+1 (415) 555-0100')).toBe('+14155550100');
    expect(normalizePhone('+44 7700 900123')).toBe('+447700900123');
  });

  it('refuses what is not a number', () => {
    for (const bad of ['4155550100', '12345', '+0123456789', '599 12 34', '59912345678', '+995 599 12 34 56 78 90 12', 'abc', '5+99123456']) {
      expect(normalizePhone(bad)).toBeNull();
    }
  });

  it('asks for an email only while phone sign-in is off', () => {
    expect(parseIdentifier('599 12 34 56', { phone: false })).toEqual({ kind: 'invalid' });
    expect(parseIdentifier('a@b.ge', { phone: false })).toEqual({ kind: 'email', email: 'a@b.ge' });
  });

  it('knows when the person is typing a number (the field icon)', () => {
    expect(looksLikePhone('599')).toBe(true);
    expect(looksLikePhone('+995')).toBe(true);
    expect(looksLikePhone('giorgi')).toBe(false);
    expect(looksLikePhone('599@')).toBe(false);
    expect(looksLikePhone('')).toBe(false);
  });

  it('shows the number back readably', () => {
    expect(formatPhone('+995599123456')).toBe('+995 599 12 34 56');
    expect(formatPhone('+14155550100')).toBe('+14155550100');
  });
});
