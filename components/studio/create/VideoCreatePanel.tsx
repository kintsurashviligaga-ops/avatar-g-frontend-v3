'use client';

/**
 * VideoCreatePanel — the video tool's create screen (ref4 / ref5), one component for the phone's sheet and the desktop's
 * right column (the same element, only the surrounding scroll container differs).
 *
 * Order, top to bottom: header (tool name + tool switcher, ✕) → HERO model card ("✎ Change") → Create | Extend →
 * "Add references" (images → the film's reference frames, audio → the soundtrack) → Prompt (+ "@ Elements", 🔊 On/Off) →
 * Model row → [length] [format] [resolution] tiles → quality (Economy · Fast · Max quality, each with its price) →
 * disclosures (Story & style · Voice & music · Advanced) → Generate ✦ N, pinned.
 *
 * ⚠️ NOTHING THE CINEMA TAB HAD IS GONE. Mode, effect, transitions, voices, dialogue, lip-sync, the master script, the
 * templates, the scene frames, the storyboard and the Veo camera controls are the three disclosures' content — OmniStudio
 * passes the very same blocks in as `story`, `voice` and `advanced`, so they keep their state and their behaviour.
 *
 * ⚠️ THE NUMBER ON THE BUTTON IS THE QUOTE (lib/video/createPanel.videoQuote → quoteCredits → videoCredits) for exactly the
 * seconds, tier and mode on screen; the server charges the film through the same function. No request carries a price.
 * `free` shows only for ONE short clip (≤ 8 s) while the trial slot is left; `insufficient` turns the tap into the top-up.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { GenerateButton } from '@/components/studio/ui/GenerateButton';
import { videoQuote, freeSlotApplies, insertPromptToken, openDuration, videoResolution, type VideoCapabilities } from '@/lib/video/createPanel';
import { planNotices, type VeoPlan, type VeoPlanAction } from '@/lib/video/veoPlan';
import type { VideoMode } from '@/lib/credits/videoPricing';
import type { OutputFormat } from '@/lib/veo/types';
import type { VeoEngineInfo } from '../video/VeoParametersPanel';
import { VideoDurationSheet, VideoFormatSheet, VideoModelSheet } from './VideoPickers';
import { VideoExtendTab } from './VideoExtendTab';
import {
  VideoCreateHeader, VideoDisclosure, VideoGenerateBar, VideoHero, VideoModelRow, VideoPromptCard, VideoQualityRow, VideoRefsCard, VideoTabs,
  VideoTiles, type VideoTab,
} from './videoCreateParts';
import { VIDEO_COPY, vc } from './videoCreateCopy';

export interface VideoCreateRefs {
  /** The reference images (data URLs), in scene order — the film's per-scene anchor frames. */
  images: readonly string[];
  /** How many the film takes (one per scene). */
  max: number;
  onAddImage: () => void;
  onRemoveImage: (index: number) => void;
  /** The uploaded soundtrack, if any. */
  audio: { name: string } | null;
  audioBusy: boolean;
  onAddAudio: () => void;
  onRemoveAudio: () => void;
}

export interface VideoCreateGenerate {
  /** Start the film — the same entry the composer's Send uses (guest gate and all). */
  onGenerate: () => void;
  /** A film or storyboard is already being made. */
  busy: boolean;
  /** There is something to make a film from (a prompt, a script or scene frames). */
  canGenerate: boolean;
  /** Whole credits, or null when unknown (a guest, or not read yet). Display-only. */
  balanceCredits: number | null;
  /** First-video slots left, or null when unknown. */
  freeFilmsRemaining: number | null;
  /** Open the shell's top-up. */
  onTopUp: () => void;
}

export interface VideoCreatePanelProps {
  locale: string;
  /** What the panel sits in: the phone's sheet (solid surface) or the desktop column (a tint of it). */
  surface: 'sheet' | 'panel';
  toolName: string;
  onSwitchTool: () => void;
  onClose: () => void;
  plan: VeoPlan;
  dispatch: (action: VeoPlanAction) => void;
  engine: VeoEngineInfo | null;
  mode: VideoMode;
  onMode: (m: VideoMode) => void;
  seconds: number;
  onSeconds: (s: number) => void;
  format: OutputFormat;
  onFormat: (f: OutputFormat) => void;
  prompt: string;
  onPrompt: (v: string) => void;
  placeholder?: string;
  refs: VideoCreateRefs;
  generate: VideoCreateGenerate;
  /** The lengths the server can render today (already limited to what the studio can order). */
  caps: VideoCapabilities;
  story: ReactNode;
  voice: ReactNode;
  advanced: ReactNode;
  storySummary?: string;
  voiceSummary?: string;
  storyOpenWhen?: boolean;
  voiceOpenWhen?: boolean;
}

type Sheet = 'duration' | 'format' | 'model' | null;

export function VideoCreatePanel(p: VideoCreatePanelProps) {
  const { locale, plan, dispatch, mode, seconds, format, prompt, refs, generate, caps } = p;
  const [tab, setTab] = useState<VideoTab>('create');
  const [sheet, setSheet] = useState<Sheet>(null);
  const [needed, setNeeded] = useState(false);
  const promptRef = useRef<HTMLTextAreaElement>(null);

  // A stored, typed or templated length that is off the grid — or locked — never stays selected.
  useEffect(() => {
    const open = openDuration(seconds, caps);
    if (open !== seconds) p.onSeconds(open);
    // p.onSeconds is a state setter in the caller; seconds/caps are what decide whether it must run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seconds, caps]);
  useEffect(() => { if (prompt.trim()) setNeeded(false); }, [prompt]);

  const tier = plan.tier;
  const credits = videoQuote({ seconds, tier, mode });
  const free = freeSlotApplies(generate.freeFilmsRemaining, seconds);
  const insufficient = !free && generate.balanceCredits !== null && generate.balanceCredits < credits;
  const audioToggle = p.engine?.audioToggle ?? false;
  const croppedNotes = planNotices({ ...plan, format }, { audioToggle }).filter((n) => n.id === 'cropped').map((n) => n[locale === 'en' ? 'en' : locale === 'ru' ? 'ru' : 'ka']);

  const insertToken = useCallback((token: string) => {
    const el = promptRef.current;
    const r = insertPromptToken(prompt, el?.selectionStart ?? prompt.length, el?.selectionEnd ?? prompt.length, token);
    p.onPrompt(r.value);
    requestAnimationFrame(() => { el?.focus(); try { el?.setSelectionRange(r.caret, r.caret); } catch { /* an unfocusable box */ } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt, p.onPrompt]);

  const onGenerate = () => {
    if (insufficient) { generate.onTopUp(); return; }
    if (!generate.canGenerate) { setNeeded(true); promptRef.current?.focus(); return; }
    setNeeded(false);
    generate.onGenerate();
  };

  return (
    <div data-testid="video-create-panel" className="space-y-3">
      <VideoCreateHeader locale={locale} title={p.toolName} onSwitchTool={p.onSwitchTool} onClose={p.onClose} />
      <VideoHero locale={locale} tier={tier} mode={mode} format={format} seconds={seconds} onChange={() => setSheet('model')} />
      <VideoTabs locale={locale} value={tab} onChange={setTab} />

      {tab === 'extend' ? (
        <VideoExtendTab locale={locale} surface={p.surface} />
      ) : (
        <div id="video-tabpanel-create" role="tabpanel" aria-labelledby="video-tab-create" className="space-y-3">
          <VideoRefsCard locale={locale} images={refs.images} maxImages={refs.max} onAddImage={refs.onAddImage} onRemoveImage={refs.onRemoveImage}
            audio={refs.audio} audioBusy={refs.audioBusy} onAddAudio={refs.onAddAudio} onRemoveAudio={refs.onRemoveAudio} />
          <VideoPromptCard
            locale={locale} value={prompt} onChange={p.onPrompt} placeholder={p.placeholder ?? vc(VIDEO_COPY.placeholder, locale)} textareaRef={promptRef}
            images={refs.images} onInsertToken={insertToken} onAddImage={refs.onAddImage}
            soundOn={plan.nativeAudio || !audioToggle} soundLocked={!audioToggle}
            onToggleSound={() => dispatch({ type: 'nativeAudio', on: !plan.nativeAudio })} needed={needed} />
          <VideoModelRow locale={locale} tier={tier} mode={mode} onOpen={() => setSheet('model')} />
          <VideoTiles locale={locale} seconds={seconds} format={format} resolution={videoResolution(seconds)}
            onLength={() => setSheet('duration')} onFormat={() => setSheet('format')} onResolution={() => setSheet('model')} />
          <VideoQualityRow locale={locale} tier={tier} mode={mode} seconds={seconds} onTier={(t) => dispatch({ type: 'tier', tier: t })} />

          <VideoDisclosure id="story" title={vc(VIDEO_COPY.story, locale)} summary={p.storySummary} openWhen={p.storyOpenWhen}>{p.story}</VideoDisclosure>
          <VideoDisclosure id="voice" title={vc(VIDEO_COPY.voice, locale)} summary={p.voiceSummary} openWhen={p.voiceOpenWhen}>{p.voice}</VideoDisclosure>
          <VideoDisclosure id="advanced" title={vc(VIDEO_COPY.advanced, locale)}>{p.advanced}</VideoDisclosure>

          <VideoGenerateBar surface={p.surface}>
            <GenerateButton label={vc(VIDEO_COPY.generate, locale)} credits={credits} free={free} insufficient={insufficient}
              loading={generate.busy} loadingLabel={vc(VIDEO_COPY.rendering, locale)} locale={locale} onClick={onGenerate} testId="video-generate" />
          </VideoGenerateBar>
        </div>
      )}

      <VideoDurationSheet open={sheet === 'duration'} onClose={() => setSheet(null)} locale={locale} seconds={seconds} onChange={p.onSeconds} caps={caps} tier={tier} mode={mode} />
      <VideoFormatSheet open={sheet === 'format'} onClose={() => setSheet(null)} locale={locale} format={format} onChange={p.onFormat} musicVideo={mode === 'musicvideo'} notes={croppedNotes} />
      <VideoModelSheet open={sheet === 'model'} onClose={() => setSheet(null)} locale={locale} tier={tier} mode={mode} seconds={seconds}
        onTier={(t) => dispatch({ type: 'tier', tier: t })} onMode={p.onMode} />
    </div>
  );
}
