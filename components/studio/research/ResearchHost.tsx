'use client';

/**
 * ResearchHost — mounted ONCE in ChatChrome. It owns what has to outlive any one screen:
 *
 *   · the WATCHER: reads GET /api/research while a job is active and the page is visible (watcher.ts decides when: sparing,
 *     visibility-aware, backing off on failure), and once on mount / return to the foreground with `refresh=1` so a report that
 *     finished while the phone was locked or the tab closed is found — the job runs on the server regardless of this page;
 *   · the TOASTS ("your report is ready", once per job);
 *   · the SHEETS: start confirmation (the price on the button), the report viewer, the list, the Connectors;
 *   · the LIVE call about a report (GeminiLiveConversation with `researchId` — the server loads the report for the owner).
 *
 * It renders nothing at all until the server says Deep Research exists here (`/api/research/capabilities` → available), and
 * nothing in it can charge: the only paid action is the start sheet's button, and the server does the charging.
 */
import { useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { isEnabledByDefault } from '@/lib/env/flag';
import { listJobs } from './api';
import { ListSheet } from './ListSheet';
import { ResearchToasts } from './ResearchToasts';
import { StartSheet } from './StartSheet';
import { getResearchState, researchActions, subscribeResearch, useResearchState } from './store';
import { activeJobs, nextPollDelayMs, shouldWakeRead } from './watcher';

// The viewer (Markdown, dictation) and the Connectors sheet load on first open — never in the chat's initial bundle.
const ReportViewer = dynamic(() => import('./ReportViewer').then((m) => m.ReportViewer), { ssr: false });
const ConnectorsSheet = dynamic(() => import('./ConnectorsSheet').then((m) => m.ConnectorsSheet), { ssr: false });
const GeminiLiveConversation = dynamic(() => import('@/components/voice/GeminiLiveConversation'), { ssr: false });
const LIVE_ENABLED = isEnabledByDefault(process.env.NEXT_PUBLIC_GEMINI_LIVE_ENABLED);

/** The polling loop. `enabled` = signed in AND the feature exists here. */
function useResearchWatcher(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let inflight: AbortController | null = null;
    let failures = 0;
    let lastReadAt = 0;
    let unauthorized = false;
    let first = true;

    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      if (stopped) return;
      const delay = nextPollDelayMs({ jobs: Object.values(getResearchState().jobs), nowMs: Date.now(), failures, hidden: document.hidden, unauthorized });
      if (delay !== null) timer = setTimeout(() => { timer = null; void read(); }, delay);
    };

    const read = async () => {
      if (stopped || inflight) return;
      // The first read of a visit asks the server to poll running jobs at the provider too (the read-through).
      const refresh = first || activeJobs(Object.values(getResearchState().jobs)).length > 0;
      first = false;
      const ctrl = new AbortController();
      inflight = ctrl;
      lastReadAt = Date.now();
      const r = await listJobs({ refresh, signal: ctrl.signal });
      inflight = null;
      if (stopped) return;
      if (r.ok) {
        failures = 0;
        if (!r.available) { researchActions.markUnavailable(); return; }
        researchActions.ingestList(r.items, { announce: true });
      } else if (r.unauthorized) {
        unauthorized = true;
      } else {
        failures += 1;
      }
      schedule();
    };

    const wake = () => {
      if (shouldWakeRead({ lastReadAtMs: lastReadAt, nowMs: Date.now(), hidden: document.hidden, online: navigator.onLine !== false })) void read();
      else schedule();
    };
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('focus', wake);
    window.addEventListener('online', wake);
    // A job that starts (or appears) while idle needs a timer.
    const unsub = subscribeResearch(() => { if (!timer && !inflight && !stopped) schedule(); });
    void read();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      inflight?.abort();
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('focus', wake);
      window.removeEventListener('online', wake);
      unsub();
    };
  }, [enabled]);
}

export function ResearchHost({ locale, authed, userId }: { locale: string; authed: boolean; userId: string | null }) {
  const state = useResearchState();
  const available = state.caps?.available === true;

  useEffect(() => { void researchActions.ensureCapabilities(); }, []);

  // A different account (or sign-out) must not see the previous one's research.
  const lastUser = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const who = authed ? userId : null;
    if (lastUser.current !== undefined && lastUser.current !== who) researchActions.resetUser();
    lastUser.current = who;
  }, [authed, userId]);

  useResearchWatcher(authed && available);

  return (
    <>
      <ResearchToasts locale={locale} />
      {available && state.start && <StartSheet locale={locale} authed={authed} />}
      {available && state.list && <ListSheet locale={locale} />}
      {state.viewer && <ReportViewer key={state.viewer} id={state.viewer} locale={locale} canLive={LIVE_ENABLED && !!userId} />}
      {state.connectors && <ConnectorsSheet locale={locale} authed={authed} />}
      {state.live && userId && (
        <GeminiLiveConversation
          userId={userId}
          locale={locale === 'en' || locale === 'ru' ? locale : 'ka'}
          researchId={state.live.id}
          onClose={researchActions.closeLive}
          onUnavailable={() => { researchActions.closeLive(); researchActions.pushInfo('liveOff'); }}
        />
      )}
    </>
  );
}

export default ResearchHost;
