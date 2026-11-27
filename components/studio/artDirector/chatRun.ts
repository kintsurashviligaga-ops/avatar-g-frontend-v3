/**
 * The chat's one call to the Art Director route (Phase 8.4 PR C). Client-safe; the fetch is injected for tests.
 * `fallback` means the server said this user may not use the Art Director (IMAGE_ART_DIRECTOR off for them): the chat
 * then makes the picture the old way, so turning the client switch on never breaks anyone's images.
 */
import type { ArtChatRequest, ArtChatTile } from '@/lib/image/artDirector/chat';

export type ArtChatResult =
  | { kind: 'ok'; tiles: ArtChatTile[]; perImage: number; charged: number }
  | { kind: 'fallback' }
  | { kind: 'error'; code: string; message?: string };

interface RouteSlot { index: number; status: 'done' | 'failed'; id?: string; url?: string; path?: string; charged?: number; refunded?: number; meta?: { width?: number; height?: number } }

export async function postArtChat(fetcher: typeof fetch, request: ArtChatRequest, signal?: AbortSignal): Promise<ArtChatResult> {
  let res: Response;
  try {
    res = await fetcher('/api/image/art-director', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(request),
      ...(signal ? { signal } : {}),
    });
  } catch {
    return { kind: 'error', code: 'network' };
  }
  const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; message?: string; slots?: RouteSlot[]; perImage?: number; charged?: number };
  if (res.status === 404 && j.error === 'feature_off') return { kind: 'fallback' };
  if (!res.ok || !j.ok || !Array.isArray(j.slots)) return { kind: 'error', code: j.error ?? 'failed', ...(j.message ? { message: j.message } : {}) };
  const tiles: ArtChatTile[] = j.slots.map((s) => ({
    index: s.index, status: s.status,
    ...(s.id ? { id: s.id } : {}), ...(s.url ? { url: s.url } : {}), ...(s.path ? { path: s.path } : {}),
    ...(s.meta?.width ? { width: s.meta.width } : {}), ...(s.meta?.height ? { height: s.meta.height } : {}),
    charged: s.charged ?? 0, refunded: s.refunded ?? 0,
  }));
  return { kind: 'ok', tiles, perImage: j.perImage ?? 0, charged: j.charged ?? 0 };
}
