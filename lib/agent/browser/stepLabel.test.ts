import { browserStepLabel } from './stepLabel';

describe('browserStepLabel', () => {
  test('each step reads in the user\'s words', () => {
    expect(browserStepLabel({ op: 'goto', url: 'https://www.youtube.com/results?search_query=x' }, 'ka')).toBe('გახსნა youtube.com');
    expect(browserStepLabel({ op: 'type', selector: 'input[name=q]', text: 'ვაკე ბინა' }, 'ka')).toBe('ჩაწერა „ვაკე ბინა“');
    expect(browserStepLabel({ op: 'click', selector: 'button#search' }, 'en')).toBe('Click: button#search');
    expect(browserStepLabel({ op: 'wait', ms: 1500 }, 'en')).toBe('Wait 1.5 s');
    expect(browserStepLabel({ op: 'screenshot', name: 'home' }, 'ru')).toBe('Скриншот');
    expect(browserStepLabel({ op: 'text' }, 'en')).toBe('Read the text of the page');
  });
  test('a long selector is cut, a broken address does not throw', () => {
    expect(browserStepLabel({ op: 'click', selector: 'a'.repeat(80) }, 'en')).toMatch(/…$/);
    expect(browserStepLabel({ op: 'goto', url: 'not a url' }, 'en')).toBe('Open not a url');
  });
});
