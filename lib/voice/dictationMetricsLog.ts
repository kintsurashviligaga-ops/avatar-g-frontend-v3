/**
 * lib/voice/dictationMetricsLog.ts — the server side of the dictation metrics (app/api/voice/dictation-metrics): the
 * device family of a summary and the log line it becomes. Kept out of the route file, which may export only handlers.
 */

/** Where a summary line goes (the server log). A field, so a test can read what would be logged. */
export const metricsLog = {
  // eslint-disable-next-line no-console
  write: (line: string): void => { console.info('[dictation-metrics]', line); },
};

export type DevicePlatform = 'ios' | 'android' | 'mac' | 'windows' | 'linux' | 'other';

/** The device family a latency belongs to (an iPhone and a desktop are different products). */
export function platformOf(ua: string | null): DevicePlatform {
  const s = ua ?? '';
  if (/iPhone|iPad|iPod/.test(s)) return 'ios';
  if (/Android/.test(s)) return 'android';
  if (/Macintosh|Mac OS X/.test(s)) return 'mac';
  if (/Windows/.test(s)) return 'windows';
  if (/Linux|X11/.test(s)) return 'linux';
  return 'other';
}
