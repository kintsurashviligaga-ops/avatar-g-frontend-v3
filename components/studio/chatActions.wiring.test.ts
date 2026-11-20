/**
 * Phase 8.13 (GG 2026-11-20: chat interface audit). Pins the chat action fixes in OmniStudio's source, next to the unit
 * tests of their helpers (components/studio/chat/replyActions.test.ts, lib/clipboard/copyText):
 *
 *   copy       the reply / user Copy goes through copyText (legacy fallback) and a failed copy shows a warning toast;
 *              no bare navigator.clipboard.writeText is left in the chat's copy path.
 *   share      a share that falls back to a copy says „copied" only when the copy worked.
 *   recorder   a refused microphone in Music / Avatar „record" shows recordErrorText, never a silent no-op.
 *   actions    the reply's action buttons are 44 px on touch (36 px with a fine pointer), like the user bubble's.
 *   toast      it wraps within the screen and is announced (role=status), with a warning icon for a failure.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const studio = readFileSync(join(process.cwd(), 'components/studio/OmniStudio.tsx'), 'utf8');
const between = (from: string, to: string) => {
  const a = studio.indexOf(from);
  const b = studio.indexOf(to, a + from.length);
  if (a < 0 || b < 0) throw new Error(`markers not found: ${from} … ${to}`);
  return studio.slice(a, b);
};

describe('chat actions (Phase 8.13)', () => {
  test('Copy uses copyText and reports a failure', () => {
    const copy = between('const copyMsg = useCallback(', 'const shareReply = useCallback(');
    expect(copy).toContain('await copyText(text)');
    expect(copy).not.toContain('navigator.clipboard');
    expect(copy).toContain('COPY_FAILED[replyLang(locale)]');
    expect(copy).toContain('setShareToastWarn(true)');
  });

  test('a share falls back to „copied" only after a real copy', () => {
    const share = between('const shareReply = useCallback(', 'const rateMsg = useCallback(');
    expect(share).toContain('if (!(await copyMsg(text, i))) return;');
    expect(share).toContain('setShareToastWarn(false)');
  });

  test('a refused microphone in the voice recorder says why', () => {
    const rec = between('const startVoiceRecording = useCallback(', 'useMicRelease(');
    expect(rec).toMatch(/catch \(err\) \{[\s\S]*recordErrorText\(err, locale\)/);
    expect(rec).toContain('voiceStreamRef.current = null;');
  });

  test('reply action buttons are 44 px on touch', () => {
    expect(studio).toContain("const act = 'inline-flex h-11 w-11 [@media(pointer:fine)]:h-9 [@media(pointer:fine)]:w-9");
  });

  test('the toast wraps on a phone, is announced, and shows a warning icon for a failure', () => {
    const toast = between('{shareToast && (', '{shareToast}');
    expect(toast).toContain('role="status"');
    expect(toast).toContain('max-w-[calc(100vw-32px)]');
    expect(toast).toContain('shareToastWarn ? <AlertTriangle');
  });
});
