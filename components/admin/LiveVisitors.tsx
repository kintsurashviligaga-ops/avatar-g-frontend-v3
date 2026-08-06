'use client';

import { useCallback, useEffect, useState } from 'react';
import { Radio } from 'lucide-react';

/**
 * "Active now" — visitors with a heartbeat inside the server's window.
 *
 * ⚠️ THE SPLIT IS THE POINT, NOT THE TOTAL. "40 people" says nothing on its own; "40, of whom 35 are on
 * pricing and 2 are in the chat" is a different morning to the reverse, and it is the difference between
 * a launch working and a launch stalling at the checkout.
 *
 * ⚠️ null MEANS "NOT MEASURED", NOT ZERO. Before the migration runs the endpoint returns degraded, and
 * an admin reading a confident 0 would conclude the site is dead. It shows an em-dash and says why.
 */

const SECTION_LABEL: Record<string, { ka: string; en: string }> = {
  chat: { ka: 'ჩატი', en: 'Chat' },
  library: { ka: 'ბიბლიოთეკა', en: 'Library' },
  pricing: { ka: 'ფასები', en: 'Pricing' },
  settings: { ka: 'პარამეტრები', en: 'Settings' },
  support: { ka: 'მხარდაჭერა', en: 'Support' },
  legal: { ka: 'იურიდიული', en: 'Legal' },
  marketing: { ka: 'მთავარი', en: 'Marketing' },
  admin: { ka: 'ადმინი', en: 'Admin' },
  other: { ka: 'სხვა', en: 'Other' },
};

type Presence = {
  active: number | null; signedIn: number; anonymous: number;
  bySection: Record<string, number>; windowSeconds: number; degraded?: boolean;
};

export function LiveVisitors({ ka = true }: { ka?: boolean }) {
  const [p, setP] = useState<Presence | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/presence', { cache: 'no-store' });
      if (r.ok) setP((await r.json()) as Presence);
    } catch { /* leave the last good value on screen */ }
  }, []);

  // 15s: fast enough to feel live, slow enough that an open admin tab is not itself the traffic.
  useEffect(() => { void load(); const t = setInterval(() => void load(), 15_000); return () => clearInterval(t); }, [load]);

  const sections = Object.entries(p?.bySection ?? {}).sort((a, b) => b[1] - a[1]);

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center gap-2">
        <span className="relative flex h-2 w-2">
          {p?.active ? <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" /> : null}
          <span className={`relative inline-flex h-2 w-2 rounded-full ${p?.active ? 'bg-emerald-400' : 'bg-white/25'}`} />
        </span>
        <span className="text-[11px] uppercase tracking-wide text-white/45">{ka ? 'ახლა საიტზე' : 'Active now'}</span>
        <Radio size={13} className="ml-auto text-white/20" />
      </div>

      <p className="mt-2 text-[34px] font-bold leading-none tabular-nums text-white">
        {p?.active ?? '—'}
      </p>

      {p?.degraded ? (
        <p className="mt-2 text-[11.5px] leading-relaxed text-amber-300">
          {ka ? 'ცხრილი ჯერ არ არსებობს — გაუშვი 20260802f_active_visitors.sql' : 'Run migration 20260802f_active_visitors.sql'}
        </p>
      ) : (
        <>
          <p className="mt-1 text-[11.5px] text-white/45">
            {ka ? 'შესული' : 'signed in'} <span className="tabular-nums text-white/70">{p?.signedIn ?? 0}</span>
            {' · '}
            {ka ? 'ანონიმური' : 'anonymous'} <span className="tabular-nums text-white/70">{p?.anonymous ?? 0}</span>
          </p>
          {sections.length > 0 && (
            <ul className="mt-3 space-y-1">
              {sections.map(([k, n]) => (
                <li key={k} className="flex items-center justify-between text-[12px]">
                  <span className="text-white/55">{ka ? (SECTION_LABEL[k]?.ka ?? k) : (SECTION_LABEL[k]?.en ?? k)}</span>
                  <span className="tabular-nums text-white/80">{n}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

export default LiveVisitors;
