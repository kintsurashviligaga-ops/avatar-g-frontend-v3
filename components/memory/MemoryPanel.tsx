'use client';

import { useCallback, useEffect, useState } from 'react';
import { Brain, Pencil, Plus, Save, Trash2, X } from 'lucide-react';

interface MemoryRow {
  id: string;
  user_id: string;
  fact: string;
  source: 'auto' | 'manual';
  created_at: string;
  updated_at: string;
}

interface MemoryApiList {
  memories?: MemoryRow[];
  error?: string;
}

interface MemoryApiOne {
  memory?: MemoryRow;
  error?: string;
}

const MIN_FACT_LENGTH = 3;

// ─── Component ────────────────────────────────────────────────────────
export default function MemoryPanel() {
  const [memories, setMemories] = useState<MemoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch('/api/memory', {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
      });
      const json = (await res.json().catch(() => ({}))) as MemoryApiList;
      if (!res.ok) {
        setError(json.error ?? 'Failed to load memories');
        return;
      }
      setMemories(json.memories ?? []);
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // ─── Create ─────────────────────────────────────────────────────────
  const handleAdd = useCallback(async () => {
    const fact = draft.trim();
    if (fact.length < MIN_FACT_LENGTH || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/memory', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fact }),
      });
      const json = (await res.json().catch(() => ({}))) as MemoryApiOne;
      if (!res.ok || !json.memory) {
        setError(json.error ?? 'Failed to save memory');
        return;
      }
      setMemories((prev) => [json.memory as MemoryRow, ...prev]);
      setDraft('');
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  }, [draft, saving]);

  // ─── Update ─────────────────────────────────────────────────────────
  const beginEdit = (m: MemoryRow) => {
    setEditingId(m.id);
    setEditDraft(m.fact);
  };
  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft('');
  };
  const handleEditSave = useCallback(async () => {
    if (!editingId) return;
    const fact = editDraft.trim();
    if (fact.length < MIN_FACT_LENGTH || editSaving) return;
    setEditSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/memory', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingId, fact }),
      });
      const json = (await res.json().catch(() => ({}))) as MemoryApiOne;
      if (!res.ok || !json.memory) {
        setError(json.error ?? 'Failed to update memory');
        return;
      }
      const updated = json.memory as MemoryRow;
      setMemories((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
      cancelEdit();
    } catch {
      setError('Network error');
    } finally {
      setEditSaving(false);
    }
  }, [editingId, editDraft, editSaving]);

  // ─── Delete ─────────────────────────────────────────────────────────
  const handleDelete = useCallback(async (id: string) => {
    setError(null);
    // optimistic
    const snapshot = memories;
    setMemories((prev) => prev.filter((m) => m.id !== id));
    try {
      const res = await fetch(`/api/memory?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        setError(json.error ?? 'Failed to delete memory');
        setMemories(snapshot);
      }
    } catch {
      setError('Network error');
      setMemories(snapshot);
    }
  }, [memories]);

  // ─── Render ─────────────────────────────────────────────────────────
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:py-10">
      <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-slate-900/80 to-slate-950/90 p-5 shadow-2xl backdrop-blur sm:p-7">
        {/* Header */}
        <div className="mb-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-xl"
              style={{ background: 'linear-gradient(140deg,#22d3ee,#a78bfa)' }}
            >
              <Brain className="h-4 w-4 text-slate-950" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white sm:text-xl">
                Memory <span className="text-white/50">/</span>{' '}
                <span className="text-white/80">მეხსიერება</span>
              </h1>
              <p className="text-xs text-white/50">
                What Agent G remembers about you.
              </p>
            </div>
          </div>
          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-semibold tabular-nums text-white/80">
            {memories.length}
          </span>
        </div>

        {/* Add */}
        <div className="mb-6 rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add a memory… e.g. I prefer Georgian replies, I run a coffee shop in Tbilisi."
            rows={3}
            className="w-full resize-none rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white placeholder-white/30 outline-none transition-colors focus:border-cyan-400/50"
          />
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[11px] text-white/40">
              {draft.trim().length < MIN_FACT_LENGTH
                ? `Min ${MIN_FACT_LENGTH} chars`
                : `${draft.trim().length} chars`}
            </span>
            <button
              type="button"
              onClick={handleAdd}
              disabled={saving || draft.trim().length < MIN_FACT_LENGTH}
              className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-400 px-3 py-1.5 text-xs font-semibold text-slate-950 transition-colors hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" />
              {saving ? 'Saving…' : 'Save memory'}
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
            {error}
          </div>
        )}

        {/* List */}
        <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
          {loading ? (
            <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-6 text-center text-sm text-white/40">
              Loading…
            </div>
          ) : memories.length === 0 ? (
            <div className="rounded-lg border border-dashed border-white/10 bg-white/[0.02] px-3 py-8 text-center text-sm text-white/40">
              No memories yet. Add one above and Agent G will remember it.
            </div>
          ) : (
            memories.map((m) => {
              const isEditing = editingId === m.id;
              const isAuto = m.source === 'auto';
              return (
                <div
                  key={m.id}
                  className="group rounded-lg border border-white/10 bg-white/[0.02] p-3 transition-colors hover:bg-white/[0.04]"
                >
                  {isEditing ? (
                    <div>
                      <textarea
                        value={editDraft}
                        onChange={(e) => setEditDraft(e.target.value)}
                        rows={3}
                        className="w-full resize-none rounded-md border border-white/10 bg-slate-950/60 px-2.5 py-2 text-sm text-white outline-none focus:border-cyan-400/50"
                      />
                      <div className="mt-2 flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1 text-xs font-medium text-white/70 hover:bg-white/[0.06]"
                        >
                          <X className="h-3 w-3" />
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleEditSave}
                          disabled={
                            editSaving || editDraft.trim().length < MIN_FACT_LENGTH
                          }
                          className="inline-flex items-center gap-1 rounded-md bg-cyan-400 px-2.5 py-1 text-xs font-semibold text-slate-950 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Save className="h-3 w-3" />
                          {editSaving ? 'Saving…' : 'Save'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-3">
                      <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-white/90">
                        {m.fact}
                      </p>
                      <div className="flex flex-shrink-0 items-center gap-1">
                        <span
                          className={
                            'rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ' +
                            (isAuto
                              ? 'border-purple-400/30 bg-purple-400/10 text-purple-300'
                              : 'border-cyan-400/30 bg-cyan-400/10 text-cyan-300')
                          }
                          title={isAuto ? 'Auto-extracted from chat' : 'Added manually'}
                        >
                          {m.source}
                        </span>
                        <button
                          type="button"
                          onClick={() => beginEdit(m)}
                          aria-label="Edit memory"
                          className="rounded-md p-1.5 text-white/40 transition-colors hover:bg-white/5 hover:text-white"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(m.id)}
                          aria-label="Delete memory"
                          className="rounded-md p-1.5 text-white/40 transition-colors hover:bg-rose-500/10 hover:text-rose-300"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
