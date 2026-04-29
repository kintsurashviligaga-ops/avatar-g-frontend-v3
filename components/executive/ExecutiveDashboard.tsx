'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import type { ExecutiveTaskLog, ExecutiveOutputs } from '@/types/billing';

interface ExecutiveDashboardProps {
  userId: string;
}

export default function ExecutiveDashboard({ userId: _userId }: ExecutiveDashboardProps) {
  const t = useTranslations('executive');

  /* ── State ─────────────────────────────────────────────────────────────── */
  const [input, setInput] = useState('');
  const [running, setRunning] = useState(false);
  const [tasks, setTasks] = useState<ExecutiveTaskLog[]>([]);
  const [error, setError] = useState<string | null>(null);

  /* ── Fetch task history ────────────────────────────────────────────────── */
  const loadTasks = useCallback(async () => {
    try {
      const res = await fetch('/api/executive/tasks');
      if (!res.ok) return;
      const json = await res.json();
      setTasks(json.tasks ?? []);
    } catch {
      // silent fail — tasks list is non-critical
    }
  }, []);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  /* ── Submit new task ───────────────────────────────────────────────────── */
  const handleSubmit = async () => {
    if (!input.trim() || running) return;
    setRunning(true);
    setError(null);

    try {
      const res = await fetch('/api/executive/task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: input.trim(), channel: 'dashboard' }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'submit_failed');
      }

      setInput('');
      await loadTasks(); // Refresh after submission
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error_generic'));
    } finally {
      setRunning(false);
    }
  };

  /* ── Render ────────────────────────────────────────────────────────────── */
  return (
    <div className="hf-main-content px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl space-y-8">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <header className="hf-hero px-6 py-5">
          <h1 className="hf-heading text-3xl font-bold tracking-tight text-white">{t('title')}</h1>
          <p className="mt-1 text-sm text-cyan-100/55">{t('subtitle')}</p>
        </header>

        {/* ── Input area ─────────────────────────────────────────────────── */}
        <div className="hf-card p-4">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t('input_placeholder')}
            rows={3}
            className="w-full resize-none rounded-lg border border-cyan-100/20 bg-cyan-300/[0.06] px-4 py-3 text-sm text-white placeholder-cyan-100/30 outline-none transition focus:border-cyan-300/60 focus:ring-1 focus:ring-cyan-300/30"
            disabled={running}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                handleSubmit();
              }
            }}
          />

          <div className="mt-3 flex items-center justify-between">
            {error && (
              <p className="text-xs text-red-400">{error}</p>
            )}
            <div className="ml-auto flex gap-2">
              <button
                onClick={handleSubmit}
                disabled={running || !input.trim()}
                className="hf-cta rounded-lg px-4 py-2 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-40"
              >
                {running ? t('button_running') : t('button_run')}
              </button>
            </div>
          </div>
        </div>

        {/* ── Task History ───────────────────────────────────────────────── */}
        <section>
          <h2 className="hf-heading mb-4 text-lg font-semibold text-white/85">
            {t('history_title')}
          </h2>

          {tasks.length === 0 ? (
            <p className="text-sm text-cyan-100/40">{t('no_tasks')}</p>
          ) : (
            <ul className="space-y-3">
              {tasks.map((task) => (
                <TaskCard key={task.id} task={task} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

/* ── Task Card (local sub-component) ──────────────────────────────────────── */

function TaskCard({ task }: { task: ExecutiveTaskLog }) {
  const t = useTranslations('executive');
  const outputs = task.outputs as ExecutiveOutputs;

  const statusColor: Record<string, string> = {
    queued: 'bg-yellow-500/20 text-yellow-400',
    running: 'bg-blue-500/20 text-blue-400',
    completed: 'bg-emerald-500/20 text-emerald-400',
    failed: 'bg-red-500/20 text-red-400',
  };

  return (
    <li className="hf-card p-4 transition hover:bg-cyan-200/[0.03]">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          {/* Input text */}
          <p className="truncate text-sm font-medium text-cyan-50/95">
            {task.input_text ?? '—'}
          </p>

          {/* Intent + credits */}
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-cyan-100/45">
            {task.detected_intent && (
              <span className="rounded bg-cyan-200/10 px-1.5 py-0.5 text-cyan-100/70">
                {task.detected_intent}
              </span>
            )}
            {task.credits_used > 0 && (
              <span>{task.credits_used} {t('credits_used_label')}</span>
            )}
            <span>
              {new Date(task.created_at).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>

          {/* Summary */}
          {outputs?.summaryText && (
            <p className="mt-2 text-xs text-cyan-100/55">{outputs.summaryText}</p>
          )}

          {/* Artifacts */}
          {outputs?.artifacts && outputs.artifacts.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {outputs.artifacts.map((a, i) => (
                <a
                  key={i}
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded bg-cyan-900/30 px-2 py-0.5 text-xs text-cyan-300 transition hover:bg-cyan-900/50"
                >
                  {a.label} ({a.type})
                </a>
              ))}
            </div>
          )}
        </div>

        {/* Status badge */}
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColor[task.status] ?? 'bg-gray-500/20 text-gray-400'}`}
        >
          {t(`status_${task.status}`)}
        </span>
      </div>

      {/* Error */}
      {task.error && (
        <p className="mt-2 rounded bg-red-900/20 px-2 py-1 text-xs text-red-400">
          {task.error}
        </p>
      )}
    </li>
  );
}

