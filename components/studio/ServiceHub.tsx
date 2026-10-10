'use client';

/**
 * ServiceHub — the dashboard's one window: the studio (OmniStudio, every tool) inside ChatChrome, and Agent G's terminal
 * (`#agent`) in the same shell.
 *
 * ⚠️ THE OLD SURFACES ARE GONE (the owner, 2026-10-09 18:25Z: „this is something old and has nothing to do with it —
 * remove it"). The „Choose a service · Three studios — one window" card grid (`#hub`), the full-screen Film Studio with its
 * „Music Video" director (`#film`, ConversationalFilmStudio) and the Lip-Sync Studio (`#lipsync`) were second ways to do
 * what the studio's own tools do. An old link to one of them opens the studio on that tool instead: `#film` → Video,
 * `#lipsync` → Avatar, `#hub` → the chat.
 */

import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';
import { ChatChrome } from './ChatChrome';
import ErrorBoundary from '@/components/ErrorBoundary';
import { isToolId, type ToolId } from '@/lib/studio/tools';

// PERF: lazy-load the studio so the dashboard's initial JS ships only the shell. OMNI_CURRENT_ID_KEY is INLINED here
// (matching the literal in ChatChrome) — a static named import would drag the whole OmniStudio into the initial chunk.
const OMNI_CURRENT_ID_KEY = 'myavatar-omni-current';

// In-shell loader (the studio renders INSIDE ChatChrome, which paints instantly).
const InShellLoading = () => (
  <div className="flex min-h-[60dvh] w-full items-center justify-center">
    <Loader2 className="h-6 w-6 animate-spin text-app-accent" />
  </div>
);

const OmniStudio = dynamic(() => import('./OmniStudio'), { ssr: false, loading: InShellLoading });
// One Window: the STEP 3 agent + its live process mount IN-PLACE here (inside the same
// ChatChrome shell as the assistant), not on a separate /agent-terminal or /services/agent-g route.
const AgentTerminal = dynamic(() => import('@/components/agent/AgentTerminal'), { ssr: false, loading: InShellLoading });
// The first-run tour (composer → Avatar tool). Its own small chunk, fetched after hydration, so it adds nothing to the
// dashboard's first load; for a returning visitor it reads one localStorage key and renders nothing.
const OnboardingTour = dynamic(() => import('@/components/onboarding/OnboardingTour'), { ssr: false });

type Lang = 'ka' | 'en' | 'ru';
type Service = 'omni' | 'agent';

/** The retired surfaces' hashes → the studio tool that does the same job. */
export const RETIRED_HASH_TOOL: Readonly<Record<string, ToolId>> = { film: 'video', lipsync: 'avatar', hub: 'chat' };

export function ServiceHub({ locale = 'ka', isAuthenticated = false }: { locale?: string; isAuthenticated?: boolean }) {
  const lang: Lang = locale === 'en' ? 'en' : locale === 'ru' ? 'ru' : 'ka';
  const [service, setService] = useState<Service>('omni');
  // "New Chat" remounts the assistant by bumping this key — a clean reset of the
  // whole conversation (messages, attachment, mode) without page reload.
  const [chatResetKey, setChatResetKey] = useState(0);
  // …except the TOOL: Gemini's „New chat“ keeps you where you were. Read from <html data-tool> (OmniStudio publishes
  // the active tool there) at the moment of the press, and handed to the fresh OmniStudio as its initial tool. The
  // studio opens on the chat by default, so only another tool needs carrying over.
  const [restartTool, setRestartTool] = useState<ToolId | undefined>(undefined);
  const newChat = useCallback(() => {
    try { window.localStorage.removeItem(OMNI_CURRENT_ID_KEY); } catch { /* noop */ }
    const active = document.documentElement.dataset.tool;
    setRestartTool(isToolId(active) && active !== 'chat' ? active : undefined);
    setChatResetKey((k) => k + 1);
  }, []);

  useEffect(() => {
    const read = () => {
      const h = (typeof window !== 'undefined' ? window.location.hash : '').replace('#', '');
      const retired = RETIRED_HASH_TOOL[h];
      if (retired) {
        // An old link: drop the hash and open the studio on the tool that does that job. A mounted studio is switched
        // in place (it answers `omni:set-tool` by cancelling it). ⚠️ That can be the FIRST load too: on a production
        // build the studio's chunk is often ready at hydration, the studio mounts with this shell, and its effects run
        // before this one, so it has already read (and missed) `?tool=`. Only while nobody heard does the tool wait in
        // the address, where the studio reads it once when it mounts (the same hand-off as ChatChrome's askStudio).
        const url = new URL(window.location.href);
        url.hash = '';
        const ev = new CustomEvent('omni:set-tool', { detail: retired, cancelable: true });
        window.dispatchEvent(ev);
        if (!ev.defaultPrevented && retired !== 'chat') url.searchParams.set('tool', retired);
        window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}`);
        setService('omni');
      } else {
        setService(h === 'agent' ? 'agent' : 'omni');
      }
      // A restart's tool is one-shot: coming back to the studio from another surface opens it fresh (on the chat).
      setRestartTool(undefined);
    };
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);

  const go = useCallback((s: Service) => {
    // The studio lives on the bare URL (empty hash); the agent rides `#agent` so it's shareable.
    if (typeof window !== 'undefined') window.location.hash = s === 'omni' ? '' : s;
    setService(s);
    setRestartTool(undefined);
  }, []);

  // The studio and the agent, in the full chat chrome (brand, balance, top-up, drawer, New session).
  return (
    <ChatChrome
      locale={locale}
      // The dashboard page resolved the session server-side; forwarding it stops the composer's
      // auth gate from answering '0' for a signed-in user during the client getUser() round-trip.
      initialAuthed={isAuthenticated}
      // The studio IS the home — it has nothing to go "back" to. The agent (STEP 3) mounts IN-PLACE here too; its
      // back returns to the studio.
      onBack={service === 'agent' ? () => go('omni') : undefined}
      title={service === 'agent' ? 'Agent G' : undefined}
      onNewChat={service === 'omni' ? newChat : undefined}
      scrollBody={service === 'agent'}
    >
      {/* PHASE 3 Task 5 — a render crash in the studio keeps the ChatChrome shell +
          shows a localized, friendly retry card instead of blanking the route. */}
      <ErrorBoundary
        fallback={
          <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-6 text-center">
            <span className="text-4xl">⚠️</span>
            <p className="text-[15px] font-semibold text-app-text">{lang === 'en' ? 'Something went wrong' : lang === 'ru' ? 'Что-то пошло не так' : 'რაღაც შეფერხდა'}</p>
            <p className="max-w-xs text-[13px] text-app-muted">{lang === 'en' ? 'Please reload and try again. Your work is safe.' : lang === 'ru' ? 'Перезагрузите и попробуйте снова. Ваши работы сохранены.' : 'გადატვირთეთ და სცადეთ თავიდან. თქვენი ნამუშევრები დაცულია.'}</p>
            <button type="button" onClick={() => window.location.reload()}
              className="mt-1 rounded-xl bg-app-accent px-5 py-2.5 text-[14px] font-semibold text-app-bg transition hover:opacity-90">
              {lang === 'en' ? 'Reload' : lang === 'ru' ? 'Перезагрузить' : 'გადატვირთვა'}
            </button>
          </div>
        }
      >
        {service === 'omni' ? <OmniStudio key={chatResetKey} locale={lang} initialTool={restartTool} />
          : <AgentTerminal embedded locale={lang} onExit={() => go('omni')} />}
      </ErrorBoundary>
      {service === 'omni' && <OnboardingTour locale={lang} />}
    </ChatChrome>
  );
}

export default ServiceHub;
