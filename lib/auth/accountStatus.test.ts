import { accountExists, isAccountStatus, lookupAccountStatus, statusFromRow } from './accountStatus';

describe('statusFromRow — the database answer → what the sign-in sheet does', () => {
  it.each([
    [{ exists: false, confirmed: false, password: null }, 'none'],
    // A sign-up nobody finished is not an account: log-in says „no account", sign-up re-sends its code.
    [{ exists: true, confirmed: false, password: false }, 'none'],
    [{ exists: true, confirmed: true, password: true }, 'password'],
    [{ exists: true, confirmed: true, password: false }, 'code'],
    // Made before the flag existed: it may have a password (the old email + password sign-up).
    [{ exists: true, confirmed: true, password: null }, 'password'],
  ])('%j → %s', (row, status) => {
    expect(statusFromRow(row)).toBe(status);
  });

  it.each([null, undefined, 'x', [], {}, { exists: 'yes', confirmed: true }])('malformed %j → unknown, never a guess', (row) => {
    expect(statusFromRow(row)).toBe('unknown');
  });
});

describe('lookupAccountStatus', () => {
  const client = (result: { data: unknown; error: unknown } | Error) => ({
    rpc: jest.fn(async () => { if (result instanceof Error) throw result; return result as { data: unknown; error: null }; }),
  });

  it('asks the server-only function by email or by phone — never both', async () => {
    const c = client({ data: { exists: true, confirmed: true, password: false }, error: null });
    expect(await lookupAccountStatus(c, { kind: 'email', email: 'a@example.com' })).toBe('code');
    expect(c.rpc).toHaveBeenCalledWith('auth_account_status', { p_email: 'a@example.com', p_phone: null });
    await lookupAccountStatus(c, { kind: 'phone', phone: '+995599123456' });
    expect(c.rpc).toHaveBeenLastCalledWith('auth_account_status', { p_email: null, p_phone: '+995599123456' });
  });

  it('fails soft to unknown when the function is not applied yet, or the database fails', async () => {
    expect(await lookupAccountStatus(client({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } }), { kind: 'email', email: 'a@example.com' })).toBe('unknown');
    expect(await lookupAccountStatus(client(new Error('network')), { kind: 'email', email: 'a@example.com' })).toBe('unknown');
  });

  it('isAccountStatus guards the client side of the wire', () => {
    expect(['none', 'password', 'code', 'unknown'].every(isAccountStatus)).toBe(true);
    expect(isAccountStatus('admin')).toBe(false);
  });
});

describe('accountExists — does the address have an account row at all (log-in must not create one)', () => {
  const client = (result: { data: unknown; error: unknown } | Error) => ({
    rpc: jest.fn(async () => { if (result instanceof Error) throw result; return result as { data: unknown; error: null }; }),
  });

  it('reads `exists` directly: an unconfirmed row exists, no row does not', async () => {
    expect(await accountExists(client({ data: { exists: false, confirmed: false, password: null }, error: null }), 'a@example.com')).toBe(false);
    expect(await accountExists(client({ data: { exists: true, confirmed: false, password: false }, error: null }), 'a@example.com')).toBe(true);
  });

  it('is null (not false) when the database cannot answer, so the caller never refuses on a guess', async () => {
    expect(await accountExists(client({ data: null, error: { message: 'boom' } }), 'a@example.com')).toBeNull();
    expect(await accountExists(client({ data: { exists: 'no' }, error: null }), 'a@example.com')).toBeNull();
    expect(await accountExists(client(new Error('network')), 'a@example.com')).toBeNull();
  });
});
