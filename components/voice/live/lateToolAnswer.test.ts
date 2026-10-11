/** @jest-environment node */
import { lateToolAnswerNote } from './useGeminiLiveSession';

describe('an answer that came back after the connection was renewed is told, not dropped', () => {
  it('each function by name with its answer, as one [App] note', () => {
    const note = lateToolAnswerNote([
      { id: 'g1', name: 'ask_agent_g', response: { ok: true, answer: '12 flats found in Kutaisi' } },
      { id: 'w1', name: 'read_webpage', response: { ok: false, error: 'blocked' } },
    ]);
    expect(note).toBe('[App] The connection was renewed while you waited, so these answers arrive as a note — use them now: '
      + 'ask_agent_g: {"ok":true,"answer":"12 flats found in Kutaisi"} | read_webpage: {"ok":false,"error":"blocked"}');
  });

  it('a long answer is cut; nothing named is nothing to tell', () => {
    const note = lateToolAnswerNote([{ id: 'g1', name: 'ask_agent_g', response: { answer: 'x'.repeat(5000) } }])!;
    expect(note.length).toBeLessThan(1700);
    expect(note.endsWith('…')).toBe(true);
    expect(lateToolAnswerNote([])).toBeNull();
    expect(lateToolAnswerNote([{ id: 'a', name: '', response: {} }])).toBeNull();
  });
});
