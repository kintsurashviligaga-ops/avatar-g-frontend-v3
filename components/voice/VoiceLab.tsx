'use client';

/**
 * VoiceLab — record a voice sample, clone it via ElevenLabs, manage clones.
 *
 * Flow:
 *   1. Record up to 30s of audio with MediaRecorder (audio/webm;codecs=opus).
 *   2. Name the sample, then POST to /api/voice/clone as multipart form.
 *   3. List user's clones; each row supports inline preview via <InlineMedia>,
 *      setting as default, or deletion.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, Square, Trash2, Star, StarOff, Play } from 'lucide-react';
import InlineMedia from '@/components/dashboard/command-center/InlineMedia';
import { reportError } from '@/lib/observability/report-error';

const MAX_SECONDS = 30;
const MIME = 'audio/webm;codecs=opus';

interface VoiceSample {
  id: string;
  name: string;
  provider: string;
  external_id: string;
  preview_url: string | null;
  is_default: boolean;
  created_at: string;
}

export default function VoiceLab() {
  const [samples, setSamples] = useState<VoiceSample[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<number>(0);

  // ── Initial load ──────────────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    setLoadingList(true);
    setListError(null);
    try {
      const res = await fetch('/api/voice/clone', { cache: 'no-store' });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { samples: VoiceSample[] };
      setSamples(data.samples ?? []);
    } catch (err) {
      reportError(err, { component: 'VoiceLab', op: 'list' });
      setListError(err instanceof Error ? err.message : 'Failed to load voices');
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        try {
          recorderRef.current.stop();
        } catch {
          // ignore
        }
      }
      streamRef.current?.getTracks().forEach(t => t.stop());
      if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Recording controls ────────────────────────────────────────────────────
  const stopRecording = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    const rec = recorderRef.current;
    if (rec && rec.state !== 'inactive') {
      try {
        rec.stop();
      } catch (err) {
        reportError(err, { component: 'VoiceLab', op: 'stop' });
      }
    }
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setRecording(false);
  }, []);

  const startRecording = useCallback(async () => {
    setSaveError(null);
    setRecordedBlob(null);
    if (recordedUrl) {
      URL.revokeObjectURL(recordedUrl);
      setRecordedUrl(null);
    }
    chunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported(MIME) ? MIME : '';
      const rec = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recorderRef.current = rec;

      rec.ondataavailable = e => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || MIME });
        chunksRef.current = [];
        setRecordedBlob(blob);
        const url = URL.createObjectURL(blob);
        setRecordedUrl(url);
      };

      rec.start();
      startedAtRef.current = Date.now();
      setElapsed(0);
      setRecording(true);
      tickRef.current = setInterval(() => {
        const secs = Math.floor((Date.now() - startedAtRef.current) / 1000);
        setElapsed(secs);
        if (secs >= MAX_SECONDS) stopRecording();
      }, 200);
    } catch (err) {
      reportError(err, { component: 'VoiceLab', op: 'start' });
      setSaveError(
        err instanceof Error
          ? `Microphone access failed: ${err.message}`
          : 'Microphone access failed',
      );
    }
  }, [recordedUrl, stopRecording]);

  // ── Save / upload ─────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!recordedBlob) {
      setSaveError('Record a sample first');
      return;
    }
    if (!name.trim()) {
      setSaveError('Give the voice a name');
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      const fd = new FormData();
      fd.append('audio', recordedBlob, `sample-${Date.now()}.webm`);
      fd.append('name', name.trim());

      const res = await fetch('/api/voice/clone', { method: 'POST', body: fd });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }

      // Reset local state
      setName('');
      setRecordedBlob(null);
      if (recordedUrl) URL.revokeObjectURL(recordedUrl);
      setRecordedUrl(null);
      setElapsed(0);
      await refresh();
    } catch (err) {
      reportError(err, { component: 'VoiceLab', op: 'save' });
      setSaveError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }, [name, recordedBlob, recordedUrl, refresh]);

  // ── Row actions ───────────────────────────────────────────────────────────
  const handleDelete = useCallback(
    async (id: string) => {
      setBusyId(id);
      try {
        const res = await fetch(`/api/voice/clone?id=${encodeURIComponent(id)}`, {
          method: 'DELETE',
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(j.error ?? `HTTP ${res.status}`);
        }
        if (expandedId === id) setExpandedId(null);
        await refresh();
      } catch (err) {
        reportError(err, { component: 'VoiceLab', op: 'delete', id });
      } finally {
        setBusyId(null);
      }
    },
    [expandedId, refresh],
  );

  const handleSetDefault = useCallback(
    async (id: string) => {
      setBusyId(id);
      try {
        const res = await fetch('/api/voice/clone', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id }),
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(j.error ?? `HTTP ${res.status}`);
        }
        await refresh();
      } catch (err) {
        reportError(err, { component: 'VoiceLab', op: 'set-default', id });
      } finally {
        setBusyId(null);
      }
    },
    [refresh],
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <header className="mb-10">
          <h1 className="text-2xl font-semibold tracking-tight text-white">Voice Lab</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Record a short sample, clone it via ElevenLabs, then test playback and pick the
            default voice for your avatar.
          </p>
        </header>

        {/* ── Recorder card ────────────────────────────────────────────── */}
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 shadow-lg shadow-violet-950/10">
          <div className="flex flex-col items-center gap-4">
            <button
              type="button"
              onClick={recording ? stopRecording : startRecording}
              disabled={saving}
              aria-label={recording ? 'Stop recording' : 'Start recording'}
              className={`group relative flex h-24 w-24 items-center justify-center rounded-full border transition ${
                recording
                  ? 'border-red-500/60 bg-red-500/20 shadow-[0_0_40px_-4px_rgba(239,68,68,0.65)]'
                  : 'border-violet-500/40 bg-gradient-to-br from-violet-600/30 to-cyan-500/20 shadow-[0_0_30px_-6px_rgba(14,165,233,0.55)] hover:from-violet-600/40 hover:to-cyan-500/30'
              } disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {recording ? (
                <Square className="h-9 w-9 text-red-300" />
              ) : (
                <Mic className="h-10 w-10 text-violet-200" />
              )}
            </button>

            <div className="flex items-center gap-2 text-sm text-zinc-300">
              {recording && (
                <span className="flex items-center gap-2">
                  <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)]" />
                  <span className="font-mono tabular-nums">
                    {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')} /{' '}
                    {Math.floor(MAX_SECONDS / 60)}:{String(MAX_SECONDS % 60).padStart(2, '0')}
                  </span>
                </span>
              )}
              {!recording && !recordedBlob && (
                <span className="text-zinc-500">
                  Tap the mic to record up to {MAX_SECONDS}s of clean speech.
                </span>
              )}
              {!recording && recordedBlob && (
                <span className="text-emerald-400">
                  Sample captured — name it below and Save.
                </span>
              )}
            </div>

            {recordedUrl && !recording && (
              <audio
                src={recordedUrl}
                controls
                className="mt-2 w-full max-w-md rounded-lg bg-zinc-950/60"
              />
            )}
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-[1fr_auto]">
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Voice name (e.g. My calm voice)"
              disabled={saving || recording}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950/80 px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-violet-500/60 focus:outline-none focus:ring-2 focus:ring-violet-500/30 disabled:opacity-50"
              maxLength={80}
            />
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || recording || !recordedBlob || !name.trim()}
              className="rounded-lg border border-violet-500/40 bg-gradient-to-r from-violet-600 to-cyan-500 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:from-violet-500 hover:to-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save voice'}
            </button>
          </div>

          {saveError && (
            <p className="mt-3 text-sm text-red-400" role="alert">
              {saveError}
            </p>
          )}
        </section>

        {/* ── Voices list ────────────────────────────────────────────────── */}
        <section className="mt-10">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
              Your voices
            </h2>
            <button
              type="button"
              onClick={() => void refresh()}
              className="text-xs text-zinc-500 hover:text-zinc-300"
            >
              Refresh
            </button>
          </div>

          {loadingList && <p className="text-sm text-zinc-500">Loading voices…</p>}
          {!loadingList && listError && (
            <p className="text-sm text-red-400">Failed to load: {listError}</p>
          )}
          {!loadingList && !listError && samples.length === 0 && (
            <p className="text-sm text-zinc-500">
              No voices yet. Record one above to get started.
            </p>
          )}

          <ul className="space-y-2">
            {samples.map(sample => {
              const isExpanded = expandedId === sample.id;
              const isBusy = busyId === sample.id;
              return (
                <li
                  key={sample.id}
                  className={`rounded-xl border bg-zinc-900/40 p-4 transition ${
                    sample.is_default
                      ? 'border-violet-500/40 shadow-[0_0_24px_-12px_rgba(14,165,233,0.55)]'
                      : 'border-zinc-800'
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-white">
                          {sample.name}
                        </span>
                        {sample.is_default && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-violet-500/40 bg-violet-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-violet-300">
                            <Star className="h-2.5 w-2.5" /> Default
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 text-xs text-zinc-500">
                        {sample.provider} · {new Date(sample.created_at).toLocaleString()}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : sample.id)}
                        disabled={!sample.preview_url}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800/60 px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-cyan-500/40 hover:bg-cyan-500/10 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Play className="h-3 w-3" />
                        {isExpanded ? 'Hide' : 'Test'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleSetDefault(sample.id)}
                        disabled={isBusy || sample.is_default}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800/60 px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-violet-500/40 hover:bg-violet-500/10 hover:text-violet-200 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {sample.is_default ? (
                          <Star className="h-3 w-3" />
                        ) : (
                          <StarOff className="h-3 w-3" />
                        )}
                        Default
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(sample.id)}
                        disabled={isBusy}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800/60 px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Trash2 className="h-3 w-3" />
                        Delete
                      </button>
                    </div>
                  </div>

                  {isExpanded && sample.preview_url && (
                    <div className="mt-3">
                      <InlineMedia kind="audio" url={sample.preview_url} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}
