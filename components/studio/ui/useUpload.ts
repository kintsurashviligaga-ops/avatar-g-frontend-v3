'use client';

import { useCallback, useState } from 'react';
import { createBrowserClient } from '@/lib/supabase/browser';

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
 * WHY THIS IS A SHARED HOOK. Four surfaces had grown their own copy of this — OmniStudio,
 * MontageEditor, SurgicalEditor and LipsyncStudio — and they had drifted: different timeouts, different
 * error handling, and only some of them distinguished "you are signed out" from "the file failed".
 * That last one matters, because since /api/upload/sign started requiring a session, being signed out
 * became the commonest cause, and telling the user to re-encode their video does not help them.
 */

export type UploadError = 'auth' | 'rate' | 'too-large' | 'fail';
export type UploadOutcome = { path: string } | { error: UploadError };

/** 50MB. Below the storage ceiling, and checked HERE so the user is told before a long upload, not after. */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export async function uploadFileToStorage(file: File): Promise<UploadOutcome> {
  if (file.size > MAX_UPLOAD_BYTES) return { error: 'too-large' };
  try {
    const signRes = await fetch('/api/upload/sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ contentType: file.type || 'application/octet-stream' }),
      signal: AbortSignal.timeout(60_000),
    });
    if (signRes.status === 401) return { error: 'auth' };
    if (signRes.status === 429) return { error: 'rate' };
    const sign = (await signRes.json().catch(() => ({}))) as { bucket?: string; path?: string; token?: string };
    if (!signRes.ok || !sign.path || !sign.token) return { error: 'fail' };

    const sb = createBrowserClient();
    // The PUT is a supabase-js call, not a fetch, so it takes no AbortSignal — race it instead, or a
    // stalled upload strands the caller's spinner forever.
    const put = sb.storage
      .from(sign.bucket || 'uploads')
      .uploadToSignedUrl(sign.path, sign.token, file, { contentType: file.type || 'application/octet-stream' });
    const timeout = new Promise<{ error: { message: string } }>((resolve) =>
      setTimeout(() => resolve({ error: { message: 'upload timeout' } }), 300_000),
    );
    const { error } = await Promise.race([put, timeout]);
    return error ? { error: 'fail' } : { path: sign.path };
  } catch {
    return { error: 'fail' };
  }
}

/** Localized copy for each failure. Never blames the file for something that is not the file. */
export function uploadErrorText(err: UploadError, locale: string, fileName?: string): string {
  const ka = {
    auth: 'ატვირთვამდე გაიარე ავტორიზაცია.',
    rate: 'ძალიან ბევრი ატვირთვა — დაელოდე რამდენიმე წამს.',
    'too-large': 'ფაილი ძალიან დიდია (მაქსიმუმ 50MB).',
    fail: 'ფაილი ვერ აიტვირთა',
  };
  const en = {
    auth: 'Sign in before uploading.',
    rate: 'Too many uploads — wait a few seconds.',
    'too-large': 'That file is too large (50MB max).',
    fail: 'File could not be uploaded',
  };
  const ru = {
    auth: 'Войдите, чтобы загружать файлы.',
    rate: 'Слишком много загрузок — подождите несколько секунд.',
    'too-large': 'Файл слишком большой (максимум 50 МБ).',
    fail: 'Файл не загрузился',
  };
  const table = locale === 'en' ? en : locale === 'ru' ? ru : ka;
  const base = table[err];
  return err === 'fail' && fileName ? `${base}: ${fileName}` : base;
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
