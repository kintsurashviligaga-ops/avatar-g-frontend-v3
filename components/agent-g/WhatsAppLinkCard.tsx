'use client';
/**
 * WhatsAppLinkCard — link your WhatsApp number to Agent G, see that it is linked, choose alerts, unlink.
 * Rendered in Settings (#whatsapp — the page Agent G's WhatsApp replies point to) and by the Connectors hub, which
 * imports it by this exact name and path.
 *
 * The link is made FROM WhatsApp: "Get code" mints a one-time code (15 min) and "Open WhatsApp" opens the chat with
 * Agent G with `connect CODE` already typed. The card then checks every few seconds until the webhook has bound the
 * number. It never asks for a phone number — a typed number proves nothing (see lib/agent-g/channels/whatsapp-link.ts).
 *
 * Honest states only: "opening soon" while the deployment lacks the keys or the tables, "sign in" for a guest. No
 * button is drawn that cannot work.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Bell, BellOff, Check, Copy, Loader2, MessageCircle, Unlink } from 'lucide-react';

type Lang = 'ka' | 'en' | 'ru';

interface LinkState {
  guest: boolean;
  configured: boolean;
  available: boolean;
  linked: { number: string; linked_at: string | null; alerts: boolean } | null;
}

interface Minted {
  code: string;
  command: string;
  expires_at: string;
  wa_link: string | null;
}

const COPY: Record<Lang, {
  title: string; sub: string; soon: string; guest: string; getCode: string; open: string; orSend: string;
  validFor: string; waiting: string; check: string; linkedAs: string; alerts: string; alertsHint: string;
  unlink: string; unlinkConfirm: string; cancel: string; failed: string; copied: string; copy: string; expired: string;
}> = {
  ka: {
    title: 'WhatsApp', sub: 'მიწერე Agent G-ს WhatsApp-ზე და მიიღე შეტყობინება, როცა შედეგი მზად იქნება.',
    soon: 'WhatsApp-ზე Agent G მალე ჩაირთვება.', guest: 'WhatsApp-ის დასაკავშირებლად შედი ანგარიშზე.',
    getCode: 'კოდის მიღება', open: 'WhatsApp-ის გახსნა', orSend: 'ან Agent G-ს WhatsApp-ზე გაუგზავნე:',
    validFor: 'კოდი 15 წუთი მოქმედებს.', waiting: 'ველოდები შენს შეტყობინებას…', check: 'შემოწმება',
    linkedAs: 'დაკავშირებულია', alerts: 'შეტყობინებები WhatsApp-ზე', alertsHint: 'ვიდეო, სურათი, მუსიკა და კვლევა მზადაა',
    unlink: 'გათიშვა', unlinkConfirm: 'გავთიშო?', cancel: 'გაუქმება', failed: 'ვერ მოხერხდა. სცადე თავიდან.',
    copied: 'დაკოპირდა', copy: 'კოპირება', expired: 'კოდს ვადა გაუვიდა — აიღე ახალი.',
  },
  en: {
    title: 'WhatsApp', sub: 'Chat with Agent G on WhatsApp and get a message when your result is ready.',
    soon: 'Agent G on WhatsApp is opening soon.', guest: 'Sign in to link WhatsApp.',
    getCode: 'Get code', open: 'Open WhatsApp', orSend: 'Or send this to Agent G on WhatsApp:',
    validFor: 'The code is valid for 15 minutes.', waiting: 'Waiting for your message…', check: 'Check',
    linkedAs: 'Linked', alerts: 'WhatsApp alerts', alertsHint: 'Video, image, music and research ready',
    unlink: 'Unlink', unlinkConfirm: 'Unlink this number?', cancel: 'Cancel', failed: 'That did not work. Try again.',
    copied: 'Copied', copy: 'Copy', expired: 'The code has expired — get a new one.',
  },
  ru: {
    title: 'WhatsApp', sub: 'Пиши Agent G в WhatsApp и получай сообщение, когда результат готов.',
    soon: 'Agent G в WhatsApp скоро заработает.', guest: 'Войдите, чтобы привязать WhatsApp.',
    getCode: 'Получить код', open: 'Открыть WhatsApp', orSend: 'Или отправь Agent G в WhatsApp:',
    validFor: 'Код действует 15 минут.', waiting: 'Жду твоё сообщение…', check: 'Проверить',
    linkedAs: 'Привязан', alerts: 'Уведомления в WhatsApp', alertsHint: 'Видео, изображение, музыка и исследование готовы',
    unlink: 'Отвязать', unlinkConfirm: 'Отвязать номер?', cancel: 'Отмена', failed: 'Не получилось. Попробуй ещё раз.',
    copied: 'Скопировано', copy: 'Копировать', expired: 'Срок кода истёк — получи новый.',
  },
};

const langOf = (l: string | null | undefined): Lang => (l === 'en' || l === 'ru' ? l : 'ka');

const POLL_MS = 4_000;
const POLL_FOR_MS = 3 * 60_000;

async function readState(): Promise<LinkState | null> {
  try {
    const r = await fetch('/api/agent-g/whatsapp/link', { credentials: 'include', cache: 'no-store' });
    if (!r.ok) return null;
    const j = (await r.json()) as { data?: LinkState };
    return j.data ?? null;
  } catch {
    return null;
  }
}

export function WhatsAppLinkCard({ locale }: { locale?: string } = {}) {
  const pathname = usePathname();
  const lang = langOf(locale ?? pathname?.split('/')[1]);
  const t = COPY[lang];

  const [state, setState] = useState<LinkState | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [minted, setMinted] = useState<Minted | null>(null);
  const [busy, setBusy] = useState<'code' | 'alerts' | 'unlink' | null>(null);
  const [error, setError] = useState(false);
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const [copied, setCopied] = useState(false);
  const [polling, setPolling] = useState(false);
  const pollUntil = useRef(0);

  const refresh = useCallback(async () => {
    const s = await readState();
    if (s) {
      setState(s);
      setLoadFailed(false);
      if (s.linked) {
        setMinted(null);
        setPolling(false);
      }
    } else {
      setLoadFailed(true);
    }
    return s;
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  // After a code is shown, look for the link every few seconds for a while — the person is in WhatsApp sending it.
  useEffect(() => {
    if (!polling) return;
    const id = window.setInterval(() => {
      if (Date.now() > pollUntil.current) { setPolling(false); return; }
      void refresh();
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [polling, refresh]);

  const getCode = async () => {
    setBusy('code');
    setError(false);
    try {
      const r = await fetch('/api/agent-g/whatsapp/link', { method: 'POST', credentials: 'include' });
      const j = (await r.json().catch(() => ({}))) as { data?: Minted };
      if (!r.ok || !j.data) throw new Error('mint failed');
      setMinted(j.data);
      pollUntil.current = Date.now() + POLL_FOR_MS;
      setPolling(true);
    } catch {
      setError(true);
    } finally {
      setBusy(null);
    }
  };

  const setAlerts = async (alerts: boolean) => {
    if (!state?.linked) return;
    setBusy('alerts');
    setError(false);
    const previous = state;
    setState({ ...state, linked: { ...state.linked, alerts } });
    try {
      const r = await fetch('/api/agent-g/whatsapp/link', {
        method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ alerts }),
      });
      if (!r.ok) throw new Error('patch failed');
    } catch {
      setState(previous);
      setError(true);
    } finally {
      setBusy(null);
    }
  };

  const doUnlink = async () => {
    setBusy('unlink');
    setError(false);
    try {
      const r = await fetch('/api/agent-g/whatsapp/link', { method: 'DELETE', credentials: 'include' });
      if (!r.ok) throw new Error('unlink failed');
      setConfirmUnlink(false);
      await refresh();
    } catch {
      setError(true);
    } finally {
      setBusy(null);
    }
  };

  const copyCommand = async () => {
    if (!minted) return;
    try {
      await navigator.clipboard.writeText(minted.command);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard refused — the command is on screen to type */ }
  };

  const expired = minted ? Date.parse(minted.expires_at) < Date.now() : false;

  return (
    <section
      id="whatsapp"
      data-testid="whatsapp-link-card"
      className="scroll-mt-24 rounded-2xl bg-app-elevated/60 p-5 ring-1 ring-app-border/40 backdrop-blur-sm md:p-6"
    >
      <header className="mb-4 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 ring-1 ring-emerald-500/25">
          <MessageCircle size={16} className="text-emerald-400" />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight md:text-lg">{t.title}</h2>
          <p className="mt-0.5 text-xs text-app-muted md:text-sm">{t.sub}</p>
        </div>
      </header>

      {!state && !loadFailed && <Loader2 size={16} className="animate-spin text-app-muted" aria-hidden />}
      {!state && loadFailed && <p className="text-sm text-app-muted">{t.soon}</p>}

      {state && !state.available && <p className="text-sm text-app-muted" data-testid="wa-soon">{t.soon}</p>}
      {state && state.available && state.guest && <p className="text-sm text-app-muted" data-testid="wa-guest">{t.guest}</p>}

      {state && state.available && !state.guest && state.linked && (
        <div className="space-y-4" data-testid="wa-linked">
          <div className="flex items-center gap-2 text-sm">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
            <span className="font-medium">{t.linkedAs}</span>
            <span className="text-app-muted tabular-nums">{state.linked.number}</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-medium">
                {state.linked.alerts ? <Bell size={14} /> : <BellOff size={14} className="text-app-muted" />}
                {t.alerts}
              </div>
              <div className="mt-0.5 text-xs text-app-muted">{t.alertsHint}</div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={state.linked.alerts}
              aria-label={t.alerts}
              disabled={busy === 'alerts'}
              onClick={() => void setAlerts(!state.linked?.alerts)}
              className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60 disabled:opacity-60 ${state.linked.alerts ? 'bg-app-accent' : 'bg-app-bg ring-1 ring-app-border/60'}`}
            >
              <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${state.linked.alerts ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
          {confirmUnlink ? (
            <div className="flex items-center gap-2">
              <span className="text-sm">{t.unlinkConfirm}</span>
              <button type="button" onClick={() => void doUnlink()} disabled={busy === 'unlink'} className="inline-flex items-center gap-1.5 rounded-full bg-red-500/90 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60">
                {busy === 'unlink' ? <Loader2 size={12} className="animate-spin" /> : <Unlink size={12} />}{t.unlink}
              </button>
              <button type="button" onClick={() => setConfirmUnlink(false)} className="rounded-full px-3 py-1.5 text-xs text-app-muted hover:text-app-text">{t.cancel}</button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmUnlink(true)} className="inline-flex items-center gap-1.5 text-xs text-app-muted transition-colors hover:text-red-400">
              <Unlink size={12} />{t.unlink}
            </button>
          )}
        </div>
      )}

      {state && state.available && !state.guest && !state.linked && (
        <div className="space-y-3" data-testid="wa-unlinked">
          {!minted || expired ? (
            <>
              {expired && <p className="text-xs text-app-muted">{t.expired}</p>}
              <button
                type="button"
                onClick={() => void getCode()}
                disabled={busy === 'code'}
                className="inline-flex items-center gap-2 rounded-full bg-app-accent px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {busy === 'code' && <Loader2 size={14} className="animate-spin" />}
                {t.getCode}
              </button>
            </>
          ) : (
            <>
              {minted.wa_link && (
                <a
                  href={minted.wa_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                >
                  <MessageCircle size={14} />{t.open}
                </a>
              )}
              <div className="text-xs text-app-muted">{t.orSend}</div>
              <div className="flex items-center gap-2">
                <code className="rounded-lg bg-app-bg px-3 py-2 font-mono text-base tracking-wider ring-1 ring-app-border/60" data-testid="wa-command">{minted.command}</code>
                <button type="button" onClick={() => void copyCommand()} aria-label={t.copy} className="rounded-full p-2 text-app-muted transition-colors hover:text-app-text">
                  {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                </button>
              </div>
              <div className="flex items-center gap-2 text-xs text-app-muted">
                {polling ? <Loader2 size={12} className="animate-spin" /> : null}
                <span>{polling ? t.waiting : t.validFor}</span>
                {!polling && (
                  <button
                    type="button"
                    onClick={() => { pollUntil.current = Date.now() + POLL_FOR_MS; setPolling(true); void refresh(); }}
                    className="font-medium text-app-text underline-offset-2 hover:underline"
                  >
                    {t.check}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {error && <p className="mt-3 text-xs text-red-400" role="alert">{t.failed}</p>}
    </section>
  );
}
