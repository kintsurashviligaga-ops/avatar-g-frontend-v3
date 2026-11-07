/**
 * lib/agent/browser/stepLabel.ts — one planned browser step in the user's words, for the Start card's step list
 * (GG 2026-11-07 07:47Z: the user saw nothing of what Agent G was going to do or was doing). Pure.
 */
export type PlannedStep = { op: string; url?: string; selector?: string; text?: string; key?: string; ms?: number; name?: string };
type Lang = 'ka' | 'en' | 'ru';

const host = (u?: string) => {
  try { return u ? new URL(u).host.replace(/^www\./, '') : ''; } catch { return u ?? ''; }
};
const cut = (s: string | undefined, n = 40) => {
  const v = (s ?? '').trim();
  return v.length > n ? `${v.slice(0, n)}…` : v;
};

export function browserStepLabel(s: PlannedStep, lang: Lang): string {
  const L = {
    ka: { goto: 'გახსნა', click: 'დაჭერა', type: 'ჩაწერა', press: 'ღილაკი', wait: 'ლოდინი', text: 'ტექსტის წაკითხვა', links: 'შედეგების და ბმულების წაკითხვა', shot: 'სქრინშოტი', sec: 'წმ', page: 'გვერდიდან' },
    en: { goto: 'Open', click: 'Click', type: 'Type', press: 'Press', wait: 'Wait', text: 'Read the text', links: 'Read the results and links', shot: 'Screenshot', sec: 's', page: 'of the page' },
    ru: { goto: 'Открыть', click: 'Нажать', type: 'Ввести', press: 'Клавиша', wait: 'Ждать', text: 'Прочитать текст', links: 'Прочитать результаты и ссылки', shot: 'Скриншот', sec: 'с', page: 'страницы' },
  }[lang];
  switch (s.op) {
    case 'goto': return `${L.goto} ${host(s.url)}`;
    case 'click': return `${L.click}: ${cut(s.selector)}`;
    case 'type': return `${L.type} „${cut(s.text, 30)}“`;
    case 'press': return `${L.press}: ${cut(s.key, 20)}`;
    case 'wait': return `${L.wait} ${Math.round((s.ms ?? 0) / 100) / 10} ${L.sec}`;
    case 'text': return s.selector ? `${L.text}: ${cut(s.selector)}` : `${L.text} ${L.page}`;
    case 'links': return L.links;
    case 'screenshot': return L.shot;
    default: return s.op;
  }
}
