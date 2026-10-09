'use client';

/**
 * VideoCreatePanel — the video tool's create screen (ref4 / ref5), one component for the phone's sheet and the desktop's
 * right column (the same element, only the surrounding scroll container differs).
 *
 * Order, top to bottom: header (tool name + tool switcher, ✕) → HERO model card ("✎ Change") →
 * "Add references" (images → the film's reference frames, audio → the soundtrack) → Prompt (+ "@ Elements", 🔊 On/Off) →
 * Model row → [length] [format] [resolution] tiles → quality (Economy · Fast · Max quality, each with its price) →
 * disclosures (Story & style · Voice & music · Advanced) → Generate ✦ N, pinned.
 *
 * ⚠️ NOTHING THE CINEMA TAB HAD IS GONE. Mode, effect, transitions, voices, dialogue, lip-sync, the master script, the
 * templates, the scene frames, the storyboard and the Veo camera controls are the three disclosures' content — OmniStudio
 * passes the very same blocks in as `story`, `voice` and `advanced`, so they keep their state and their behaviour.
 *
 * THE MODEL is the studio's one ModelPicker (components/studio/ui/ModelPicker): Google first — Veo 3.1 Lite · Fast · Max
 * quality, which the film route runs (`veo.tier` — the tier IS the model; Fast is the default) — then the Higgsfield video
 * models, open where this deployment can run them and dimmed with why where it cannot. "✎ Change", the Model row and the
 * resolution tile open it; the documentary / music-video switch rides at its top. The pick is remembered in this browser
 * (lib/studio/modelPick) and re-applied when the panel mounts; whatever changes the tier (the quality row, the desktop table)
 * is remembered too. No price in it — the price is on Generate.
 *
 * A HIGGSFIELD PICK renders one clip through the studio saga (HiggsfieldGenerate: the server's price on the button, the tap
 * confirms it) instead of the Veo film: the hero and the Model row name it, the Veo tier row steps aside, and the line above
 * the button says the length that model really renders (Kling: 3–15 s).
 *
 * ⚠️ THE NUMBER ON THE BUTTON IS THE QUOTE (lib/video/createPanel.videoQuote → quoteCredits → videoCredits) for exactly the
 * seconds, tier and mode on screen; the server charges the film through the same function. No request carries a price.
 * `free` shows only for ONE short clip (≤ 8 s) while the trial slot is left; `insufficient` turns the tap into the top-up.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { GenerateButton } from '@/components/studio/ui/GenerateButton';
import { ModelPicker } from '@/components/studio/ui/ModelPicker';
import { catalogueEntry, catalogueLang, tierForVideoModel, videoModelForTier, type ModelRunner } from '@/lib/providers/catalogue';
import { pickerRows, useModelPick } from '@/lib/studio/modelPick';
import { useCatalogueStatus } from '@/components/studio/ui/useCatalogueStatus';
import { HiggsfieldGenerate } from './HiggsfieldGenerate';
import { videoQuote, freeSlotApplies, insertPromptToken, openDuration, videoResolution, type VideoCapabilities } from '@/lib/video/createPanel';
import { planNotices, type VeoPlan, type VeoPlanAction } from '@/lib/video/veoPlan';
import type { VideoMode } from '@/lib/credits/videoPricing';
import type { OutputFormat } from '@/lib/veo/types';
import type { VeoEngineInfo } from '../video/VeoParametersPanel';
import { VideoDurationSheet, VideoFormatSheet, VideoModeChoice } from './VideoPickers';
import {
  VideoCreateHeader, VideoDisclosure, VideoGenerateBar, VideoHero, VideoPromptCard, VideoQualityRow, VideoRefsCard,
  VideoTiles,
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

/** What this panel can run: the Veo film (/api/chat/orchestrate, `veo.tier`), and the studio saga where the deployment has it. */
const FILM_RUNNERS: readonly ModelRunner[] = ['film', 'studio'];

export function VideoCreatePanel(p: VideoCreatePanelProps) {
  const { locale, plan, dispatch, mode, seconds, format, prompt, refs, generate, caps } = p;
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

  // ── the remembered model ────────────────────────────────────────────────────────────────────────────────────────────
  // The film's tier lives in the studio's Veo plan; this browser's pick lives in lib/studio/modelPick. A stored pick is
  // applied when it arrives (after hydration, or from another tab); any later tier change — this sheet, the quality row,
  // the desktop table — is stored. Neither effect writes what the other just read, so they cannot ping-pong.
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
  const hfHints = useMemo(() => ({ aspect: format, seconds, sound: plan.nativeAudio || !(p.engine?.audioToggle ?? false) }), [format, seconds, plan.nativeAudio, p.engine?.audioToggle]);
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
      <VideoHero locale={locale} tier={tier} mode={mode} format={format} seconds={seconds} onChange={() => setSheet('model')} {...(hfName ? { title: hfName } : {})} />
      {/* No Create | Extend tabs: Extend is not open yet (Veo continues a clip from its last frame; until that path is ready a
          long film is made with the length picker), and a whole tab that only said „soon" was the first thing under the model. */}
      <div className="space-y-3">
          <VideoRefsCard locale={locale} images={refs.images} maxImages={refs.max} onAddImage={refs.onAddImage} onRemoveImage={refs.onRemoveImage}
            audio={refs.audio} audioBusy={refs.audioBusy} onAddAudio={refs.onAddAudio} onRemoveAudio={refs.onRemoveAudio} />
          <VideoPromptCard
            locale={locale} value={prompt} onChange={p.onPrompt} placeholder={p.placeholder ?? vc(VIDEO_COPY.placeholder, locale)} textareaRef={promptRef}
            images={refs.images} onInsertToken={insertToken} onAddImage={refs.onAddImage}
            soundOn={plan.nativeAudio || !audioToggle} soundLocked={!audioToggle}
            onToggleSound={() => dispatch({ type: 'nativeAudio', on: !plan.nativeAudio })} needed={needed} />
          {/* No separate „Model ›" row: the hero card above names the model and its „Change" opens the same picker. */}
          <VideoTiles locale={locale} seconds={seconds} format={format} resolution={videoResolution(seconds)}
            onLength={() => setSheet('duration')} onFormat={() => setSheet('format')} onResolution={() => setSheet('model')} />
          {/* Veo's three tiers ARE Veo models; with a Higgsfield model picked they would be a second, contradicting choice. */}
          {!hf && <VideoQualityRow locale={locale} tier={tier} mode={mode} seconds={seconds} onTier={(t) => dispatch({ type: 'tier', tier: t })} />}

          <VideoDisclosure id="story" title={vc(VIDEO_COPY.story, locale)} summary={p.storySummary} openWhen={p.storyOpenWhen}>{p.story}</VideoDisclosure>
          <VideoDisclosure id="voice" title={vc(VIDEO_COPY.voice, locale)} summary={p.voiceSummary} openWhen={p.voiceOpenWhen}>{p.voice}</VideoDisclosure>
          <VideoDisclosure id="advanced" title={vc(VIDEO_COPY.advanced, locale)}>{p.advanced}</VideoDisclosure>

          <VideoGenerateBar surface={p.surface}>
            {hf ? (
              <HiggsfieldGenerate locale={locale} modelId={hf.id} service="video" label={vc(VIDEO_COPY.generate, locale)} prompt={prompt}
                hints={hfHints} images={refs.images} balanceCredits={generate.balanceCredits} onTopUp={generate.onTopUp}
                onNeedPrompt={() => { setNeeded(true); promptRef.current?.focus(); }} buttonTestId="video-generate" />
            ) : (
              <GenerateButton service="video.generate" label={vc(VIDEO_COPY.generate, locale)} credits={credits} free={free} insufficient={insufficient}
                loading={generate.busy} loadingLabel={vc(VIDEO_COPY.rendering, locale)} locale={locale} onClick={onGenerate} testId="video-generate" />
            )}
          </VideoGenerateBar>
        </div>

      <VideoDurationSheet open={sheet === 'duration'} onClose={() => setSheet(null)} locale={locale} seconds={seconds} onChange={p.onSeconds} caps={caps} tier={tier} mode={mode} />
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
        header={<VideoModeChoice locale={locale} mode={mode} onMode={p.onMode} />}
        testId="video-model-sheet"
      />
    </div>
  );
}
