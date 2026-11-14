'use client';

/**
 * components/agent/BrowserLoginSheet.tsx — log in to a site inside Agent G's cloud browser (/api/agent/browser/login).
 * The person sees the site live, taps on the picture to click, types into the box below, and presses Save; from then on
 * Agent G's tasks that start on that site run logged in. The list on top shows the saved sites, each with Forget.
 *
 * What is typed goes straight into the page in the cloud browser; we keep only the site's login cookies, sealed, for
 * 30 days (lib/agent/browser/sessionVault). The picture is never saved.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ChevronDown, ChevronUp, CornerDownLeft, Delete, Eye, EyeOff, Loader2, Trash2 } from 'lucide-react';
import { BottomSheet } from '@/components/studio/ui/BottomSheet';

type Lang = 'ka' | 'en' | 'ru';
const T = {
  ka: {
    title: 'საიტზე შესვლა', close: 'დახურვა', saved: 'შენახული შესვლები', none: 'ჯერ არცერთი.', forget: 'წაშლა',
    url: 'საიტის მისამართი', open: 'გახსნა', opening: 'ბრაუზერი იხსნება…', type: 'ჩაწერეთ აქ', send: 'ჩაწერა',
    save: 'შენახვა', cancel: 'გაუქმება', saving: 'ინახება…', done: (s: string) => `შესვლა შენახულია: ${s}. Agent G ამ საიტზე შესული იმუშავებს.`,
    tap: 'დააჭირეთ სურათს, რომ დააკლიკოთ. ტექსტი ქვემოთ ჩაწერეთ.', hide: 'დამალვა', show: 'ჩვენება', back: 'უკან', up: 'ზემოთ', down: 'ქვემოთ',
    note: 'პაროლს არ ვინახავთ. ვინახავთ მხოლოდ ამ საიტის შესვლის ქუქიებს, დაშიფრულად, 30 დღით.',
  },
  en: {
    title: 'Log in to a site', close: 'Close', saved: 'Saved logins', none: 'None yet.', forget: 'Forget',
    url: 'Site address', open: 'Open', opening: 'Opening the browser…', type: 'Type here', send: 'Type',
    save: 'Save', cancel: 'Cancel', saving: 'Saving…', done: (s: string) => `Login saved for ${s}. Agent G will work there logged in.`,
    tap: 'Tap the picture to click. Type below.', hide: 'Hide', show: 'Show', back: 'Back', up: 'Up', down: 'Down',
    note: 'We never keep your password. Only this site’s login cookies are kept, encrypted, for 30 days.',
  },
  ru: {
    title: 'Вход на сайт', close: 'Закрыть', saved: 'Сохранённые входы', none: 'Пока нет.', forget: 'Удалить',
    url: 'Адрес сайта', open: 'Открыть', opening: 'Браузер открывается…', type: 'Пишите здесь', send: 'Ввести',
    save: 'Сохранить', cancel: 'Отмена', saving: 'Сохраняю…', done: (s: string) => `Вход сохранён: ${s}. Agent G будет работать там с входом.`,
    tap: 'Нажмите на картинку, чтобы кликнуть. Текст пишите ниже.', hide: 'Скрыть', show: 'Показать', back: 'Назад', up: 'Вверх', down: 'Вниз',
    note: 'Пароль мы не храним. Храним только cookies входа этого сайта, зашифрованно, 30 дней.',
  },
} as const;

const API = '/api/agent/browser/login';
const VIEW = { w: 1280, h: 800 };

async function post(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  return r.ok ? j : { ok: false, message: typeof j.message === 'string' ? j.message : `HTTP ${r.status}` };
}

/** Where a tap on the shown picture lands in the 1280×800 page. */
export function tapToPage(tapX: number, tapY: number, box: { width: number; height: number }): { x: number; y: number } {
  const x = Math.round((tapX / Math.max(1, box.width)) * VIEW.w);
  const y = Math.round((tapY / Math.max(1, box.height)) * VIEW.h);
  return { x: Math.min(VIEW.w - 1, Math.max(0, x)), y: Math.min(VIEW.h - 1, Math.max(0, y)) };
}

export function BrowserLoginSheet({ open, onClose, locale }: { open: boolean; onClose: () => void; locale: string }) {
  const lang: Lang = locale === 'en' || locale === 'ru' ? locale : 'ka';
  const t = T[lang];
  const [sites, setSites] = useState<Array<{ site: string; savedAt: number }>>([]);
  const [url, setUrl] = useState('');
  const [pass, setPass] = useState<string | null>(null);
  const [busy, setBusy] = useState<'' | 'start' | 'save'>('');
  const [frame, setFrame] = useState<{ jpeg?: string; url?: string; title?: string; error?: string | null } | null>(null);
  const [text, setText] = useState('');
  const [masked, setMasked] = useState(true);
  const [msg, setMsg] = useState('');
  const passRef = useRef<string | null>(null);
  passRef.current = pass;

  const loadSites = useCallback(async () => {
    const r = await fetch(API, { cache: 'no-store' }).then((x) => x.json()).catch(() => null) as { sites?: Array<{ site: string; savedAt: number }> } | null;
    setSites(Array.isArray(r?.sites) ? r.sites : []);
  }, []);
  useEffect(() => { if (open) void loadSites(); }, [open, loadSites]);

  // The live picture, about once a second while a login window is open.
  useEffect(() => {
    if (!pass) return;
    let live = true;
    const tick = async () => {
      const r = await post({ action: 'frame', pass });
      if (!live) return;
      if (r.ok) setFrame({ jpeg: r.jpeg as string | undefined, url: r.url as string, title: r.title as string, error: (r.error as string | null) ?? null });
      else { setMsg(String(r.message ?? '')); setPass(null); }
    };
    void tick();
    const id = setInterval(tick, 1000);
    return () => { live = false; clearInterval(id); };
  }, [pass]);

  // Closing the sheet with a window open closes the cloud browser too.
  const close = () => {
    if (passRef.current) void post({ action: 'cancel', pass: passRef.current });
    setPass(null); setFrame(null); setMsg(''); setText('');
    onClose();
  };

  const start = async () => {
    setBusy('start'); setMsg('');
    const href = /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
    const r = await post({ action: 'start', url: href });
    setBusy('');
    if (r.ok && typeof r.pass === 'string') { setPass(r.pass); setFrame(null); } else setMsg(String(r.message ?? ''));
  };
  const act = (input: Record<string, unknown>) => { if (pass) void post({ action: 'act', pass, input }); };
  const save = async () => {
    if (!pass) return;
    setBusy('save');
    const r = await post({ action: 'save', pass });
    setBusy(''); setPass(null); setFrame(null);
    setMsg(r.ok ? t.done(String(r.site ?? '')) : String(r.message ?? ''));
    void loadSites();
  };
  const cancel = () => { if (pass) void post({ action: 'cancel', pass }); setPass(null); setFrame(null); };
  const forget = async (site: string) => { await post({ action: 'forget', site }); void loadSites(); };

  const btn = 'inline-flex min-h-[40px] items-center justify-center gap-1 rounded-xl px-3 text-[14px]';
  return (
    <BottomSheet open={open} onClose={close} title={t.title} closeLabel={t.close} testId="browser-login-sheet">
      {!pass && (
        <div className="flex flex-col gap-3">
          <p className="text-[13px] text-app-muted">{t.note}</p>
          <div>
            <div className="mb-1 text-[13px] text-app-muted">{t.saved}</div>
            {sites.length === 0 ? <div className="text-[14px] text-app-muted">{t.none}</div> : (
              <ul className="flex flex-col divide-y divide-white/[0.06] rounded-2xl bg-app-surface/60" data-testid="browser-login-sites">
                {sites.map((s) => (
                  <li key={s.site} className="flex min-h-[48px] items-center gap-3 px-4 text-[15px] text-app-text">
                    <span className="flex-1 truncate">{s.site}</span>
                    <span className="text-[12px] text-app-muted">{new Date(s.savedAt).toLocaleDateString()}</span>
                    <button type="button" onClick={() => void forget(s.site)} aria-label={`${t.forget} ${s.site}`} className="text-app-muted"><Trash2 size={16} aria-hidden="true" /></button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (url.trim() && !busy) void start(); }}>
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" aria-label={t.url} inputMode="url" autoCapitalize="off" autoCorrect="off"
              className="min-h-[44px] flex-1 rounded-xl bg-app-surface px-3 text-[15px] text-app-text" data-testid="browser-login-url" />
            <button type="submit" disabled={!url.trim() || !!busy} className={`${btn} bg-app-accent text-black disabled:opacity-50`} data-testid="browser-login-open">
              {busy === 'start' ? <><Loader2 size={16} className="animate-spin" aria-hidden="true" />{t.opening}</> : t.open}
            </button>
          </form>
          {msg && <p className="text-[14px] text-app-text" role="status">{msg}</p>}
        </div>
      )}
      {pass && (
        <div className="flex flex-col gap-2">
          <div className="truncate text-[12px] text-app-muted">{frame?.url || '…'}</div>
          <div className="relative overflow-hidden rounded-xl bg-black" style={{ aspectRatio: `${VIEW.w} / ${VIEW.h}` }}>
            {frame?.jpeg ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`data:image/jpeg;base64,${frame.jpeg}`} alt={frame.title || ''} draggable={false} data-testid="browser-login-frame"
                className="h-full w-full cursor-pointer select-none object-contain"
                onClick={(e) => { const b = e.currentTarget.getBoundingClientRect(); act({ op: 'click', ...tapToPage(e.clientX - b.left, e.clientY - b.top, b) }); }} />
            ) : <div className="flex h-full items-center justify-center text-app-muted"><Loader2 className="animate-spin" aria-hidden="true" /></div>}
          </div>
          <p className="text-[12px] text-app-muted">{t.tap}</p>
          {frame?.error && <p className="text-[12px] text-red-300">{frame.error}</p>}
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (text) { act({ op: 'type', text }); setText(''); } }}>
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder={t.type} aria-label={t.type} type={masked ? 'password' : 'text'}
              autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false}
              className="min-h-[44px] flex-1 rounded-xl bg-app-surface px-3 text-[15px] text-app-text" data-testid="browser-login-text" />
            <button type="button" onClick={() => setMasked((m) => !m)} aria-label={masked ? t.show : t.hide} className={`${btn} bg-app-surface text-app-text`}>
              {masked ? <Eye size={16} aria-hidden="true" /> : <EyeOff size={16} aria-hidden="true" />}
            </button>
            <button type="submit" disabled={!text} className={`${btn} bg-app-surface text-app-text disabled:opacity-50`}>{t.send}</button>
          </form>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => act({ op: 'key', key: 'Enter' })} className={`${btn} bg-app-surface text-app-text`} aria-label="Enter"><CornerDownLeft size={16} aria-hidden="true" />Enter</button>
            <button type="button" onClick={() => act({ op: 'key', key: 'Tab' })} className={`${btn} bg-app-surface text-app-text`}>Tab</button>
            <button type="button" onClick={() => act({ op: 'key', key: 'Backspace' })} className={`${btn} bg-app-surface text-app-text`} aria-label="Backspace"><Delete size={16} aria-hidden="true" /></button>
            <button type="button" onClick={() => act({ op: 'scroll', dy: -500 })} className={`${btn} bg-app-surface text-app-text`} aria-label={t.up}><ChevronUp size={16} aria-hidden="true" /></button>
            <button type="button" onClick={() => act({ op: 'scroll', dy: 500 })} className={`${btn} bg-app-surface text-app-text`} aria-label={t.down}><ChevronDown size={16} aria-hidden="true" /></button>
            <button type="button" onClick={() => act({ op: 'back' })} className={`${btn} bg-app-surface text-app-text`} aria-label={t.back}><ArrowLeft size={16} aria-hidden="true" /></button>
          </div>
          <div className="mt-1 flex gap-2">
            <button type="button" onClick={() => void save()} disabled={!!busy} className={`${btn} flex-1 bg-app-accent text-black disabled:opacity-50`} data-testid="browser-login-save">
              {busy === 'save' ? <><Loader2 size={16} className="animate-spin" aria-hidden="true" />{t.saving}</> : t.save}
            </button>
            <button type="button" onClick={cancel} disabled={!!busy} className={`${btn} bg-app-surface text-app-text`} data-testid="browser-login-cancel">{t.cancel}</button>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}
