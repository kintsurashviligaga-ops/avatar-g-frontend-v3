'use client';
/**
 * PushPermissionCard — turn Web Push on or off for THIS browser, and send yourself a test. The Connectors / Plugins hub
 * imports it by this exact name and path.
 *
 * It only ever shows what is true here: "not supported in this browser", "on iPhone, add the app to the Home Screen
 * first" (iOS offers push only to installed web apps), "blocked — change it in the browser settings", "not available on
 * this site yet" (no VAPID keys or no table — GET /api/push/public-key), off, or on.
 *
 * ⚠️ The permission prompt appears ONLY from the "Turn on" press — never on mount. Browsers quietly block (Chrome) or
 * reject (Firefox, Safari) prompts without a user gesture, and an unasked-for prompt teaches people to press "Block".
 *
 * Locale: the `locale` prop, else the route's [locale] segment, else Georgian.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { Bell, BellOff, BellRing, Loader2, Send } from 'lucide-react';
import { asCardLocale, pushCopy, type PushCardLocale } from './pushCopy';
import {
  base64UrlToBytes,
  currentSubscription,
  detectPushSupport,
  fetchPushKey,
  readyRegistration,
  removeSubscription,
  requestNotificationPermission,
  saveSubscription,
  sendTestPush,
  subscribedWithKey,
} from './pushClient';

export type PushCardView = 'checking' | 'unsupported' | 'in_app' | 'ios_install' | 'unavailable' | 'blocked' | 'off' | 'on';

type Note = { tone: 'ok' | 'error'; text: string } | null;

const btn =
  'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full px-4 text-[13px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent disabled:opacity-50';

export function PushPermissionCard({ locale: localeProp, className = '' }: { locale?: string; className?: string } = {}) {
  const params = useParams() as { locale?: string | string[] } | null;
  const routeLocale = Array.isArray(params?.locale) ? params?.locale[0] : params?.locale;
  const locale: PushCardLocale = asCardLocale(localeProp ?? routeLocale);
  const c = pushCopy(locale);

  const [view, setView] = useState<PushCardView>('checking');
  const [busy, setBusy] = useState<null | 'on' | 'off' | 'test'>(null);
  const [note, setNote] = useState<Note>(null);
  const keyRef = useRef<Uint8Array | null>(null);

  // What is true on this device right now. No prompt, no subscribe — only reads (and a re-registration of a subscription
  // that already exists, so a shared browser follows whoever is signed in now).
  useEffect(() => {
    let alive = true;
    const set = (v: PushCardView) => { if (alive) setView(v); };
    (async () => {
      const support = detectPushSupport();
      if (support !== 'supported') return set(support);
      const key = await fetchPushKey();
      if (!key?.available || !key.publicKey) return set('unavailable');
      keyRef.current = base64UrlToBytes(key.publicKey);
      if (Notification.permission === 'denied') return set('blocked');

      let sub = await currentSubscription();
      if (sub && !subscribedWithKey(sub, keyRef.current)) {
        // Made with a key we no longer hold: it can never be delivered to again. Drop it; "Turn on" makes a fresh one.
        await sub.unsubscribe().catch(() => false);
        sub = null;
      }
      if (!sub || Notification.permission !== 'granted') return set('off');
      const synced = await saveSubscription(sub, locale);
      if (synced.status === 401) {
        if (alive) setNote({ tone: 'error', text: c.signedOut });
        return set('off');
      }
      set('on');
    })().catch(() => set('unsupported'));
    return () => { alive = false; };
    // Runs once per mount (and when the language changes): it reflects the device, not the render.
  }, [locale]); // eslint-disable-line react-hooks/exhaustive-deps

  const failNote = useCallback((status: number): Note => {
    if (status === 401) return { tone: 'error', text: c.signedOut };
    if (status === 429) return { tone: 'error', text: c.rateLimited };
    return { tone: 'error', text: c.failed };
  }, [c]);

  const turnOn = async () => {
    setBusy('on');
    setNote(null);
    try {
      // ⚠️ The prompt must be the FIRST await of the press: Safari forgets the gesture across any earlier await.
      let permission = Notification.permission;
      if (permission === 'default') permission = await requestNotificationPermission();
      if (permission === 'denied') return setView('blocked');
      if (permission !== 'granted') return setNote({ tone: 'error', text: c.dismissed });
      const key = keyRef.current;
      if (!key) return setView('unavailable');

      const reg = await readyRegistration();
      let sub = await reg.pushManager.getSubscription();
      if (sub && !subscribedWithKey(sub, key)) {
        await sub.unsubscribe().catch(() => false);
        sub = null;
      }
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key as BufferSource });

      const saved = await saveSubscription(sub, locale);
      if (!saved.ok) {
        // The browser and the server must agree: a subscription the server does not know would show "on" and never ring.
        await sub.unsubscribe().catch(() => false);
        if (saved.status === 503) return setView('unavailable');
        return setNote(failNote(saved.status));
      }
      setView('on');
      setNote({ tone: 'ok', text: c.turnedOn });
    } catch {
      setNote({ tone: 'error', text: c.failed });
    } finally {
      setBusy(null);
    }
  };

  const turnOff = async () => {
    setBusy('off');
    setNote(null);
    try {
      const sub = await currentSubscription();
      if (sub) {
        // Server first (best-effort), then the browser: if the server call fails, the next send gets a 410 and prunes it.
        await removeSubscription(sub.endpoint);
        await sub.unsubscribe().catch(() => false);
      }
      setView('off');
    } catch {
      setNote({ tone: 'error', text: c.failed });
    } finally {
      setBusy(null);
    }
  };

  const test = async () => {
    setBusy('test');
    setNote(null);
    try {
      const r = await sendTestPush(locale);
      if (r.status === 503) return setView('unavailable');
      if (!r.ok) return setNote(failNote(r.status));
      if (r.data?.sent) return setNote({ tone: 'ok', text: c.testSent });
      if (r.data?.reason === 'not_linked') return setNote({ tone: 'error', text: c.testNoDevice });
      setNote({ tone: 'error', text: c.failed });
    } finally {
      setBusy(null);
    }
  };

  const status: Record<PushCardView, string> = {
    checking: c.checking,
    unsupported: c.unsupported,
    in_app: c.inApp,
    ios_install: c.iosInstall,
    unavailable: c.unavailable,
    blocked: c.blocked,
    off: c.off,
    on: c.on,
  };
  const Icon = view === 'on' ? BellRing : view === 'off' || view === 'checking' ? Bell : BellOff;
  const spin = <Loader2 size={15} className="motion-safe:animate-spin" aria-hidden="true" />;

  return (
    <section
      className={`w-full rounded-2xl border border-app-border/15 bg-app-elevated/40 p-3.5 ${className}`}
      data-testid="push-permission-card"
      data-state={view}
      aria-labelledby="push-card-title"
      aria-busy={view === 'checking' || busy !== null}
    >
      <div className="flex items-start gap-3">
        <span
          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${view === 'on' ? 'bg-app-accent/15 text-app-accent' : 'bg-app-border/15 text-app-muted'}`}
          aria-hidden="true"
        >
          <Icon size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 id="push-card-title" className="text-[14px] font-semibold text-app-text">{c.title}</h3>
          <p className="mt-0.5 text-[12.5px] leading-snug text-app-muted">{c.description}</p>
          <p className="mt-2 text-[13px] leading-snug text-app-text/90" role="status">{status[view]}</p>

          {view === 'off' && (
            <div className="mt-2.5 flex flex-wrap gap-2">
              <button type="button" className={`${btn} bg-app-accent text-app-bg hover:opacity-90`} onClick={turnOn} disabled={busy !== null}>
                {busy === 'on' ? spin : <Bell size={15} aria-hidden="true" />}
                {c.turnOn}
              </button>
            </div>
          )}
          {view === 'on' && (
            <div className="mt-2.5 flex flex-wrap gap-2">
              <button type="button" className={`${btn} bg-app-accent text-app-bg hover:opacity-90`} onClick={test} disabled={busy !== null}>
                {busy === 'test' ? spin : <Send size={15} aria-hidden="true" />}
                {c.sendTest}
              </button>
              <button type="button" className={`${btn} border border-app-border/25 text-app-text hover:bg-app-elevated`} onClick={turnOff} disabled={busy !== null}>
                {busy === 'off' ? spin : <BellOff size={15} aria-hidden="true" />}
                {c.turnOff}
              </button>
            </div>
          )}
          {note && (
            <p
              className={`mt-2 text-[12.5px] leading-snug ${note.tone === 'ok' ? 'text-app-success' : 'text-app-danger'}`}
              role={note.tone === 'error' ? 'alert' : 'status'}
              data-testid="push-card-note"
            >
              {note.text}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
