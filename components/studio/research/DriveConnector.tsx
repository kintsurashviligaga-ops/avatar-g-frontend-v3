'use client';

/**
 * DriveConnector — the Google Drive row in Connectors (Phase 4, GG 2026-11-01: only the files the user picks).
 *
 *   not linked  „დაკავშირება" → /api/connectors/google_drive/connect (Google's consent screen, scope drive.file only).
 *   linked      the picked files (GET /api/connectors/google_drive/files), „ფაილის არჩევა" opens the Google Picker
 *               (picking a file is what gives the app access to it), „გათიშვა" revokes at Google and deletes our copy.
 *
 * Drawn only when the server says the connector is `connectable` for this user (configured + CONNECTORS_DRIVE).
 */
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Cloud, FileText, Loader2, Plus, Unlink } from 'lucide-react';
import type { ConnectorFile } from '@/lib/connectors/types';
import { loadGooglePicker } from './googlePicker';

type Lang = 'ka' | 'en' | 'ru';

type Copy = { title: string; sub: string; connect: string; pick: string; disconnect: string; empty: string; linked: string; failed: string; disconnected: string; denied: string; account: string; hint: string };

const COPY: Record<Lang, Copy> = {
  ka: {
    title: 'Google Drive',
    sub: 'Agent G ხედავს მხოლოდ იმ ფაილებს, რომლებსაც შენ აირჩევ. დანარჩენი Drive მისთვის დახურულია.',
    connect: 'დაკავშირება',
    pick: 'ფაილის არჩევა',
    disconnect: 'გათიშვა',
    empty: 'ჯერ ფაილი არ აგირჩევია.',
    linked: 'დაკავშირებულია.',
    failed: 'Google Drive-მა არ უპასუხა. სცადე თავიდან.',
    disconnected: 'Google Drive გაითიშა.',
    denied: 'დაკავშირება გაუქმდა.',
    account: 'არჩეული ფაილები დაკავშირებულ Google ანგარიშში მიუწვდომელია. სცადე იმავე ანგარიშით.',
    hint: 'ჰკითხე Agent G-ს, მაგალითად: „რა წერია ჩემს Drive-ის დოკუმენტში?“',
  },
  en: {
    title: 'Google Drive',
    sub: 'Agent G sees only the files you pick. The rest of your Drive stays closed to it.',
    connect: 'Connect',
    pick: 'Pick files',
    disconnect: 'Disconnect',
    empty: 'No files picked yet.',
    linked: 'Connected.',
    failed: 'Google Drive did not answer. Try again.',
    disconnected: 'Google Drive is disconnected.',
    denied: 'The connection was cancelled.',
    account: 'The selected files are unavailable in your connected Google account. Try again with that account.',
    hint: 'Ask Agent G, for example: "What does my Drive document say?"',
  },
  ru: {
    title: 'Google Drive',
    sub: 'Agent G видит только выбранные вами файлы. Остальной Drive для него закрыт.',
    connect: 'Подключить',
    pick: 'Выбрать файлы',
    disconnect: 'Отключить',
    empty: 'Файлы ещё не выбраны.',
    linked: 'Подключено.',
    failed: 'Google Drive не ответил. Попробуйте ещё раз.',
    disconnected: 'Google Drive отключён.',
    denied: 'Подключение отменено.',
    account: 'Выбранные файлы недоступны в подключённом аккаунте Google. Попробуйте снова с этим аккаунтом.',
    hint: 'Спросите Agent G, например: «Что написано в моём документе на Drive?»',
  },
};

const SUPPORTED_MIME = [
  'application/vnd.google-apps.document',
  'application/vnd.google-apps.spreadsheet',
  'application/vnd.google-apps.presentation',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
  'text/csv',
].join(',');

/* eslint-disable @typescript-eslint/no-explicit-any */
export function DriveConnector({ lang, linked: linkedAtLoad, onChanged }: { lang: Lang; linked: boolean; onChanged: () => void }) {
  const t = COPY[lang];
  const h = `${useId()}-drive-h`;
  const [linked, setLinked] = useState(linkedAtLoad);
  const [files, setFiles] = useState<ConnectorFile[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const pickerRef = useRef<any>(null);
  useEffect(() => () => { pickerRef.current?.dispose(); }, []);

  useEffect(() => setLinked(linkedAtLoad), [linkedAtLoad]);

  // The result of Google's redirect back (drive=linked | drive=error&reason=…), shown once, then dropped from the URL.
  useEffect(() => {
    try {
      const u = new URL(window.location.href);
      const r = u.searchParams.get('drive');
      if (!r) return;
      setMessage(r === 'linked' ? t.linked : u.searchParams.get('reason') === 'denied' ? t.denied : u.searchParams.get('reason') === 'account' ? t.account : t.failed);
      u.searchParams.delete('drive');
      u.searchParams.delete('reason');
      window.history.replaceState(null, '', u.toString());
    } catch { /* SSR */ }
  }, [t]);

  const loadFiles = useCallback(async () => {
    try {
      const r = await fetch('/api/connectors/google_drive/files', { credentials: 'same-origin', cache: 'no-store' });
      if (r.status === 409) { setLinked(false); setFiles(null); return; }
      const body = (await r.json().catch(() => null)) as { files?: ConnectorFile[] } | null;
      if (r.ok && body?.files) setFiles(body.files);
      else setMessage(t.failed);
    } catch {
      setMessage(t.failed);
    }
  }, [t]);

  useEffect(() => { if (linked) void loadFiles(); }, [linked, loadFiles]);

  const connect = () => {
    window.location.assign(`/api/connectors/google_drive/connect?locale=${lang}`);
  };

  const pick = async () => {
    setMessage(null);
    // The embedded web Picker has a documented 566×350 minimum. On narrower
    // screens use Google's redirect-based Picker rather than clipping it.
    if (window.innerWidth < 590 || window.innerHeight < 382) {
      window.location.assign(`/api/connectors/google_drive/connect?locale=${lang}&picker=1`);
      return;
    }
    setBusy(true);
    try {
      const r = await fetch('/api/connectors/google_drive/picker', { credentials: 'same-origin', cache: 'no-store' });
      if (r.status === 409) { setLinked(false); return; }
      const cfg = (await r.json().catch(() => null)) as { accessToken?: string; apiKey?: string; appId?: string } | null;
      if (!r.ok || !cfg?.accessToken || !cfg.apiKey || !cfg.appId) { setMessage(t.failed); return; }
      await loadGooglePicker();
      const g = window.google.picker;
      pickerRef.current?.dispose();
      // drive.file does not grant thumbnail access for files the user has not picked yet.
      const view = new g.DocsView(g.ViewId.DOCS).setMode(g.DocsViewMode.LIST).setMimeTypes(SUPPORTED_MIME).setIncludeFolders(false).setSelectFolderEnabled(false);
      const picker = new g.PickerBuilder()
        .addView(view)
        .enableFeature(g.Feature.MULTISELECT_ENABLED)
        .setOAuthToken(cfg.accessToken)
        .setDeveloperKey(cfg.apiKey)
        .setAppId(cfg.appId)
        .setOrigin(window.location.origin)
        .setSize(Math.min(1051, window.innerWidth - 24), Math.min(650, window.innerHeight - 32))
        .setLocale(lang)
        .setCallback((data: any) => {
          if (data?.action === g.Action.PICKED || data?.action === g.Action.CANCEL) {
            pickerRef.current?.dispose();
            pickerRef.current = null;
          }
          if (data?.action === g.Action.PICKED) void loadFiles();
        })
        .build();
      pickerRef.current = picker;
      picker.setVisible(true);
    } catch {
      setMessage(t.failed);
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setMessage(null);
    setBusy(true);
    try {
      const r = await fetch('/api/connectors/google_drive/disconnect', { method: 'POST', credentials: 'same-origin' });
      if (r.ok) { setLinked(false); setFiles(null); setMessage(t.disconnected); onChanged(); }
      else setMessage(t.failed);
    } catch {
      setMessage(t.failed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby={h} data-testid="connector-drive" className="rounded-2xl bg-app-elevated/50 p-3">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-app-accent/15 text-app-accent" aria-hidden="true"><Cloud size={17} /></span>
        <div className="min-w-0 flex-1">
          <h3 id={h} className="text-[14.5px] font-semibold text-app-text">{t.title}</h3>
          <p className="mt-0.5 text-[12.5px] leading-snug text-app-muted">{t.sub}</p>
        </div>
      </div>

      {!linked ? (
        <button type="button" onClick={connect} data-testid="drive-connect"
          className="mt-3 inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-app-accent text-[14px] font-semibold text-app-bg hover:opacity-90">
          {t.connect}
        </button>
      ) : (
        <div className="mt-3">
          {files && files.length > 0 ? (
            <ul className="space-y-1" aria-label={t.title} data-testid="drive-files">
              {files.map((f) => (
                <li key={f.id} className="flex min-h-[44px] items-center gap-3 rounded-xl bg-app-bg/40 px-3">
                  <FileText size={16} className="shrink-0 text-app-muted" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate text-[13.5px] text-app-text">{f.name}</span>
                </li>
              ))}
            </ul>
          ) : files ? <p className="text-[12.5px] text-app-muted">{t.empty}</p> : <Loader2 size={16} className="text-app-muted motion-safe:animate-spin" aria-hidden="true" />}
          <div className="mt-2 flex gap-2">
            <button type="button" disabled={busy} onClick={() => void pick()} data-testid="drive-pick"
              className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-2xl border border-dashed border-app-border/30 text-[14px] font-medium text-app-text hover:bg-app-elevated disabled:opacity-50">
              {busy ? <Loader2 size={16} className="motion-safe:animate-spin" aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}
              {t.pick}
            </button>
            <button type="button" disabled={busy} onClick={() => void disconnect()} data-testid="drive-disconnect"
              className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl px-4 text-[13.5px] text-app-muted hover:bg-app-elevated hover:text-app-text disabled:opacity-50">
              <Unlink size={15} aria-hidden="true" />
              {t.disconnect}
            </button>
          </div>
          {files && files.length > 0 && <p className="mt-2 text-[12px] leading-snug text-app-muted">{t.hint}</p>}
        </div>
      )}

      {message && <p role="status" className="mt-2 text-[12.5px] leading-snug text-app-text">{message}</p>}
    </section>
  );
}
