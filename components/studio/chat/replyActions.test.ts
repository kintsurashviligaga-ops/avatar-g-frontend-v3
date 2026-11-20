/** @jest-environment jsdom */
import { replyLang, COPY_FAILED, recordErrorText } from './replyActions';
import { copyText } from '@/lib/clipboard/copyText';


const GEORGIAN = /[ა-ჿ]/;
const err = (name: string, message = '') => Object.assign(new Error(message), { name });

describe('chat reply actions (Phase 8.13)', () => {
  test('every recorder failure has a Georgian sentence, and none leaks English into ka', () => {
    for (const e of [err('NotAllowedError'), err('NotAllowedError', 'Permission denied by system'), err('NotFoundError'), err('NotReadableError'), err('OverconstrainedError'), new TypeError('x'), 'weird', null]) {
      const t = recordErrorText(e, 'ka');
      expect(t).toMatch(GEORGIAN);
      expect(t).not.toMatch(/[A-Za-z]{4,}/);
    }
    expect(recordErrorText(err('NotAllowedError'), 'ka')).toMatch(/ბოქლომს/);
    expect(recordErrorText(err('NotAllowedError', 'Permission denied by system'), 'ka')).toMatch(/სისტემის/);
    expect(recordErrorText(err('NotFoundError'), 'en')).toMatch(/No microphone/);
    expect(recordErrorText(err('NotReadableError'), 'ru')).toMatch(/занят/);
  });

  test('copy-failed note exists in each language; unknown locale is Georgian', () => {
    expect(COPY_FAILED.ka).toMatch(GEORGIAN);
    expect(replyLang('de')).toBe('ka');
    expect(replyLang('en')).toBe('en');
  });

  test('copyText falls back to execCommand when the async clipboard is refused, and reports a total failure', async () => {
    const writeText = jest.fn(async () => { throw new Error('denied'); });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const exec = jest.fn(() => true);
    (document as unknown as { execCommand: unknown }).execCommand = exec;
    expect(await copyText('hello')).toBe(true);
    expect(writeText).toHaveBeenCalledWith('hello');
    expect(exec).toHaveBeenCalledWith('copy');
    exec.mockReturnValueOnce(false);
    expect(await copyText('hello')).toBe(false);
    expect(document.querySelectorAll('textarea')).toHaveLength(0);
  });
});
