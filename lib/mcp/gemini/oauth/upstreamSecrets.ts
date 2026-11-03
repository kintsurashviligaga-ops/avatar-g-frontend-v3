import 'server-only';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/** Distinct broker-only secret; do not reuse browser or Drive token keys. */
export function brokerEncryptionKey(env: NodeJS.ProcessEnv = process.env): Buffer | null {
  const raw = env.MCP_BROKER_ENCRYPTION_KEY ?? '';
  if (!/^[A-Za-z0-9+/]{43}=$/.test(raw)) return null;
  const key = Buffer.from(raw, 'base64');
  return key.length === 32 && key.toString('base64') === raw ? key : null;
}

export type UpstreamBinding = { grantId: string; userId: string; clientId: string };
export type UpstreamTokenKind = 'access' | 'refresh';

function associatedData(binding: UpstreamBinding, kind: UpstreamTokenKind): Buffer | null {
  const fields = [binding.grantId, binding.userId, binding.clientId];
  if (fields.some((field) => typeof field !== 'string' || !field || field.length > 256 || /[\u0000-\u001f\u007f]/.test(field))) return null;
  return Buffer.from(JSON.stringify(['myavatar-mcp-upstream', 'v1', kind, ...fields]), 'utf8');
}

/** Return null on invalid input. Never log plaintext, key or ciphertext. */
export function sealUpstreamToken(token: string, binding: UpstreamBinding, kind: UpstreamTokenKind, key: Buffer): string | null {
  const aad = associatedData(binding, kind);
  if (!aad || key.length !== 32 || !token || Buffer.byteLength(token, 'utf8') > 8192) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ciphertext.toString('base64url')].join('.');
}

/** Reject corrupt, copied, substituted, or wrong-version envelopes. */
export function openUpstreamToken(envelope: string, binding: UpstreamBinding, kind: UpstreamTokenKind, key: Buffer): string | null {
  const aad = associatedData(binding, kind);
  const parts = envelope.split('.');
  if (!aad || key.length !== 32 || envelope.length > 12000 || parts.length !== 4) return null;
  const [version, ivText, tagText, encrypted] = parts;
  if (version !== 'v1' || !ivText || !tagText || !encrypted || !/^[A-Za-z0-9_-]+$/.test(ivText + tagText + encrypted)) return null;
  try {
    const iv = Buffer.from(ivText, 'base64url');
    const tag = Buffer.from(tagText, 'base64url');
    const ciphertext = Buffer.from(encrypted, 'base64url');
    if (iv.length !== 12 || tag.length !== 16 || !ciphertext.length || ciphertext.length > 8192 ||
        iv.toString('base64url') !== ivText || tag.toString('base64url') !== tagText || ciphertext.toString('base64url') !== encrypted) return null;
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(aad);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch { return null; }
}
