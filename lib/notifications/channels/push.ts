/**
 * Web Push channel — PLACEHOLDER until the push work lands (VAPID keys, push_subscriptions, web-push). It answers
 * "not configured" so the dispatcher and every caller compile and behave today.
 */
import 'server-only';
import type { ChannelResult, NotifyEvent } from '../types';

export async function sendPushAlert(_ev: NotifyEvent): Promise<ChannelResult> {
  return { sent: false, reason: 'not_configured' };
}
