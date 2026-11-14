'use client';

/**
 * components/studio/ConnectorsButton.tsx — the connectors door right beside the composer's „+" (GG 2026-11-07 07:55Z:
 * „პლიუსის ნიშნის გვერდით … კონექტორის ღილაკი"), as Manus has it: every service Agent G can work with, in one list,
 * each with its honest state. Google Drive links and picks files in the existing sheet (researchActions.openConnectors);
 * Gmail and Google Calendar are named „soon" until they are built and Google has approved their scopes; Adobe Premiere
 * Pro is an export: Agent G writes the montage as a Premiere project (.xml, lib/video/premiereXml) it opens. No fake
 * "connected": the state comes from GET /api/connectors.
 */
import { useEffect, useState } from 'react';
import { Calendar, ChevronRight, Clapperboard, Cloud, KeyRound, Mail, Plug } from 'lucide-react';
import { BrowserLoginSheet } from '@/components/agent/BrowserLoginSheet';
import { BottomSheet } from '@/components/studio/ui/BottomSheet';
import { fetchConnectors } from './research/api';
import { researchActions } from './research/store';
import type { ConnectorState } from '@/lib/connectors/types';

type Lang = 'ka' | 'en' | 'ru';
const T = {
  ka: { logins: 'საიტზე შესვლა', manage: 'მართვა', open: 'კონექტორები', title: 'კონექტორები', linked: 'დაკავშირებულია', connect: 'დაკავშირება', soon: 'მალე', export: 'XML ექსპორტი', off: 'მიუწვდომელია', close: 'დახურვა', note: 'Agent G ამ სერვისებთან თავად იმუშავებს, როცა დავალება მოითხოვს.' },
  en: { logins: 'Log in to a site', manage: 'Manage', open: 'Connectors', title: 'Connectors', linked: 'Connected', connect: 'Connect', soon: 'Soon', export: 'XML export', off: 'Unavailable', close: 'Close', note: 'Agent G works with these by itself when a task needs them.' },
  ru: { logins: 'Вход на сайт', manage: 'Управлять', open: 'Коннекторы', title: 'Коннекторы', linked: 'Подключено', connect: 'Подключить', soon: 'Скоро', export: 'Экспорт XML', off: 'Недоступно', close: 'Закрыть', note: 'Agent G сам работает с ними, когда задаче это нужно.' },
} as const;

/** What a row says, from the server's state (Drive) or the plan (Gmail, Calendar). */
export function connectorRowState(c: Pick<ConnectorState, 'status' | 'linked'> | undefined): 'linked' | 'connect' | 'soon' | 'off' {
  if (!c) return 'soon';
  if (c.linked) return 'linked';
  if (c.status === 'connectable' || c.status === 'ready') return 'connect';
  if (c.status === 'unavailable') return 'off';
  return 'soon';
}

export function ConnectorsButton({ locale, className }: { locale: string; className: string }) {
  const lang: Lang = locale === 'en' || locale === 'ru' ? locale : 'ka';
  const t = T[lang];
  const [open, setOpen] = useState(false);
  const [drive, setDrive] = useState<ConnectorState | undefined>(undefined);
  // Logging in inside Agent G's cloud browser: the row shows only when the server has it on for this person.
  const [logins, setLogins] = useState<{ enabled: boolean; count: number }>({ enabled: false, count: 0 });
  const [loginOpen, setLoginOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    let live = true;
    void fetchConnectors().then((r) => { if (live && r.ok) setDrive(r.connectors.find((c) => c.id === 'google_drive')); });
    // No fetch (old browsers, test env) = the row simply stays hidden.
    if (typeof fetch === 'function') {
      void fetch('/api/agent/browser/login', { cache: 'no-store' }).then((r) => r.json()).then((j: { enabled?: boolean; sites?: unknown[] }) => {
        if (live) setLogins({ enabled: j.enabled === true, count: Array.isArray(j.sites) ? j.sites.length : 0 });
      }).catch(() => undefined);
    }
    return () => { live = false; };
  }, [open]);

  const rows: Array<{ id: string; label: string; Icon: typeof Cloud; state: ReturnType<typeof connectorRowState> | 'export' | 'manage'; onTap?: () => void }> = [
    { id: 'google_drive', label: 'Google Drive', Icon: Cloud, state: connectorRowState(drive), onTap: () => { setOpen(false); researchActions.openConnectors(); } },
    { id: 'gmail', label: 'Gmail', Icon: Mail, state: 'soon' },
    { id: 'google_calendar', label: 'Google Calendar', Icon: Calendar, state: 'soon' },
    // GG 2026-11-07 07:58Z / card 08:02Z. Premiere Pro has no web app to drive: Agent G exports its montage as a project
    // (.xml + the clips) Premiere opens with the timeline and cuts (workspace_premiere_xml).
    { id: 'premiere', label: 'Adobe Premiere Pro', Icon: Clapperboard, state: 'export' },
    ...(logins.enabled
      ? [{ id: 'site_logins', label: t.logins, Icon: KeyRound, state: (logins.count ? 'linked' : 'manage') as 'linked' | 'manage', onTap: () => { setOpen(false); setLoginOpen(true); } }]
      : []),
  ];
  const word = { linked: t.linked, connect: t.connect, soon: t.soon, off: t.off, export: t.export, manage: t.manage };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} data-testid="composer-connectors" aria-label={t.open} title={t.open} aria-haspopup="dialog" className={className}>
        <Plug size={19} aria-hidden="true" />
      </button>
      <BottomSheet open={open} onClose={() => setOpen(false)} title={t.title} closeLabel={t.close} testId="connectors-menu">
        <p className="mb-3 text-[13px] text-app-muted">{t.note}</p>
        <ul className="flex flex-col divide-y divide-white/[0.06] rounded-2xl bg-app-surface/60">
          {rows.map(({ id, label, Icon, state, onTap }) => {
            const tappable = !!onTap && (state === 'linked' || state === 'connect' || state === 'manage');
            return (
              <li key={id}>
                <button type="button" disabled={!tappable} onClick={tappable ? onTap : undefined} data-testid={`connector-row-${id}`} data-state={state}
                  className="flex min-h-[52px] w-full items-center gap-3 px-4 text-left text-[15px] text-app-text disabled:cursor-default">
                  <Icon size={20} aria-hidden="true" className="text-app-accent" />
                  <span className="flex-1">{label}</span>
                  <span className={`text-[13px] ${state === 'linked' || state === 'export' ? 'text-app-accent' : 'text-app-muted'}`}>{word[state]}</span>
                  {tappable && <ChevronRight size={16} aria-hidden="true" className="text-app-muted" />}
                </button>
              </li>
            );
          })}
        </ul>
      </BottomSheet>
      {logins.enabled && <BrowserLoginSheet open={loginOpen} onClose={() => setLoginOpen(false)} locale={locale} />}
    </>
  );
}
