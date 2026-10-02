/**
 * components/studio/hub/skills.ts — what Agent G can do HERE, as a read-only list for the Skills tab. Pure: the tab gathers the
 * signals, this decides each row's state, and the test pins the rules.
 *
 * Every state comes from a signal that already exists — nothing is assumed:
 *   chat · files · video in the chat   the service catalogue's `live` flag for the chat (lib/services/serviceCatalogue.ts)
 *   live voice                         NEXT_PUBLIC_GEMINI_LIVE_ENABLED (opt-out, the flag ChatChrome and ResearchHost read)
 *   image · video · music              the catalogue's `live` flag for each (the same one the „+" sheet's „მალე" tag reads)
 *   Deep Research · your documents     GET /api/research/capabilities (`available`, `filesAvailable`)
 *   Telegram · WhatsApp                GET /api/agent-g/channels → runtime_status[].ready
 *
 * ⚠️ TELEGRAM IS NEVER "AVAILABLE" HERE, even when its bot runs: /api/agent-g/telegram/connect-code issues a code, but the
 * Telegram webhook never consumes it (lib/agent-g/channels/telegram-webhook-handler.ts has no `/connect` handling), so no
 * Telegram chat can be tied to a MyAvatar account. The row says the bot runs and that linking is "soon" — and the Connectors
 * tab draws no connect button for it. When the webhook links accounts, this rule (and that tab) change together.
 *
 * No toggles: there is no server-side per-user skill preference to switch.
 */
import type { ToolId } from '@/lib/studio/tools';
import type { SkillGroupId, SkillId, SkillState } from './copy';

export type SkillNote = 'hidden' | 'tg' | 'wa' | 'guestChat';

export interface SkillSignals {
  guest: boolean;
  /** The live voice call is switched on for this deployment. */
  liveVoice: boolean;
  /** The service catalogue says this surface works. */
  serviceLive: (id: 'chat' | 'image' | 'video' | 'music') => boolean;
  research: { available: boolean; filesAvailable: boolean } | 'checking' | 'unknown';
  channels: { telegramReady: boolean; whatsappReady: boolean } | 'checking' | 'unknown';
  /** Tools the user switched off in Plugins (only noted — a hidden tool is still a skill). */
  hidden: ReadonlySet<ToolId>;
}

export interface SkillRow {
  id: SkillId;
  state: SkillState;
  note?: SkillNote;
}

export const SKILL_GROUPS: ReadonlyArray<{ id: SkillGroupId; skills: readonly SkillId[] }> = [
  { id: 'talk', skills: ['chat', 'live'] },
  { id: 'create', skills: ['image', 'video', 'music'] },
  { id: 'read', skills: ['filesChat', 'videoChat', 'docs'] },
  { id: 'research', skills: ['research'] },
  { id: 'channels', skills: ['web', 'telegram', 'whatsapp'] },
];

export function skillRow(id: SkillId, s: SkillSignals): SkillRow {
  /** Works here; a guest is told it needs an account (the studio asks a guest to sign in for it — docs/DESIGN.md §13). */
  const open = (works: boolean): SkillState => (!works ? 'soon' : s.guest ? 'account' : 'available');
  switch (id) {
    case 'chat':
      // The one skill a guest has: a short, capped chat (lib/chat/guestChat.ts).
      return { id, state: s.serviceLive('chat') ? 'available' : 'soon', ...(s.guest ? { note: 'guestChat' as const } : {}) };
    case 'live':
      return { id, state: open(s.liveVoice) };
    case 'image':
    case 'video':
    case 'music':
      return { id, state: open(s.serviceLive(id)), ...(s.hidden.has(id) ? { note: 'hidden' as const } : {}) };
    case 'filesChat':
    case 'videoChat':
      return { id, state: open(s.serviceLive('chat')) };
    case 'docs':
      return { id, state: typeof s.research === 'string' ? s.research : open(s.research.filesAvailable) };
    case 'research':
      return { id, state: typeof s.research === 'string' ? s.research : open(s.research.available) };
    case 'web':
      return { id, state: 'available' };
    case 'telegram':
      if (typeof s.channels === 'string') return { id, state: s.channels };
      return { id, state: 'soon', ...(s.channels.telegramReady ? { note: 'tg' as const } : {}) };
    case 'whatsapp':
      if (typeof s.channels === 'string') return { id, state: s.channels };
      return { id, state: open(s.channels.whatsappReady), ...(s.channels.whatsappReady ? { note: 'wa' as const } : {}) };
  }
}

export function skillGroups(s: SkillSignals): Array<{ id: SkillGroupId; rows: SkillRow[] }> {
  return SKILL_GROUPS.map((g) => ({ id: g.id, rows: g.skills.map((id) => skillRow(id, s)) }));
}
