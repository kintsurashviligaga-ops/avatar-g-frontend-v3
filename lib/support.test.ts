import { SUPPORT_EMAIL, validateSupportRequest, buildSupportMailto } from './support';

describe('validateSupportRequest', () => {
  test('accepts a valid request and trims fields', () => {
    const r = validateSupportRequest({ email: ' a@b.co ', message: '  need help please  ', name: ' Gio ' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.email).toBe('a@b.co');
      expect(r.value.message).toBe('need help please');
      expect(r.value.name).toBe('Gio');
    }
  });
  test('rejects bad email', () => {
    expect(validateSupportRequest({ email: 'nope', message: 'hello there' }).ok).toBe(false);
  });
  test('rejects short message', () => {
    expect(validateSupportRequest({ email: 'a@b.co', message: 'x' }).ok).toBe(false);
  });
  test('rejects oversized message', () => {
    expect(validateSupportRequest({ email: 'a@b.co', message: 'x'.repeat(5001) }).ok).toBe(false);
  });
  test('rejects non-object', () => {
    expect(validateSupportRequest(null).ok).toBe(false);
    expect(validateSupportRequest('hi').ok).toBe(false);
  });
});

describe('buildSupportMailto', () => {
  test('targets the official support node', () => {
    expect(buildSupportMailto()).toContain(`mailto:${SUPPORT_EMAIL}`);
    expect(SUPPORT_EMAIL).toBe('support@myavatar.ge');
  });
  test('encodes subject + body', () => {
    const link = buildSupportMailto({ subject: 'Billing issue', message: 'charged twice', email: 'a@b.co' });
    expect(link).toMatch(/subject=Billing\+issue|subject=Billing%20issue/);
    expect(link).toContain('body=');
  });
});
