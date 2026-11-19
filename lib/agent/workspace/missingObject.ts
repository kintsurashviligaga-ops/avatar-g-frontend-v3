/** lib/agent/workspace/missingObject.ts — pure: is a Storage download error just "not there yet"? */

/**
 * Is a download error just "no such object (or bucket yet)"?
 *
 * ⚠️ EVERY FIRST WORKSPACE FAILED WITH „Storage did not answer" (GG 2026-11-07 07:39Z). download() asks storage-js not to
 * parse the body (noResolveJson), so a missing object comes back as a StorageUnknownError: message "{}", no statusCode,
 * and the HTTP Response in `originalError` (status 400, body `{"statusCode":"404","error":"not_found"}`). The old check
 * read only statusCode/message, so a user with no index.json yet — everyone, the first time — got a storage failure.
 */
export async function isMissingObject(error: unknown): Promise<boolean> {
  if (!error || typeof error !== 'object') return false;
  const e = error as { statusCode?: unknown; status?: unknown; message?: unknown; originalError?: unknown };
  const msg = typeof e.message === 'string' ? e.message : '';
  if (/not.?found|does not exist|no such/i.test(msg)) return true;
  const code = Number(e.statusCode ?? e.status ?? 0);
  if (code === 404) return true;
  const res = e.originalError as { status?: unknown; clone?: () => { text(): Promise<string> }; text?: () => Promise<string> } | undefined;
  const status = Number(res?.status ?? 0);
  if (status === 404) return true;
  if (status !== 400 && code !== 400) return false;
  // A 400 is "missing" only when its body says so (storage answers a missing object or bucket with 400 + statusCode 404).
  try {
    const read = res?.clone ? res.clone().text() : res?.text ? res.text() : Promise.resolve('');
    const body = await read;
    return /"statusCode"\s*:\s*"?404|not.?found/i.test(body);
  } catch {
    return false;
  }
}
