'use client';

/**
 * VideoCreatePanel — the video tool's settings, one component for the phone's sheet and the desktop's right column.
 *
 * GG 2026-10-18 („ზედმეტი ფუნქციები წაშალე… პრომპტი ჩატის ველში უნდა ჩაიწეროს"): THE PROMPT LIVES ONLY IN THE CHAT
 * COMPOSER, and the composer's Send (its price on it — the same videoQuote) starts the film through the same runTool/send
 * path the panel's Generate used. The panel keeps only what changes the film, as short rows of dropdowns and switches:
 * header → Film | Music video → [length] [format] → Quality (priced select) · Sound · Narrator · Music · Subtitles (film) /
 * Lip-sync (music video, priced) → the optional photos (and a song). No disclosures, no second prompt box, no Generate —
 * except where a Higgsfield model is picked (its saga's own priced button, reading the composer's text).
 *
 * Script, dialogue, lyrics, per-scene action, effect and camera are no longer panel controls: the user types them in the
 * prompt, or attaches a .txt / .pdf / .docx in the composer (extractScriptText). Their state keeps its defaults.
 *
 * THE MODEL: the Quality select names the three Veo 3.1 tiers (the tier IS the model; Fast is the default) with their
 * prices; „Other models…" opens the studio's one ModelPicker (the Higgsfield video models, open where this deployment runs
 * them). The pick is remembered in this browser (lib/studio/modelPick) and re-applied when the panel mounts.
 *
 * ⚠️ EVERY PRICE HERE IS THE QUOTE (lib/video/createPanel.videoQuote → quoteCredits) for the seconds, tier and mode on
 * screen; the server charges the film through the same function. No request carries a price.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ModelPicker } from '@/components/studio/ui/ModelPicker';
import { catalogueEntry, catalogueLang, tierForVideoModel, videoModelForTier, type ModelRunner } from '@/lib/providers/catalogue';
import { pickerRows, useModelPick } from '@/lib/studio/modelPick';
import { useCatalogueStatus } from '@/components/studio/ui/useCatalogueStatus';
import { creditsLabel, quoteCredits } from '@/lib/credits/quote';
import { HiggsfieldGenerate } from './HiggsfieldGenerate';
import { lipsyncAddOnNote, openDuration, type VideoCapabilities } from '@/lib/video/createPanel';
import { activePlan, describeDurationPlan } from '@/lib/video/durationContract';
import { planNotices, type VeoPlan, type VeoPlanAction } from '@/lib/video/veoPlan';
import type { VideoMode } from '@/lib/credits/videoPricing';
import type { OutputFormat } from '@/lib/veo/types';
import type { VeoEngineInfo } from '../video/VeoParametersPanel';
import { VideoDurationSheet, VideoFormatSheet, VideoModeChoice } from './VideoPickers';
import {
  CARD, VideoCreateHeader, VideoGenerateBar, VideoQualitySelect, VideoRefsRow, VideoSettingRow, VideoSwitch, VideoTiles,
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

/** What the panel still needs to say about money (the Veo film itself starts from the composer's priced Send). */
export interface VideoCreateGenerate {
  /** Whole credits, or null when unknown (a guest, or not read yet). Display-only — a Higgsfield pick's button reads it. */
  balanceCredits: number | null;
  /** Open the shell's top-up. */
  onTopUp: () => void;
  /** The lip-sync pass this film would run, in credits (lib/video/createPanel.lipsyncAddOnCredits): its own charge,
   *  named under the switches. 0 or absent → this film runs none. */
  lipsyncCredits?: number;
  /** Put the cursor in the chat box (a Higgsfield tap with nothing typed). */
  onNeedPrompt?: () => void;
}

/** The film's sound switches — each bound to the studio's own state, so the request reads them unchanged. */
export interface VideoCreateAudio {
  narration: boolean;
  onNarration: (on: boolean) => void;
  narratorGender: 'female' | 'male';
  onNarratorGender: (g: 'female' | 'male') => void;
  music: boolean;
  onMusic: (on: boolean) => void;
  subtitles: boolean;
  onSubtitles: (on: boolean) => void;
  lipsync: boolean;
  onLipsync: (on: boolean) => void;
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
  /** The chat box's text (read-only here): a Higgsfield pick's button sends it. */
  prompt: string;
  refs: VideoCreateRefs;
  generate: VideoCreateGenerate;
  audio: VideoCreateAudio;
  /** The lengths the server can render today (already limited to what the studio can order). */
  caps: VideoCapabilities;
  /** Video Core v1.0 §4 — the length the user asked for in words when it is off the grid (OmniStudio videoRequestedSec):
   *  the panel then says requested · rendered · final beside the length instead of the rendered length alone. */
  requestedSec?: number | null;
  /** The plan's join model (lib/video/durationContract joinOverlapFor): 0 with cuts, 1 s per soft join — the scenes are counted from the stitched length. */
  joinOverlapSec?: number;
}

type Sheet = 'duration' | 'format' | 'model' | null;

/** What this panel can run: the Veo film (/api/chat/orchestrate, `veo.tier`), and the studio saga where the deployment has it. */
const FILM_RUNNERS: readonly ModelRunner[] = ['film', 'studio'];

export function VideoCreatePanel(p: VideoCreatePanelProps) {
  const { locale, plan, dispatch, mode, seconds, format, prompt, refs, generate, caps, audio } = p;
  const [sheet, setSheet] = useState<Sheet>(null);

  // A stored, typed or templated length that is off the grid — or locked — never stays selected.
  useEffect(() => {
    const open = openDuration(seconds, caps);
    if (open !== seconds) p.onSeconds(open);
    // p.onSeconds is a state setter in the caller; seconds/caps are what decide whether it must run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seconds, caps]);

  const tier = plan.tier;
  // The three lengths of an off-grid request — said only when there IS a trim to say (an on-grid ask is one length, the tile's).
  const requestPlan = activePlan(p.requestedSec, seconds, caps, { joinOverlapSec: p.joinOverlapSec ?? 0 });
  const finalPlan = requestPlan && requestPlan.deviation === 'trim' ? requestPlan : null;

  // ── the remembered model ────────────────────────────────────────────────────────────────────────────────────────────
  // The film's tier lives in the studio's Veo plan; this browser's pick lives in lib/studio/modelPick. A stored pick is
  // applied when it arrives (after hydration, or from another tab); any later tier change is stored. Neither effect writes
  // what the other just read, so they cannot ping-pong.
  const [storedModel, setStoredModel] = useModelPick('video');
  useEffect(() => {
    const t = tierForVideoModel(storedModel);
    if (t && t !== plan.tier) dispatch({ type: 'tier', tier: t });
    // Only a NEW stored pick is applied; the tier changing under it is the other effect's business.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storedModel]);
  const seenTier = useRef(plan.tier);
  useEffect(() => {
    if (seenTier.current === plan.tier) return;
    seenTier.current = plan.tier;
    setStoredModel(videoModelForTier(plan.tier).id);
  }, [plan.tier, setStoredModel]);

  // A Higgsfield pick: open only where the server says this deployment runs it; otherwise the film's Veo model stands.
  const storedIsStudio = catalogueEntry(storedModel)?.wire.runner === 'studio';
  const status = useCatalogueStatus('video', sheet === 'model' || storedIsStudio);
  const rows = useMemo(() => pickerRows('video', { runners: FILM_RUNNERS, status }), [status]);
  const hf = storedIsStudio && rows.some((r) => r.entry.id === storedModel && r.selectable) ? catalogueEntry(storedModel) : null;
  useEffect(() => {
    // A remembered Higgsfield pick this deployment can no longer run goes back to the film's Veo model (said by the server).
    if (status && storedIsStudio && !hf) setStoredModel(videoModelForTier(plan.tier).id);
  }, [status, storedIsStudio, hf, plan.tier, setStoredModel]);
  const hfName = hf ? hf.label[catalogueLang(locale)] : undefined;
  const audioToggle = p.engine?.audioToggle ?? false;
  const soundOn = plan.nativeAudio || !audioToggle;
  const hfHints = useMemo(() => ({ aspect: format, seconds, sound: soundOn }), [format, seconds, soundOn]);
  const croppedNotes = planNotices({ ...plan, format }, { audioToggle }).filter((n) => n.id === 'cropped').map((n) => n[locale === 'en' ? 'en' : locale === 'ru' ? 'ru' : 'ka']);
  const film = mode !== 'musicvideo';
  const lipsyncPrice = creditsLabel(quoteCredits({ tool: 'avatar' }), locale);

  return (
    <div data-testid="video-create-panel" className="space-y-3">
      <VideoCreateHeader locale={locale} title={p.toolName} onSwitchTool={p.onSwitchTool} onClose={p.onClose} />
      <VideoModeChoice locale={locale} mode={mode} onMode={p.onMode} />
      <VideoTiles locale={locale} seconds={seconds} format={format} onLength={() => setSheet('duration')} onFormat={() => setSheet('format')} />
      {finalPlan && (
        <p data-testid="video-duration-plan" data-final={finalPlan.finalSec} data-native={finalPlan.nativeSec} data-frames={finalPlan.finalFrames}
          className="rounded-2xl bg-app-elevated/70 px-3.5 py-2.5 text-[12.5px] leading-snug tabular-nums text-app-muted">
          {describeDurationPlan(finalPlan, locale)}
        </p>
      )}

      <div data-testid="video-settings" className={`${CARD} divide-y divide-app-border/10 py-1`}>
        <VideoSettingRow label={vc(VIDEO_COPY.quality, locale)}>
          <VideoQualitySelect locale={locale} tier={tier} mode={mode} seconds={seconds} otherName={hfName}
            onTier={(t) => { if (hf) setStoredModel(videoModelForTier(t).id); dispatch({ type: 'tier', tier: t }); }}
            onOtherModels={() => setSheet('model')} />
        </VideoSettingRow>
        <VideoSettingRow label={vc(VIDEO_COPY.sound, locale)} sub={vc(soundOn ? VIDEO_COPY.on : VIDEO_COPY.off, locale)}>
          <VideoSwitch label={vc(VIDEO_COPY.sound, locale)} on={soundOn} onChange={(on) => dispatch({ type: 'nativeAudio', on })} testId="video-sound"
            locked={!audioToggle} lockedReason={vc(VIDEO_COPY.soundLocked, locale)} />
        </VideoSettingRow>
        {film ? (
          <>
            {/* Narrator dropdown removed: voice auto-detected from prompt/persona */}
            <VideoSettingRow label={vc(VIDEO_COPY.music, locale)}>
              <VideoSwitch label={vc(VIDEO_COPY.music, locale)} on={audio.music} onChange={audio.onMusic} testId="video-music" />
            </VideoSettingRow>
            {audio.narration && (
              <VideoSettingRow label={vc(VIDEO_COPY.subtitles, locale)}>
                <VideoSwitch label={vc(VIDEO_COPY.subtitles, locale)} on={audio.subtitles} onChange={audio.onSubtitles} testId="video-subtitles" />
              </VideoSettingRow>
            )}
          </>
        ) : (
          <VideoSettingRow label={vc(VIDEO_COPY.lipsync, locale)} sub={vc(VIDEO_COPY.lipsyncSub(lipsyncPrice), locale)}>
            <VideoSwitch label={vc(VIDEO_COPY.lipsync, locale)} on={audio.lipsync} onChange={audio.onLipsync} testId="video-lipsync" />
          </VideoSettingRow>
        )}
        <VideoRefsRow locale={locale} images={refs.images} maxImages={refs.max} onAddImage={refs.onAddImage} onRemoveImage={refs.onRemoveImage}
          audio={refs.audio} audioBusy={refs.audioBusy} onAddAudio={refs.onAddAudio} onRemoveAudio={refs.onRemoveAudio} />
      </div>

      {!hf && (generate.lipsyncCredits ?? 0) > 0 && (
        <p data-testid="video-lipsync-addon" data-credits={generate.lipsyncCredits} className="px-1 text-[11.5px] leading-snug text-app-muted">
          {lipsyncAddOnNote(generate.lipsyncCredits ?? 0, locale)}
        </p>
      )}

      {hf ? (
        // A Higgsfield model renders through the studio saga: its server's price on its own button, the tap confirms it.
        // It sends the chat box's text — there is no second prompt box.
        <VideoGenerateBar surface={p.surface}>
          <HiggsfieldGenerate locale={locale} modelId={hf.id} service="video" label={vc(VIDEO_COPY.generate, locale)} prompt={prompt}
            hints={hfHints} images={refs.images} balanceCredits={generate.balanceCredits} onTopUp={generate.onTopUp}
            onNeedPrompt={() => generate.onNeedPrompt?.()} buttonTestId="video-generate" />
        </VideoGenerateBar>
      ) : (
        <p data-testid="video-prompt-hint" className="px-1 text-[12.5px] leading-snug text-app-muted">{vc(VIDEO_COPY.promptInChat, locale)}</p>
      )}
      {p.surface === 'sheet' && !hf && (
        // The phone's sheet covers the chat box: „Done" closes it, back to the box and its priced Send.
        <button type="button" onClick={p.onClose} data-testid="video-settings-done"
          className="flex min-h-[48px] w-full items-center justify-center rounded-2xl bg-app-elevated px-5 text-[15px] font-semibold text-app-text ring-1 ring-app-border/15 transition-colors hover:bg-app-elevated/70">
          {vc(VIDEO_COPY.done, locale)}
        </button>
      )}

      <VideoDurationSheet open={sheet === 'duration'} onClose={() => setSheet(null)} locale={locale} seconds={seconds} onChange={p.onSeconds} caps={caps} tier={tier} mode={mode} requestedSec={p.requestedSec ?? null} joinOverlapSec={p.joinOverlapSec ?? 0} />
      <VideoFormatSheet open={sheet === 'format'} onClose={() => setSheet(null)} locale={locale} format={format} onChange={p.onFormat} musicVideo={mode === 'musicvideo'} notes={croppedNotes} />
      <ModelPicker
        service="video"
        locale={locale}
        value={hf ? hf.id : videoModelForTier(tier).id}
        onChange={(id) => { setStoredModel(id); const t = tierForVideoModel(id); if (t && t !== tier) dispatch({ type: 'tier', tier: t }); }}
        runners={FILM_RUNNERS}
        status={status}
        open={sheet === 'model'}
        onOpenChange={(o) => setSheet(o ? 'model' : null)}
        trigger="none"
        title={vc(VIDEO_COPY.modelTitle, locale)}
        testId="video-model-sheet"
      />
    </div>
  );
}
