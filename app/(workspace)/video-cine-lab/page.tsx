'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

type PentagonResult = {
  success?: boolean;
  error?: string;
  finalVideoUrl?: string;
  renderJobId?: string;
  [key: string]: any;
};

type HealthState =
  | { ok: true; info: string }
  | { ok: false; info: string }
  | { ok: null; info: string };

function nowIso() {
  return new Date().toISOString();
}

function clamp(n: number, min: number, max: number) {
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function normalizeBaseUrl(url: string) {
  return url.trim().replace(/\/+$/, '');
}

async function safeRead(res: Response) {
  const text = await res.text();
  try {
    return { json: JSON.parse(text), text };
  } catch {
    return { json: null, text };
  }
}

async function safeFetchJson(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  const { json, text } = await safeRead(res);
  return { res, json, text };
}

export default function VideoCineLabPage() {
  const router = useRouter();

  const [prompt, setPrompt] = useState('');
  const [maxScenes, setMaxScenes] = useState<number>(5);
  const [maxDurationSec, setMaxDurationSec] = useState<number>(15);

  const [loading, setLoading] = useState(false);
  const [health, setHealth] = useState<HealthState>({ ok: null, info: 'Checking endpoint…' });

  const [error, setError] = useState<string | null>(null);
  const [debug, setDebug] = useState<string>('');
  const [result, setResult] = useState<PentagonResult | null>(null);

  const controllerRef = useRef<AbortController | null>(null);

  /**
   * ✅ IMPORTANT:
   * Browser must NOT call backend directly (CORS).
   * Always call local proxy route: app/api/pentagon/route.ts
   */
  const endpoint = useMemo(() => {
    return '/api/pentagon';
  }, []);

  /**
   * Health check:
   * - For local proxy, we can ping the backend root via our proxy using GET /api/pentagon/health (optional)
   * - But simplest: just show "local endpoint" as OK, and rely on debug if POST fails.
   */
  const bg =
    'radial-gradient(ellipse at top, rgba(139, 92, 246, 0.18), transparent 55%), radial-gradient(ellipse at center, rgba(59, 130, 246, 0.10), transparent 60%), #0a0e14';

  function buildDebugBlock(lines: string[]) {
    return lines.filter(Boolean).join('\n');
  }

  function stopOngoing() {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setLoading(false);
  }

  async function runHealthCheck() {
    // With local proxy, we can only "check" that our app is reachable.
    // True backend health is reflected by POST response/debug.
    setHealth({ ok: true, info: 'Local proxy endpoint ready: POST /api/pentagon (CORS-safe)' });
  }

  useEffect(() => {
    runHealthCheck();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleGenerate = async () => {
    const p = prompt.trim();
    if (!p) {
      setError('ჩაწერე prompt (მაგ: "კინემატოგრაფიული ვიდეო საქართველოს მთებზე მზის ჩასვლისას")');
      return;
    }

    const scenes = clamp(Number(maxScenes || 5), 1, 12);
    const dur = clamp(Number(maxDurationSec || 15), 5, 180);

    setMaxScenes(scenes);
    setMaxDurationSec(dur);

    setLoading(true);
    setError(null);
    setResult(null);
    setDebug('');

    // cancel previous request if any
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    // longer timeout because pipeline can be heavy
    const timeout = window.setTimeout(() => controller.abort(), 120000); // 120s

    const payload = {
      userPrompt: p,
      constraints: {
        maxScenes: scenes,
        maxDurationSec: dur,
        style: 'cinematic, professional, 4K, beautiful lighting',
      },
    };

    try {
      const startedAt = nowIso();

      const { res, json, text } = await safeFetchJson(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify(payload),
      });

      // Debug always
      setDebug(
        buildDebugBlock([
          `=== VIDEO CINE LAB DEBUG ===`,
          `TIME: ${startedAt}`,
          `ENDPOINT: ${endpoint}`,
          `METHOD: POST`,
          `PAYLOAD: ${JSON.stringify(payload)}`,
          ``,
          `HTTP: ${res.status} ${res.statusText}`,
          `CONTENT-TYPE: ${res.headers.get('content-type') || '(none)'}`,
          ``,
          `RAW (first 2000 chars):`,
          (text || '(empty response)').slice(0, 2000),
          ``,
          `=== END ===`,
        ])
      );

      if (!res.ok) {
        const hint =
          res.status === 405
            ? `\n\nHINT: 405 = Method Not Allowed. Proxy route.ts უნდა ჰქონდეს POST export.`
            : res.status === 404
              ? `\n\nHINT: 404 = /api/pentagon route არ არსებობს. გადაამოწმე app/api/pentagon/route.ts შექმნილია?`
              : res.status === 401 || res.status === 403
                ? `\n\nHINT: 401/403 = backend auth/token/cors policy. ახლა უკვე CORS-safe ვართ, ამიტომ backend auth/keys გადაამოწმე.`
                : '';

        throw new Error(`HTTP ${res.status}: ${(text || '').slice(0, 300) || 'Request failed'}${hint}`);
      }

      const data = (json || {}) as PentagonResult;
      const success = data.success ?? true;

      if (!success) throw new Error(data.error || 'Pipeline failed');

      setResult(data);
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        setError('Request გაჩერდა / Timeout (120s). სცადე კიდევ ერთხელ.');
      } else {
        setError(e?.message || 'Failed to fetch');
      }
    } finally {
      window.clearTimeout(timeout);
      setLoading(false);
    }
  };

  const copyDebug = async () => {
    try {
      await navigator.clipboard.writeText(debug || '');
    } catch {
      // mobile may block clipboard; ignore
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: bg, paddingBottom: 110 }}>
      <header
        style={{
          padding: 18,
          background: 'rgba(10, 14, 20, 0.92)',
          backdropFilter: 'blur(18px)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.10)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}
      >
        <button
          onClick={() => router.push('/')}
          style={{
            padding: 10,
            background: 'rgba(255, 255, 255, 0.06)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: 14,
            cursor: 'pointer',
            color: '#fff',
            fontSize: 18,
            lineHeight: 1,
          }}
          aria-label="Back"
        >
          ←
        </button>

        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 18, fontWeight: 800, color: '#fff', margin: 0 }}>Video Cine Lab</h1>
          <p style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.62)', margin: 0 }}>Neural Video Render Studio</p>
        </div>

        <div
          style={{
            padding: '6px 12px',
            background: 'rgba(16, 185, 129, 0.10)',
            border: '1px solid rgba(16, 185, 129, 0.30)',
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 900,
            color: '#10B981',
          }}
        >
          Active
        </div>
      </header>

      <div style={{ padding: '18px 18px 0 18px' }}>
        <div
          style={{
            borderRadius: 20,
            border: '1px solid rgba(255,255,255,0.10)',
            background: 'rgba(255,255,255,0.06)',
            boxShadow: '0 18px 55px rgba(0,0,0,0.45)',
            backdropFilter: 'blur(18px)',
            padding: 16,
          }}
        >
          {/* Health */}
          <div
            style={{
              marginBottom: 12,
              padding: 10,
              borderRadius: 14,
              border: '1px solid rgba(255,255,255,0.10)',
              background:
                health.ok === true
                  ? 'rgba(16,185,129,0.08)'
                  : health.ok === false
                    ? 'rgba(239,68,68,0.08)'
                    : 'rgba(255,255,255,0.04)',
              color:
                health.ok === true
                  ? '#a7f3d0'
                  : health.ok === false
                    ? '#fecaca'
                    : 'rgba(255,255,255,0.70)',
              fontSize: 12,
              lineHeight: 1.35,
            }}
          >
            <strong>Endpoint Check:</strong> {health.info}
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 900, color: 'rgba(255,255,255,0.75)', marginBottom: 8 }}>
              Prompt
            </div>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder='მაგ: "კინემატოგრაფიული ვიდეო საქართველოს მთებზე მზის ჩასვლისას"'
              rows={3}
              style={{
                width: '100%',
                padding: 12,
                borderRadius: 14,
                border: '1px solid rgba(255,255,255,0.12)',
                background: 'rgba(10,14,20,0.55)',
                color: '#fff',
                outline: 'none',
                fontSize: 14,
              }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 900, color: 'rgba(255,255,255,0.75)', marginBottom: 8 }}>
                Max Scenes
              </div>
              <input
                type="number"
                value={maxScenes}
                onChange={(e) => setMaxScenes(Number(e.target.value))}
                min={1}
                max={12}
                style={{
                  width: '100%',
                  padding: 12,
                  borderRadius: 14,
                  border: '1px solid rgba(255,255,255,0.12)',
                  background: 'rgba(10,14,20,0.55)',
                  color: '#fff',
                  outline: 'none',
                  fontSize: 14,
                }}
              />
            </div>

            <div>
              <div style={{ fontSize: 12, fontWeight: 900, color: 'rgba(255,255,255,0.75)', marginBottom: 8 }}>
                Max Duration (sec)
              </div>
              <input
                type="number"
                value={maxDurationSec}
                onChange={(e) => setMaxDurationSec(Number(e.target.value))}
                min={5}
                max={180}
                style={{
                  width: '100%',
                  padding: 12,
                  borderRadius: 14,
                  border: '1px solid rgba(255,255,255,0.12)',
                  background: 'rgba(10,14,20,0.55)',
                  color: '#fff',
                  outline: 'none',
                  fontSize: 14,
                }}
              />
            </div>
          </div>

          <button
            onClick={handleGenerate}
            disabled={loading}
            style={{
              width: '100%',
              padding: 16,
              borderRadius: 18,
              border: '1px solid rgba(255,255,255,0.12)',
              background: loading ? 'rgba(255,255,255,0.12)' : 'linear-gradient(135deg, #8B5CF6, #3B82F6)',
              color: '#fff',
              fontSize: 15,
              fontWeight: 950,
              cursor: loading ? 'not-allowed' : 'pointer',
              boxShadow: loading ? 'none' : '0 10px 28px rgba(139, 92, 246, 0.28)',
            }}
          >
            {loading ? '⏳ Generating…' : '🚀 Generate Video'}
          </button>

          <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
            <button
              onClick={stopOngoing}
              disabled={!loading}
              style={{
                flex: 1,
                padding: 12,
                borderRadius: 14,
                border: '1px solid rgba(255,255,255,0.12)',
                background: !loading ? 'rgba(255,255,255,0.06)' : 'rgba(239,68,68,0.16)',
                color: !loading ? 'rgba(255,255,255,0.55)' : '#fecaca',
                fontWeight: 900,
                cursor: !loading ? 'not-allowed' : 'pointer',
              }}
            >
              ⛔ Cancel
            </button>

            <button
              onClick={runHealthCheck}
              style={{
                flex: 1,
                padding: 12,
                borderRadius: 14,
                border: '1px solid rgba(255,255,255,0.12)',
                background: 'rgba(255,255,255,0.06)',
                color: 'rgba(255,255,255,0.80)',
                fontWeight: 900,
                cursor: 'pointer',
              }}
            >
              🔎 Recheck
            </button>
          </div>

          <div style={{ marginTop: 10, fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
            Using endpoint: <span style={{ color: 'rgba(255,255,255,0.86)' }}>{endpoint}</span>
          </div>
        </div>

        {error && (
          <div
            style={{
              marginTop: 14,
              padding: 14,
              borderRadius: 16,
              border: '1px solid rgba(239,68,68,0.35)',
              background: 'rgba(239,68,68,0.10)',
              color: '#fecaca',
              whiteSpace: 'pre-wrap',
            }}
          >
            <strong>❌ Error:</strong> {error}
          </div>
        )}

        {debug && (
          <div
            style={{
              marginTop: 14,
              padding: 14,
              borderRadius: 16,
              border: '1px solid rgba(255,255,255,0.10)',
              background: 'rgba(0,0,0,0.35)',
              color: 'rgba(255,255,255,0.88)',
              whiteSpace: 'pre-wrap',
              fontFamily:
                'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
              fontSize: 12,
              overflow: 'auto',
            }}
          >
            <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
              <button
                onClick={copyDebug}
                style={{
                  padding: '10px 12px',
                  borderRadius: 12,
                  border: '1px solid rgba(255,255,255,0.12)',
                  background: 'rgba(255,255,255,0.06)',
                  color: 'rgba(255,255,255,0.85)',
                  fontWeight: 900,
                  cursor: 'pointer',
                }}
              >
                📋 Copy Debug
              </button>
            </div>

            {debug}
          </div>
        )}

        {result?.finalVideoUrl ? (
          <div
            style={{
              marginTop: 14,
              borderRadius: 18,
              overflow: 'hidden',
              border: '1px solid rgba(255,255,255,0.10)',
              background: '#000',
            }}
          >
            <video controls playsInline style={{ width: '100%', display: 'block' }} src={result.finalVideoUrl} />
            <div style={{ padding: 12, background: 'rgba(0,0,0,0.55)' }}>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.70)', marginBottom: 6 }}>Final Video URL</div>
              <div style={{ fontSize: 12, color: '#fff', wordBreak: 'break-all' }}>{result.finalVideoUrl}</div>
              <a
                href={result.finalVideoUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: 'inline-block', marginTop: 10, fontSize: 12, color: '#93c5fd', fontWeight: 900 }}
              >
                Open in new tab →
              </a>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
              }
