/**
 * The send path's multi-scene shortcut (OmniStudio.send, „Smart Scene & Mode Detection") plans a storyboard when a message
 * names its scenes or says „storyboard" / „სთორიბორდი" / „მრავალსცენიანი". The word alone is also how people ASK about it:
 * „open the settings and tell me what a storyboard is" planned a two-scene film instead of going to the chat
 * (tests/agent-g-panels.spec.ts). Pinned on the source: the studio is one large client component, and the browser spec is
 * not in CI. lib/agent/chatTurn.test.ts pins which words ask.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(process.cwd(), 'components/studio/OmniStudio.tsx'), 'utf8');
const sendBody = src.slice(src.indexOf('const send = useCallback(async (opts?:'), src.indexOf('// ── VIDEO REMIX — edit an uploaded video via /api/video/remix'));

describe('a storyboard asked about is answered in the chat, never planned', () => {
  test('„storyboard" or a scene count plans a board only when the words do not just ask about it', () => {
    expect(sendBody).toContain('const isMultiScene = sceneHeadersCount >= 2\n'
      + "      || ((detectedScenes >= 2 || /(?:სთორიბორდ|storyboard|მრავალსცენ)/iu.test(text)) && !wordsAskToBeTold(text, mode, locale));");
    expect(sendBody).not.toMatch(/const isMultiScene = detectedScenes >= 2 \|\|/);
  });

  test('a script that names its scenes is still planned as one, whatever words it holds', () => {
    expect(sendBody).toContain('const sceneHeadersCount = (text.match(/(?:სცენა|scene)\\s*[1-9]/gi) || []).length;');
  });
});
