/** @jest-environment node */
/**
 * The report voice-command matcher: Georgian inflections first (the language the product is for, and the one an ASCII `\b`
 * silently breaks), then English and Russian — and the false positives that matter: a QUESTION about the report must stay a
 * question ("what is the main RISK", "will the market stop?"), and control words only act when they are the whole utterance.
 */
import { COMMAND_HINTS, matchReportCommand, reportTokens, type ReportIntent } from './voiceCommands';

const intent = (s: string): ReportIntent => matchReportCommand(s).intent;

describe('tokens — Unicode-aware, never ASCII word boundaries', () => {
  test('Georgian, Cyrillic and Latin words split on punctuation and spaces, lower-cased', () => {
    expect(reportTokens('შეაჯამე, გთხოვ! «Суммируй» it’s OK.')).toEqual(['შეაჯამე', 'გთხოვ', 'суммируй', 'its', 'ok']);
  });
  test('Georgian capitals (Mtavruli) fold to the lower case a recognizer returns', () => {
    expect(reportTokens('ᲨᲔᲐᲯᲐᲛᲔ')).toEqual(['შეაჯამე']);
    expect(intent('ᲨᲔᲐᲯᲐᲛᲔ')).toBe('summarize');
  });
  test('digits are kept, empty input gives no tokens', () => {
    expect(reportTokens('  ,, ')).toEqual([]);
    expect(reportTokens('top 5')).toEqual(['top', '5']);
    expect(matchReportCommand('   ')).toMatchObject({ intent: 'none' });
  });
  test('a regex with ASCII \\b would NOT find these words — proof the token scan is needed', () => {
    expect(/\bშეაჯამე\b/.test('შეაჯამე')).toBe(false); // \b needs a \w neighbour; Georgian letters are not \w
    expect(intent('შეაჯამე')).toBe('summarize');
  });
});

describe('Georgian — summarize (შეაჯამე and its inflections)', () => {
  test.each([
    'შეაჯამე',
    'შეაჯამეთ',
    'შეაჯამე ეს ანგარიში',
    'გთხოვ შეაჯამო',
    'შემიჯამე ეს',
    'შეგვიჯამე ანგარიში',
    'მომეცი შეჯამება',
    'მინდა მოკლე შეჯამება',
    'შეჯამება მინდა',
    'ანგარიშის რეზიუმე',
    'მოკლედ მითხარი რა წერია',
    'დააჯამე ეს ტექსტი',
    'შეაჯამებ?',
    'ᲨᲔᲐᲯᲐᲛᲔ ᲔᲡ',
  ])('%s → summarize', (u) => {
    expect(intent(u)).toBe('summarize');
  });
});

describe('Georgian — key takeaways (ამოიღე მთავარი არსი and its neighbours)', () => {
  test.each([
    'ამოიღე მთავარი არსი',
    'ამოიღე მთავარი არსი ამ ანგარიშიდან',
    'გთხოვ ამოიღე მთავარი',
    'ამოიღეთ მთავარი არსი',
    'მთავარი არსი',
    'მთავარი აზრი რა არის',
    'ძირითადი აზრი',
    'ძირითადი დასკვნები',
    'მთავარი დასკვნები მითხარი',
    'მთავარი პუნქტები',
    'ძირითადი პუნქტები ჩამომიწერე',
    'ჩამოწერე მთავარი თეზისები',
    'გამოყავი მთავარი',
    'გამოაყოფ ძირითად ფაქტებს',
    'რა არის მთავარი',
    'ყველაზე მნიშვნელოვანი დასკვნები',
    'მთავარი მიგნებები',
  ])('%s → takeaways', (u) => {
    expect(intent(u)).toBe('takeaways');
  });
});

describe('Georgian — read it to me (წამიკითხე and its inflections)', () => {
  test.each([
    'წამიკითხე',
    'წაგვიკითხე',
    'წაიკითხე ანგარიში',
    'წაიკითხეთ ხმამაღლა',
    'ხმამაღლა წაიკითხე',
    'მიკითხე',
    'ამომიკითხე ანგარიში',
    'წამიკითხავ?',
    'გახმოვანე ანგარიში',
    'მინდა მოვისმინო',
    'მომასმინე ანგარიში',
    'წამიკითხე ეს ანგარიში თავიდან',
  ])('%s → read (always aloud)', (u) => {
    expect(matchReportCommand(u)).toMatchObject({ intent: 'read', aloud: true });
  });
});

describe('Georgian — the commands combine with "say it"', () => {
  test('read + takeaways = the takeaways, spoken', () => {
    expect(matchReportCommand('წამიკითხე მთავარი არსი')).toMatchObject({ intent: 'takeaways', aloud: true });
    expect(matchReportCommand('ამოიღე მთავარი არსი და წამიკითხე')).toMatchObject({ intent: 'takeaways', aloud: true });
  });
  test('aloud + summarize = the summary, spoken', () => {
    expect(matchReportCommand('ხმამაღლა შეაჯამე')).toMatchObject({ intent: 'summarize', aloud: true });
    expect(matchReportCommand('შეაჯამე')).toMatchObject({ intent: 'summarize', aloud: false });
  });
});

describe('control words — only when they are the whole utterance', () => {
  test.each([
    ['გაჩერდი', 'stop'], ['გაჩერდით', 'stop'], ['გააჩერე', 'stop'], ['შეწყვიტე', 'stop'], ['საკმარისია', 'stop'], ['სტოპ', 'stop'], ['გთხოვ გაჩერდი', 'stop'], ['ჩუმად', 'stop'],
    ['პაუზა', 'pause'], ['დააპაუზე', 'pause'], ['დაელოდე', 'pause'],
    ['გააგრძელე', 'resume'], ['გააგრძელეთ', 'resume'], ['გააგრძელე წაკითხვა', 'resume'], ['განაგრძე', 'resume'],
    ['stop', 'stop'], ['Stop.', 'stop'], ['please stop', 'stop'], ['stop reading', 'stop'], ['enough', 'stop'], ['pause', 'pause'], ['pause reading', 'pause'], ['wait', 'pause'],
    ['resume', 'resume'], ['continue', 'resume'], ['please continue', 'resume'],
    ['стоп', 'stop'], ['остановись', 'stop'], ['хватит', 'stop'], ['пауза', 'pause'], ['подожди', 'pause'], ['продолжай', 'resume'], ['продолжи', 'resume'], ['дальше', 'resume'],
  ])('%s → %s', (u, want) => {
    expect(intent(u)).toBe(want);
  });

  test('inside a longer sentence a control word is NOT a command — it is a question about the report', () => {
    expect(intent('გაჩერდება თუ არა ბაზრის ზრდა?')).toBe('ask'); // "will the market growth stop?"
    expect(intent('what happens if the market stops growing')).toBe('ask');
    expect(intent('why did the growth stop in 2024')).toBe('ask');
    expect(intent('почему рост остановился в 2024 году')).toBe('ask');
    expect(intent('stop and summarize')).toBe('summarize'); // two content words: not a bare control command
  });
});

describe('English', () => {
  test.each([
    ['summarize', 'summarize'], ['Summarise it', 'summarize'], ['give me a summary', 'summarize'], ['sum it up', 'summarize'], ['sum up the report', 'summarize'],
    ['tl;dr', 'summarize'], ['TLDR please', 'summarize'], ['recap', 'summarize'], ['give me a brief', 'summarize'], ['briefly', 'summarize'],
    ['key takeaways', 'takeaways'], ['what are the key points', 'takeaways'], ['the main points', 'takeaways'], ['main findings', 'takeaways'], ['highlights', 'takeaways'],
    ['the gist', 'takeaways'], ['bottom line', 'takeaways'], ['most important', 'takeaways'], ['what is important', 'takeaways'], ['extract the main idea', 'takeaways'], ['take aways', 'takeaways'],
    ['read it to me', 'read'], ['read it aloud', 'read'], ['read the report', 'read'], ['read this out', 'read'], ['read', 'read'], ['read me the report', 'read'], ['play it', 'read'], ['narrate it', 'read'], ['let me listen', 'read'],
  ])('%s → %s', (u, want) => {
    expect(intent(u)).toBe(want);
  });

  test('"read me the key points" is the key points, spoken', () => {
    expect(matchReportCommand('read me the key points')).toMatchObject({ intent: 'takeaways', aloud: true });
    expect(matchReportCommand('read the summary aloud')).toMatchObject({ intent: 'summarize', aloud: true });
  });
});

describe('Russian', () => {
  test.each([
    ['суммируй', 'summarize'], ['Суммируй отчёт', 'summarize'], ['резюмируй', 'summarize'], ['кратко', 'summarize'], ['дай краткое содержание', 'summarize'], ['перескажи', 'summarize'], ['подведи итоги', 'summarize'], ['вкратце', 'summarize'],
    ['главное', 'takeaways'], ['выдели главное', 'takeaways'], ['основные выводы', 'takeaways'], ['ключевые моменты', 'takeaways'], ['главная мысль', 'takeaways'], ['суть', 'takeaways'], ['важные пункты', 'takeaways'], ['тезисы', 'takeaways'],
    ['прочитай', 'read'], ['прочитай отчёт', 'read'], ['зачитай', 'read'], ['озвучь отчёт', 'read'], ['читай вслух', 'read'], ['прочитай мне', 'read'],
  ])('%s → %s', (u, want) => {
    expect(intent(u)).toBe(want);
  });

  test('"прочитай главное" is the key points, spoken', () => {
    expect(matchReportCommand('прочитай главное')).toMatchObject({ intent: 'takeaways', aloud: true });
  });
});

describe('questions stay questions (the matcher must NOT hijack them)', () => {
  test.each([
    'რა რისკები აქვს ამ ბაზარს?',
    'რა არის ბაზრის მთავარი რისკი',
    'რამდენი მყიდველია ევროპაში',
    'არსებობს თუ არა კონკურენტები',
    'what is the main risk',
    'what does the report say about pricing',
    'which sources should I read first',
    'how big is the market in 2025',
    'какой главный риск у этого рынка',
    'сколько стоит выход на рынок',
    'почему рост замедлился',
  ])('%s → ask', (u) => {
    expect(matchReportCommand(u)).toMatchObject({ intent: 'ask', aloud: false });
  });

  test('the question text is returned untouched for the model', () => {
    expect(matchReportCommand('  რა არის ბაზრის მთავარი რისკი?  ').text).toBe('რა არის ბაზრის მთავარი რისკი?');
  });
});

describe('hints', () => {
  test('the suggested phrases are themselves recognised as the commands they advertise', () => {
    for (const lang of ['ka', 'en', 'ru'] as const) {
      expect(intent(COMMAND_HINTS[lang].summarize)).toBe('summarize');
      expect(intent(COMMAND_HINTS[lang].takeaways)).toBe('takeaways');
      expect(intent(COMMAND_HINTS[lang].read)).toBe('read');
    }
  });
});
