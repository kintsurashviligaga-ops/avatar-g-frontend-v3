/** @jest-environment node */
import { siteAsk } from './siteAsk';

describe('siteAsk — acting on myavatar.ge itself (GG 2026-11-07 09:36Z)', () => {
  test.each([
    'გადადი ბიბლიოთეკაში და გადმოწერე ბოლო ვიდეო',
    'დააკლიკე პარამეტრებს',
    'შეავსე ეს ველი ჩემი სახელით',
    'myavatar.ge-ზე გახსენი ფასები',
    'open my library here',
    'click the settings button on this page',
    'открой библиотеку на сайте',
  ])('%s → this site', (t) => expect(siteAsk(t)).toBe(true));

  test.each([
    'გახსენი youtube და მოძებნე tupac',
    'გახსენი magticom.ge საიტი',
    'open github.com',
    'რა არის ბიბლიოთეკა?',
    'გამარჯობა',
    'შექმენი ვიდეო ზღვაზე',
  ])('%s → not this site', (t) => expect(siteAsk(t)).toBe(false));
});
