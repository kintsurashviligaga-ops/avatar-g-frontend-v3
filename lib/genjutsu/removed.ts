/**
 * lib/genjutsu/removed.ts — the VFX service is removed (GG 2026-11-13: „Please remove the VFX service entirely. It is
 * unnecessary and clutters the interface").
 *
 * POST /api/genjutsu/quote, POST /api/genjutsu/generate and GET /api/genjutsu/capabilities answer 410 `service_removed`
 * FIRST, before the auth, the quote, the charge and any Veo call, so an old tab or a stored link can neither start nor bill
 * a VFX scene.
 *
 * ⚠️ GET /api/genjutsu/status STAYS OPEN ON PURPOSE. It is shared: the Video clip and the talking Avatar poll their Veo /
 * Omni jobs through it (OmniStudio, lib/video/voicedClip, lib/avatar/voicedClip), and it refunds a VFX scene that was
 * already paid for before this change. It never charges. lib/genjutsu/veoScene stays too: the video clip route submits
 * through it.
 */
import { NextResponse } from 'next/server';

export const VFX_REMOVED = {
  ka: 'VFX სერვისი აღარ არის ხელმისაწვდომი. ვიდეო შექმენი ვიდეოს სერვისით — თანხა არ ჩამოგეჭრა.',
  en: 'The VFX service is no longer offered. Make a video with the Video service. You were not charged.',
  ru: 'Сервис VFX больше не доступен. Создайте видео в сервисе «Видео». Списания не было.',
} as const;

/** The one answer every removed VFX endpoint gives: 410, no-store, the code the client error table knows. */
export function vfxRemovedResponse(): NextResponse {
  return NextResponse.json(
    { error: 'service_removed', code: 'service_removed', tool: 'vfx', message: VFX_REMOVED.ka, messages: VFX_REMOVED },
    { status: 410, headers: { 'Cache-Control': 'no-store' } },
  );
}
