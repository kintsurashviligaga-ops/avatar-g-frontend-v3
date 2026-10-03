'use client'

/**
 * ServiceWorkspaceView — the body of /{lang}/services/<slug>. It renders inside the studio's own shell (StudioPageShell,
 * the same frame as the /services hub it is reached from), in docs/DESIGN.md's language: true black, one accent, hairline
 * rings, no gradient, glow or emoji, 16 px inputs and 44 px targets, ka · en · ru.
 *
 * What a page offers comes from lib/services/workspaceForms:
 *   • a STUDIO service (video, image, music, avatar, interior, photo, editing — and the chat for the ones that never had
 *     a generator) names its studio tool and opens it — ONE solid accent pill, `/{lang}/dashboard?tool=<id>`;
 *   • a FORM service (tourism, game, podcast, …) keeps its own form, posts to the same route as before, and shows the
 *     answer beside it.
 *
 * ⚠️ NO NUMBER THAT IS NOT REAL. This page used to open on four stat cards — „კრედიტი 1000" (a prop default),
 * „გენერირებული 0", „ამ თვეში 0", „სტატისტიკა —" — and a „1000 კრედიტი" headline, none of them the visitor's, and its
 * buttons printed prices („4 კრედიტი") that their routes never charged. The balance lives once, in the shell's sidebar
 * (ChatChrome → store/useCreditsBalance → /api/credits/balance); nothing here repeats or invents one.
 */

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, Check, ChevronDown, ChevronLeft, Copy, Download, Loader2, LogIn } from 'lucide-react'
import { supabase } from '@/lib/supabase/browser'
import { serviceCardImage } from '@/lib/services/cardImage'
import { signInPath } from '@/lib/routing/signIn'
import { TOOL_META, type ToolId } from '@/lib/studio/tools'
import {
  apiErrorMessage,
  buildGenerateRequest,
  extractOutputText,
  extractOutputUrl,
  formDefaults,
  isAuthRequired,
  servicePlan,
  studioToolHref,
  unwrapApiData,
  workspaceLang,
  type ServiceForm,
  type WorkspaceField,
  type WorkspaceLang,
} from '@/lib/services/workspaceForms'

// Only a generation in the browser produces an answer — the markdown renderer loads then, never on the server.
const ResultMarkdown = dynamic(() => import('./ResultMarkdown'), { ssr: false })

const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ')

const COPY: Record<WorkspaceLang, {
  services: string
  inStudio: string
  openTool: string
  openChat: string
  result: string
  working: string
  copy: string
  copied: string
  download: string
  failed: string
  signIn: string
  signInToCreate: string
}> = {
  ka: {
    services: 'სერვისები',
    inStudio: 'სტუდიაში',
    openTool: 'სტუდიაში გახსნა',
    openChat: 'ჩატის გახსნა',
    result: 'შედეგი',
    working: 'იქმნება…',
    copy: 'კოპირება',
    copied: 'დაკოპირდა',
    download: 'ჩამოტვირთვა',
    failed: 'მოთხოვნა ვერ შესრულდა. სცადე ხელახლა.',
    signIn: 'შესვლა',
    signInToCreate: 'შესაქმნელად შედი ანგარიშზე.',
  },
  en: {
    services: 'Services',
    inStudio: 'In the studio',
    openTool: 'Open in the studio',
    openChat: 'Open the chat',
    result: 'Result',
    working: 'Working on it…',
    copy: 'Copy',
    copied: 'Copied',
    download: 'Download',
    failed: 'The request failed. Try again.',
    signIn: 'Sign in',
    signInToCreate: 'Sign in to create.',
  },
  ru: {
    services: 'Сервисы',
    inStudio: 'В студии',
    openTool: 'Открыть в студии',
    openChat: 'Открыть чат',
    result: 'Результат',
    working: 'Создаётся…',
    copy: 'Копировать',
    copied: 'Скопировано',
    download: 'Скачать',
    failed: 'Запрос не выполнен. Попробуйте ещё раз.',
    signIn: 'Войти',
    signInToCreate: 'Войдите, чтобы создавать.',
  },
}

const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60'
/** The one primary action of the view: a solid rocket-blue pill with ink text (docs/DESIGN.md §2). */
const PRIMARY_PILL =
  'inline-flex h-12 w-full touch-manipulation items-center justify-center gap-2 rounded-full bg-app-accent px-6 text-[16px] font-semibold text-app-bg transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-text/80'
/** Secondary actions: outline pills, 44 px. */
const OUTLINE_PILL = cx(
  'inline-flex h-11 shrink-0 touch-manipulation items-center justify-center gap-1.5 rounded-full px-4 text-[14px] font-medium text-app-text/85 ring-1 ring-app-border/15 transition-colors hover:text-app-text',
  FOCUS_RING,
)
/** The studio's panel (components/studio/create/primitives PanelCard): translucent surface, a white hairline, no shadow. */
const PANEL = 'rounded-[26px] bg-app-elevated/45 ring-1 ring-app-border/10'
/** Inputs override globals.css's `input:not(...), textarea, select` rule (specificity 0,3,1) — hence the `!`. */
const FIELD =
  'w-full !rounded-2xl !border !border-app-border/15 !bg-app-bg/60 px-4 text-[16px] !text-app-text placeholder:text-app-muted focus:!border-app-accent/60 focus:!shadow-none focus:outline-none'

type ResultState = { kind: 'text'; text: string } | { kind: 'audio'; url: string }

interface ServiceWorkspaceViewProps {
  serviceId: string
  serviceName: string
  description: string
  locale: string
}

export default function ServiceWorkspaceView({ serviceId, serviceName, description, locale }: ServiceWorkspaceViewProps) {
  const lang = workspaceLang(locale)
  const c = COPY[lang]
  const plan = servicePlan(serviceId)
  const cardImage = serviceCardImage(serviceId)

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-[max(4rem,env(safe-area-inset-bottom))] pt-3 sm:px-6 sm:pt-6 lg:px-10">
      <nav aria-label={c.services}>
        <Link href={`/${lang}/services`} className={cx('-ml-2 inline-flex min-h-[44px] items-center gap-1 rounded-full px-2 text-[14px] font-medium text-app-muted transition-colors hover:text-app-text', FOCUS_RING)}>
          <ChevronLeft size={16} aria-hidden="true" />
          {c.services}
        </Link>
      </nav>

      <header className="mt-2">
        <div className="flex items-center gap-4">
          {/* The service's own still (the /services hub's card picture) — it was a 24 px Unicode glyph. Decorative: the
              heading names the service. */}
          {cardImage && (
            <span data-testid="service-header-thumb" className="relative block h-14 w-14 shrink-0 overflow-hidden rounded-2xl bg-app-surface ring-1 ring-app-border/10 sm:h-16 sm:w-16">
              <Image src={cardImage} alt="" fill sizes="64px" className="object-cover" priority />
            </span>
          )}
          <h1 className="min-w-0 text-[28px] font-bold leading-[1.15] tracking-[-0.01em] text-app-text sm:text-[36px]">{serviceName}</h1>
        </div>
        <p className="mt-3 max-w-[65ch] text-[16px] leading-[1.6] text-app-muted">{description}</p>
      </header>

      {plan.kind === 'studio'
        ? <StudioHandoff tool={plan.tool} lang={lang} cardImage={cardImage} />
        : <ServiceFormView key={serviceId} serviceId={serviceId} form={plan.form} lang={lang} cardImage={cardImage} />}
    </div>
  )
}

/* ── STUDIO: the tool this service is, and the one way into it ─────────────────────────────────────────────────────── */

function StudioHandoff({ tool, lang, cardImage }: { tool: ToolId; lang: WorkspaceLang; cardImage: string | null }) {
  const c = COPY[lang]
  const meta = TOOL_META[tool]
  const Icon = meta.Icon
  return (
    <div className="mt-8 grid gap-6 md:grid-cols-2 md:items-start lg:gap-10">
      <section aria-labelledby="studio-tool-name" className={cx(PANEL, 'p-5 sm:p-6')}>
        <p className="text-[14px] font-medium text-app-muted">{c.inStudio}</p>
        <div className="mt-3 flex items-center gap-3">
          <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-app-text/[0.06] text-app-text">
            <Icon size={20} strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            <p id="studio-tool-name" className="text-[18px] font-semibold leading-snug text-app-text">{meta.name[lang]}</p>
            <p className="text-[15px] leading-snug text-app-muted">{meta.sub[lang]}</p>
          </div>
        </div>
        <Link href={studioToolHref(lang, tool)} data-testid="service-primary" className={cx(PRIMARY_PILL, 'mt-6 sm:w-auto')}>
          {tool === 'chat' ? c.openChat : c.openTool}
          <ArrowRight size={18} aria-hidden="true" />
        </Link>
      </section>
      {cardImage && (
        <div className="relative hidden aspect-[4/3] overflow-hidden rounded-[26px] bg-app-surface ring-1 ring-app-border/10 md:block">
          <Image src={cardImage} alt="" fill sizes="(min-width: 1280px) 560px, 45vw" className="object-cover" />
        </div>
      )}
    </div>
  )
}

/* ── FORM: the service's own generator ──────────────────────────────────────────────────────────────────────────────── */

async function postJson(path: string, body: Record<string, unknown>): Promise<{ status: number; payload: unknown }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  // The routes read the session from the cookie or a Bearer token; send the token when there is one.
  try {
    const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } }
    const token = data?.session?.access_token
    if (token) headers.Authorization = `Bearer ${token}`
  } catch {
    // No session — a sign-in-only route answers 401, which the page turns into „შესვლა".
  }
  const response = await fetch(path, { method: 'POST', headers, body: JSON.stringify(body) })
  const payload = await response.json().catch(() => null)
  return { status: response.status, payload }
}

function downloadName(serviceId: string, result: ResultState) {
  return result.kind === 'audio' ? `${serviceId}.mp3` : `${serviceId}.md`
}

function ServiceFormView({ serviceId, form, lang, cardImage }: { serviceId: string; form: ServiceForm; lang: WorkspaceLang; cardImage: string | null }) {
  const c = COPY[lang]
  const [values, setValues] = useState<Record<string, string>>(() => formDefaults(form))
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ResultState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [needsSignIn, setNeedsSignIn] = useState(false)
  const [copied, setCopied] = useState(false)
  const sessionRef = useRef(`workspace_${serviceId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`)
  const resultRef = useRef<HTMLElement>(null)

  const prompt = (values.prompt ?? '').trim()
  const idle = !busy && !result && !error

  // On a phone the answer lands below the form — bring it on screen once it is there.
  useEffect(() => {
    if (!(result || error) || typeof window === 'undefined' || window.innerWidth >= 1024) return
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    resultRef.current?.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' })
  }, [result, error])

  useEffect(() => {
    if (!copied) return
    const t = window.setTimeout(() => setCopied(false), 2000)
    return () => window.clearTimeout(t)
  }, [copied])

  const run = useCallback(async (event?: FormEvent) => {
    event?.preventDefault()
    if (busy || !prompt) return
    setBusy(true)
    setResult(null)
    setError(null)
    setNeedsSignIn(false)
    try {
      const { path, body } = buildGenerateRequest(form, values, { sessionId: sessionRef.current, locale: lang })
      const { status, payload } = await postJson(path, body)
      if (status >= 400) {
        if (isAuthRequired(status, payload)) {
          // In the page's language whatever the route defaulted to (/api/orbit is not told the locale).
          setNeedsSignIn(true)
          setError(c.signInToCreate)
          return
        }
        throw new Error(apiErrorMessage(payload) ?? c.failed)
      }
      const data = unwrapApiData(payload)
      if (data.status === 'error' || data.error) throw new Error(apiErrorMessage(data) ?? c.failed)
      if (form.route.kind === 'pipeline' && form.route.output === 'audio') {
        const url = extractOutputUrl(data)
        if (url) {
          setResult({ kind: 'audio', url })
          return
        }
      }
      const text = typeof data.result === 'string' && data.result.trim() ? data.result : extractOutputText(data)
      if (!text) throw new Error(c.failed)
      setResult({ kind: 'text', text })
    } catch (requestError) {
      setError(requestError instanceof Error && requestError.message ? requestError.message : c.failed)
    } finally {
      setBusy(false)
    }
  }, [busy, c.failed, c.signInToCreate, form, lang, prompt, values])

  const handleCopy = useCallback(() => {
    const content = result?.kind === 'text' ? result.text : result?.url
    if (!content || !navigator.clipboard) return
    void navigator.clipboard.writeText(content).then(() => setCopied(true), () => {})
  }, [result])

  const handleDownload = useCallback(() => {
    if (!result) return
    const link = document.createElement('a')
    link.download = downloadName(serviceId, result)
    if (result.kind === 'audio') {
      link.href = result.url
      link.click()
      return
    }
    const href = URL.createObjectURL(new Blob([result.text], { type: 'text/markdown;charset=utf-8' }))
    link.href = href
    link.click()
    URL.revokeObjectURL(href)
  }, [result, serviceId])

  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:items-start">
      <form onSubmit={run} className={cx(PANEL, 'space-y-4 p-4 sm:p-5 lg:sticky lg:top-6')}>
        {form.fields.map((field) => (
          <FormField key={field.id} field={field} lang={lang} value={values[field.id] ?? ''} onChange={(v) => setValues((prev) => ({ ...prev, [field.id]: v }))} />
        ))}
        <button type="submit" data-testid="service-primary" disabled={busy || !prompt} aria-busy={busy || undefined} className={cx(PRIMARY_PILL, '!mt-6 disabled:cursor-not-allowed disabled:opacity-40')}>
          {busy && <Loader2 size={18} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}
          {busy ? c.working : form.actionLabel[lang]}
        </button>
      </form>

      <section
        ref={resultRef}
        aria-labelledby={`${serviceId}-result`}
        aria-busy={busy || undefined}
        className={cx(PANEL, 'min-h-[320px] scroll-mt-4 flex-col p-4 sm:p-5', idle ? 'hidden lg:flex' : 'flex')}
      >
        <div className="flex min-h-[44px] flex-wrap items-center justify-between gap-2">
          <h2 id={`${serviceId}-result`} className="text-[16px] font-medium text-app-text">{c.result}</h2>
          {result && (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={handleCopy} className={OUTLINE_PILL}>
                {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
                {copied ? c.copied : c.copy}
              </button>
              <button type="button" onClick={handleDownload} className={OUTLINE_PILL}>
                <Download size={15} aria-hidden="true" />
                {c.download}
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-1 flex-col" aria-live="polite">
          {busy ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 py-10 text-app-muted">
              <Loader2 size={22} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
              <p className="text-[15px]">{c.working}</p>
            </div>
          ) : error ? (
            <div className="flex flex-1 flex-col items-start justify-center gap-4 py-6">
              <p role="alert" className="max-w-[60ch] whitespace-pre-wrap text-[16px] leading-[1.6] text-rose-300">{error}</p>
              {needsSignIn && (
                <Link href={signInPath(lang, { redirect: `/${lang}/services/${serviceId}` })} className={OUTLINE_PILL}>
                  <LogIn size={15} aria-hidden="true" />
                  {c.signIn}
                </Link>
              )}
            </div>
          ) : result?.kind === 'audio' ? (
            <div className="flex flex-1 items-center py-6">
              <audio controls className="w-full" src={result.url} />
            </div>
          ) : result ? (
            <ResultMarkdown text={result.text} />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 py-10 text-center">
              {cardImage && (
                <span className="relative block h-14 w-14 overflow-hidden rounded-2xl opacity-80 ring-1 ring-app-border/10">
                  <Image src={cardImage} alt="" fill sizes="56px" className="object-cover" />
                </span>
              )}
              <p className="max-w-[40ch] text-[15px] leading-[1.6] text-app-muted">{form.previewHint[lang]}</p>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

function FormField({ field, lang, value, onChange }: { field: WorkspaceField; lang: WorkspaceLang; value: string; onChange: (value: string) => void }) {
  const id = `field-${field.id}`
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-[14px] font-medium text-app-muted">{field.label[lang]}</label>
      {field.type === 'textarea' ? (
        <textarea
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={field.placeholder?.[lang]}
          rows={5}
          className={cx(FIELD, 'min-h-[132px] resize-y py-3 leading-[1.6]')}
        />
      ) : (
        <div className="relative">
          <select id={id} value={value} onChange={(event) => onChange(event.target.value)} className={cx(FIELD, 'h-12 cursor-pointer appearance-none pr-11')}>
            {field.options?.map((option) => (
              <option key={option.value} value={option.value} className="bg-app-surface text-app-text">{option.label[lang]}</option>
            ))}
          </select>
          <ChevronDown size={16} aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-app-muted" />
        </div>
      )}
    </div>
  )
}
