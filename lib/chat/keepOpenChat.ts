/**
 * lib/chat/keepOpenChat.ts — a language switch keeps the chat on screen.
 *
 * ⚠️ WHY. Switching the language is a navigation to the same page under another locale (/en/dashboard → /ka/dashboard),
 * which mounts the studio afresh, and a fresh mount opens a new, empty chat by design (OmniStudio's
 * currentConversationId). On the Preview run of 2026-10-11 that is how a montage card vanished mid-render: the chat it
 * lived in was simply left behind. A switcher now announces the switch just before it navigates; the studio, when it is
 * on screen, saves its chat and hands it to the next mount exactly as a pick from History is handed over. With no studio
 * on screen nobody answers and nothing changes: the next visit still opens a fresh chat.
 *
 * A literal event name, so a surface like the sidebar does not pull the studio into its bundle to announce it.
 */
export const KEEP_OPEN_CHAT_EVENT = 'myavatar:keep-open-chat';

/** Call just before a language switch navigates. */
export function keepOpenChat(): void {
  try {
    window.dispatchEvent(new Event(KEEP_OPEN_CHAT_EVENT));
  } catch { /* no window: nothing to keep */ }
}
