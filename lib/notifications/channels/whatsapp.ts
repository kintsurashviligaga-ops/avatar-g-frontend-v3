/**
 * WhatsApp channel (Agent G) — PLACEHOLDER until the WhatsApp work lands (link flow, Cloud API send, 24 h window,
 * template fallback). It answers "not configured" so the dispatcher and every caller compile and behave today.
 */
import 'server-only';
import type { ChannelResult, NotifyEvent } from '../types';

export async function sendWhatsAppAlert(_ev: NotifyEvent): Promise<ChannelResult> {
  return { sent: false, reason: 'not_configured' };
}
