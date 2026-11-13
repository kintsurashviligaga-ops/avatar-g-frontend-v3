'use client';

/**
 * When a saved chat is opened, its expired (or nearly expired) media links are renewed once and swapped into the bubbles
 * (Phase 7.6 item 7). One ask per conversation per page load; the server decides whether the feature is on
 * (CHAT_MEDIA_RENEW) and which links the user may have.
 */
import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { applyRenewedMedia, requestMediaRenewal, staleMediaUrls, type CHAT_MEDIA_FIELDS } from './mediaRenewClient';

type WithMedia = Partial<Record<(typeof CHAT_MEDIA_FIELDS)[number], string>>;

export function useChatMediaRenew<T extends WithMedia>(conversationId: string, messages: readonly T[], setMessages: Dispatch<SetStateAction<T[]>>): void {
  const asked = useRef(new Set<string>());
  // The answer is applied only while the same chat is open (the effect re-runs on every message, so no cleanup cancel).
  const current = useRef(conversationId);
  current.current = conversationId;
  useEffect(() => {
    if (!conversationId || asked.current.has(conversationId) || messages.length === 0) return;
    const urls = staleMediaUrls(messages, Math.floor(Date.now() / 1000));
    if (urls.length === 0) return;
    asked.current.add(conversationId);
    void requestMediaRenewal(urls).then((renewed) => {
      if (current.current !== conversationId || Object.keys(renewed).length === 0) return;
      setMessages((prev) => applyRenewedMedia(prev, renewed));
    });
  }, [conversationId, messages, setMessages]);
}
