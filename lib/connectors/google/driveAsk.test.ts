import { driveAgentGoal, isDriveAsk, DRIVE_ASK_MAX_CHARS } from './driveAsk';

describe('isDriveAsk', () => {
  it.each([
    'რა წერია ჩემ დრაივზე?',
    'რა ფაილებია ჩემს დრაივში',
    'გუგლ დისკზე რა მაქვს?',
    'What is in my Google Drive?',
    'summarize the PDF on my drive',
    'read the drive files',
    'что лежит на моем гугл диске?',
    'открой драйв',
  ])('asks about Drive: %s', (t) => { expect(isDriveAsk(t)).toBe(true); });

  it.each([
    '',
    'შემიქმენი სურათი',
    'drive a car through the city at night, cinematic',
    'what is a hard disk',
    'test drive the new feature',
    'driven by data',
  ])('does not: %s', (t) => { expect(isDriveAsk(t)).toBe(false); });

  it('ignores a long pasted text', () => {
    expect(isDriveAsk(`${'a'.repeat(DRIVE_ASK_MAX_CHARS)} google drive`)).toBe(false);
  });

  it('goal keeps the words and points at the Drive tools', () => {
    const g = driveAgentGoal('  რა წერია ჩემ დრაივზე? ');
    expect(g.startsWith('რა წერია ჩემ დრაივზე?')).toBe(true);
    expect(g).toContain('drive_list_files');
  });
});
