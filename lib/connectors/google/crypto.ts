/**
 * lib/connectors/google/crypto.ts — the three secrets of the Drive link, all from one server-only key.
 *
 *   · the refresh token at rest: AES-256-GCM, random 12-byte IV, the user id as associated data (a row copied to
 *     another user does not decrypt). Stored as `v1.<iv>.<tag>.<ciphertext>` (base64url).
 *   · the OAuth `state`: HMAC-SHA256 over `drive-oauth-state:v1:<user>.<nonce>.<expiry>`, constant-time compare.
 *   · PKCE: a 43-char verifier and its S256 challenge.
 *
 * CONNECTOR_TOKEN_KEY is 32 bytes, base64. Missing or the wrong length = null key = the connector stays closed (fail
 * closed). The encryption key and the state key are derived from it with HKDF, so one never signs with the other.
 */
import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';

export interface ConnectorKeys {
  enc: Buffer;
  mac: Buffer;
}

const b64u = (b: Buffer) => b.toString('base64url');
const unb64u = (s: string) => Buffer.from(s, 'base64url');

export function connectorKeys(env: NodeJS.ProcessEnv = process.env): ConnectorKeys | null {
  const raw = (env.CONNECTOR_TOKEN_KEY ?? '').trim();
  if (!raw) return null;
  const master = Buffer.from(raw, 'base64');
  if (master.length !== 32) return null;
  const derive = (info: string) => Buffer.from(hkdfSync('sha256', master, Buffer.alloc(0), info, 32));
  return { enc: derive('connector-token-enc:v1'), mac: derive('connector-oauth-state:v1') };
}

export function encryptToken(plain: string, userId: string, keys: ConnectorKeys): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', keys.enc, iv);
  c.setAAD(Buffer.from(userId, 'utf8'));
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return ['v1', b64u(iv), b64u(c.getAuthTag()), b64u(ct)].join('.');
}

/** null for anything that is not ours, not this user's, or tampered with. Never throws. */
export function decryptToken(sealed: string, userId: string, keys: ConnectorKeys): string | null {
  const [ver, iv, tag, ct] = sealed.split('.');
  if (ver !== 'v1' || !iv || !tag || ct === undefined || sealed.split('.').length !== 4) return null;
  try {
    const d = createDecipheriv('aes-256-gcm', keys.enc, unb64u(iv));
    d.setAAD(Buffer.from(userId, 'utf8'));
    d.setAuthTag(unb64u(tag));
    return Buffer.concat([d.update(unb64u(ct)), d.final()]).toString('utf8');
  } catch {
    return null;
  }
}

/** The link flow has 10 minutes from "Connect" to Google's redirect back. */
export const STATE_TTL_MS = 10 * 60 * 1000;
const STATE_DOMAIN = 'drive-oauth-state:v1';

function stateMac(payload: string, keys: ConnectorKeys): string {
  return b64u(createHmac('sha256', keys.mac).update(`${STATE_DOMAIN}:${payload}`).digest());
}

export function signState(userId: string, keys: ConnectorKeys, now = Date.now()): string {
  const payload = `${b64u(Buffer.from(userId, 'utf8'))}.${b64u(randomBytes(16))}.${now + STATE_TTL_MS}`;
  return `${payload}.${stateMac(payload, keys)}`;
}

export type StateCheck = { ok: true } | { ok: false; reason: 'invalid' | 'expired' | 'other_user' };

export function verifyState(state: string, userId: string, keys: ConnectorKeys, now = Date.now()): StateCheck {
  const parts = state.split('.');
  const [user, nonce, expiry, mac] = parts;
  if (parts.length !== 4 || !user || !nonce || !expiry || !mac) return { ok: false, reason: 'invalid' };
  const want = Buffer.from(stateMac(`${user}.${nonce}.${expiry}`, keys));
  const got = Buffer.from(mac);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return { ok: false, reason: 'invalid' };
  const exp = Number(expiry);
  if (!Number.isFinite(exp) || exp < now) return { ok: false, reason: 'expired' };
  if (unb64u(user).toString('utf8') !== userId) return { ok: false, reason: 'other_user' };
  return { ok: true };
}

export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = b64u(randomBytes(32));
  return { verifier, challenge: pkceChallenge(verifier) };
}

export function pkceChallenge(verifier: string): string {
  return b64u(createHash('sha256').update(verifier).digest());
}
