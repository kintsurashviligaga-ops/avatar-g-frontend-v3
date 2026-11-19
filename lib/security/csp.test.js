/* eslint-disable @typescript-eslint/no-require-imports */
const { cspDirectiveMap, serializeCsp, CSP_DIRECTIVES, liveRelayOrigin } = require('./csp');

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

  it('music beat analysis may fetch authorized R2 audio without weakening other CSP directives', () => {
    const allowed = 'https://*.r2.cloudflarestorage.com';
    expect(map['media-src']).toContain(allowed);
    expect(map['connect-src']).toContain(allowed);
    expect(map['connect-src']).toContain('https://*.supabase.co');
    expect(map['object-src']).toEqual(["'none'"]);
  });

  it('connect-src allows the provider CDN so the download/fetch path works', () => {
    expect(map['connect-src']).toContain('https://*.replicate.delivery');
  });

  it('connect-src no longer opens ElevenLabs: no browser code calls it, and speech is Cloud TTS on the server (PR 6b)', () => {
    expect(map['connect-src'].some((src) => src.includes('elevenlabs'))).toBe(false);
  });

  it('connect-src opens no provider API: Gemini Live is refused before a token (Developer API, v3.1), so is LiveAvatar', () => {
    const connect = map['connect-src'];
    for (const host of ['generativelanguage.googleapis.com', 'api.openai.com', 'api.replicate.com', 'liveavatar.com', 'livekit.cloud']) {
      expect(connect.some((src) => src.includes(host))).toBe(false);
    }
    // The CDNs of assets made before stay, so their downloads still work.
    expect(connect).toEqual(expect.arrayContaining(['https://*.replicate.delivery', 'https://files2.heygen.ai']));
  });

  it('connect-src has no partial-label wildcard (Chrome drops the whole source) and lets telemetry through', () => {
    const connect = map['connect-src'];
    // `o*.ingest.sentry.io` was silently ignored by the browser for as long as it existed — a CSP
    // source may only wildcard a WHOLE leftmost label. Any `*` that is not `*.` at the host start is a bug.
    for (const src of connect) {
      const host = src.replace(/^[a-z]+:\/\//, '');
      expect(host.includes('*') && !host.startsWith('*.')).toBe(false);
    }
    expect(connect).toContain('https://*.ingest.de.sentry.io');
    expect(connect).toContain('https://us-assets.i.posthog.com');
  });

  it('script-src lets posthog-js load its remote config script (CSP violation on every page, 2026-10-16)', () => {
    expect(map['script-src']).toContain('https://us-assets.i.posthog.com');
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

  it('connect-src opens the Live relay socket only when LIVE_RELAY_URL is a plain wss:// URL', () => {
    const url = 'wss://live-relay-1.us-central1.run.app/v1/live';
    expect(cspDirectiveMap({ LIVE_RELAY_URL: url })['connect-src']).toContain('wss://live-relay-1.us-central1.run.app');
    expect(cspDirectiveMap({})['connect-src'].some((src) => src.includes('run.app'))).toBe(false);
    for (const bad of ['https://live-relay-1.us-central1.run.app', 'wss://u:p@x.run.app', 'wss://x.run.app/?k=1', 'nope']) {
      expect(liveRelayOrigin(bad)).toBeNull();
    }
  });
});

describe('Google Picker (Phase 4 Drive connector)', () => {
  const { cspDirectiveMap } = require('./csp');
  const map = cspDirectiveMap({});
  it('loads gapi and frames the Picker, nothing broader', () => {
    expect(map['script-src']).toContain('https://apis.google.com');
    expect(map['frame-src']).toEqual(expect.arrayContaining(['https://docs.google.com', 'https://accounts.google.com']));
    expect(map['frame-src']).not.toContain('https://*.google.com');
  });
});
