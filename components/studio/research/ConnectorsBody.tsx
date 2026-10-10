'use client';

/**
 * ConnectorsBody — where the user's OWN documents come from, and an honest account of what works. Drawn by the research
 * ConnectorsSheet (opened from Deep Research). The Connectors · Plugins · Skills hub that also drew it was retired 2026-10-09.
 *
 *   Local files   WORKS: pick a PDF / DOCX / TXT / MD → the text is extracted (txt/md in the browser, PDF and DOCX by
 *                 /api/utils/extract-text) → /api/connectors/files stores the TEXT only → a research run can attach it.
 *   Google Drive · OneDrive · Notion · Dropbox   NOT drawn. The server still lists them as „soon" (lib/connectors/registry.ts)
 *                 but there is no OAuth flow and no token store, so they cannot connect. The „Soon" rows were removed
 *                 2026-10-10 (Omnichannel A2: a cloud integration without real access is not shown). They come back
 *                 only with a working connect flow.
 */
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { FileText, HardDrive, Loader2, Plus, Trash2 } from 'lucide-react';
import type { ConnectorFile, ConnectorState } from '@/lib/connectors/types';
import { RESEARCH_FILES_MAX } from '@/lib/research/context';
import { addFile, extractFileText, fetchConnectors, fetchFiles, removeFile, TEXT_FILE_RE, type ConnectorLimits } from './api';
import { researchCopy, researchLang } from './copy';

/** The route's JSON body must stay under Vercel's ~4.5 MB: a binary document is sent as base64 (×1.37). */
const MAX_BINARY_BYTES = 3 * 1024 * 1024;

export function ConnectorsBody({ locale, authed }: { locale: string; authed: boolean }) {
  const c = researchCopy(locale);
  // Heading ids are per instance, so two copies in one page never share an id.
  const uid = useId();
  const localH = `${uid}-local-h`;
  const lang = researchLang(locale);
  const [states, setStates] = useState<ConnectorState[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [files, setFiles] = useState<ConnectorFile[] | null>(null);
  const [limits, setLimits] = useState<ConnectorLimits | null>(null);
  const [filesUnavailable, setFilesUnavailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const pickRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    setLoadFailed(false);
    const [cs, fs] = await Promise.all([fetchConnectors(), authed ? fetchFiles() : Promise.resolve(null)]);
    if (cs.ok) { setStates(cs.connectors); if (cs.limits) setLimits(cs.limits); } else setLoadFailed(true);
    if (fs) {
      if (fs.ok) { setFiles(fs.files); if (fs.limits) setLimits(fs.limits); setFilesUnavailable(false); }
      else setFilesUnavailable(fs.unavailable);
    }
  }, [authed]);

  useEffect(() => { void load(); }, [load]);

  const localState = states?.find((s) => s.id === 'local_files');
  const localReady = localState?.status === 'ready' && !filesUnavailable;
  const maxFiles = limits?.maxFiles ?? RESEARCH_FILES_MAX;
  const full = (files?.length ?? 0) >= maxFiles;

  const onPick = async (list: FileList | null) => {
    const picked = list ? Array.from(list) : [];
    if (picked.length === 0) return;
    setMessage(null);
    setBusy(true);
    for (const file of picked) {
      if ((files?.length ?? 0) >= maxFiles) { setMessage(c.connFilesLimit(maxFiles)); break; }
      const isText = TEXT_FILE_RE.test(file.name) || file.type.startsWith('text/');
      if (!isText && file.size > MAX_BINARY_BYTES) { setMessage(c.connTooLarge); continue; }
      const text = await extractFileText(file);
      if (!text) { setMessage(c.connUnreadable); continue; }
      const r = await addFile({ name: file.name, mimeType: file.type || 'application/octet-stream', bytes: file.size, text, locale: lang });
      if (r.ok) setFiles((cur) => [r.file, ...(cur ?? [])]);
      else setMessage(r.message ?? c.connUploadFailed);
    }
    setBusy(false);
    if (pickRef.current) pickRef.current.value = '';
  };

  const del = async (f: ConnectorFile) => {
    const ok = await removeFile(f.id);
    if (ok) setFiles((cur) => (cur ?? []).filter((x) => x.id !== f.id));
    else setMessage(c.connUploadFailed);
  };

  return (
    <div className="space-y-4 px-2 pb-2 pt-1" data-testid="connectors-body">
      <p className="text-[13.5px] leading-relaxed text-app-muted">{c.connLead}</p>

      {/* Local files — the one connector that works. */}
      <section aria-labelledby={localH} data-testid="connector-local" className="rounded-2xl bg-app-elevated/50 p-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-app-accent/15 text-app-accent" aria-hidden="true"><HardDrive size={17} /></span>
          <div className="min-w-0 flex-1">
            <h3 id={localH} className="text-[14.5px] font-semibold text-app-text">{c.connLocal}</h3>
            <p className="mt-0.5 text-[12.5px] leading-snug text-app-muted">{c.connLocalSub}</p>
          </div>
        </div>

        {loadFailed && (
          <div className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-app-bg/40 px-3 py-2 text-[12.5px] text-app-text" role="alert">
            <span>{c.connLoadFailed}</span>
            <button type="button" onClick={() => void load()} className="inline-flex min-h-[44px] items-center rounded-full px-3 font-semibold text-app-accent hover:bg-app-elevated">{c.retry}</button>
          </div>
        )}

        {!authed ? (
          <div className="mt-3 flex items-center justify-between gap-2 text-[12.5px] text-app-muted">
            <span>{c.connSignIn}</span>
            <button type="button" onClick={() => { try { window.dispatchEvent(new CustomEvent('myavatar:auth-required')); } catch { /* SSR */ } }}
              className="inline-flex min-h-[44px] items-center rounded-full bg-app-accent px-4 font-semibold text-app-bg hover:opacity-90">{c.connSignInButton}</button>
          </div>
        ) : !localReady && states ? (
          <p className="mt-3 text-[12.5px] text-app-muted" data-testid="connector-local-unavailable">{c.connUnavailable}</p>
        ) : localReady ? (
          <div className="mt-3">
            {files && files.length > 0 ? (
              <ul className="space-y-1" aria-label={c.connLocal} data-testid="connector-files">
                {files.map((f) => (
                  <li key={f.id} className="flex min-h-[48px] items-center gap-3 rounded-xl bg-app-bg/40 pl-3 pr-1">
                    <FileText size={16} className="shrink-0 text-app-muted" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] text-app-text">{f.name}</span>
                      {typeof f.chars === 'number' ? <span className="block text-[11.5px] text-app-muted">{c.connChars(f.chars)}</span> : null}
                    </span>
                    <button type="button" onClick={() => void del(f)} aria-label={c.connRemove(f.name)} title={c.connRemove(f.name)}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-app-muted transition-colors hover:bg-app-elevated hover:text-app-text">
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : files ? <p className="text-[12.5px] text-app-muted">{c.connEmpty}</p> : <Loader2 size={16} className="text-app-muted motion-safe:animate-spin" aria-label={c.cardLoading} />}

            <input ref={pickRef} type="file" multiple accept=".pdf,.docx,.txt,.md,.markdown,.csv,application/pdf,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="sr-only" tabIndex={-1} data-testid="connector-file-input" onChange={(e) => void onPick(e.target.files)} />
            <button type="button" disabled={busy || full} onClick={() => pickRef.current?.click()} data-testid="connector-add"
              className="mt-2 inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-app-border/30 text-[14px] font-medium text-app-text transition-colors hover:bg-app-elevated disabled:opacity-50">
              {busy ? <Loader2 size={16} className="motion-safe:animate-spin" aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}
              {busy ? c.connAdding : c.connAdd}
            </button>
            <p className="mt-1.5 text-center text-[11.5px] text-app-muted">{c.connFormats}</p>
            {full && <p className="mt-1 text-[12px] text-app-muted">{c.connFilesLimit(maxFiles)}</p>}
          </div>
        ) : null}

        {message && <p role="alert" className="mt-2 text-[12.5px] leading-snug text-app-text">{message}</p>}
      </section>
    </div>
  );
}
