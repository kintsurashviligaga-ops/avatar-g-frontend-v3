/** @jest-environment node */
// The cron gate: an unset secret refuses everything; the Bearer header or x-cron-token must match exactly.
jest.mock('server-only', () => ({}));
import { isCronAuthorized } from './cronAuth';

const req = (headers: Record<string, string>) => new Request('https://myavatar.ge/api/cron/deliveries', { headers });
const saved = process.env.CRON_SECRET;
afterEach(() => { if (saved === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = saved; });

describe('isCronAuthorized', () => {
  it('refuses every caller while CRON_SECRET is unset, "Bearer undefined" included', () => {
    delete process.env.CRON_SECRET;
    expect(isCronAuthorized(req({ authorization: 'Bearer undefined' }))).toBe(false);
    expect(isCronAuthorized(req({ authorization: 'Bearer ' }))).toBe(false);
    expect(isCronAuthorized(req({ 'x-cron-token': '' }))).toBe(false);
  });

  it('accepts the Bearer header or x-cron-token carrying the secret', () => {
    process.env.CRON_SECRET = 'cron-test-secret';
    expect(isCronAuthorized(req({ authorization: 'Bearer cron-test-secret' }))).toBe(true);
    expect(isCronAuthorized(req({ 'x-cron-token': 'cron-test-secret' }))).toBe(true);
  });

  it('refuses a wrong, partial or schemeless secret', () => {
    process.env.CRON_SECRET = 'cron-test-secret';
    expect(isCronAuthorized(req({}))).toBe(false);
    expect(isCronAuthorized(req({ authorization: 'Bearer cron-test-secreT' }))).toBe(false);
    expect(isCronAuthorized(req({ authorization: 'Bearer cron-test' }))).toBe(false);
    expect(isCronAuthorized(req({ authorization: 'cron-test-secret' }))).toBe(false);
    expect(isCronAuthorized(req({ authorization: 'Basic cron-test-secret' }))).toBe(false);
    expect(isCronAuthorized(req({ 'x-cron-token': 'cron-test-secret-and-more' }))).toBe(false);
  });
});
