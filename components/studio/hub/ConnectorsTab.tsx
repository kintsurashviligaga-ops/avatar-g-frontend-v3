'use client';

/**
 * ConnectorsTab — where Agent G reaches the user and the user's things, each with its honest state:
 *
 *   Documents      the research Connectors body (components/studio/research/ConnectorsBody): Local files WORKS; Google Drive,
 *                  OneDrive, Notion, Dropbox are „Soon" with no button — one body, so this tab and the research sheet agree.
 *   Notifications  <PushPermissionCard locale /> — owned by the push work (components/notifications). It draws its OWN titled
 *                  card, so no second title is put around it.
 *   WhatsApp       <WhatsAppLinkCard locale /> — owned by the WhatsApp work (components/agent-g). It draws its OWN titled card
 *                  (the same one the Settings page shows), so no second title is put around it.
 *   Telegram       a STATUS LINE ONLY. ⚠️ No connect button: /api/agent-g/telegram/connect-code issues a code, but the Telegram
 *                  webhook never consumes it, so "connect" would be a button that does nothing (lib/agent-g/channels/
 *                  telegram-webhook-handler.ts has no `/connect` handling). The line says whether the bot runs here and that
 *                  linking it to an account is not ready. When the webhook links accounts, a real button goes here.
 *
 * The two cards are imported by their fixed names and never edited here. When one renders nothing (not shipped on this branch
 * yet, or nothing to offer) its place says so — „not switched on yet" / a „Soon" row — instead of leaving a gap or a title
 * over an empty space.
 */
import { Bell, Loader2, MessageCircle, Send } from 'lucide-react';
import { PushPermissionCard } from '@/components/notifications/PushPermissionCard';
import { WhatsAppLinkCard } from '@/components/agent-g/WhatsAppLinkCard';
import { ConnectorsBody } from '@/components/studio/research/ConnectorsBody';
import { hubCopy } from './copy';
import { CardSlot, HubSection, StateTag } from './parts';
import { hubActions, useHubSelector } from './store';

function TelegramStatus({ locale }: { locale: string }) {
  const c = hubCopy(locale);
  const ch = useHubSelector((s) => s.channels);
  const state = ch.status === 'failed' ? 'failed' : ch.status !== 'ready' ? 'checking' : ch.telegramReady ? 'bot' : 'off';
  return (
    <div data-testid="hub-telegram" data-state={state} className="flex min-h-[48px] items-center gap-3 rounded-2xl bg-app-elevated/50 px-3 py-2.5">
      {state === 'checking' ? (
        <p className="flex min-w-0 flex-1 items-center gap-2 text-[12.5px] text-app-muted">
          <Loader2 size={14} className="shrink-0 motion-safe:animate-spin" aria-hidden="true" />{c.tgChecking}
        </p>
      ) : state === 'failed' ? (
        <>
          <p className="min-w-0 flex-1 text-[12.5px] text-app-text" role="alert">{c.tgLoadFailed}</p>
          <button type="button" onClick={() => void hubActions.loadChannels(true)}
            className="inline-flex min-h-[44px] shrink-0 items-center rounded-full px-3 text-[12.5px] font-semibold text-app-accent hover:bg-app-elevated">{c.retry}</button>
        </>
      ) : (
        <>
          <p className="min-w-0 flex-1 text-[12.5px] leading-snug text-app-text/90">{state === 'bot' ? c.tgReady : c.tgOff}</p>
          <StateTag label={c.soon} />
        </>
      )}
    </div>
  );
}

/** Shown only while the push card renders nothing: its name and „not switched on yet" — nothing to press. */
function PushSoon({ locale }: { locale: string }) {
  const c = hubCopy(locale);
  return (
    <div className="flex min-h-[48px] items-center gap-3 rounded-2xl bg-app-elevated/50 px-3 py-2.5">
      <Bell size={18} className="shrink-0 text-app-text/80" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block text-[14.5px] font-semibold text-app-text">{c.notifTitle}</span>
        <span className="mt-0.5 block text-[12.5px] leading-snug text-app-muted">{c.notOnYet}</span>
      </span>
    </div>
  );
}

/** Shown only while the WhatsApp card renders nothing: its name, one line, and a „Soon" tag — nothing to press. */
function WhatsAppSoon({ locale }: { locale: string }) {
  const c = hubCopy(locale);
  return (
    <div className="flex min-h-[48px] items-center gap-3 rounded-2xl bg-app-elevated/50 px-3 py-2.5">
      <MessageCircle size={18} className="shrink-0 text-app-text/80" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block text-[14.5px] font-semibold text-app-text">{c.waTitle}</span>
        <span className="mt-0.5 block text-[12.5px] leading-snug text-app-muted">{c.waSub}</span>
      </span>
      <StateTag label={c.soon} />
    </div>
  );
}

export function ConnectorsTab({ locale, authed }: { locale: string; authed: boolean }) {
  const c = hubCopy(locale);
  return (
    <div className="space-y-6 pb-2">
      <ConnectorsBody locale={locale} authed={authed} />
      <div className="px-2" data-testid="hub-notifications">
        <CardSlot fallback={<PushSoon locale={locale} />} testId="hub-push-slot"><PushPermissionCard locale={locale} /></CardSlot>
      </div>
      <div className="px-2" data-testid="hub-whatsapp">
        <CardSlot fallback={<WhatsAppSoon locale={locale} />} testId="hub-whatsapp-slot"><WhatsAppLinkCard locale={locale} /></CardSlot>
      </div>
      <HubSection icon={Send} title={c.tgTitle} sub={c.tgSub} testId="hub-telegram-section">
        <TelegramStatus locale={locale} />
      </HubSection>
    </div>
  );
}
