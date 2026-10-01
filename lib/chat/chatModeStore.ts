'use client';

/**
 * lib/chat/chatModeStore.ts — the viewer's chosen chat mode (Fast · Thinking · Pro · Lite), shared by every surface
 * that shows or uses it: the desktop header switcher (OmniStudio), the phone header switcher (ChatChrome) and the
 * send path (OmniStudio.streamChat reads `getChatMode()` AT SEND TIME, like the persona — so a switch mid-conversation
 * applies to the very next turn, regenerate and queued type-ahead included, with no stale closure).
 *
 * localStorage (per viewer, try/catch — private mode or blocked storage falls back to the default) plus a window
 * event so two mounted switchers stay in sync. Lives outside OmniStudio on purpose: "New chat" remounts OmniStudio,
 * and a model choice kept in its useState was lost on every new session.
 */
import { useCallback, useSyncExternalStore } from 'react';

import {
  CHAT_MODE_EVENT,
  CHAT_MODE_STORAGE_KEY,
  DEFAULT_CHAT_MODE,
  resolveChatMode,
  type ChatModeId,
} from './chatModes';

/** The saved mode (disabled or unknown → the default). Safe on the server (returns the default). */
export function getChatMode(): ChatModeId {
  if (typeof window === 'undefined') return DEFAULT_CHAT_MODE;
  try {
    return resolveChatMode(window.localStorage.getItem(CHAT_MODE_STORAGE_KEY));
  } catch {
    return DEFAULT_CHAT_MODE;
  }
}

/** Save + announce. A storage failure still announces, so the open page follows the choice for this session. */
export function setChatMode(mode: ChatModeId): void {
  if (typeof window === 'undefined') return;
  const next = resolveChatMode(mode);
  memo = next;
  try { window.localStorage.setItem(CHAT_MODE_STORAGE_KEY, next); } catch { /* private mode — memory only */ }
  try { window.dispatchEvent(new CustomEvent<ChatModeId>(CHAT_MODE_EVENT, { detail: next })); } catch { /* old engines */ }
}

// In-memory mirror: survives a storage that throws on read after a successful in-page choice.
let memo: ChatModeId | null = null;

function snapshot(): ChatModeId {
  if (memo) return memo;
  memo = getChatMode();
  return memo;
}

function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const onEvent = () => { onChange(); };
  const onStorage = (e: StorageEvent) => {
    if (e.key !== CHAT_MODE_STORAGE_KEY) return;
    memo = resolveChatMode(e.newValue);
    onChange();
  };
  window.addEventListener(CHAT_MODE_EVENT, onEvent);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHAT_MODE_EVENT, onEvent);
    window.removeEventListener('storage', onStorage);
  };
}

/** React hook: `[mode, setMode]`. Renders the default on the server, the saved choice on the client. */
export function useChatMode(): [ChatModeId, (mode: ChatModeId) => void] {
  const mode = useSyncExternalStore(subscribe, snapshot, () => DEFAULT_CHAT_MODE);
  const set = useCallback((m: ChatModeId) => setChatMode(m), []);
  return [mode, set];
}

/** Test hook: forget the in-memory mirror. */
export function __resetChatModeMemo(): void {
  memo = null;
}
