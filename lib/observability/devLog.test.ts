/** Phase 8.15: browser notices print while building and testing, and never on myavatar.ge. */
import { devInfo, devWarn } from './devLog';

const env = process.env as Record<string, string | undefined>;
const before = env.NODE_ENV;
afterEach(() => { env.NODE_ENV = before; jest.restoreAllMocks(); });

test('prints outside production', () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  env.NODE_ENV = 'development';
  devWarn('[x] a');
  expect(warn).toHaveBeenCalledWith('[x] a');
});

test('is silent in production', () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  const info = jest.spyOn(console, 'info').mockImplementation(() => {});
  env.NODE_ENV = 'production';
  devWarn('[x] a');
  devInfo('[x] b');
  expect(warn).not.toHaveBeenCalled();
  expect(info).not.toHaveBeenCalled();
});
