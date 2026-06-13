'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AlertTriangle, ArrowLeft, Loader2, Trash2, Check } from 'lucide-react';

export const dynamic = 'force-dynamic';

type Lang = 'ka' | 'en' | 'ru';

const COPY: Record<Lang, {
  back: string;
  title: string;
  lead: string;
  whatTitle: string;
  what: string[];
  irreversible: string;
  confirmLabel: string;
  confirmWord: string;
  placeholder: string;
  cancel: string;
  delete: string;
  deleting: string;
  failed: string;
}> = {
  ka: {
    back: 'უკან',
    title: 'ანგარიშის წაშლა',
    lead: 'ეს სამუდამოდ წაშლის შენს MyAvatar ანგარიშს და ყველა დაკავშირებულ მონაცემს. მოქმედება შეუქცევადია.',
    whatTitle: 'რა წაიშლება:',
    what: [
      'პროფილი და ავტორიზაციის მონაცემები',
      'ჩატის ისტორია, ავატარები და მეხსიერება',
      'შექმნილი სურათები, მუსიკა და ვიდეოები',
      'კრედიტები, ბალანსი და ტრანზაქციების ისტორია',
    ],
    irreversible: 'წაშლის შემდეგ მონაცემების აღდგენა შეუძლებელია.',
    confirmLabel: 'დასადასტურებლად ჩაწერე',
    confirmWord: 'DELETE',
    placeholder: 'ჩაწერე DELETE',
    cancel: 'გაუქმება',
    delete: 'სამუდამოდ წაშლა',
    deleting: 'იშლება…',
    failed: 'წაშლა ვერ მოხერხდა. სცადე თავიდან ან დაგვიკავშირდი.',
  },
  en: {
    back: 'Back',
    title: 'Delete account',
    lead: 'This permanently deletes your MyAvatar account and all associated data. This action cannot be undone.',
    whatTitle: 'What gets deleted:',
    what: [
      'Your profile and sign-in identity',
      'Chat history, avatars and memory',
      'Generated images, music and videos',
      'Credits, balance and transaction history',
    ],
    irreversible: 'Once deleted, your data cannot be recovered.',
    confirmLabel: 'Type to confirm',
    confirmWord: 'DELETE',
    placeholder: 'Type DELETE',
    cancel: 'Cancel',
    delete: 'Delete permanently',
    deleting: 'Deleting…',
    failed: 'Deletion failed. Please try again or contact us.',
  },
  ru: {
    back: 'Назад',
    title: 'Удалить аккаунт',
    lead: 'Это навсегда удалит ваш аккаунт MyAvatar и все связанные данные. Действие необратимо.',
    whatTitle: 'Что будет удалено:',
    what: [
      'Профиль и данные для входа',
      'История чатов, аватары и память',
      'Созданные изображения, музыка и видео',
      'Кредиты, баланс и история транзакций',
    ],
    irreversible: 'После удаления данные восстановить нельзя.',
    confirmLabel: 'Введите для подтверждения',
    confirmWord: 'DELETE',
    placeholder: 'Введите DELETE',
    cancel: 'Отмена',
    delete: 'Удалить навсегда',
    deleting: 'Удаление…',
    failed: 'Не удалось удалить. Попробуйте снова или свяжитесь с нами.',
  },
};

export default function DeleteAccountPage() {
  // Derive the locale from the path (/{locale}/account/delete) — version-agnostic,
  // avoids the params-as-promise ambiguity in a client component.
  const pathname = usePathname();
  const seg = (pathname || '').split('/')[1];
  const lang: Lang = seg === 'en' ? 'en' : seg === 'ru' ? 'ru' : 'ka';
  const t = COPY[lang];

  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const armed = confirmText.trim().toUpperCase() === 'DELETE';

  const onDelete = async () => {
    if (!armed || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/account/delete', { method: 'POST', credentials: 'include' });
      const j = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (res.ok && j.success) {
        // The account (and session) are gone — bounce to the sign-in screen.
        window.location.href = `/${lang}/login`;
        return;
      }
      setError(j.error || t.failed);
    } catch {
      setError(t.failed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-lg flex-col px-4 py-8 text-app-text">
      <Link
        href={`/${lang}/dashboard`}
        className="inline-flex w-fit items-center gap-1.5 text-[13px] font-medium text-app-muted transition-colors hover:text-app-text"
      >
        <ArrowLeft size={15} /> {t.back}
      </Link>

      <div className="mt-6 space-y-5">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-app-danger/10 text-app-danger">
            <AlertTriangle size={22} />
          </span>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{t.title}</h1>
            <p className="mt-1 text-[13.5px] leading-relaxed text-app-muted">{t.lead}</p>
          </div>
        </div>

        <div className="rounded-2xl bg-app-elevated/60 p-4">
          <p className="text-[13px] font-semibold">{t.whatTitle}</p>
          <ul className="mt-2 space-y-1.5">
            {t.what.map((w, i) => (
              <li key={i} className="flex items-start gap-2 text-[12.5px] text-app-muted">
                <Check size={14} className="mt-0.5 shrink-0 text-app-muted/60" />
                <span>{w}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[12.5px] font-medium text-app-danger">{t.irreversible}</p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="confirm" className="text-[12.5px] font-medium text-app-muted">
            {t.confirmLabel} <span className="font-semibold text-app-text">{t.confirmWord}</span>
          </label>
          <input
            id="confirm"
            type="text"
            inputMode="text"
            autoComplete="off"
            autoCapitalize="characters"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={t.placeholder}
            className="w-full rounded-xl border border-app-border/15 bg-app-surface px-3.5 py-2.5 text-[15px] text-app-text outline-none transition-colors placeholder:text-app-muted/60 focus:border-app-danger/50"
          />
        </div>

        {error && (
          <p className="rounded-xl bg-app-danger/10 px-3.5 py-2.5 text-[12.5px] text-app-danger">{error}</p>
        )}

        <div className="flex items-center gap-2 pt-1">
          <Link
            href={`/${lang}/dashboard`}
            className="inline-flex flex-1 items-center justify-center rounded-full bg-app-elevated px-4 py-2.5 text-[13.5px] font-medium text-app-text transition-colors hover:bg-app-border/10"
          >
            {t.cancel}
          </Link>
          <button
            type="button"
            onClick={() => void onDelete()}
            disabled={!armed || busy}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-app-danger px-4 py-2.5 text-[13.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
            {busy ? t.deleting : t.delete}
          </button>
        </div>
      </div>
    </div>
  );
}
