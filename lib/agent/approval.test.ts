import { TAP, approvalNote, approvalParams, parseRunApproval } from './approval';

describe('parseRunApproval', () => {
  it('no approval is the card\'s own Start tap', () => {
    expect(parseRunApproval(undefined)).toEqual({ ok: true, approval: TAP });
    expect(parseRunApproval(null)).toEqual({ ok: true, approval: TAP });
  });

  it('tap and panel button pass, without words', () => {
    expect(parseRunApproval({ channel: 'tap', said: 'ignored' })).toEqual({ ok: true, approval: { channel: 'tap' } });
    expect(parseRunApproval({ channel: 'panel-button' })).toEqual({ ok: true, approval: { channel: 'panel-button' } });
  });

  it('a voice yes is judged again on the server and kept as evidence', () => {
    expect(parseRunApproval({ channel: 'voice-transcript', said: '  კი,  დაიწყე ' }))
      .toEqual({ ok: true, approval: { channel: 'voice-transcript', said: 'კი, დაიწყე' } });
    expect(parseRunApproval({ channel: 'voice-transcript', said: 'да, давай' })).toMatchObject({ ok: true });
  });

  it('a voice approval whose words are not a clear yes starts nothing', () => {
    for (const said of ['wait', 'how much?', 'yes, make it blue', 'არა', '', '   ']) {
      expect(parseRunApproval({ channel: 'voice-transcript', said })).toMatchObject({ ok: false, error: 'approval_unclear' });
    }
    expect(parseRunApproval({ channel: 'voice-transcript' })).toMatchObject({ ok: false, error: 'approval_unclear' });
    expect(parseRunApproval({ channel: 'voice-transcript', said: 'yes '.repeat(200) })).toMatchObject({ ok: false, error: 'approval_unclear' });
  });

  it('anything else is a bad request, never a silent tap', () => {
    expect(parseRunApproval('yes')).toMatchObject({ ok: false, error: 'bad_approval' });
    expect(parseRunApproval([])).toMatchObject({ ok: false, error: 'bad_approval' });
    expect(parseRunApproval({ channel: 'model' })).toMatchObject({ ok: false, error: 'bad_approval' });
    expect(parseRunApproval({})).toMatchObject({ ok: false, error: 'bad_approval' });
  });
});

describe('approvalParams / approvalNote', () => {
  it('the row keeps the channel, and the words only for a voice yes', () => {
    expect(approvalParams(TAP)).toEqual({ _approval: { channel: 'tap' } });
    expect(approvalParams({ channel: 'voice-transcript', said: 'კი' })).toEqual({ _approval: { channel: 'voice-transcript', said: 'კი' } });
  });

  it('the audit note names a voice yes by its words', () => {
    expect(approvalNote(TAP)).toBe('');
    expect(approvalNote({ channel: 'panel-button' })).toBe('panel button');
    expect(approvalNote({ channel: 'voice-transcript', said: 'yes please' })).toBe('voice "yes please"');
  });
});
