'use client';
/**
 * components/chat/CodeRun.tsx — „გაშვება“ on a finished Python or JavaScript block in a chat reply (Agent G, Master Task
 * v2.0, Phase 3). Two taps, the same contract as every Agent G action that costs money:
 *
 *   Run    POST /api/agent/sandbox/run { action: 'quote' }: the server checks the code and signs the plan. The card
 *          shows what will happen (language, at most 60 s, no internet, free) with Start and Cancel. Nothing ran yet.
 *   Start  POST { action: 'run', request, token }: the plan exactly as signed, once. The card shows what it printed.
 *
 * The button exists only for a user the server says may run code (GET → { enabled }, asked once per page and only when
 * a runnable block is on screen), so a closed flag shows nothing at all. Output is shown as text, never as HTML.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Loader2, Play, Square } from 'lucide-react';

type Lang = 'ka' | 'en' | 'ru';
export type SandboxLang = 'python' | 'node';

/** The fence label → the sandbox language, or null when this block cannot be run. */
export function sandboxLanguageOf(fence: string): SandboxLang | null {
  const l = fence.trim().toLowerCase();
  if (l === 'python' || l === 'py' || l === 'python3') return 'python';
  if (l === 'javascript' || l === 'js' || l === 'node' || l === 'mjs' || l === 'nodejs') return 'node';
  return null;
}

// ─── Is it open to me? Asked once per page. ────────────────────────────────────

let enabled: boolean | null = null;
let asking = false;
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => { listeners.add(fn); return () => listeners.delete(fn); };
const snapshot = () => enabled === true;

function askEnabled(): void {
  if (enabled !== null || asking || typeof window === 'undefined') return;
  if (typeof fetch !== 'function') { enabled = false; return; }
  asking = true;
  void fetch('/api/agent/sandbox/run', { credentials: 'same-origin', cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : { enabled: false }))
    .then((j: { enabled?: unknown }) => { enabled = j?.enabled === true; })
    .catch(() => { enabled = false; })
    .finally(() => { asking = false; listeners.forEach((fn) => fn()); });
}

/** Tests only. */
export function __resetCodeRunForTests(value: boolean | null = null): void {
  enabled = value;
  asking = false;
}

export function useCodeRunEnabled(wanted: boolean): boolean {
  useEffect(() => { if (wanted) askEnabled(); }, [wanted]);
  return useSyncExternalStore(subscribe, snapshot, () => false);
}

// ─── The card ──────────────────────────────────────────────────────────────────

interface Quote { language: SandboxLang; wallSec: number; credits: number }
type State =
  | { phase: 'idle' }
  | { phase: 'quoting' }
  | { phase: 'quoted'; quote: Quote; request: unknown; token: string }
  | { phase: 'running'; t0: number }
  | { phase: 'done'; exitCode: number; stdout: string; stderr: string; wallMs: number }
  | { phase: 'failed'; error: string };

const L: Record<Lang, Record<string, string>> = {
  ka: {
    run: 'გაშვება', start: 'დაწყება', cancel: 'გაუქმება', checking: 'ვამოწმებ კოდს…', running: 'მუშაობს',
    plan: '{lang} · მაქსიმუმ {sec} წამი · ინტერნეტის გარეშე · უფასო', exit: 'დასრულდა, კოდი {code} · {sec} წმ',
    noOutput: 'პროგრამამ არაფერი დაბეჭდა.', again: 'ხელახლა',
  },
  en: {
    run: 'Run', start: 'Start', cancel: 'Cancel', checking: 'Checking the code…', running: 'Running',
    plan: '{lang} · at most {sec} s · no internet · free', exit: 'Finished, exit code {code} · {sec} s',
    noOutput: 'The program printed nothing.', again: 'Run again',
  },
  ru: {
    run: 'Запустить', start: 'Старт', cancel: 'Отмена', checking: 'Проверяю код…', running: 'Выполняется',
    plan: '{lang} · не больше {sec} с · без интернета · бесплатно', exit: 'Готово, код выхода {code} · {sec} с',
    noOutput: 'Программа ничего не вывела.', again: 'Ещё раз',
  },
};

const ERR: Record<Lang, Record<string, string>> = {
  ka: {
    bad_input: 'ეს კოდი ვერ გაეშვება (Python ან JavaScript, 64 KB-მდე).', quote_used: 'ეს გეგმა უკვე გაეშვა.',
    quote_expired: 'გეგმას ვადა გაუვიდა, დააჭირე „გაშვებას“ თავიდან.', quote_changed: 'კოდი შეიცვალა, დააჭირე „გაშვებას“ თავიდან.',
    timeout: 'პროგრამამ 60 წამს გადააჭარბა და გაჩერდა.', refused: 'სენდბოქსის ბიუჯეტი ამოიწურა.',
    sandbox_disabled: 'კოდის გაშვება ახლა გამორთულია.', guard_unavailable: 'ახლა ვერ ვამოწმებ განმეორებას, ცადე ერთ წუთში.',
    rate_limited: 'დღის ლიმიტი ამოიწურა, ცადე ხვალ.', too_fast: 'ძალიან სწრაფად, ცადე ერთ წუთში.', other: 'გაშვება ვერ მოხერხდა.',
  },
  en: {
    bad_input: 'This code cannot be run (Python or JavaScript, up to 64 KB).', quote_used: 'This plan already ran.',
    quote_expired: 'The plan expired; press Run again.', quote_changed: 'The code changed; press Run again.',
    timeout: 'The program ran past 60 seconds and was stopped.', refused: 'The sandbox budget is used up.',
    sandbox_disabled: 'Running code is switched off right now.', guard_unavailable: 'The duplicate check is unavailable; try again in a minute.',
    rate_limited: 'Today\'s limit is reached; try again tomorrow.', too_fast: 'Too many runs at once; try again in a minute.', other: 'The run failed.',
  },
  ru: {
    bad_input: 'Этот код нельзя запустить (Python или JavaScript, до 64 КБ).', quote_used: 'Этот план уже выполнен.',
    quote_expired: 'План устарел, нажмите «Запустить» ещё раз.', quote_changed: 'Код изменился, нажмите «Запустить» ещё раз.',
    timeout: 'Программа работала дольше 60 секунд и остановлена.', refused: 'Бюджет песочницы исчерпан.',
    sandbox_disabled: 'Запуск кода сейчас выключен.', guard_unavailable: 'Проверка повторов недоступна, попробуйте через минуту.',
    rate_limited: 'Дневной лимит исчерпан, попробуйте завтра.', too_fast: 'Слишком часто, попробуйте через минуту.', other: 'Запуск не удался.',
  },
};

const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ''));

export function codeRunErrorText(code: string, locale: Lang): string {
  return ERR[locale][code] ?? ERR[locale].other!;
}

async function post(body: unknown, signal?: AbortSignal): Promise<{ status: number; json: Record<string, unknown> }> {
  const r = await fetch('/api/agent/sandbox/run', {
    method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), ...(signal ? { signal } : {}),
  });
  const json = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: r.status, json };
}

/** A 429 is the daily cap only when it says to wait more than an hour; a per-minute refusal is "too fast". */
export const errorOf = (status: number, json: Record<string, unknown>) =>
  status === 429
    ? (typeof json.retryAfter === 'number' && json.retryAfter > 3600 ? 'rate_limited' : 'too_fast')
    : typeof json.error === 'string' ? json.error : 'other';

const BTN = 'flex h-11 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[13px] text-app-muted transition-colors hover:bg-app-border/10 hover:text-app-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60 disabled:opacity-50 [@media(pointer:fine)]:h-8';

/** The header button and the card under the code (both null when `language` is null). `code` is read when Run is pressed. */
export function useCodeRun(language: SandboxLang | null, readCode: () => string, locale: Lang) {
  const [state, setState] = useState<State>({ phase: 'idle' });
  const abort = useRef<AbortController | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => {
    if (state.phase !== 'running') return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [state.phase]);

  const quote = useCallback(async () => {
    if (!language) return;
    setState({ phase: 'quoting' });
    try {
      const { status, json } = await post({ action: 'quote', request: { language, code: readCode() } });
      if (json.ok === true && typeof json.token === 'string') {
        setState({ phase: 'quoted', quote: json.quote as Quote, request: json.request, token: json.token });
      } else setState({ phase: 'failed', error: errorOf(status, json) });
    } catch {
      setState({ phase: 'failed', error: 'other' });
    }
  }, [language, readCode]);

  const start = useCallback(async () => {
    if (state.phase !== 'quoted') return;
    const { request, token } = state;
    const ac = new AbortController();
    abort.current = ac;
    setState({ phase: 'running', t0: Date.now() });
    try {
      const { status, json } = await post({ action: 'run', request, token }, ac.signal);
      if (json.ok === true) {
        setState({
          phase: 'done', exitCode: Number(json.exitCode), stdout: String(json.stdout ?? ''), stderr: String(json.stderr ?? ''), wallMs: Number(json.wallMs) || 0,
        });
      } else setState({ phase: 'failed', error: errorOf(status, json) });
    } catch {
      setState({ phase: 'failed', error: ac.signal.aborted ? 'cancelled' : 'other' });
    }
  }, [state]);

  if (!language) return { button: null, card: null };
  const t = L[locale];
  const busy = state.phase === 'quoting' || state.phase === 'running';
  const button = (
    <button type="button" onClick={() => void quote()} disabled={busy || state.phase === 'quoted'} aria-label={t.run} title={t.run} data-code-run="" className={BTN}>
      {busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Play size={14} aria-hidden />}
      <span className="hidden sm:inline">{state.phase === 'done' || state.phase === 'failed' ? t.again : t.run}</span>
    </button>
  );

  const card = state.phase === 'idle' ? null : (
    <div className="border-t border-app-border/10 px-4 py-3 text-[14px]" data-code-run-card={state.phase} aria-live="polite">
      {state.phase === 'quoting' && <p className="text-app-muted">{t.checking}</p>}
      {state.phase === 'quoted' && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-app-text">{fill(t.plan!, { lang: state.quote.language === 'python' ? 'Python' : 'JavaScript', sec: state.quote.wallSec })}</p>
          <span className="flex items-center gap-1">
            <button type="button" onClick={() => setState({ phase: 'idle' })} className={BTN}>{t.cancel}</button>
            <button type="button" onClick={() => void start()} data-code-run-start="" className="flex h-11 items-center gap-1.5 rounded-full bg-app-accent px-4 text-[13px] font-medium text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60 [@media(pointer:fine)]:h-8">
              <Play size={14} aria-hidden />{t.start}
            </button>
          </span>
        </div>
      )}
      {state.phase === 'running' && (
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-app-muted"><Loader2 size={14} className="animate-spin" aria-hidden />{t.running} · {Math.max(0, Math.floor((now - state.t0) / 1000))} s</p>
          <button type="button" onClick={() => abort.current?.abort()} className={BTN} aria-label={t.cancel}><Square size={14} aria-hidden /></button>
        </div>
      )}
      {state.phase === 'done' && (
        <div className="space-y-2">
          <p className="text-[12px] text-app-muted">{fill(t.exit!, { code: state.exitCode, sec: (state.wallMs / 1000).toFixed(1) })}</p>
          {state.stdout && <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-black/30 p-3 text-[13px] text-app-text" data-code-run-stdout="">{state.stdout}</pre>}
          {state.stderr && <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-black/30 p-3 text-[13px] text-app-danger" data-code-run-stderr="">{state.stderr}</pre>}
          {!state.stdout && !state.stderr && <p className="text-app-muted">{t.noOutput}</p>}
        </div>
      )}
      {state.phase === 'failed' && <p className="text-app-danger">{codeRunErrorText(state.error, locale)}</p>}
    </div>
  );
  return { button, card };
}
