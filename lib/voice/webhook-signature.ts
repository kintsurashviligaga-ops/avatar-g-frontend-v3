import crypto from 'node:crypto';

function cleanSignature(value: string): string {
  return value.trim().replace(/^sha256=/i, '').toLowerCase();
}

export function buildVapiWebhookSignature(rawBody: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');
}

export function verifyVapiWebhookSignature(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader || !secret) {
    return false;
  }

  const expected = buildVapiWebhookSignature(rawBody, secret);
  const candidates = signatureHeader
    .split(',')
    .map(cleanSignature)
    .filter(Boolean);

  if (candidates.length === 0) {
    return false;
  }

  for (const candidate of candidates) {
    if (candidate.length !== expected.length) {
      continue;
    }

    const expectedBuffer = Buffer.from(expected, 'utf8');
    const candidateBuffer = Buffer.from(candidate, 'utf8');

    if (crypto.timingSafeEqual(expectedBuffer, candidateBuffer)) {
      return true;
    }
  }

  return false;
}
