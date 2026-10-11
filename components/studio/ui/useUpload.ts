'use client';

import { useCallback, useState } from 'react';
import { createBrowserClient } from '@/lib/supabase/browser';
import { UPLOAD_MAX_BYTES, allowedUploadMime } from '@/lib/uploads/policy';

/**
 * Upload a local file to storage and get back its object PATH.
 *
 * ⚠️ THE BYTES MUST NOT GO THROUGH A SERVERLESS FUNCTION. A request body caps out around 4.5MB and a
 * real video off a phone is 10–40MB, so the data-URL-in-JSON approach fails on anything worth
 * uploading — the platform rejects it before the route even runs, which reads to the user as "upload
 * failed" with no explanation. The browser therefore PUTs straight to Supabase through a signed upload
 * URL; only a tiny handshake passes through the function.
 *
 * Returns a PATH, not a URL, and that is deliberate: an object cannot be signed for reading until its
 * bytes have landed. Every v2 route resolves the path server-side at the moment it needs to fetch
 * (see lib/services/resolveUpload).
 *
 * WHY THIS IS A SHARED HOOK. Four surfaces had grown their own copy of this — OmniStudio, the old
 * montage form, SurgicalEditor and LipsyncStudio — and they had drifted: different timeouts, different
 * error handling, and only some of them distinguished "you are signed out" from "the file failed".
 * That last one matters, because since /api/upload/sign started requiring a session, being signed out
 * became the commonest cause, and telling the user to re-encode their video does not help them.
 */

export type UploadError = 'auth' | 'rate' | 'too-large' | 'type' | 'fail' | 'content' | 'aborted';
export type UploadOutcome = { path: string; format?: string } | { error: UploadError };

/** What the chat's attachment pipeline asks of an upload beyond „store these bytes". */
export interface UploadOptions {
  /** 0..1 as the bytes go up. Given → the PUT is an XMLHttpRequest (fetch reports no upload progress). */
  onProgress?: (fraction: number) => void;
  /** Stops the upload (a file removed from the tray). */
  signal?: AbortSignal;
  /**
   * After the PUT, have /api/upload/verify read the STORED bytes and confirm they can be this kind (lib/uploads/sniff).
   * A mismatch is `{ error: 'content' }` and the server has already removed the object.
   */
  verifyKind?: 'video' | 'audio' | 'image';
}

/** A stalled PUT ends here rather than spinning forever. */
const PUT_TIMEOUT_MS = 300_000;

/**
 * The signed PUT with upload progress. Mirrors supabase-js `uploadToSignedUrl` for a raw body (type and cache headers,
 * no upsert); `apikey` rides along like supabase-js sends it. Resolves the HTTP status (0 = network/timeout, -1 = aborted).
 */
function putWithProgress(url: string, body: Blob, contentType: string, onProgress: (f: number) => void, signal?: AbortSignal): Promise<number> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('content-type', contentType);
    xhr.setRequestHeader('cache-control', 'max-age=3600');
    xhr.setRequestHeader('x-upsert', 'false');
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (key) xhr.setRequestHeader('apikey', key);
    xhr.timeout = PUT_TIMEOUT_MS;
    xhr.upload.onprogress = (e) => { if (e.lengthComputable && e.total > 0) onProgress(Math.min(1, e.loaded / e.total)); };
    xhr.onload = () => resolve(xhr.status);
    xhr.onerror = () => resolve(0);
    xhr.ontimeout = () => resolve(0);
    xhr.onabort = () => resolve(-1);
    if (signal) {
      if (signal.aborted) { resolve(-1); return; }
      signal.addEventListener('abort', () => xhr.abort(), { once: true });
    }
    xhr.send(body);
  });
}

/** /api/upload/verify's answer as an outcome. */
async function verifyStored(path: string, kind: NonNullable<UploadOptions['verifyKind']>, signal?: AbortSignal): Promise<UploadOutcome> {
  try {
    const res = await fetch('/api/upload/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ path, kind }),
      signal: signal ?? AbortSignal.timeout(30_000),
    });
    if (res.status === 401) return { error: 'auth' };
    if (res.status === 413) return { error: 'too-large' };
    if (res.status === 422) return { error: 'content' };
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; format?: string | null };
    if (!res.ok || !j.ok) return { error: 'fail' };
    return j.format ? { path, format: j.format } : { path };
  } catch {
    return { error: signal?.aborted ? 'aborted' : 'fail' };
  }
}

/**
 * 50MB (lib/uploads/policy UPLOAD_MAX_BYTES — the routes and the bucket enforce the same number). Checked HERE so
 * the user is told before a long upload, not after.
 */
export const MAX_UPLOAD_BYTES = UPLOAD_MAX_BYTES;

export async function uploadFileToStorage(file: File, opts: UploadOptions = {}): Promise<UploadOutcome> {
  if (file.size > MAX_UPLOAD_BYTES) return { error: 'too-large' };
  // Images, video and audio only — the bucket refuses anything else. A file the browser could not type (an empty
  // `file.type`, common for .mov / .mkv / .heic) is typed from its name instead of being sent as octet-stream.
  const contentType = allowedUploadMime(file.type, file.name);
  if (!contentType) return { error: 'type' };
  try {
    const signRes = await fetch('/api/upload/sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ contentType, size: file.size, name: file.name }),
      signal: opts.signal ?? AbortSignal.timeout(60_000),
    });
    if (signRes.status === 401) return { error: 'auth' };
    if (signRes.status === 429) return { error: 'rate' };
    if (signRes.status === 413) return { error: 'too-large' };
    if (signRes.status === 415) return { error: 'type' };
    const sign = (await signRes.json().catch(() => ({}))) as { bucket?: string; path?: string; token?: string; signedUrl?: string; contentType?: string };
    if (!signRes.ok || !sign.path || !sign.token) return { error: 'fail' };
    const putType = sign.contentType || contentType;
    const done = (path: string): Promise<UploadOutcome> | UploadOutcome =>
      opts.verifyKind ? verifyStored(path, opts.verifyKind, opts.signal) : { path };

    // With a progress callback the PUT is an XHR straight to the signed URL. A 401/403 there is the gateway refusing the
    // request before the token is spent, so the supabase-js PUT below may still use it.
    if (opts.onProgress && sign.signedUrl && typeof XMLHttpRequest !== 'undefined') {
      const status = await putWithProgress(sign.signedUrl, new Blob([file], { type: putType }), putType, opts.onProgress, opts.signal);
      if (status === -1) return { error: 'aborted' };
      if (status >= 200 && status < 300) { opts.onProgress(1); return done(sign.path); }
      if (status === 413) return { error: 'too-large' };
      if (status === 415) return { error: 'type' };
      if (status !== 401 && status !== 403) return { error: 'fail' };
    }

    const sb = createBrowserClient();
    // The PUT is a supabase-js call, not a fetch, so it takes no AbortSignal — race it instead, or a
    // stalled upload strands the caller's spinner forever.
    const put = sb.storage
      .from(sign.bucket || 'uploads')
      .uploadToSignedUrl(sign.path, sign.token, file, { contentType: sign.contentType || contentType });
    const timeout = new Promise<{ error: { message: string } }>((resolve) =>
      setTimeout(() => resolve({ error: { message: 'upload timeout' } }), 300_000),
    );
    const { error } = await Promise.race([put, timeout]);
    if (error) return { error: 'fail' };
    opts.onProgress?.(1);
    return done(sign.path);
  } catch {
    return { error: opts.signal?.aborted ? 'aborted' : 'fail' };
  }
}

/** Localized copy for each failure. Never blames the file for something that is not the file. */
export function uploadErrorText(err: UploadError, locale: string, fileName?: string): string {
  const ka = {
    auth: 'ატვირთვამდე გაიარე ავტორიზაცია.',
    rate: 'ძალიან ბევრი ატვირთვა — დაელოდე რამდენიმე წამს.',
    'too-large': 'ფაილი ძალიან დიდია (მაქსიმუმ 50MB).',
    type: 'ამ ტიპის ფაილი არ მიიღება — ატვირთე სურათი, ვიდეო ან აუდიო.',
    fail: 'ფაილი ვერ აიტვირთა',
    content: 'ფაილის შიგთავსი არ ემთხვევა მის ტიპს (მაგ. გადარქმეული ფაილი)',
    aborted: 'ატვირთვა გაუქმდა',
  };
  const en = {
    auth: 'Sign in before uploading.',
    rate: 'Too many uploads — wait a few seconds.',
    'too-large': 'That file is too large (50MB max).',
    type: 'That file type is not supported — upload an image, a video or audio.',
    fail: 'File could not be uploaded',
    content: 'The file\'s contents do not match its type (a renamed file?)',
    aborted: 'Upload cancelled',
  };
  const ru = {
    auth: 'Войдите, чтобы загружать файлы.',
    rate: 'Слишком много загрузок — подождите несколько секунд.',
    'too-large': 'Файл слишком большой (максимум 50 МБ).',
    type: 'Этот тип файла не поддерживается — загрузите изображение, видео или аудио.',
    fail: 'Файл не загрузился',
    content: 'Содержимое файла не соответствует его типу (переименованный файл?)',
    aborted: 'Загрузка отменена',
  };
  const table = locale === 'en' ? en : locale === 'ru' ? ru : ka;
  const base = table[err];
  return (err === 'fail' || err === 'content') && fileName ? `${base}: ${fileName}` : base;
}

/**
 * The same upload with the state a panel actually renders: busy, error, and the resulting path.
 * `error` is already localized, so a caller only has to display it.
 */
export function useUpload(locale: string) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(async (file: File): Promise<string | null> => {
    setBusy(true);
    setError(null);
    try {
      const res = await uploadFileToStorage(file);
      if ('path' in res) return res.path;
      setError(uploadErrorText(res.error, locale, file.name));
      return null;
    } finally {
      setBusy(false);
    }
  }, [locale]);

  return { upload, busy, error, clearError: useCallback(() => setError(null), []) };
}
