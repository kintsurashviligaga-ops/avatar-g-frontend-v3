/**
 * lib/connectors/localFiles.ts — the user's own documents, kept as TEXT for research (table `research_context_files`,
 * migration 20261003b). The only connector that works today.
 *
 * THE FLOW: the browser reads a PDF / TXT / MD / DOCX, posts it to the existing /api/utils/extract-text (which parses PDF with
 * unpdf and DOCX with mammoth, fail-open to ''), then posts the TEXT here. Nothing but text is stored — never the original
 * bytes — and a run that attaches a file folds that text into its prompt under a hard cap (lib/research/context.ts says why
 * it is not sent as a `document` input).
 *
 * CAPS (all server-side; the UI mirrors them): ≤ RESEARCH_FILES_MAX documents per user, each ≤ RESEARCH_FILE_MAX_CHARS
 * characters (longer text is cut and flagged `truncated`), a run attaches ≤ RESEARCH_ATTACH_MAX.
 *
 * Written with the SERVICE-ROLE client after the route verified the user, always scoped `.eq('user_id', userId)`: the table
 * has no client write policy at all, and a document id from another account simply is not found.
 */
import {
  RESEARCH_ATTACH_MAX,
  RESEARCH_FILES_MAX,
  RESEARCH_FILE_MAX_CHARS,
  safeFileName,
  tidy,
  type ResearchContextFile,
} from '@/lib/research/context';
import type { ContextFilesPort } from '@/lib/research/service';
import type { ConnectorFile } from './types';

type Sb = { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

const TABLE = 'research_context_files';
const LIST_COLUMNS = 'id,name,mime_type,bytes,chars,truncated,created_at';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BYTES = 100 * 1024 * 1024;

export interface AddFileInput {
  name: unknown;
  mimeType?: unknown;
  bytes?: unknown;
  /** The extracted text. */
  text: unknown;
}

export type AddFileResult =
  | { ok: true; file: ConnectorFile }
  | { ok: false; code: 'too_many' | 'empty' | 'invalid' | 'unavailable' };

export interface LocalFilesStore {
  list(userId: string): Promise<ConnectorFile[]>;
  count(userId: string): Promise<number>;
  add(userId: string, input: AddFileInput): Promise<AddFileResult>;
  remove(userId: string, id: string): Promise<boolean>;
  /** The documents a run attaches, in the order asked — `invalid_file` when any id is not this user's. */
  loadForRun: ContextFilesPort['loadForRun'];
}

interface Row {
  id: string;
  name: string;
  mime_type: string | null;
  bytes: number | null;
  chars: number | null;
  truncated: boolean | null;
  created_at: string | null;
  text_content?: string;
}

const toFile = (r: Row): ConnectorFile => ({
  id: r.id,
  name: r.name,
  mimeType: r.mime_type ?? null,
  chars: typeof r.chars === 'number' ? r.chars : null,
  bytes: typeof r.bytes === 'number' ? r.bytes : null,
  truncated: r.truncated === true,
  createdAt: r.created_at ?? null,
});

/** What the add route validates and stores. Pure, so it is unit-tested without a database. */
export function normalizeLocalFile(input: AddFileInput): { name: string; mimeType: string | null; bytes: number; text: string; truncated: boolean } | null {
  if (typeof input.text !== 'string') return null;
  // Postgres text cannot hold a NUL; control characters are noise in a prompt.
  const cleaned = tidy(input.text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' '));
  if (!cleaned) return null;
  const truncated = cleaned.length > RESEARCH_FILE_MAX_CHARS;
  const text = truncated ? `${cleaned.slice(0, RESEARCH_FILE_MAX_CHARS - 2).trimEnd()} …` : cleaned;
  const mime = typeof input.mimeType === 'string' ? input.mimeType.trim().slice(0, 120) : '';
  const bytes = typeof input.bytes === 'number' && Number.isFinite(input.bytes) ? Math.max(0, Math.min(MAX_BYTES, Math.round(input.bytes))) : 0;
  return { name: safeFileName(input.name), mimeType: mime || null, bytes, text, truncated };
}

export function createLocalFilesStore(sb: Sb): LocalFilesStore {
  const list = async (userId: string): Promise<ConnectorFile[]> => {
    const { data, error } = await sb.from(TABLE).select(LIST_COLUMNS).eq('user_id', userId).order('created_at', { ascending: false }).limit(RESEARCH_FILES_MAX * 2);
    if (error) throw new Error(`${TABLE} list: ${error.message}`);
    return ((data ?? []) as Row[]).map(toFile);
  };

  const count = async (userId: string): Promise<number> => {
    const { count: n, error } = await sb.from(TABLE).select('id', { count: 'exact', head: true }).eq('user_id', userId);
    if (error || typeof n !== 'number') throw new Error(`${TABLE} count: ${error?.message ?? 'no count'}`);
    return n;
  };

  return {
    list,
    count,

    async add(userId, input) {
      const f = normalizeLocalFile(input);
      if (!f) return { ok: false, code: typeof input.text === 'string' ? 'empty' : 'invalid' };
      try {
        if ((await count(userId)) >= RESEARCH_FILES_MAX) return { ok: false, code: 'too_many' };
        const { data, error } = await sb
          .from(TABLE)
          .insert({ user_id: userId, name: f.name, mime_type: f.mimeType, bytes: f.bytes, text_content: f.text, chars: f.text.length, truncated: f.truncated })
          .select(LIST_COLUMNS)
          .single();
        if (error || !data) return { ok: false, code: 'unavailable' };
        return { ok: true, file: toFile(data as Row) };
      } catch {
        return { ok: false, code: 'unavailable' };
      }
    },

    async remove(userId, id) {
      if (!UUID_RE.test(id)) return false;
      const { data, error } = await sb.from(TABLE).delete().eq('user_id', userId).eq('id', id).select('id');
      if (error) throw new Error(`${TABLE} delete: ${error.message}`);
      return Array.isArray(data) ? data.length > 0 : true;
    },

    async loadForRun(userId, ids) {
      const unique = [...new Set(ids)];
      if (unique.length === 0) return { ok: true, files: [] };
      if (unique.length > RESEARCH_ATTACH_MAX || unique.some((id) => !UUID_RE.test(id))) return { ok: false, code: 'invalid_file' };
      try {
        const { data, error } = await sb.from(TABLE).select('id,name,text_content').eq('user_id', userId).in('id', unique);
        if (error) return { ok: false, code: 'unavailable' };
        const byId = new Map(((data ?? []) as Row[]).map((r) => [r.id, r]));
        const files: ResearchContextFile[] = [];
        for (const id of unique) {
          const r = byId.get(id);
          if (!r || typeof r.text_content !== 'string') return { ok: false, code: 'invalid_file' };
          files.push({ id: r.id, name: r.name, text: r.text_content });
        }
        return { ok: true, files };
      } catch {
        return { ok: false, code: 'unavailable' };
      }
    },
  };
}
