/** @jest-environment node */
/**
 * A chat opened again showed no videos (GG 2026-10-26 20:14Z „გაასწორე"): a delivered clip, picture or song is a bubble with
 * no words and no card, so neither the words' rows nor the card rows ever saved it, and the chat opened from History or on
 * another device showed the question and nothing after it. OmniStudio is too large to mount, so these pin the wiring in
 * its source; what a row holds and how the copies merge is lib-tested in lib/chat/turnMeta.test.ts.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const src = readFileSync(join(__dirname, 'OmniStudio.tsx'), 'utf8');
const between = (from: string, to: string) => {
  const a = src.indexOf(from);
  return a < 0 ? '' : src.slice(a, src.indexOf(to, a));
};

describe('a delivered result in the account’s history', () => {
  const save = between('const saveResultRow = useCallback(', 'const updateResultRow = useCallback(');
  const effect = between('const updateResultRow = useCallback(', '// The user\'s yes to one step\'s own price');

  it('is saved as one row of its own when it lands: its words or a mark, its links in the metadata', () => {
    expect(save).toContain('const meta = lean ? turnMetaOf(');
    expect(save).toContain("await saveMessage(sid, 'assistant', resultRowText(m), meta, rowId)");
    // The bubble takes its row, so a later change rewrites that row instead of saving another.
    expect(save).toContain('next[i] = { ...prev[i]!, cloudRowId: rowId };');
  });

  it('only what lands while the chat is open is saved: a chat opened again is the baseline, a cloud chat loading is skipped', () => {
    expect(effect).toContain('if (hydratingRef.current === conversationId) return;');
    expect(effect).toMatch(/if \(!st \|\| st\.cid !== conversationId\) \{[\s\S]*?seen: new Set\(messages\.flatMap[\s\S]*?return;\s*\}/);
    expect(effect).toContain('if (st.seen.has(url)) continue;');
    expect(effect).toContain('saveResultRow(m, url);');
    // A result read back or already saved is rewritten only when it changes here, never saved twice.
    expect(effect).toContain('if (was !== undefined && was !== sig) updateResultRow(m);');
    expect(effect.indexOf('if (m.cloudRowId) {')).toBeLessThan(effect.indexOf('saveResultRow(m, url);'));
  });

  it('reads back as the same wordless bubble, with its row', () => {
    const turns = between('function serverTurns(', '/** An Agent G card whose work is running now');
    expect(turns).toContain('text: savedTurnText(r.content, meta)');
    expect(turns).toContain("const own = !!meta.id || isResultTurn({ ...meta, role });");
    expect(turns).toContain('...(own ? { cloudRowId: r.id } : {})');
  });

  it('an Omni clip keeps its job id on this device too, so „გააგრძელე" after a reload continues that clip', () => {
    const lean = between('function leanMessages(', 'function conversationTitle(');
    expect(lean).toContain('...(m.omniJob ? { omniJob: m.omniJob } : {}),');
  });
});
