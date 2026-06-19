// Master Prompt §15 — structured logging with a correlationId (jobId). Dependency-free
// (no pino) so it runs unmodified on Vercel serverless; every line is JSON for ingestion.
type Fields = Record<string, unknown>;

function emit(level: 'info' | 'warn' | 'error', fields: Fields, msg: string): void {
  try {
    // eslint-disable-next-line no-console
    console[level](JSON.stringify({ level, ts: new Date().toISOString(), msg, ...fields }));
  } catch {
    // eslint-disable-next-line no-console
    console[level](msg);
  }
}

export const logger = {
  info: (fields: Fields, msg: string) => emit('info', fields, msg),
  warn: (fields: Fields, msg: string) => emit('warn', fields, msg),
  error: (fields: Fields, msg: string) => emit('error', fields, msg),
};

/** Emit a correlated lifecycle/analytics event (§15 table). */
export function track(event: string, jobId: string, props: Fields = {}): void {
  emit('info', { event, jobId, ...props }, `event:${event}`);
}
