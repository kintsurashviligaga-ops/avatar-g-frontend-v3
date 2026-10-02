import { planReportCommand } from './commands';

describe('planReportCommand — what the viewer does with a typed or dictated line', () => {
  test('the three commands in Georgian', () => {
    expect(planReportCommand('შეაჯამე')).toEqual({ type: 'ask', mode: 'summarize', question: '', speak: false });
    expect(planReportCommand('ამოიღე მთავარი არსი')).toEqual({ type: 'ask', mode: 'takeaways', question: '', speak: false });
    expect(planReportCommand('წამიკითხე')).toEqual({ type: 'read' });
  });
  test('the same commands in English and Russian', () => {
    expect(planReportCommand('Summarize')).toMatchObject({ type: 'ask', mode: 'summarize' });
    expect(planReportCommand('key takeaways')).toMatchObject({ type: 'ask', mode: 'takeaways' });
    expect(planReportCommand('Read it to me')).toEqual({ type: 'read' });
    expect(planReportCommand('Суммируй')).toMatchObject({ type: 'ask', mode: 'summarize' });
    expect(planReportCommand('Выдели главное')).toMatchObject({ type: 'ask', mode: 'takeaways' });
    expect(planReportCommand('Прочитай')).toEqual({ type: 'read' });
  });
  test('"aloud" beside a content command means: answer, then say the answer', () => {
    expect(planReportCommand('ხმამაღლა შეაჯამე')).toMatchObject({ type: 'ask', mode: 'summarize', speak: true });
    expect(planReportCommand('read me the key points')).toMatchObject({ type: 'ask', mode: 'takeaways', speak: true });
  });
  test('a free line is a question about the report, with the text as typed', () => {
    expect(planReportCommand('  Which sources cover Georgia?  ')).toEqual({ type: 'ask', mode: 'ask', question: 'Which sources cover Georgia?', speak: false });
    expect(planReportCommand('გაჩერდება თუ არა ბაზარი?')).toMatchObject({ type: 'ask', mode: 'ask' });
  });
  test('control words act ONLY while a voice is reading — a bare "stop" is never sent to the model', () => {
    expect(planReportCommand('stop', 'idle')).toEqual({ type: 'noop' });
    expect(planReportCommand('გაჩერდი', 'idle')).toEqual({ type: 'noop' });
    expect(planReportCommand('stop', 'playing')).toEqual({ type: 'stop' });
    expect(planReportCommand('გაჩერდი', 'loading')).toEqual({ type: 'stop' });
    expect(planReportCommand('pause', 'playing')).toEqual({ type: 'pause' });
    expect(planReportCommand('pause', 'idle')).toEqual({ type: 'noop' });
    expect(planReportCommand('გააგრძელე', 'paused')).toEqual({ type: 'resume' });
    expect(planReportCommand('continue', 'playing')).toEqual({ type: 'noop' });
  });
  test('an empty line does nothing', () => {
    expect(planReportCommand('   ')).toEqual({ type: 'noop' });
    expect(planReportCommand('')).toEqual({ type: 'noop' });
  });
});
