/** @jest-environment node */
import {
  linkTypeFor,
  verifyTypeFor,
  isOtpPurpose,
  isSixDigitCode,
  extractEmailOtp,
  isPlausibleEmail,
  normalizeLocale,
  buildOtpEmail,
} from './otpEmail';

describe('purpose → Supabase vocabulary', () => {
  it('maps to the right generateLink type', () => {
    expect(linkTypeFor('signup')).toBe('signup');
    expect(linkTypeFor('signin')).toBe('magiclink');
  });

  it('maps to the right verifyOtp type — the mismatch that silently rejected valid codes', () => {
    // A sign-in code verified as 'signup' is rejected by Supabase, and vice versa. This pairing is the
    // whole reason the client tracks which flow issued the code.
    expect(verifyTypeFor('signup')).toBe('signup');
    expect(verifyTypeFor('signin')).toBe('email');
  });

  it('validates the purpose rather than trusting the request body', () => {
    expect(isOtpPurpose('signup')).toBe(true);
    expect(isOtpPurpose('signin')).toBe(true);
    expect(isOtpPurpose('magiclink')).toBe(false);
    expect(isOtpPurpose(undefined)).toBe(false);
  });
});

describe('extracting the code from generateLink', () => {
  it('reads the SDK shape (properties.email_otp)', () => {
    expect(extractEmailOtp({ properties: { email_otp: '123456' } })).toBe('123456');
  });

  it('reads the raw GoTrue shape (top-level email_otp)', () => {
    expect(extractEmailOtp({ email_otp: '654321' })).toBe('654321');
  });

  it('reads through the SDK data wrapper', () => {
    expect(extractEmailOtp({ data: { properties: { email_otp: '000111' } } })).toBe('000111');
  });

  it('REFUSES anything that is not exactly six digits — mailing a wrong code locks the user out', () => {
    expect(extractEmailOtp({ properties: { email_otp: '12345' } })).toBeNull();
    expect(extractEmailOtp({ properties: { email_otp: '1234567' } })).toBeNull();
    expect(extractEmailOtp({ properties: { email_otp: 'abc123' } })).toBeNull();
    expect(extractEmailOtp({ properties: { email_otp: '' } })).toBeNull();
    expect(extractEmailOtp({ properties: { email_otp: 123456 } })).toBeNull();
  });

  it('returns null on a contract change instead of guessing', () => {
    expect(extractEmailOtp({ properties: { action_link: 'https://x' } })).toBeNull();
    expect(extractEmailOtp(null)).toBeNull();
    expect(extractEmailOtp('nope')).toBeNull();
    expect(extractEmailOtp({})).toBeNull();
  });

  it('isSixDigitCode is strict about leading zeros being kept as a string', () => {
    expect(isSixDigitCode('000000')).toBe(true);
    expect(isSixDigitCode('0')).toBe(false);
  });
});

describe('email address guard', () => {
  it('accepts ordinary addresses and rejects junk', () => {
    expect(isPlausibleEmail('a@b.co')).toBe(true);
    expect(isPlausibleEmail('user.name+tag@example.co.uk')).toBe(true);
    expect(isPlausibleEmail('no-at-sign')).toBe(false);
    expect(isPlausibleEmail('a@b')).toBe(false);
    expect(isPlausibleEmail('a b@c.de')).toBe(false);
    expect(isPlausibleEmail('')).toBe(false);
    expect(isPlausibleEmail(`${'x'.repeat(250)}@b.co`)).toBe(false);
  });
});

describe('the email itself', () => {
  it('puts the code in the SUBJECT so it is readable from a phone notification', () => {
    const mail = buildOtpEmail('123456', 'signup', 'en');
    expect(mail?.subject.startsWith('123456')).toBe(true);
  });

  it('renders the code in the body, in all three locales, for both purposes', () => {
    for (const loc of ['ka', 'en', 'ru'] as const) {
      for (const purpose of ['signup', 'signin'] as const) {
        const mail = buildOtpEmail('246810', purpose, loc);
        expect(mail).not.toBeNull();
        expect(mail!.html).toContain('246810');
        expect(mail!.text).toContain('246810');
        expect(mail!.subject.length).toBeGreaterThan(6);
      }
    }
  });

  it('says the code expires and is single-use — the two things people ask support about', () => {
    const mail = buildOtpEmail('111111', 'signin', 'en');
    expect(mail!.text.toLowerCase()).toContain('once');
  });

  it('refuses to build a mail for a malformed code', () => {
    expect(buildOtpEmail('12345', 'signup', 'en')).toBeNull();
    expect(buildOtpEmail('', 'signup', 'en')).toBeNull();
  });

  it('defaults to Georgian for an unknown locale — this product default is ka, not en', () => {
    expect(normalizeLocale('xx')).toBe('ka');
    expect(normalizeLocale(undefined)).toBe('ka');
    expect(normalizeLocale('ru')).toBe('ru');
  });
});
