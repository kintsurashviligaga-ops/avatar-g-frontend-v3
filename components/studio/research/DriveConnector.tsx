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

type Copy = {
  title: string; sub: string; connect: string; connecting: string; pick: string; disconnect: string; empty: string; linked: string; failed: string;
  disconnected: string; denied: string; hint: string;
  /** The grant stopped working while the row showed it as linked (removed at Google, or the token was revoked). */
  expired: string;
  /** Google's consent screen let the user untick the Drive box: linked without the one permission we need. */
  scopeMissing: string;
  /** The 10-minute link expired, or the return did not match the start (two tabs). */
  stateExpired: string;
  /** Google gave no refresh token (an old grant): it has to be removed once in the Google account. */
  noRefresh: string;
  notSignedIn: string;
  /** The Google Picker window did not open (script blocked, timeout, Safari's cross-site tracking block). */
  pickerFailed: string;
  /** Google's Picker opened but reported an error itself. */
  pickerError: string;
  retry: string;
};

const COPY: Record<Lang, Copy> = {
  ka: {
    title: 'Google Drive',
    sub: 'Agent G ხედავს მხოლოდ იმ ფაილებს, რომლებსაც შენ აირჩევ. დანარჩენი Drive მისთვის დახურულია.',
    connect: 'დაკავშირება',
    connecting: 'Google იხსნება…',
    pick: 'ფაილის არჩევა',
    disconnect: 'გათიშვა',
    empty: 'ჯერ ფაილი არ აგირჩევია.',
    linked: 'დაკავშირებულია.',
    failed: 'Google Drive-მა არ უპასუხა. სცადე თავიდან.',
    disconnected: 'Google Drive გაითიშა.',
    denied: 'დაკავშირება გაუქმდა.',
    hint: 'ჰკითხე Agent G-ს, მაგალითად: „რა წერია ჩემს Drive-ის დოკუმენტში?“',
    expired: 'Google Drive-თან კავშირი გაწყდა. დააკავშირე თავიდან.',
    scopeMissing: 'Google-ის ფანჯარაში Drive-ის ნებართვა არ მონიშნულა. დააკავშირე თავიდან და მონიშნე Google Drive-ის ველი.',
    stateExpired: 'ბმულს ვადა გაუვიდა. დააჭირე „დაკავშირებას“ თავიდან.',
    noRefresh: 'Google-მა წვდომა ბოლომდე არ მოგვცა. Google ანგარიშში წაშალე MyAvatar-ის წვდომა და დააკავშირე თავიდან.',
    notSignedIn: 'Google Drive-ის დასაკავშირებლად ჯერ შედი ანგარიშში.',
    pickerFailed: 'ფაილების ფანჯარა ვერ გაიხსნა. Safari-ში გამორთე „Prevent Cross-Site Tracking“ ან გამოიყენე Chrome და სცადე თავიდან.',
    pickerError: 'Google-ის ფაილების ფანჯარამ შეცდომა დააბრუნა. სცადე თავიდან.',
    retry: 'თავიდან ცდა',
  },
  en: {
    title: 'Google Drive',
    sub: 'Agent G sees only the files you pick. The rest of your Drive stays closed to it.',
    connect: 'Connect',
    connecting: 'Opening Google…',
    pick: 'Pick files',
    disconnect: 'Disconnect',
    empty: 'No files picked yet.',
    linked: 'Connected.',
    failed: 'Google Drive did not answer. Try again.',
    disconnected: 'Google Drive is disconnected.',
    denied: 'The connection was cancelled.',
    hint: 'Ask Agent G, for example: "What does my Drive document say?"',
    expired: 'The Google Drive connection stopped working. Connect it again.',
    scopeMissing: 'The Drive permission was not ticked in Google\'s window. Connect again and tick the Google Drive box.',
    stateExpired: 'The link expired. Press Connect again.',
    noRefresh: 'Google did not give full access. Remove MyAvatar in your Google Account, then connect again.',
    notSignedIn: 'Sign in first to connect Google Drive.',
    pickerFailed: 'The file window did not open. In Safari turn off "Prevent Cross-Site Tracking", or use Chrome, then try again.',
    pickerError: 'Google\'s file window reported an error. Try again.',
    retry: 'Try again',
  },
  ru: {
    title: 'Google Drive',
    sub: 'Agent G видит только выбранные вами файлы. Остальной Drive для него закрыт.',
    connect: 'Подключить',
    connecting: 'Открываем Google…',
    pick: 'Выбрать файлы',
    disconnect: 'Отключить',
    empty: 'Файлы ещё не выбраны.',
    linked: 'Подключено.',
    failed: 'Google Drive не ответил. Попробуйте ещё раз.',
    disconnected: 'Google Drive отключён.',
    denied: 'Подключение отменено.',
    hint: 'Спросите Agent G, например: «Что написано в моём документе на Drive?»',
    expired: 'Связь с Google Drive прервалась. Подключите его снова.',
    scopeMissing: 'В окне Google не отмечено разрешение для Drive. Подключите снова и отметьте пункт Google Drive.',
    stateExpired: 'Срок ссылки истёк. Нажмите «Подключить» ещё раз.',
    noRefresh: 'Google не дал полный доступ. Удалите доступ MyAvatar в аккаунте Google и подключите снова.',
    notSignedIn: 'Чтобы подключить Google Drive, сначала войдите.',
    pickerFailed: 'Окно выбора файлов не открылось. В Safari отключите «Предотвращать трекинг между сайтами» или откройте Chrome и попробуйте снова.',
    pickerError: 'Окно выбора файлов Google вернуло ошибку. Попробуйте ещё раз.',
    retry: 'Повторить',
  },
};

/** The message for Google's redirect back (?drive=linked | ?drive=error&reason=…), one per reason the routes send. */
export function driveReturnMessage(result: string, reason: string | null, lang: Lang): string {
  const t = COPY[lang];
  if (result === 'linked') return t.linked;
  switch (reason) {
    case 'denied': return t.denied;
    case 'scope_missing': return t.scopeMissing;
    case 'state': return t.stateExpired;
    case 'no_refresh_token': return t.noRefresh;
    case 'not_signed_in': return t.notSignedIn;
    default: return t.failed;
  }
}

/**
 * What a failed „Pick files" says. A Picker that never loaded (blocked script, timeout, Safari's cross-site tracking
 * block — gapi_load / picker_load / picker_timeout / picker_missing from loadGooglePicker) gets the browser advice; the
 * picker config call failing is Drive not answering. Both offer „Try again" (the loader resets itself after a failure).
 */
export function pickFailureMessage(error: unknown, lang: Lang): string {
  const t = COPY[lang];
  const code = error instanceof Error ? error.message : '';
  return /^(gapi_load|picker_load|picker_timeout|picker_missing)$/.test(code) ? t.pickerFailed : t.failed;
}

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
  const [connecting, setConnecting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  /** The last „Pick files" failed: the message gets a „Try again" button next to it. */
  const [pickFailed, setPickFailed] = useState(false);
  const pickerRef = useRef<any>(null);
  useEffect(() => () => { pickerRef.current?.dispose(); }, []);

  useEffect(() => setLinked(linkedAtLoad), [linkedAtLoad]);

  // The result of Google's redirect back (drive=linked | drive=error&reason=…), shown once, then dropped from the URL.
  useEffect(() => {
    try {
      const u = new URL(window.location.href);
      const r = u.searchParams.get('drive');
      if (!r) return;
      setMessage(driveReturnMessage(r, u.searchParams.get('reason'), lang));
      u.searchParams.delete('drive');
      u.searchParams.delete('reason');
      window.history.replaceState(null, '', u.toString());
    } catch { /* SSR */ }
  }, [lang]);

  // A 409 while the row shows Drive as linked = the grant died mid-session (removed at Google, revoked): say so and
  // offer Connect, instead of silently swapping the row back to its first-time state.
  const lostLink = useCallback(() => {
    setLinked(false);
    setFiles(null);
    setMessage(t.expired);
    onChanged();
  }, [t, onChanged]);

  const loadFiles = useCallback(async () => {
    try {
      const r = await fetch('/api/connectors/google_drive/files', { credentials: 'same-origin', cache: 'no-store' });
      if (r.status === 409) { lostLink(); return; }
      const body = (await r.json().catch(() => null)) as { files?: ConnectorFile[] } | null;
      if (r.ok && body?.files) setFiles(body.files);
      else setMessage(t.failed);
    } catch {
      setMessage(t.failed);
    }
  }, [t, lostLink]);

  useEffect(() => { if (linked) void loadFiles(); }, [linked, loadFiles]);

  // The page leaves for Google's consent screen: a spinner and a disabled button meanwhile, so a second tap on a slow
  // phone does not start a second flow (whose state cookie would overwrite the first). Back-forward cache restores it.
  const connect = () => {
    if (connecting) return;
    setMessage(null);
    setConnecting(true);
    window.location.assign(`/api/connectors/google_drive/connect?locale=${lang}`);
  };
  useEffect(() => {
    const onShow = () => setConnecting(false);
    window.addEventListener('pageshow', onShow);
    return () => window.removeEventListener('pageshow', onShow);
  }, []);

  const pick = async () => {
    setMessage(null);
    setPickFailed(false);
    setBusy(true);
    try {
      const r = await fetch('/api/connectors/google_drive/picker', { credentials: 'same-origin', cache: 'no-store' });
      if (r.status === 409) { lostLink(); return; }
      const cfg = (await r.json().catch(() => null)) as { accessToken?: string; apiKey?: string; appId?: string } | null;
      if (!r.ok || !cfg?.accessToken || !cfg.apiKey || !cfg.appId) { setMessage(t.failed); setPickFailed(true); return; }
      await loadGooglePicker();
      const g = window.google.picker;
      pickerRef.current?.dispose();
      const view = new g.DocsView(g.ViewId.DOCS).setMimeTypes(SUPPORTED_MIME).setIncludeFolders(false).setSelectFolderEnabled(false);
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
          // The Picker reports its own failures as action 'error' (no Action constant for it in every build).
          if (data?.action === 'error' || (g.Action.ERROR && data?.action === g.Action.ERROR)) {
            pickerRef.current?.dispose();
            pickerRef.current = null;
            setMessage(t.pickerError);
            setPickFailed(true);
          }
        })
        .build();
      pickerRef.current = picker;
      picker.setVisible(true);
    } catch (e) {
      setMessage(pickFailureMessage(e, lang));
      setPickFailed(true);
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
        <button type="button" onClick={connect} disabled={connecting} aria-busy={connecting} data-testid="drive-connect"
          className="mt-3 inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-app-accent text-[14px] font-semibold text-app-bg hover:opacity-90 disabled:opacity-70">
          {connecting && <Loader2 size={16} className="motion-safe:animate-spin" aria-hidden="true" />}
          {connecting ? t.connecting : t.connect}
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
      {pickFailed && linked && (
        <button type="button" disabled={busy} onClick={() => void pick()} data-testid="drive-pick-retry"
          className="mt-2 inline-flex min-h-[44px] items-center justify-center rounded-2xl bg-app-elevated px-4 text-[13.5px] font-medium text-app-text hover:opacity-90 disabled:opacity-50">
          {t.retry}
        </button>
      )}
    </section>
  );
}
