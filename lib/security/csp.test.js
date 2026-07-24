/* eslint-disable @typescript-eslint/no-require-imports */
const { cspDirectiveMap, serializeCsp, CSP_DIRECTIVES } = require('./csp');

describe('CSP — PHASE 48 §2 inline-media playback lock-down', () => {
  const map = cspDirectiveMap();

  it('media-src allows data: so inline data:video/mp4 + data:audio/* play natively', () => {
    // THE regression: without data: the browser blocks every inline <video>/<audio>
    // whose src is a base64 data URL — the "plays only after download" symptom.
    expect(map['media-src']).toContain('data:');
  });

  it('media-src still allows blob:, self, storage and the provider CDN', () => {
    expect(map['media-src']).toEqual(
      expect.arrayContaining([
        "'self'",
        'blob:',
        'data:',
        'https://*.supabase.co',
        'https://*.r2.cloudflarestorage.com',
        'https://*.replicate.delivery',
      ]),
    );
  });

  it('img-src keeps data: (data-URL images) and gains the provider CDN', () => {
    expect(map['img-src']).toContain('data:');
    expect(map['img-src']).toContain('https://*.replicate.delivery');
  });

  it('connect-src allows the provider CDN so the download/fetch path works', () => {
    expect(map['connect-src']).toContain('https://*.replicate.delivery');
    expect(map['connect-src']).toContain('https://api.elevenlabs.io');
  });

  it('connect-src allows the Gemini Live WebSocket (else voice mode is CSP-blocked as "insecure")', () => {
    expect(map['connect-src']).toContain('wss://generativelanguage.googleapis.com');
    expect(map['connect-src']).toContain('https://generativelanguage.googleapis.com');
  });

  it('object-src stays locked to none (no Flash/plugin vector)', () => {
    expect(map['object-src']).toEqual(["'none'"]);
  });

  // PHASE 51 §2 — LTX hosts finished MP4s on api.ltx.video / GCP storage. Native
  // <video> playback, <img> poster fetch and the download path all need these
  // origins allow-listed, or the browser silently blocks the hosted clip.
  it('allows the LTX output origins across media/img/connect', () => {
    for (const directive of ['media-src', 'img-src', 'connect-src']) {
      expect(map[directive]).toContain('https://api.ltx.video');
      expect(map[directive]).toContain('https://storage.googleapis.com');
    }
  });

  it('serializes into a single header string with directive separators', () => {
    const header = serializeCsp(map);
    expect(header).toContain('media-src ');
    expect(header).toContain('data:');
    expect(header.split('; ').length).toBeGreaterThan(5);
    expect(CSP_DIRECTIVES).toBe(header);
  });
});
