/** @jest-environment node */
import { detectSendToEmailCommand } from './mailCommand';

describe('detectSendToEmailCommand', () => {
  test('matches Georgian send-to-email phrasings', () => {
    expect(detectSendToEmailCommand('G, გააგზავნე ეს ცხრილი ჩემს მეილზე')).toBe(true);
    expect(detectSendToEmailCommand('გამომიგზავნე ეს დოკუმენტი ელფოსტაზე')).toBe(true);
  });

  test('matches English phrasings', () => {
    expect(detectSendToEmailCommand('send this to my email')).toBe(true);
    expect(detectSendToEmailCommand('email me this table please')).toBe(true);
  });

  test('matches Russian phrasings', () => {
    expect(detectSendToEmailCommand('отправь это на почту')).toBe(true);
  });

  test('matches "mail me the document" (doc-noun object)', () => {
    expect(detectSendToEmailCommand('mail me the document')).toBe(true);
    expect(detectSendToEmailCommand('send that to my email')).toBe(true);
  });

  test('does NOT match messages that merely mention email', () => {
    expect(detectSendToEmailCommand('what is my email address?')).toBe(false);
    expect(detectSendToEmailCommand('build me a table of the top 5 cities')).toBe(false);
    expect(detectSendToEmailCommand('')).toBe(false);
  });

  test('does NOT intercept a generation request that mentions email but has no demonstrative object', () => {
    expect(detectSendToEmailCommand('email me a marketing plan')).toBe(false);
    expect(detectSendToEmailCommand('write an email newsletter about our launch')).toBe(false);
  });
});
