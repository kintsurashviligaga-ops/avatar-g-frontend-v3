'use client';

import { useCallback, useEffect, useState } from 'react';
import { describeServiceError } from '@/components/studio/ui/serviceError';
import { Brain, Pencil, Plus, Save, Trash2, X } from 'lucide-react';

interface MemoryRow {
  id: string;
  user_id: string;
  fact: string;
  source: 'auto' | 'manual';
  created_at: string;
  updated_at: string;
}

/** A fact picked out of the user's own chat turns (lib/chat/userMemory), shown so it can be seen and deleted. */
interface ProfileFact {
  key: string;
  value: string;
  updatedAt: string | null;
}

interface MemoryApiList {
  memories?: MemoryRow[];
  profile?: ProfileFact[];
  autoMemory?: boolean;
  error?: string;
}

type Lang = 'ka' | 'en' | 'ru';
const langOf = (locale: string | undefined): Lang => (locale === 'en' || locale === 'ru' ? locale : 'ka');

/** The words this panel adds for "what Agent G keeps about you" (PART 2, G4). */
const T: Record<string, Record<Lang, string>> = {
  picked: { en: 'Picked up from your chats', ka: 'შენი საუბრებიდან დამახსოვრებული', ru: 'Запомнено из ваших чатов' },
  pickedNone: { en: 'Nothing picked up from your chats.', ka: 'საუბრებიდან არაფერია დამახსოვრებული.', ru: 'Из чатов ничего не запомнено.' },
  auto: {
    en: 'Remember what I say about myself in chat (name, age, height, weight)',
    ka: 'დაიმახსოვრე, რასაც ჩატში ჩემზე ვამბობ (სახელი, ასაკი, სიმაღლე, წონა)',
    ru: 'Запоминать, что я говорю о себе в чате (имя, возраст, рост, вес)',
  },
  deleteAll: { en: 'Delete all memory', ka: 'მთელი მეხსიერების წაშლა', ru: 'Удалить всю память' },
  confirm: {
    en: 'Delete everything Agent G remembers about you? This cannot be undone.',
    ka: 'წავშალო ყველაფერი, რაც Agent G-ს შენზე ახსოვს? ამას ვეღარ დავაბრუნებთ.',
    ru: 'Удалить всё, что Agent G помнит о вас? Это нельзя отменить.',
  },
  confirmYes: { en: 'Delete all', ka: 'ყველაფრის წაშლა', ru: 'Удалить всё' },
  cancel: { en: 'Cancel', ka: 'გაუქმება', ru: 'Отмена' },
  remove: { en: 'Delete', ka: 'წაშლა', ru: 'Удалить' },
  deleted: { en: 'Everything was deleted.', ka: 'ყველაფერი წაიშალა.', ru: 'Всё удалено.' },
  failed: { en: 'That did not work. Try again.', ka: 'ვერ მოხერხდა. სცადე თავიდან.', ru: 'Не получилось. Попробуйте ещё раз.' },
  // Phase 7.6 (2026-11-13): the rest of the page was English only, and a failure printed the server's own text.
  minChars: { en: 'At least {n} characters', ka: 'მინიმუმ {n} სიმბოლო', ru: 'Минимум {n} символов' },
  chars: { en: '{n} characters', ka: '{n} სიმბოლო', ru: 'Символов: {n}' },
  title: { en: 'Memory', ka: 'მეხსიერება', ru: 'Память' },
  subtitle: { en: 'What Agent G remembers about you.', ka: 'რა ახსოვს Agent G-ს შენზე.', ru: 'Что Agent G помнит о вас.' },
  placeholder: {
    en: 'Add a memory… e.g. I prefer Georgian replies, I run a coffee shop in Tbilisi.',
    ka: 'დაამატე რამე დასამახსოვრებლად… მაგ.: ქართულად მიპასუხე, თბილისში ყავის მაღაზია მაქვს.',
    ru: 'Добавьте факт… например: отвечай по-грузински, у меня кофейня в Тбилиси.',
  },
  saving: { en: 'Saving…', ka: 'ინახება…', ru: 'Сохранение…' },
  saveMemory: { en: 'Save memory', ka: 'დამახსოვრება', ru: 'Запомнить' },
  save: { en: 'Save', ka: 'შენახვა', ru: 'Сохранить' },
  empty: {
    en: '{T.empty![lang]}',
    ka: 'ჯერ არაფერია დამახსოვრებული. დაამატე ზემოთ და Agent G დაიმახსოვრებს.',
    ru: 'Пока ничего нет. Добавьте факт выше, и Agent G его запомнит.',
  },
  autoTag: { en: 'Auto-extracted from chat', ka: 'ჩატიდან ავტომატურად', ru: 'Взято из чата автоматически' },
  manualTag: { en: 'Added manually', ka: 'ხელით დამატებული', ru: 'Добавлено вручную' },
  edit: { en: 'Edit memory', ka: 'რედაქტირება', ru: 'Изменить' },
  deleteOne: { en: 'Delete memory', ka: 'წაშლა', ru: 'Удалить' },
  loadFailed: { en: 'We could not load your memory. Reload the page.', ka: 'მეხსიერება ვერ ჩაიტვირთა. გადატვირთე გვერდი.', ru: 'Не удалось загрузить память. Обновите страницу.' },
  saveFailed: { en: 'We could not save this. Try again.', ka: 'ვერ შევინახეთ. სცადე თავიდან.', ru: 'Не удалось сохранить. Попробуйте ещё раз.' },
  updateFailed: { en: 'We could not update this. Try again.', ka: 'ვერ განვაახლეთ. სცადე თავიდან.', ru: 'Не удалось изменить. Попробуйте ещё раз.' },
  deleteFailed: { en: 'We could not delete this. Try again.', ka: 'ვერ წავშალეთ. სცადე თავიდან.', ru: 'Не удалось удалить. Попробуйте ещё раз.' },
  network: { en: 'No connection. Check your internet and try again.', ka: 'კავშირი არ არის. შეამოწმე ინტერნეტი და სცადე თავიდან.', ru: 'Нет связи. Проверьте интернет и попробуйте снова.' },
};
const KEY_LABEL: Record<string, Record<Lang, string>> = {
  name: { en: 'Name', ka: 'სახელი', ru: 'Имя' },
  age: { en: 'Age', ka: 'ასაკი', ru: 'Возраст' },
  weight: { en: 'Weight', ka: 'წონა', ru: 'Вес' },
  height: { en: 'Height', ka: 'სიმაღლე', ru: 'Рост' },
  preferred_bot_name: { en: 'What you call Agent G', ka: 'როგორ ეძახი Agent G-ს', ru: 'Как вы зовёте Agent G' },
};

interface MemoryApiOne {
  memory?: MemoryRow;
  error?: string;
}

const MIN_FACT_LENGTH = 3;

// ─── Component ────────────────────────────────────────────────────────
export default function MemoryPanel({ locale }: { locale?: string } = {}) {
  const lang = langOf(locale);
  const [memories, setMemories] = useState<MemoryRow[]>([]);
  const [profile, setProfile] = useState<ProfileFact[]>([]);
  const [autoMemory, setAutoMemory] = useState(true);
  const [confirmAll, setConfirmAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
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
        setError(describeServiceError(json.error, lang, T.loadFailed![lang]));
        return;
      }
      setMemories(json.memories ?? []);
      setProfile(json.profile ?? []);
      setAutoMemory(json.autoMemory !== false);
    } catch {
      setError(T.network![lang]);
    } finally {
      setLoading(false);
    }
  }, [lang]);

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
        setError(describeServiceError(json.error, lang, T.saveFailed![lang]));
        return;
      }
      setMemories((prev) => [json.memory as MemoryRow, ...prev]);
      setDraft('');
    } catch {
      setError(T.network![lang]);
    } finally {
      setSaving(false);
    }
  }, [draft, saving, lang]);

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
        setError(describeServiceError(json.error, lang, T.updateFailed![lang]));
        return;
      }
      const updated = json.memory as MemoryRow;
      setMemories((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
      cancelEdit();
    } catch {
      setError(T.network![lang]);
    } finally {
      setEditSaving(false);
    }
  }, [editingId, editDraft, editSaving, lang]);

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
        setError(describeServiceError(json.error, lang, T.deleteFailed![lang]));
        setMemories(snapshot);
      }
    } catch {
      setError(T.network![lang]);
      setMemories(snapshot);
    }
  }, [memories, lang]);

  // ─── What was picked out of the chats, the switch, and "delete all" ──
  const handleDeleteFact = useCallback(async (key: string) => {
    setError(null);
    const snapshot = profile;
    setProfile((prev) => prev.filter((p) => p.key !== key));
    try {
      const res = await fetch(`/api/memory?key=${encodeURIComponent(key)}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) { setError(T.failed![lang]); setProfile(snapshot); }
    } catch {
      setError(T.failed![lang]);
      setProfile(snapshot);
    }
  }, [profile, lang]);

  const handleAuto = useCallback(async () => {
    const next = !autoMemory;
    setAutoMemory(next);
    setError(null);
    try {
      const res = await fetch('/api/memory', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoMemory: next }),
      });
      if (!res.ok) { setAutoMemory(!next); setError(T.failed![lang]); }
    } catch {
      setAutoMemory(!next);
      setError(T.failed![lang]);
    }
  }, [autoMemory, lang]);

  const handleDeleteAll = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/memory?all=1', { method: 'DELETE', credentials: 'include' });
      if (!res.ok) {
        await load(); // show what is left (the reload clears the error line, so it is set after)
        setError(T.failed![lang]);
        return;
      }
      setMemories([]);
      setProfile([]);
      setNotice(T.deleted![lang]);
    } catch {
      setError(T.failed![lang]);
    } finally {
      setBusy(false);
      setConfirmAll(false);
    }
  }, [busy, lang, load]);

  // ─── Render ─────────────────────────────────────────────────────────
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:py-10">
      <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-slate-900/80 to-slate-950/90 p-5 shadow-2xl backdrop-blur sm:p-7">
        {/* Header */}
        <div className="mb-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-xl"
              style={{ background: 'linear-gradient(140deg,#22d3ee,#38bdf8)' }}
            >
              <Brain className="h-4 w-4 text-slate-950" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white sm:text-xl">
                {T.title![lang]}
              </h1>
              <p className="text-xs text-white/50">
                {T.subtitle![lang]}
              </p>
            </div>
          </div>
          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-semibold tabular-nums text-white/80">
            {memories.length + profile.length}
          </span>
        </div>

        {/* The switch for picking facts out of the chats */}
        <button
          type="button"
          role="switch"
          aria-checked={autoMemory}
          onClick={handleAuto}
          data-testid="memory-auto"
          className="mb-4 flex w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-left text-xs text-white/80 hover:bg-white/[0.05]"
        >
          <span className="min-w-0 flex-1">{T.auto![lang]}</span>
          <span className={'relative h-5 w-9 flex-shrink-0 rounded-full transition-colors ' + (autoMemory ? 'bg-cyan-400' : 'bg-white/15')}>
            <span className={'absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ' + (autoMemory ? 'left-[18px]' : 'left-0.5')} />
          </span>
        </button>

        {/* Add */}
        <div className="mb-6 rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={T.placeholder![lang]}
            rows={3}
            className="w-full resize-none rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white placeholder-white/30 outline-none transition-colors focus:border-cyan-400/50"
          />
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[11px] text-white/40">
              {draft.trim().length < MIN_FACT_LENGTH
                ? T.minChars![lang].replace('{n}', String(MIN_FACT_LENGTH))
                : T.chars![lang].replace('{n}', String(draft.trim().length))}
            </span>
            <button
              type="button"
              onClick={handleAdd}
              disabled={saving || draft.trim().length < MIN_FACT_LENGTH}
              className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-400 px-3 py-1.5 text-xs font-semibold text-slate-950 transition-colors hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" />
              {saving ? T.saving![lang] : T.saveMemory![lang]}
            </button>
          </div>
        </div>

        {notice && !error && (
          <div className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200" role="status">
            {notice}
          </div>
        )}

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
                          {T.cancel![lang]}
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
                          {editSaving ? T.saving![lang] : T.save![lang]}
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
                          title={isAuto ? T.autoTag![lang] : T.manualTag![lang]}
                        >
                          {m.source}
                        </span>
                        <button
                          type="button"
                          onClick={() => beginEdit(m)}
                          aria-label={T.edit![lang]}
                          className="rounded-md p-1.5 text-white/40 transition-colors hover:bg-white/5 hover:text-white"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(m.id)}
                          aria-label={T.deleteOne![lang]}
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

        {/* Picked up from the chats */}
        <div className="mt-6">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/50">{T.picked![lang]}</h2>
          {profile.length === 0 ? (
            <p className="text-xs text-white/40">{T.pickedNone![lang]}</p>
          ) : (
            <ul className="space-y-1.5" data-testid="memory-profile">
              {profile.map((p) => (
                <li key={p.key} className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
                  <span className="min-w-0 flex-1 break-words text-sm text-white/90">
                    <span className="text-white/50">{KEY_LABEL[p.key]?.[lang] ?? p.key}: </span>{p.value}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDeleteFact(p.key)}
                    aria-label={`${T.remove![lang]}: ${KEY_LABEL[p.key]?.[lang] ?? p.key}`}
                    className="rounded-md p-1.5 text-white/40 transition-colors hover:bg-rose-500/10 hover:text-rose-300"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Delete everything */}
        <div className="mt-6 border-t border-white/10 pt-4">
          {confirmAll ? (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3" role="alertdialog" aria-label={T.deleteAll![lang]}>
              <p className="mb-3 text-xs text-rose-100">{T.confirm![lang]}</p>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmAll(false)}
                  className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-white/80 hover:bg-white/[0.06]"
                >
                  {T.cancel![lang]}
                </button>
                <button
                  type="button"
                  onClick={handleDeleteAll}
                  disabled={busy}
                  data-testid="memory-delete-all-confirm"
                  className="rounded-md bg-rose-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-400 disabled:opacity-50"
                >
                  {T.confirmYes![lang]}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => { setNotice(null); setConfirmAll(true); }}
              disabled={memories.length + profile.length === 0}
              data-testid="memory-delete-all"
              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/30 px-3 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {T.deleteAll![lang]}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
