/**
 * components/studio/research/commands.ts — what the report viewer DOES with a line a person typed or dictated under a report.
 * A thin wiring layer over lib/research/voiceCommands.ts (the Unicode matcher): the matcher says what was meant; this says
 * what the screen does about it, given whether a voice is reading right now.
 *
 *   summarize / takeaways → ask the report (mode), and read the answer aloud when "aloud" was said
 *   read                  → read the REPORT aloud
 *   pause / resume / stop → control the voice — and ONLY when a voice is reading; otherwise a bare "stop" is a no-op, never
 *                           a question sent to the model
 *   anything else         → a free question about the report
 *
 * The same matcher runs inside the Live call on the server side of the prompt (lib/research/liveContext.ts names the three
 * commands); this planner is for the box under the report, which is also what the dictation mic fills.
 */
import { matchReportCommand } from '@/lib/research/voiceCommands';

export type ReportAction =
  | { type: 'ask'; mode: 'ask' | 'summarize' | 'takeaways'; question: string; speak: boolean }
  | { type: 'read' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'stop' }
  | { type: 'noop' };

export type VoiceActivity = 'idle' | 'loading' | 'playing' | 'paused';

export function planReportCommand(utterance: string, voice: VoiceActivity = 'idle'): ReportAction {
  const cmd = matchReportCommand(utterance);
  switch (cmd.intent) {
    case 'none':
      return { type: 'noop' };
    case 'summarize':
      return { type: 'ask', mode: 'summarize', question: '', speak: cmd.aloud };
    case 'takeaways':
      return { type: 'ask', mode: 'takeaways', question: '', speak: cmd.aloud };
    case 'read':
      return { type: 'read' };
    case 'stop':
      return voice === 'idle' ? { type: 'noop' } : { type: 'stop' };
    case 'pause':
      return voice === 'playing' || voice === 'loading' ? { type: 'pause' } : { type: 'noop' };
    case 'resume':
      return voice === 'paused' ? { type: 'resume' } : { type: 'noop' };
    case 'ask':
    default:
      return { type: 'ask', mode: 'ask', question: cmd.text, speak: false };
  }
}
