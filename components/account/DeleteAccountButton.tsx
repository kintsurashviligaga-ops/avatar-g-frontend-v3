'use client';

/**
 * DeleteAccountButton
 * ===================
 * Self-contained in-app account-deletion control (Apple Guideline 5.1.1(v)).
 * Renders a danger-styled trigger; opening it shows a type-to-confirm modal so
 * an irreversible action can never be a single accidental tap. On confirm it
 * POSTs to /api/account/delete (which derives the user from the session and
 * hard-deletes via the DB cascade), signs the browser out, and returns home.
 *
 * Drop-in: <DeleteAccountButton locale={locale} />. Fully localized internally.
 * Red is used here as the reserved danger/error affordance (palette-compliant).
 */
import { useCallback, useState } from 'react';
import { Trash2, AlertTriangle, Loader2 } from 'lucide-react';
import { createBrowserClient } from '@/lib/supabase/browser';

type Dict = {
  trigger: string;
  title: string;
  body: string;
  prompt: string;
  keyword: string;
  confirm: string;
  cancel: string;
  failed: string;
};

const DICT: Record<string, Dict> = {
  ka: {
    trigger: 'ანგარიშის წაშლა',
    title: 'სამუდამოდ წავშალოთ ანგარიში?',
    body: 'ეს ქმედება შეუქცევადია. წაიშლება შენი ანგარიში და ყველა მონაცემი — ფილმები, ბალანსი და ისტორია. დასადასტურებლად აკრიფე სიტყვა ქვემოთ.',
    prompt: 'დასადასტურებლად აკრიფე',
    keyword: 'წაშლა',
    confirm: 'სამუდამოდ წაშლა',
    cancel: 'გაუქმება',
    failed: 'წაშლა ვერ მოხერხდა. სცადე ხელახლა.',
  },
  en: {
    trigger: 'Delete account',
    title: 'Permanently delete your account?',
    body: 'This cannot be undone. Your account and all data — films, balance and history — will be permanently removed. Type the word below to confirm.',
    prompt: 'Type to confirm',
    keyword: 'DELETE',
    confirm: 'Delete forever',
    cancel: 'Cancel',
    failed: 'Deletion failed. Please try again.',
  },
  ru: {
    trigger: 'Удалить аккаунт',
    title: 'Удалить аккаунт навсегда?',
    body: 'Это действие необратимо. Ваш аккаунт и все данные — фильмы, баланс и история — будут безвозвратно удалены. Введите слово ниже для подтверждения.',
    prompt: 'Введите для подтверждения',
    keyword: 'УДАЛИТЬ',
    confirm: 'Удалить навсегда',
    cancel: 'Отмена',
    failed: 'Не удалось удалить. Попробуйте ещё раз.',
  },
};

export function DeleteAccountButton({ locale }: { locale: string }) {
  const t = DICT[locale] ?? DICT['en']!;
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const armed = confirmText.trim().toUpperCase() === t.keyword.toUpperCase();

  const close = useCallback(() => {
    if (busy) return;
    setOpen(false);
    setConfirmText('');
    setError(false);
  }, [busy]);

  const handleDelete = useCallback(async () => {
    if (!armed || busy) return;
    setBusy(true);
    setError(false);
    try {
      const res = await fetch('/api/account/delete', { method: 'POST' });
      if (!res.ok) throw new Error('delete failed');
      // Auth row is gone; clear local session, then leave for a clean state.
      try {
        await createBrowserClient().auth.signOut();
      } catch {
        /* session already invalid server-side */
      }
      if (typeof window !== 'undefined') window.location.href = `/${locale}/dashboard`;
    } catch {
      setBusy(false);
      setError(true);
    }
  }, [armed, busy, locale]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2.5 rounded-xl border border-red-500/30 bg-black px-3 py-2.5 text-xs font-semibold text-red-300 transition-colors hover:border-red-500/60 hover:text-red-200"
      >
        <Trash2 className="h-4 w-4" />
        {t.trigger}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm motion-safe:animate-fade-in"
          role="dialog"
          aria-modal="true"
          aria-label={t.title}
          onClick={close}
        >
          <div
            className="w-full max-w-sm space-y-4 rounded-2xl border border-red-500/30 bg-black p-5 shadow-[0_0_40px_rgba(239,68,68,0.15)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-red-500/30 bg-red-500/10">
                <AlertTriangle className="h-5 w-5 text-red-400" aria-hidden="true" />
              </span>
              <div className="space-y-1">
                <h2 className="text-sm font-bold text-white">{t.title}</h2>
                <p className="text-xs leading-relaxed text-neutral-400">{t.body}</p>
              </div>
            </div>

            <label className="block space-y-1.5">
              <span className="text-[11px] font-semibold text-neutral-400">
                {t.prompt} <span className="font-mono text-red-300">{t.keyword}</span>
              </span>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                disabled={busy}
                autoFocus
                autoComplete="off"
                aria-label={t.prompt}
                className="w-full rounded-xl border border-white/10 bg-black px-3 py-2.5 text-sm text-white outline-none transition focus:border-red-500/50"
              />
            </label>

            {error && (
              <p className="text-xs text-red-400" role="alert">
                {t.failed}
              </p>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={close}
                disabled={busy}
                className="flex-1 rounded-xl border border-white/10 bg-black px-3 py-2.5 text-xs font-semibold text-neutral-300 transition-colors hover:text-white disabled:opacity-50"
              >
                {t.cancel}
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={!armed || busy}
                aria-disabled={!armed || busy}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-red-500/50 bg-red-500/10 px-3 py-2.5 text-xs font-bold text-red-200 transition-colors hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {t.confirm}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
