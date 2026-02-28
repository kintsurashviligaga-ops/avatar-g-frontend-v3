/**
 * Worker Structured Logger
 * JSON to stdout — log aggregators (Fly.io, Docker) parse automatically.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogEntry {
  ts: string
  level: LogLevel
  event: string
  service: string
  worker_id?: string
  data?: Record<string, unknown>
}

export function structuredLog(
  level: LogLevel,
  event: string,
  data?: Record<string, unknown>
): void {
  const entry: LogEntry = {
    ts: new Date().toISOString(),
    level,
    event,
    service: process.env.SERVICE_NAME ?? 'myavatar-worker',
    worker_id: process.env.WORKER_ID,
    data,
  }

  const json = JSON.stringify(entry)

  switch (level) {
    case 'debug':
      console.debug(json)
      break
    case 'info':
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
