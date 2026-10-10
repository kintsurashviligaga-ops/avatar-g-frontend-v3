/**
 * Pins how OmniStudio carries a multi-step Agent G run (lib/agent/run, PART 6): the chat turn's 'run' and 'resume' steps
 * reach the run card's handlers, the card owns its run's jobs (the tray never shows them a second time), Stop reaches
 * the run from the chat and from a Live call, nothing is spent before Start, and the results stay under the card.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(process.cwd(), 'components/studio/OmniStudio.tsx'), 'utf8');
const between = (a: string, b: string): string => {
  const i = src.indexOf(a);
  const j = src.indexOf(b, i + a.length);
  if (i < 0 || j < 0) throw new Error(`missing: ${i < 0 ? a : b}`);
  return src.slice(i, j);
};

describe('the run card in the studio', () => {
  const turn = between('agentTurnRef.current = (text: string, viaVoice: boolean): boolean => {', '// Agent G\'s note belongs to the tool it was made in');

  test('the chat turn is told when runs are open and which ended run „continue" carries on', () => {
    expect(turn).toContain('runOn: agentMontageOn');
    expect(turn).toMatch(/resumableRunId: lastReply\?\.id && lastReply\.runJob && canRetry\(lastReply\.runJob\)/);
  });

  test('a two-step message makes a run card from the attached files; „continue" resumes the same card', () => {
    const run = turn.slice(turn.indexOf("case 'run': {"), turn.indexOf("case 'resume':"));
    expect(run).toContain('startAgentRun(text, step.chain, files)');
    const resume = turn.slice(turn.indexOf("case 'resume':"), turn.indexOf('default:', turn.indexOf("case 'resume':")));
    expect(resume).toContain('retryAgentRun(step.cardId)');
  });

  test('a run card is one of Agent G\'s cards: its phase, its live step, and the jobs it owns', () => {
    expect(turn).toContain("kind: 'run', phase: runCardPhase(c)");
    expect(turn).toContain('for (const own of runCardJobs(c)) owned.add(own);');
    // Stop from the chat stops the run too.
    expect(turn).toContain('else if (m?.runJob) void stopAgentRun(id);');
  });

  test('one owner per job: the tray, Live status and Live stop all read the run\'s jobs as the card\'s', () => {
    expect(between('function cardJobsOf(m: Msg): string[] {', '\n}')).toContain('...runCardJobs(m.runJob)');
    expect(src).toContain("const agentCardJobs = useMemo(() => messages.flatMap(cardJobsOf).sort().join(','), [messages]);");
    expect(between('const liveTasks = (): Array<Record<string, unknown>> => {', 'const stopAgentCard')).toContain('flatMap(cardJobsOf)');
    expect(between('const stopAgentCard = (m: Msg) => {', '};')).toContain('else if (m.runJob) void stopAgentRun(m.id);');
    expect(src).toContain("m.runJob?.phase === 'running'");
  });

  test('nothing is spent before Start: the bubble uploads and plans, Start sends the signed plan once', () => {
    const start = between('const startAgentRun = useCallback(', 'const followAgentRun = useCallback(');
    expect(start).toContain('planRunClient(');
    expect(start).not.toMatch(/startRunClient|action: 'run'/);
    const confirm = between('const confirmAgentRun = useCallback(', 'const stopAgentRun = useCallback(');
    expect(confirm).toContain("card.phase !== 'planned'");
    expect(confirm).toContain('runsRef.current.has(id)');
    expect(confirm).toContain('startRunClient(');
  });

  test('a yes names its step and quote; Retry follows the new run on the same card and the old follow ends', () => {
    expect(between('const approveAgentRun = useCallback(', 'const retryAgentRun = useCallback(')).toContain('approveRunStep((u, init) => fetch(u, init), { runId: card.runId, step, quoteId })');
    const retry = between('const retryAgentRun = useCallback(', '// The upload offer after a refused link');
    expect(retry).toContain('canRetry(card)');
    expect(retry).toContain('followAgentRun(id, r.runId)');
    expect(between('const followAgentRun = useCallback(', 'const confirmAgentRun = useCallback(')).toContain('stopped: () => runFollowRef.current.get(id) !== runId');
  });

  test('the card is drawn under the reply and its results stay with it (not drawn twice by the generic players)', () => {
    expect(src).toContain('<AgentRunCard state={m.runJob}');
    expect(src).toContain('data-testid="agent-run-result"');
    expect(src).toContain('{m.videoUrl && !m.montage && !m.editJob && !m.runJob && (');
    expect(src).toContain('{m.audioUrl && !m.audioJob && !m.runJob && (');
  });

  test('a big track may travel with a run ask (upload only), like the montage', () => {
    expect(between('if (attachments.some((a) => a.uploadOnly)) {', 'toast.error(trackTooBigText(locale)); return; }')).toContain('!!runChainAsk(text, kinds)');
  });
});

describe('Retry on the one-job cards', () => {
  test('each card gets Retry only when the studio can ask it again, and ↻ and Retry share one path', () => {
    for (const card of ['<AgentMontageCard', '<AgentEditCard', '<AgentAudioCard']) {
      const at = src.indexOf(card);
      expect(src.slice(at, src.indexOf('/>', at))).toContain('retryOpen(m, messages[i - 1]) ? { onRetry: () => retryAgentCard(m.id!) } : {}');
    }
    expect(between('const regenerateReply = useCallback(', 'const retryAgentCard = useCallback(')).toContain('redoAgentCardAs(old.id, redo)');
    expect(between('const retryAgentCard = useCallback(', 'const retryOpen = useCallback(')).toContain('redoAgentCardAs(id, cardRetry(');
  });
});

describe('„what is in my video?" on Agent G\'s analysis card (behind AGENT_G_FILE_ANALYSIS)', () => {
  const turn = between('agentTurnRef.current = (text: string, viaVoice: boolean): boolean => {', '// Agent G\'s note belongs to the tool it was made in');

  test('the chat turn hears it only where the route opens it; the one attached file goes with it', () => {
    expect(src).toContain('void analyzeEnabled((u, init) => fetch(u, init)).then((on) => { if (live) setAgentAnalyzeOn(on); });');
    expect(turn).toContain('analyzeOn: agentAnalyzeOn');
    const c = turn.slice(turn.indexOf("case 'analyze': {"), turn.indexOf('default:', turn.indexOf("case 'analyze': {")));
    expect(c).toContain("step.ask.source === 'file' ? attachments[0] : undefined");
    expect(c).toContain('startAgentAnalyze(text, step.ask, file)');
  });

  test('the file goes up first, then Gemini reads it by its path; the model never gets it inline afterwards', () => {
    const start = between('const startAgentAnalyze = useCallback(', 'const analyzeAgain = useCallback(');
    expect(start).toContain('medias: [file], modelMedias: []');
    const run = between('const analyzeRun = useCallback(', 'const startAgentAnalyze = useCallback(');
    expect(run).toContain('uploadBigFile(from.file.dataUrl, from.file.mimeType)');
    expect(run).toContain("{ kind: 'file' as const, ref: ref! }");
    expect(run).toContain("persistChatTurn('assistant', answer)");
    expect(run).toContain('analyzeRetryable(r.code) ? {} : { noRetry: true }');
  });

  test('↻ and the ⚠️ retry ask the same file again, never the chat model without it', () => {
    expect(between('const regenerateReply = useCallback(', 'const retryAgentCard = useCallback(')).toContain('if (old.analyzeJob && old.id) { analyzeAgain(old.id); return; }');
    expect(src).toContain('onClick={() => (m.analyzeJob && m.id ? analyzeAgain(m.id) : regenerateChat())}');
  });

  test('a long recording may travel as an upload-only file for it; the card is drawn under the answer', () => {
    expect(between('if (attachments.some((a) => a.uploadOnly)) {', 'toast.error(trackTooBigText(locale)); return; }')).toContain("analyzeAsk(text, kinds)?.source === 'file'");
    expect(src).toContain('{m.role === \'assistant\' && m.analyzeJob && <AgentAnalyzeCard state={m.analyzeJob} locale={locale} />}');
  });
});
