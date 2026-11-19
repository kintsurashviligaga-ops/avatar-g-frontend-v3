/**
 * The /{lang}/services/<slug> form's failure line. It used to throw `apiErrorMessage(payload)` straight onto the screen,
 * so a route's English sentence or a code such as `rate_limited` reached a Georgian page (Phase 7.6 audit, GG 2026-11-13:
 * "No raw server errors anywhere").
 *
 * The machine code (`error`, or `data.error`) is tried first, then the route's sentence. Anything the shared table
 * (components/studio/ui/serviceError) does not recognise falls back to the page's own copy; raw text is never shown.
 */
import { describeServiceError } from '@/components/studio/ui/serviceError'
import { apiErrorMessage, type WorkspaceLang } from '@/lib/services/workspaceForms'

export function readableServiceError(payload: unknown, lang: WorkspaceLang, fallback: string): string {
  const record = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
  const nested = record.data && typeof record.data === 'object' ? (record.data as Record<string, unknown>) : {}
  const code = typeof record.error === 'string' ? record.error : typeof nested.error === 'string' ? nested.error : ''
  const fromCode = code ? describeServiceError(code, lang, '') : ''
  if (fromCode) return fromCode
  return describeServiceError(apiErrorMessage(payload), lang, fallback)
}
