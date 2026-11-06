'use client';
/**
 * components/workspace/WorkspacePanel.tsx — the user's Execution Workspaces (GG's 2026-11-06 audit, ACTION 2), at
 * /[locale]/workspace. Pick a workspace, see its files (who wrote each version: the user, Agent G or a code run),
 * upload a file, download, delete, see a file's versions and bring one back, and file a copy in the Library.
 *
 * Everything goes through /api/agent/workspace; the server decides who may use it (GET → { enabled }), and a closed
 * flag shows one line saying so. File names are shown as text, never as HTML.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, FolderOpen, History, Library, Loader2, Plus, RotateCcw, Trash2, Upload } from 'lucide-react';

type Lang = 'ka' | 'en' | 'ru';
interface Ws { id: string; title: string; updatedAt: string }
interface Ver { v: number; bytes: number; updatedAt: string; by: string; deleted?: boolean }
interface WsFile extends Ver { path: string; type: string }

const L: Record<Lang, Record<string, string>> = {
  ka: {
    title: 'სამუშაო სივრცე', closed: 'სამუშაო სივრცე შენთვის ჯერ არ არის ჩართული.', empty: 'ფაილები ჯერ არ არის.',
    upload: 'ატვირთვა', newWs: 'ახალი', download: 'ჩამოტვირთვა', del: 'წაშლა', history: 'ვერსიები', restore: 'აღდგენა',
    library: 'Library-ში შენახვა', saved: 'შენახულია Library-ში.', failed: 'ვერ მოხერხდა:', deleted: 'წაშლილი',
    by_user: 'შენ', by_agent: 'Agent G', by_run: 'კოდის გაშვება', confirmDel: 'წავშალო {p}? ძველი ვერსიები შეინახება.',
    hint: 'ყოველი ცვლილება ახალი ვერსიაა: წაშლილი ან შეცვლილი ფაილი ყოველთვის აღდგება. ფაილი 3 MB-მდე.',
  },
  en: {
    title: 'Workspace', closed: 'The workspace is not open for you yet.', empty: 'No files yet.',
    upload: 'Upload', newWs: 'New', download: 'Download', del: 'Delete', history: 'Versions', restore: 'Restore',
    library: 'Save to Library', saved: 'Saved in the Library.', failed: 'Failed:', deleted: 'deleted',
    by_user: 'you', by_agent: 'Agent G', by_run: 'code run', confirmDel: 'Delete {p}? Its versions are kept.',
    hint: 'Every change is a new version: a deleted or changed file can always be restored. Files up to 3 MB.',
  },
  ru: {
    title: 'Рабочая папка', closed: 'Рабочая папка для вас пока не открыта.', empty: 'Файлов пока нет.',
    upload: 'Загрузить', newWs: 'Новая', download: 'Скачать', del: 'Удалить', history: 'Версии', restore: 'Вернуть',
    library: 'В библиотеку', saved: 'Сохранено в библиотеке.', failed: 'Не удалось:', deleted: 'удалён',
    by_user: 'вы', by_agent: 'Agent G', by_run: 'запуск кода', confirmDel: 'Удалить {p}? Версии сохранятся.',
    hint: 'Каждое изменение — новая версия: удалённый или изменённый файл всегда можно вернуть. Файлы до 3 МБ.',
  },
};

async function call(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const r = await fetch('/api/agent/workspace', {
    method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  return r.ok ? j : { ok: false, message: typeof j.message === 'string' ? j.message : `HTTP ${r.status}` };
}

const size = (b: number) => (b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${Math.round(b / 1024)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);

export function byLabel(by: string, t: Record<string, string>): string {
  if (by.startsWith('run:')) return t.by_run!;
  if (by.startsWith('agent')) return t.by_agent!;
  if (by.startsWith('restore:')) return `${t.restore} v${by.slice(8)}`;
  return t.by_user!;
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

const BTN = 'flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] text-app-muted transition-colors hover:bg-app-border/10 hover:text-app-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60 disabled:opacity-50';

export default function WorkspacePanel({ locale }: { locale: string }) {
  const lang: Lang = locale === 'en' || locale === 'ru' ? locale : 'ka';
  const t = L[lang];
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [list, setList] = useState<Ws[]>([]);
  const [ws, setWs] = useState<string>('');
  const [files, setFiles] = useState<WsFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [open, setOpen] = useState<{ path: string; versions: Ver[] } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const say = (r: Record<string, unknown>, ok?: string) => setNote(r.ok === true ? (ok ?? '') : `${t.failed} ${String(r.message ?? '')}`);

  const loadFiles = useCallback(async (id: string) => {
    if (!id) return;
    const r = await call({ action: 'files', workspaceId: id });
    if (r.ok === true) setFiles((r.files as WsFile[]) ?? []);
  }, []);

  const loadList = useCallback(async () => {
    const r = await call({ action: 'list' });
    let ws0 = (r.workspaces as Ws[] | undefined) ?? [];
    if (r.ok === true && !ws0.length) {
      const c = await call({ action: 'create', title: 'Agent G' });
      if (c.ok === true) ws0 = [c.workspace as Ws];
    }
    setList(ws0);
    setWs((cur) => cur || ws0[0]?.id || '');
  }, []);

  useEffect(() => {
    void fetch('/api/agent/workspace', { credentials: 'same-origin', cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { enabled: false }))
      .then((j: { enabled?: unknown }) => setEnabled(j?.enabled === true))
      .catch(() => setEnabled(false));
  }, []);
  useEffect(() => { if (enabled) void loadList(); }, [enabled, loadList]);
  useEffect(() => { setOpen(null); void loadFiles(ws); }, [ws, loadFiles]);

  const act = async (body: Record<string, unknown>, ok?: string) => {
    setBusy(true);
    try {
      const r = await call({ ...body, workspaceId: ws });
      say(r, ok);
      if (r.ok === true) await loadFiles(ws);
      return r;
    } finally { setBusy(false); }
  };

  const upload = async (f: File) => {
    if (f.size > 3 * 1024 * 1024) { setNote(`${t.failed} > 3 MB`); return; }
    await act({ action: 'write', path: f.name, base64: toBase64(await f.arrayBuffer()) });
  };

  const download = async (path: string) => {
    const r = await call({ action: 'link', workspaceId: ws, path });
    if (typeof r.url === 'string' && /^https:\/\//.test(r.url)) window.open(r.url, '_blank', 'noopener,noreferrer');
    else say(r);
  };

  const history = async (path: string) => {
    if (open?.path === path) { setOpen(null); return; }
    const r = await call({ action: 'history', workspaceId: ws, path });
    if (r.ok === true) setOpen({ path, versions: (r.versions as Ver[]) ?? [] }); else say(r);
  };

  if (enabled === null) return <div className="p-6 text-app-muted"><Loader2 className="animate-spin" size={18} aria-hidden /></div>;
  if (!enabled) return <p className="p-6 text-app-muted" data-workspace-closed="">{t.closed}</p>;

  return (
    <section className="mx-auto w-full max-w-3xl space-y-4 px-4 py-6 text-[14px]" data-workspace-panel="">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 text-[20px] font-semibold text-app-text"><FolderOpen size={20} aria-hidden />{t.title}</h1>
        <div className="flex items-center gap-1">
          <select value={ws} onChange={(e) => setWs(e.target.value)} className="h-9 rounded-full bg-app-border/10 px-3 text-app-text" aria-label={t.title}>
            {list.map((w) => <option key={w.id} value={w.id}>{w.title}</option>)}
          </select>
          <button type="button" className={BTN} disabled={busy} onClick={async () => {
            const name = window.prompt(t.newWs);
            if (!name) return;
            const r = await call({ action: 'create', title: name });
            say(r);
            if (r.ok === true) { await loadList(); setWs((r.workspace as Ws).id); }
          }}><Plus size={14} aria-hidden />{t.newWs}</button>
          <button type="button" className={BTN} disabled={busy || !ws} onClick={() => input.current?.click()}><Upload size={14} aria-hidden />{t.upload}</button>
          <input ref={input} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void upload(f); }} />
        </div>
      </header>
      <p className="text-[12px] text-app-muted">{t.hint}</p>
      {note && <p className="text-[13px] text-app-muted" aria-live="polite">{note}</p>}
      {busy && <Loader2 className="animate-spin text-app-muted" size={16} aria-hidden />}
      {!files.length && <p className="text-app-muted">{t.empty}</p>}
      <ul className="space-y-1.5">
        {files.map((f) => (
          <li key={f.path} className="rounded-xl bg-app-border/5 px-3 py-2" data-workspace-file={f.path}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="min-w-0 truncate text-app-text" title={f.path}>
                {f.path} <span className="text-[12px] text-app-muted">· v{f.v} · {size(f.bytes)} · {byLabel(f.by, t)}</span>
              </span>
              <span className="flex items-center">
                <button type="button" className={BTN} onClick={() => void download(f.path)} aria-label={`${t.download} ${f.path}`}><Download size={14} aria-hidden /></button>
                <button type="button" className={BTN} onClick={() => void history(f.path)} aria-label={`${t.history} ${f.path}`}><History size={14} aria-hidden /></button>
                <button type="button" className={BTN} disabled={busy} onClick={() => void act({ action: 'export', path: f.path }, t.saved)} aria-label={`${t.library} ${f.path}`}><Library size={14} aria-hidden /></button>
                <button type="button" className={BTN} disabled={busy} onClick={() => { if (window.confirm(t.confirmDel!.replace('{p}', f.path))) void act({ action: 'delete', path: f.path }); }} aria-label={`${t.del} ${f.path}`}><Trash2 size={14} aria-hidden /></button>
              </span>
            </div>
            {open?.path === f.path && <Versions versions={open.versions} t={t} busy={busy} onRestore={(v) => void act({ action: 'restore', path: f.path, v }).then(() => history(f.path))} />}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Versions({ versions, t, busy, onRestore }: { versions: Ver[]; t: Record<string, string>; busy: boolean; onRestore: (v: number) => void }) {
  return (
    <ol className="mt-2 space-y-1 border-t border-app-border/10 pt-2 text-[12px] text-app-muted">
      {versions.map((h, i) => (
        <li key={h.v} className="flex items-center justify-between gap-2">
          <span>v{h.v} · {new Date(h.updatedAt).toLocaleString()} · {byLabel(h.by, t)} · {h.deleted ? t.deleted : size(h.bytes)}</span>
          {i > 0 && !h.deleted && (
            <button type="button" className={BTN} disabled={busy} onClick={() => onRestore(h.v)}><RotateCcw size={12} aria-hidden />{t.restore}</button>
          )}
        </li>
      ))}
    </ol>
  );
}
