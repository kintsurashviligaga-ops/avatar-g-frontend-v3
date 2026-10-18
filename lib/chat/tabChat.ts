/**
 * lib/chat/tabChat.ts — a refresh keeps the chat on screen and the text not yet sent.
 *
 * The owner's PRD (2026-10-18, 2.5): "გვერდის განახლების (Refresh) შემდეგ ჩაუწერელი ტექსტი და მიმდინარე საუბარი არ უნდა
 * იკარგებოდეს". Until then a reload was a fresh, empty chat by design (OmniStudio's currentConversationId), and whatever
 * sat in the composer went with it.
 *
 * sessionStorage, per account: it lives exactly as long as the tab. A reload of that tab comes back to its chat and its
 * draft; a new tab, a new visit or a link opened from elsewhere still opens a fresh chat, so nobody is dropped back
 * inside a days-old thread on every visit (the rule the fresh-chat default exists for). In private mode, where storage
 * throws, a reload is a fresh chat again and nothing breaks.
 */
const TAB_CHAT = 'myavatar:tab-chat';
const TAB_DRAFT = 'myavatar:tab-draft';
/** A draft is what someone typed, not a document: anything longer is cut rather than refused. */
export const TAB_DRAFT_MAX = 20_000;

const scoped = (base: string, uid?: string | null) => `${base}:${uid || 'anon'}`;

function store(): Storage | null {
  try { return typeof window === 'undefined' ? null : window.sessionStorage; } catch { return null; }
}

/** The conversation this tab had open before the reload, or null in a tab that has none. */
export function readTabChat(uid?: string | null): string | null {
  try { return store()?.getItem(scoped(TAB_CHAT, uid)) || null; } catch { return null; }
}

export function writeTabChat(uid: string | null | undefined, id: string): void {
  try { store()?.setItem(scoped(TAB_CHAT, uid), id); } catch { /* private mode: a reload opens a fresh chat */ }
}

/** The composer's unsent text in this tab ('' when there is none). */
export function readTabDraft(uid?: string | null): string {
  try { return store()?.getItem(scoped(TAB_DRAFT, uid)) ?? ''; } catch { return ''; }
}

/** Keep the composer's text; an empty composer leaves nothing behind. */
export function writeTabDraft(uid: string | null | undefined, text: string): void {
  try {
    const s = store();
    if (!s) return;
    if (text.trim()) s.setItem(scoped(TAB_DRAFT, uid), text.slice(0, TAB_DRAFT_MAX));
    else s.removeItem(scoped(TAB_DRAFT, uid));
  } catch { /* quota or private mode: the draft is a convenience */ }
}
