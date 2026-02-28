/**
 * Structured Logger
 * JSON to stdout — Vercel / Fly.io log aggregators parse this automatically.
 * Never import in client components ('use client' will break).
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogEntry {
  ts: string
  level: LogLevel
  event: string
  service: string
  data?: Record<string, unknown>
  trace_id?: string
}

/**
 * Emit a structured JSON log entry to stdout/stderr.
 * Vercel Functions, Fly.io, and most PaaS platforms auto-parse JSON lines.
 */
export function structuredLog(
  level: LogLevel,
  event: string,
  data?: Record<string, unknown>,
  traceId?: string
): void {
  const entry: LogEntry = {
    ts: new Date().toISOString(),
    level,
    event,
    service: process.env.SERVICE_NAME ?? 'myavatar-web',
    data,
    trace_id: traceId,
  }

  const json = JSON.stringify(entry)

  switch (level) {
    case 'debug':
      // eslint-disable-next-line no-console
      console.debug(json)
      break
    case 'info':
      // eslint-disable-next-line no-console
      console.log(json)
      break
    case 'warn':
      console.warn(json)
      break
    case 'error':
      console.error(json)
      break
  }
}

/**
 * Create a child logger with a fixed trace ID for request-scoped logging.
 */
export function createTraceLogger(traceId: string) {
  return {
    debug: (event: string, data?: Record<string, unknown>) =>
      structuredLog('debug', event, data, traceId),
    info: (event: string, data?: Record<string, unknown>) =>
      structuredLog('info', event, data, traceId),
    warn: (event: string, data?: Record<string, unknown>) =>
      structuredLog('warn', event, data, traceId),
    error: (event: string, data?: Record<string, unknown>) =>
      structuredLog('error', event, data, traceId),
  }
}
