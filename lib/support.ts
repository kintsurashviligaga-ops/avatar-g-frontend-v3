/**
 * Official corporate support node for MyAvatar.ge.
 *
 * Single source of truth for the support address + request shaping/validation.
 * The intake API (/api/support) is provider-agnostic and fails open, so the
 * support channel is always reachable (mailto + best-effort persistence) even
 * when no transactional email provider is configured.
 */

export const SUPPORT_EMAIL = 'support@myavatar.ge';

export interface SupportRequest {
  email: string;
  message: string;
  name?: string;
  subject?: string;
  /** e.g. billing | technical | account | other */
  category?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type SupportValidation =
  | { ok: true; value: SupportRequest }
  | { ok: false; error: string };

export function validateSupportRequest(input: unknown): SupportValidation {
  if (!input || typeof input !== 'object') return { ok: false, error: 'invalid payload' };
  const o = input as Record<string, unknown>;
  const email = typeof o.email === 'string' ? o.email.trim() : '';
  const message = typeof o.message === 'string' ? o.message.trim() : '';
  if (!EMAIL_RE.test(email)) return { ok: false, error: 'a valid email is required' };
  if (message.length < 3) return { ok: false, error: 'message is too short' };
  if (message.length > 5000) return { ok: false, error: 'message is too long (max 5000)' };

  const value: SupportRequest = { email, message };
  if (typeof o.name === 'string' && o.name.trim()) value.name = o.name.trim().slice(0, 120);
  if (typeof o.subject === 'string' && o.subject.trim()) value.subject = o.subject.trim().slice(0, 200);
  if (typeof o.category === 'string' && o.category.trim()) value.category = o.category.trim().slice(0, 40);
  return { ok: true, value };
}

/** Build a prefilled mailto: link to the support node (always works, no backend). */
export function buildSupportMailto(req?: Partial<SupportRequest>): string {
  const subject = req?.subject ?? 'MyAvatar.ge support';
  const lines: string[] = [];
  if (req?.name) lines.push(`Name: ${req.name}`);
  if (req?.email) lines.push(`Email: ${req.email}`);
  if (req?.category) lines.push(`Category: ${req.category}`);
  if (req?.message) { lines.push(''); lines.push(req.message); }
  const params = new URLSearchParams({ subject });
  if (lines.length) params.set('body', lines.join('\n'));
  return `mailto:${SUPPORT_EMAIL}?${params.toString()}`;
}
