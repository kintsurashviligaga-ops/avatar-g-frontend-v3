'use client';

import React, { useEffect, useState, type ReactNode, type Ref } from 'react';
import { createPortal } from 'react-dom';
import {
  Minimize2,
  Subtitles,
  Video,
  VideoOff,
  SwitchCamera,
  Mic,
  MicOff,
  X,
  RotateCcw,
  Copy,
  WifiOff,
  Volume2,
} from 'lucide-react';
import { useDialogA11y } from '@/hooks/useDialogA11y';
import { copyLiveText, liveBrowserIntent, liveRecoveryLink } from '@/lib/voice/liveBrowserRecovery';
import { LIVE_OVERLAY_STRINGS, liveErrorHeadline } from './liveOverlayCopy';
import { LiveAmbientGlow, LiveErrorPanel, LiveVoicePill } from './LiveCallChrome';
import type {
  LiveCaption,
  LiveErrorCode,
  LiveErrorDetail,
  LiveLevels,
  LiveStatus,
} from './useGeminiLiveSession';
import { isMicErrorCode } from "./useGeminiLiveSession";
import LiveDock, { LIVE_DOCK_STRINGS } from "./LiveDock";
import { orbStateFor } from "./LiveOrb";
import { liveCurrentStep, type LiveJobLine } from "./LiveActivityFeed";
import type { LiveActivityItem } from './liveActivity';
import type { LiveActionCard, LivePendingRun } from './liveActions';
import LiveActionCards from './LiveActionCards';
import { LIVE_AVATAR_STRINGS, LiveAvatarSlot } from './LiveAvatarStage';

type Locale = 'ka' | 'en' | 'ru';

export { LIVE_OVERLAY_STRINGS, liveErrorHeadline } from './liveOverlayCopy';

export interface LiveModeOverlayProps {
  locale?: Locale;
  status: LiveStatus;
  error?: LiveErrorCode | null;
  errorDetail?: LiveErrorDetail | null;
  captions: readonly LiveCaption[];
  muted: boolean;
  cameraOn: boolean;
  cameraFacing?: 'user' | 'environment';
  getLevels?: () => LiveLevels;
  videoRef?: Ref<HTMLVideoElement>;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onFlipCamera?: () => void;
  onEnd: () => void;
  onRetry?: () => void;
  audioBlocked?: boolean;
  onResumeAudio?: () => void;
  extraControls?: ReactNode;
  showCaptions?: boolean;
  actions?: readonly LiveActionCard[];
  onOpenAction?: (action: LiveActionCard) => void;
  onStopSpeaking?: () => void;
  pendingRun?: LivePendingRun | null;
  onCancelRun?: () => void;
  isDocked?: boolean;
  docked?: boolean;
  [key: string]: unknown;
  onToggleDock?: () => void;
  activity?: readonly LiveActivityItem[];
  jobs?: readonly LiveJobLine[];
  /** The talking avatar's element while an avatar session runs (LiveAvatarStage): the full screen's picture, a small
   *  one beside the docked bar. The camera then becomes a picture-in-picture. */
  avatarVideo?: HTMLVideoElement | null;
  /** One line under the status (the avatar starting, refused or capped). */
  notice?: string | null;
}

function useCopyFeedback() {
  const [state, setState] = useState<'idle' | 'copying' | 'copied' | 'failed'>('idle');
  useEffect(() => {
    if (state !== 'copied' && state !== 'failed') return;
    const timer = setTimeout(() => setState('idle'), 2000);
    return () => clearTimeout(timer);
  }, [state]);
  const copy = async (text: string) => {
    if (!text || state === 'copying') return;
    setState('copying');
    setState(await copyLiveText(text) ? 'copied' : 'failed');
  };
  return { state, copy };
}

export function LiveModeOverlay({
  locale = 'ka',
  status,
  error,
  errorDetail,
  captions,
  muted,
  cameraOn,
  getLevels,
  videoRef,
  onToggleMute,
  onToggleCamera,
  onFlipCamera,
  cameraFacing,
  onEnd,
  onRetry,
  onStopSpeaking,
  docked,
  isDocked,
  onToggleDock,
  pendingRun,
  onCancelRun,
  activity,
  audioBlocked,
  onResumeAudio,
  actions = [],
  onOpenAction,
  extraControls,
  showCaptions = true,
  avatarVideo = null,
  notice = null,
}: LiveModeOverlayProps) {
  const transcriptCopy = useCopyFeedback();
  const linkCopy = useCopyFeedback();
  const [captionsOn, setCaptionsOn] = useState(true);
  const [dismissedLinks, setDismissedLinks] = useState<ReadonlySet<string>>(() => new Set());
  const t = LIVE_OVERLAY_STRINGS[locale];
  const dialogRef = useDialogA11y<HTMLDivElement>(!(docked || isDocked), onEnd);

  const isSpeaking = status === 'speaking';
  const isListening = status === 'listening';

  // ბოლო ნათქვამი ფრაზა (თქვენს რეფერენსში: "გამარჯობა! რით შემიძლია დაგეხმაროთ?")
  const lastAgentLine = [...captions].reverse().find((c) => c.role === 'assistant');
  const lastUserLine = [...captions].reverse().find((c) => c.role === 'user');
  const lastAgentCaption = lastAgentLine?.text || '';

  const waveformState = isListening && muted ? 'idle' : orbStateFor(status);

  const recoveryLink = error === 'mic_in_app' && typeof window !== 'undefined'
    ? liveRecoveryLink(window.location.href) : '';
  const browserIntent = recoveryLink && typeof navigator !== 'undefined'
    ? liveBrowserIntent(recoveryLink, navigator.userAgent) : null;

  if (docked || isDocked) {
    const linkCard = actions.find((card) => card.action.type === 'open_url' && !dismissedLinks.has(card.id));
    const link = linkCard?.action.type === 'open_url'
      ? { id: linkCard.id, url: linkCard.action.url, title: linkCard.action.title }
      : null;
    const dock = (
      <LiveDock
        locale={locale}
        status={status}
        statusLabel={t.status[status]}
        captions={showCaptions && captionsOn ? captions : []}
        step={liveCurrentStep(activity || [], locale)}
        muted={muted}
        getLevels={getLevels}
        onToggleMute={onToggleMute}
        onEnd={onEnd}
        onExpand={onToggleDock ?? (() => {})}
        {...(onStopSpeaking ? { onStopSpeaking } : {})}
        pendingRun={pendingRun}
        {...(onCancelRun ? { onCancelRun } : {})}
        link={link}
        onDismissLink={(id) => setDismissedLinks((previous) => new Set(previous).add(id))}
      />
    );
    // The avatar keeps talking while docked (its voice is in its video): a small picture, a tap brings the call back.
    const dockedView = avatarVideo ? (
      <>
        {dock}
        <button type="button" onClick={onToggleDock} aria-label={LIVE_AVATAR_STRINGS[locale].openCall} data-testid="live-avatar-pip"
          className="fixed bottom-24 right-3 z-[130] h-[150px] w-[84px] overflow-hidden rounded-2xl bg-black shadow-lg ring-1 ring-white/20">
          <LiveAvatarSlot video={avatarVideo} className="h-full w-full" />
        </button>
      </>
    ) : dock;
    return typeof document === "undefined" ? dockedView : createPortal(dockedView, document.body);
  }

  const avatarOn = !!avatarVideo && !error;

  const overlay = (
    <div ref={dialogRef} role="dialog" aria-modal="true" data-live-call-ui data-live-status={status} aria-label={t.title} tabIndex={-1} data-theme="dark"
      className="fixed inset-0 z-[130] flex select-none flex-col justify-between overflow-hidden bg-black text-white">
      {/* 1. The talking avatar fills the screen; the camera then sits in a corner. */}
      {avatarOn && avatarVideo && <>
        <LiveAvatarSlot video={avatarVideo} className="absolute inset-0 z-0 bg-black sm:[&>video]:object-contain" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 bg-gradient-to-b from-black/50 via-transparent to-black/80" />
      </>}

      {/* კამერის ფონი (თუ კამერა ჩართულია) */}
      <video
        ref={videoRef}
        playsInline
        muted
        className={!cameraOn || error ? 'hidden'
          : avatarOn ? 'absolute right-4 top-28 z-20 h-36 w-24 rounded-2xl object-cover shadow-lg ring-1 ring-white/20'
          : 'absolute inset-0 z-0 h-full w-full object-cover'}
      />

      {/* 2. ქვემოდან ამომავალი რბილი ცისფერი ნათება (Gemini Live Ambient Nebula) */}
      {!avatarOn && <LiveAmbientGlow />}

      {/* Screen docking and secondary call controls. */}
      {!error && <div className="relative z-20 flex items-center justify-between px-5 pb-4 pt-12">
        {onToggleDock ? <button
          type="button"
          onClick={onToggleDock}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white/90 backdrop-blur-md transition-all hover:bg-white/15 active:scale-95"
          aria-label={t.showScreen}
          data-testid="live-show-screen"
        >
          <Minimize2 size={22} />
        </button> : <span aria-hidden="true" />}

        <div className="flex items-center gap-2.5">
          {cameraOn && onFlipCamera && (
            <button
              type="button"
              onClick={onFlipCamera}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-md transition-all hover:bg-white/25 active:scale-95"
              aria-label={t.flip}
              title={cameraFacing === "user" ? t.backCamera : t.frontCamera}
            >
              <SwitchCamera size={20} />
            </button>
          )}
          {showCaptions && <button
            type="button"
            onClick={() => setCaptionsOn((value) => !value)}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white/90 backdrop-blur-md transition-all hover:bg-white/15 active:scale-95"
            aria-label={t.captions}
            aria-pressed={captionsOn}
          >
            <Subtitles size={20} />
          </button>}
        </div>
      </div>}

      {/* 4. ცენტრალური სუბტიტრები (მოტივტივე რეალურ დროში) */}
      <div data-testid="live-content" className={`relative z-10 mx-auto flex min-h-0 w-full max-w-xl flex-1 flex-col overflow-y-auto overscroll-contain px-6 pb-3 pt-10 ${avatarOn ? 'justify-end' : 'justify-start'}`}>
        {error ? (
          <LiveErrorPanel
            icon={isMicErrorCode(error) ? <MicOff size={32} /> : <WifiOff size={32} />}
            headline={liveErrorHeadline(error, locale)}
            reason={t.errors[error]}
            hint={t.hints[error]}
            detailName={errorDetail?.name}
            locale={locale}
          >
            {recoveryLink && <div className="flex w-full min-w-0 flex-col items-center gap-3">
              <input aria-label={t.liveLink} readOnly value={recoveryLink} onFocus={(event) => event.currentTarget.select()}
                className="min-h-11 w-full min-w-0 rounded-lg border border-white/20 bg-white/5 px-3 text-[14px] text-white" />
              <button type="button" onClick={() => void linkCopy.copy(recoveryLink)} disabled={linkCopy.state === 'copying'}
                className="inline-flex min-h-11 max-w-full items-center justify-center rounded-full border border-white/20 px-4 py-2 text-[16px] text-white">
                {linkCopy.state === 'copied' ? t.copied : t.copyLink}
              </button>
              {linkCopy.state === 'failed' && <p role="status" className="text-[16px] text-white/80">{t.copyFailed}</p>}
              {browserIntent && <a href={browserIntent} rel="noreferrer" className="inline-flex min-h-11 max-w-full items-center justify-center rounded-full bg-white px-4 py-2 text-[16px] font-semibold text-black">{t.openInBrowser}</a>}
            </div>}
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-6 py-2.5 text-sm font-semibold text-black transition-all hover:bg-white/90 active:scale-95"
              >
                <RotateCcw size={16} /> {t.retry}
              </button>
            )}
          </LiveErrorPanel>
        ) : (
          <div className="space-y-4 animate-fade-in">
            <p data-testid="live-status" aria-live="polite" className="text-[16px] leading-relaxed text-white/70">{t.status[status]}</p>
            {notice && <p role="status" data-testid="live-notice" className="text-[14px] leading-relaxed text-white/80">{notice}</p>}
            {audioBlocked && onResumeAudio && (
              <button type="button" onClick={onResumeAudio}
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-5 py-2.5 text-[16px] font-semibold text-black">
                <Volume2 size={18} aria-hidden="true" /> {t.tapToStart}
              </button>
            )}
            {/* დიდი რეალურ დროში გამომავალი ქართული ტექსტი */}
            {showCaptions && captionsOn && <div role="log" aria-live="polite" aria-relevant="additions" aria-label={t.captions} className="space-y-3">
              {lastUserLine && <p aria-hidden={lastUserLine.final ? undefined : true} className="text-[16px] leading-relaxed text-white/60">{lastUserLine.text}</p>}
              {lastAgentLine && <p aria-hidden={lastAgentLine.final ? undefined : true} className={`font-semibold leading-relaxed tracking-tight text-white drop-shadow-md ${avatarOn ? 'text-[20px] sm:text-[24px]' : 'text-[26px] sm:text-[32px]'}`}>
                {lastAgentCaption}
              </p>}
            </div>}

            {/* AI მინიშნება და მოქმედებების ღილაკები */}
            {showCaptions && captionsOn && lastAgentCaption && (
              <div className="flex flex-col gap-2 pt-2">
                <div className="flex items-center gap-4 text-xs text-white/50">
                  <button
                    type="button"
                    onClick={() => void transcriptCopy.copy(lastAgentCaption)}
                    aria-label={transcriptCopy.state === 'copied' ? t.copied : t.copyText}
                    disabled={transcriptCopy.state === 'copying'}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-full transition-colors hover:bg-white/10 hover:text-white"
                  >
                    <Copy size={15} />
                  </button>
                  {transcriptCopy.state === 'failed' && <span role="status">{t.copyFailed}</span>}
                </div>
                <span className="text-[11px] font-normal tracking-wide text-white/35">
                  {t.aiNotice}
                </span>
              </div>
            )}
            {onOpenAction && <LiveActionCards cards={actions} locale={locale} onOpen={onOpenAction} className="-mx-6" />}
          </div>
        )}
      </div>

      {/* 5. ქვედა სამართავი პანელი (Gemini Live Controls) */}
      <div data-testid="live-controls" className="relative z-20 flex w-full shrink-0 flex-col items-center justify-center px-4 pb-10 pt-4">
        {/* "Tap to interrupt" ღილაკი, როდესაც აგენტი საუბრობს */}
        {!error && isSpeaking && onStopSpeaking && (
          <button
            type="button"
            onClick={onStopSpeaking}
            aria-label={LIVE_DOCK_STRINGS[locale].stopSpeaking}
            data-testid="live-stop-speaking"
            className="mb-4 min-h-11 min-w-11 motion-safe:animate-pulse rounded-full border border-white/10 bg-white/10 px-4 py-1.5 text-xs font-medium text-white/90 shadow-lg backdrop-blur-md transition-all hover:bg-white/20 active:scale-95"
          >
            {t.stopShort}
          </button>
        )}
        {!error && extraControls && <div className="mb-3 flex max-w-full flex-wrap items-center justify-center gap-3">{extraControls}</div>}

        {/* 5 ჰორიზონტალური ღილაკი ზუსტად რეფერენსის მიხედვით */}
        <div className="flex w-full max-w-sm items-center justify-center gap-2 min-[360px]:gap-3.5 sm:gap-5">
          {!error && <>
          <button
            type="button"
            onClick={onToggleCamera}
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-white/10 shadow-md backdrop-blur-xl transition-all active:scale-95 ${
              cameraOn ? 'bg-white text-black' : 'bg-white/10 text-white hover:bg-white/15'
            }`}
            aria-label={t.camera}
            aria-pressed={cameraOn}
          >
            {cameraOn ? <Video size={20} /> : <VideoOff size={20} />}
          </button>

          {/* The audio meter is decorative; the separate native button interrupts speech. */}
          <span data-testid="live-waveform" aria-hidden="true" className="flex">
            <LiveVoicePill state={waveformState} getLevels={getLevels} />
          </span>

          {/* 4. მიკროფონის ღილაკი */}
          <button
            type="button"
            onClick={onToggleMute}
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-white/10 shadow-md backdrop-blur-xl transition-all active:scale-95 ${
              muted
                ? 'border-rose-500/30 bg-rose-500/20 text-rose-300'
                : 'bg-white/10 text-white hover:bg-white/15'
            }`}
            aria-label={t.mute}
            aria-pressed={muted}
          >
            {muted ? <MicOff size={20} /> : <Mic size={20} />}
          </button>

          {/* 5. ზარის დასრულების ღილაკი (✕) */}
          </>}
          <button
            type="button"
            onClick={onEnd}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/10 text-white shadow-md backdrop-blur-xl transition-all hover:border-rose-500/40 hover:bg-rose-500/25 hover:text-rose-300 active:scale-95"
            aria-label={t.end}
          >
            <X size={22} />
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document === 'undefined' ? overlay : createPortal(overlay, document.body);
}

export default LiveModeOverlay;

export { LiveControl } from './LiveCallChrome';
