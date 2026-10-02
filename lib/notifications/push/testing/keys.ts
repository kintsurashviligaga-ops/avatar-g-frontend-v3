/**
 * lib/notifications/push/testing/keys.ts — TEST-ONLY: well-formed key material (a VAPID pair, a browser's p256dh/auth)
 * made locally with node:crypto, so tests never carry a real key. Imported by no production code.
 */
import { createECDH, randomBytes } from 'node:crypto';

export function testVapidKeys(): { publicKey: string; privateKey: string } {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  const priv = ecdh.getPrivateKey();
  return {
    publicKey: ecdh.getPublicKey().toString('base64url'),
    privateKey: Buffer.concat([Buffer.alloc(32 - priv.length), priv]).toString('base64url'),
  };
}

export function testBrowserKeys(): { p256dh: string; auth: string } {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  return { p256dh: ecdh.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') };
}
