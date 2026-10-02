'use client';

/**
 * ImageCreatePanel — the Image tool's whole Create screen, laid out as Higgsfield's "Create image" (the owner's reference
 * for every tool, 2026-10-02) in our own tokens. A VIEW: OmniStudio holds the state (aspect, size, count, style, the prompt, the
 * attachments, the job queue) and passes it in; nothing here generates, bills or stores anything.
 *
 * Top to bottom on a 375 px phone — the order of ref3:
 *   header        the tool's name with a chevron (the tool switcher) · ✕ where the surrounding sheet is closable
 *   upload        a dashed card: "Choose an image to upload (max N)" — N is what the image route REALLY takes (one)
 *   prompt        the prompt card; its bottom row is "◎ Model … Auto ▾" — it opens the studio's ModelPicker (components/studio/ui):
 *                 Auto · Nano Banana V2 · Nano Banana Pro, and the models this route cannot run dimmed, saying where they run
 *   templates     a collapsible gallery directly under the prompt (open on a desktop, shut on a phone)
 *   advanced      the infrequent controls, shut: style · negative prompt · whatever the studio slots in (Script → Storyboard)
 *   ─ footer (sticky) ─
 *   chips         [▢ 1:1] [◇ 2K] [⧉ 1] — each opens a picker with large 44 px+ options
 *   Generate ✦ N  full width; N is `quoteCredits`, the SAME function the route charges with
 *
 * ⚠️ NOTHING THAT EXISTED IS GONE: the ten ratios, the three sizes, ×1/×2/×4, all thirteen styles, the negative prompt, the
 * template gallery (thumbnails, "Adds: …", the picked-card semantics — OmniStudio's `applyImagePreset`), the reference picture and
 * Script → Storyboard (the `advancedExtra` slot). Only their place changed.
 *
 * ⚠️ GENERATE NEVER SILENTLY DOES NOTHING: with no balance the tap is "Top up"; with an empty prompt it focuses the prompt and says
 * so; with a non-image file in the attachment tray (which would turn the request into chat) it says that and offers to drop them.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, Cpu, Gem, Image as ImageIcon, Layers, LayoutTemplate, SlidersHorizontal, X } from 'lucide-react';
import { GenerateButton } from '@/components/studio/ui/GenerateButton';
import { ModelPicker } from '@/components/studio/ui/ModelPicker';
import { TemplateGallery, type TemplateCardItem } from '@/components/studio/ui/TemplateGallery';
import { Chip, TextArea } from '@/components/studio/ui/controls';
import { creditsLabel } from '@/lib/credits/quote';
import {
  IMAGE_MAX_REFERENCES, IMAGE_TIERS, IMG_ASPECTS, IMG_COUNTS, IMG_STYLES, imageCredits, imageLang, imageModelFor, imageVariant,
  nativeQuality, tierFor, type ImgAspect, type ImgCount, type ImgQuality,
} from '@/lib/studio/imageCreate';
import type { ModelRunner } from '@/lib/providers/catalogue';
import { useModelPick } from '@/lib/studio/modelPick';
import { AspectGlyph } from './AspectGlyph';
import { imageCreateCopy } from './imageCreateCopy';
import { OptionChip, OptionChipRow } from './OptionChips';
import { OptionPicker, type PickerOption } from './OptionPicker';
import { PromptModelCard, type MicState } from './PromptModelCard';
import { ReferenceUploadCard } from './ReferenceUploadCard';

type PickerId = 'model' | 'aspect' | 'quality' | 'count';

/** The one route this panel sends to: /api/nanobanana/image. */
const IMAGE_RUNNERS: readonly ModelRunner[] = ['image'];

export interface ImageCreatePanelProps {
  locale: string;
  /** ≥ 1024 px: the panel is the right column — templates open by default, pickers are popovers. */
  desktop: boolean;
  // ── header
  onOpenTools: () => void;
  /** Given in a closable sheet (a phone): renders the ✕. */
  onClose?: () => void;
  // ── reference picture (the image route takes ONE)
  references: ReadonlyArray<{ src: string; name?: string }>;
  onAddReference: (files: File[]) => void;
  onRemoveReference: (index: number) => void;
  /** Attachments that are not images (they would turn the request into a chat message). */
  foreignFileCount: number;
  onClearForeignFiles: () => void;
  // ── prompt
  prompt: string;
  onPrompt: (value: string) => void;
  promptRef?: React.Ref<HTMLTextAreaElement>;
  onEnhance?: () => void;
  enhancing?: boolean;
  onMic?: () => void;
  micState?: MicState;
  // ── templates (OmniStudio's own gallery items and `applyImagePreset`)
  templates: readonly TemplateCardItem[];
  activeTemplate: string | null;
  onPickTemplate: (id: string) => void;
  // ── options
  aspect: ImgAspect;
  onAspect: (v: ImgAspect) => void;
  quality: ImgQuality;
  onQuality: (v: ImgQuality) => void;
  count: ImgCount;
  onCount: (v: ImgCount) => void;
  style: string;
  onStyle: (v: string) => void;
  styleLabel: (value: string) => string;
  negative: string;
  onNegative: (v: string) => void;
  /** Slotted into Advanced after the built-in controls (OmniStudio's Script → Storyboard). */
  advancedExtra?: ReactNode;
  /** Whether the slotted content holds something the user typed — so a shut Advanced still shows a dot. */
  advancedExtraDirty?: boolean;
  // ── model + price + run
  /**
   * The picked model (lib/providers/catalogue, service 'image'). Uncontrolled by default: the panel reads and writes the
   * browser's pick itself (lib/studio/modelPick) — the same store the studio reads when it sends (`imageModelField`).
   */
  model?: string;
  onModel?: (id: string) => void;
  /** The spendable balance in credits as the header chip shows it; null when unknown (a guest, or not loaded). */
  balance: number | null;
  onGenerate: () => void;
  onTopUp: () => void;
  /** The sheet this sits in already pads the home-indicator inset; set true where nothing else does. */
  insetBottom?: boolean;
}

/** A disclosure row: 52 px, an icon, a title, a quiet summary and a chevron. */
function DisclosureRow({
  icon, title, summary, dot, open, onToggle, controls, testId,
}: { icon: ReactNode; title: string; summary?: string; dot?: boolean; open: boolean; onToggle: () => void; controls: string; testId: string }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={controls}
      data-testid={testId}
      data-dirty={dot ? '' : undefined}
      className="flex min-h-[52px] w-full touch-manipulation items-center gap-3 rounded-2xl bg-app-elevated/40 px-4 text-left ring-1 ring-app-border/10 transition-colors hover:bg-app-elevated/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60"
    >
      <span className="flex shrink-0 items-center text-app-muted" aria-hidden="true">{icon}</span>
      <span className="shrink-0 text-[15px] font-medium text-app-text">{title}</span>
      {dot && <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-app-accent" />}
      <span className="ml-auto min-w-0 truncate text-[13px] text-app-muted">{!open ? summary : null}</span>
      <ChevronDown size={18} aria-hidden="true" className={`shrink-0 text-app-muted transition-transform ${open ? 'rotate-180' : ''}`} />
    </button>
  );
}

export function ImageCreatePanel(p: ImageCreatePanelProps) {
  const lang = imageLang(p.locale);
  const c = imageCreateCopy(p.locale);
  const uid = useId();
  const tplId = `${uid}-templates`;
  const advId = `${uid}-advanced`;

  // ── what the screen quotes: the SAME functions the routes charge with ─────────────────────────────────────────────────────
  const credits = imageCredits(p.count);
  const insufficient = p.balance !== null && p.balance < credits;
  const [storedModel, setStoredModel] = useModelPick('image');
  const model = imageModelFor(p.model ?? storedModel);
  const pickModel = p.onModel ?? setStoredModel;
  const tier = tierFor(p.quality);
  const onQuality = p.onQuality;
  // A model without the size on screen (Nano Banana Pro has no 1K) moves the chip to the nearest size it HAS — the chip never
  // reads a size the render would not be.
  useEffect(() => {
    const q = nativeQuality(model.id, p.quality);
    if (q !== p.quality) onQuality(q);
  }, [model.id, p.quality, onQuality]);

  // ── local view state ─────────────────────────────────────────────────────────────────────────────────────────────────────
  const [picker, setPicker] = useState<PickerId | null>(null);
  // null = "the default for this width" (open on a desktop, shut on a phone); the first tap makes it the user's choice.
  const [tplOpenChoice, setTplOpenChoice] = useState<boolean | null>(null);
  const tplOpen = tplOpenChoice ?? p.desktop;
  const [advOpen, setAdvOpen] = useState(false);
  const [needPrompt, setNeedPrompt] = useState(false);
  const promptEl = useRef<HTMLTextAreaElement | null>(null);
  const setPromptRef = useCallback((node: HTMLTextAreaElement | null) => {
    promptEl.current = node;
    const r = p.promptRef;
    if (typeof r === 'function') r(node);
    else if (r) (r as React.MutableRefObject<HTMLTextAreaElement | null>).current = node;
  }, [p.promptRef]);
  useEffect(() => { if (p.prompt.trim()) setNeedPrompt(false); }, [p.prompt]);

  // Opening a section on a phone leaves it below the fold (the footer covers the lower third): bring its header to the top.
  const tplSection = useRef<HTMLElement | null>(null);
  const advSection = useRef<HTMLElement | null>(null);
  const reveal = (el: HTMLElement | null) => {
    if (!el || typeof window === 'undefined') return;
    window.requestAnimationFrame(() => {
      if (typeof el.scrollIntoView !== 'function') return; // jsdom
      const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      el.scrollIntoView({ block: 'start', behavior: calm ? 'auto' : 'smooth' });
    });
  };

  const aspectBtn = useRef<HTMLButtonElement | null>(null);
  const qualityBtn = useRef<HTMLButtonElement | null>(null);
  const countBtn = useRef<HTMLButtonElement | null>(null);
  const closePicker = useCallback(() => setPicker(null), []);

  const generate = () => {
    if (insufficient) { p.onTopUp(); return; }
    if (p.foreignFileCount > 0) return; // the note above the prompt already says why
    if (!p.prompt.trim()) { setNeedPrompt(true); promptEl.current?.focus(); return; }
    p.onGenerate();
  };

  // ── picker contents ──────────────────────────────────────────────────────────────────────────────────────────────────────
  const aspectOptions = useMemo<PickerOption<ImgAspect>[]>(() => IMG_ASPECTS.map((a) => ({ value: a, label: a, glyph: <AspectGlyph ratio={a} size={26} on={a === p.aspect} /> })), [p.aspect]);
  const qualityOptions = useMemo<PickerOption<ImgQuality>[]>(() => IMAGE_TIERS.map((t) => {
    const v = imageVariant(model.id, t.quality);
    return {
      value: t.quality, label: t.res, glyph: <Gem size={20} />, disabled: !v.native,
      hint: v.native ? `Nano Banana ${v.family} · ${t.note[lang]}` : c.qualityNotOnModel(model.label[lang]),
      trailing: creditsLabel(imageCredits(1), p.locale),
    };
  }), [lang, p.locale, model, c]);
  const countOptions = useMemo<PickerOption<ImgCount>[]>(() => IMG_COUNTS.map((n) => ({
    value: n, label: c.countOption(n), glyph: <Layers size={20} />, trailing: creditsLabel(imageCredits(n), p.locale),
  })), [c, p.locale]);

  const dirtyAdvanced = p.style !== 'Auto' || p.negative.trim().length > 0 || !!p.advancedExtraDirty;
  const activeTemplateLabel = p.templates.find((t) => t.id === p.activeTemplate)?.label;
  // The footer sticks to the bottom of the column that scrolls it — and that column pads its content (the sheet 12 px, the
  // desktop column 16 px). A bare `bottom-0` stops at the CONTENT edge, so the padding strip under the button showed the
  // gallery scrolling past; the negative offset sets the footer flush with the real edge, and the same amount bleeds sideways.
  const footerEdge = p.desktop ? '-bottom-4 -mx-4 px-4' : '-bottom-3 -mx-3 px-3';

  return (
    <div data-testid="image-create-panel" className="min-w-0 max-w-full space-y-3 text-app-text">
      {/* ── header: the tool's name opens the tool switcher; ✕ closes the sheet it sits in ── */}
      <div data-create-row="header" className="flex items-center gap-2">
        <button
          type="button"
          onClick={p.onOpenTools}
          aria-haspopup="dialog"
          aria-label={`${c.title} — ${c.changeTool}`}
          data-testid="create-tool-switch"
          className="flex min-h-[48px] min-w-0 flex-1 touch-manipulation items-center gap-2.5 rounded-2xl px-1 text-left transition-colors hover:bg-app-elevated/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-app-accent/15 text-app-accent"><ImageIcon size={19} aria-hidden="true" /></span>
          <span className="min-w-0 truncate text-[17px] font-bold tracking-tight">{c.title}</span>
          <ChevronDown size={17} aria-hidden="true" className="shrink-0 text-app-muted" />
        </button>
        {p.onClose && (
          <button type="button" onClick={p.onClose} aria-label={c.close} title={c.close} data-testid="create-close"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-app-elevated text-app-text ring-1 ring-app-border/10 transition-colors hover:bg-app-elevated/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60">
            <X size={18} aria-hidden="true" />
          </button>
        )}
      </div>

      {/* ── upload ── */}
      <div data-create-row="upload">
        <ReferenceUploadCard
          items={p.references}
          max={IMAGE_MAX_REFERENCES}
          onFiles={p.onAddReference}
          onRemove={p.onRemoveReference}
          title={c.uploadTitle}
          limitLabel={c.uploadLimit(IMAGE_MAX_REFERENCES)}
          filledHint={c.uploadFilled}
          replaceLabel={c.uploadReplace}
          removeLabel={c.uploadRemove}
          extraNote={c.uploadExtra}
        />
      </div>
      {p.foreignFileCount > 0 && (
        <div role="alert" data-testid="create-foreign-files" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-app-warning/10 px-4 py-2.5 text-[13px] leading-snug text-app-text ring-1 ring-app-warning/25">
          <span className="min-w-0 flex-1">{c.foreignFiles}</span>
          <button type="button" onClick={p.onClearForeignFiles} className="min-h-[44px] shrink-0 rounded-full px-3 text-[13px] font-semibold text-app-accent hover:bg-app-accent/10">{c.foreignFilesAction}</button>
        </div>
      )}

      {/* ── prompt (+ the model row) ── */}
      <div data-create-row="prompt">
        <PromptModelCard
          ref={setPromptRef}
          value={p.prompt}
          onChange={p.onPrompt}
          placeholder={c.promptPlaceholder}
          label={c.promptLabel}
          onSubmit={generate}
          modelLabel={c.model}
          modelValue={model.label[lang]}
          modelIcon={<Cpu size={18} />}
          modelOpen={picker === 'model'}
          onOpenModel={() => setPicker((cur) => (cur === 'model' ? null : 'model'))}
          {...(p.onEnhance ? { onEnhance: p.onEnhance, enhanceLabel: c.enhance } : {})}
          enhancing={!!p.enhancing}
          {...(p.onMic ? { onMic: p.onMic, micLabels: { start: c.micStart, stop: c.micStop, wait: c.micWait } } : {})}
          micState={p.micState ?? 'idle'}
          invalid={needPrompt}
          invalidMessage={c.needPrompt}
        />
      </div>

      {/* ── templates: directly under the prompt ── */}
      <section ref={tplSection} data-create-row="templates" aria-label={c.templates} className="scroll-mt-2">
        <DisclosureRow
          icon={<LayoutTemplate size={18} />}
          title={c.templates}
          summary={activeTemplateLabel ?? c.templatesPick}
          open={tplOpen}
          onToggle={() => { setTplOpenChoice(!tplOpen); if (!tplOpen) reveal(tplSection.current); }}
          controls={tplId}
          testId="templates-toggle"
        />
        {tplOpen && (
          <div id={tplId} className="mt-2 rounded-3xl border border-app-border/10 bg-app-elevated/30 p-3">
            <TemplateGallery testId="image-templates" label={c.templatesPick} items={p.templates} activeId={p.activeTemplate} onPick={p.onPickTemplate} />
          </div>
        )}
      </section>

      {/* ── advanced: everything that is not asked for on every run ── */}
      <section ref={advSection} data-create-row="advanced" aria-label={c.advanced} className="scroll-mt-2">
        <DisclosureRow
          icon={<SlidersHorizontal size={18} />}
          title={c.advanced}
          summary={p.style !== 'Auto' ? p.styleLabel(p.style) : c.advancedNone}
          dot={dirtyAdvanced}
          open={advOpen}
          onToggle={() => { setAdvOpen(!advOpen); if (!advOpen) reveal(advSection.current); }}
          controls={advId}
          testId="advanced-toggle"
        />
        {advOpen && (
          <div id={advId} className="mt-2 space-y-4 rounded-3xl border border-app-border/10 bg-app-elevated/30 p-3.5">
            <div>
              <p className="mb-2 text-[12.5px] font-semibold text-app-text">{c.style}</p>
              {/* Wraps, never scrolls sideways: thirteen styles in a strip hid most of them behind the edge. */}
              <div className="flex min-w-0 flex-wrap gap-1.5" role="group" aria-label={c.style}>
                {IMG_STYLES.map((s) => <Chip key={s} active={p.style === s} onClick={() => p.onStyle(s)}>{p.styleLabel(s)}</Chip>)}
              </div>
            </div>
            <div>
              <label htmlFor={`${uid}-neg`} className="mb-2 block text-[12.5px] font-semibold text-app-text">{c.negative}</label>
              <TextArea id={`${uid}-neg`} rows={2} value={p.negative} onChange={(e) => p.onNegative(e.target.value)} placeholder={c.negativePlaceholder} data-testid="create-negative" />
            </div>
            {p.advancedExtra}
          </div>
        )}
      </section>

      {/* ── the footer: the three chips and the one button, pinned to the bottom of whatever scrolls ── */}
      <div
        data-create-row="footer"
        className={`sticky z-10 ${footerEdge} space-y-3 border-t border-app-border/10 bg-app-surface pt-3`}
        style={{ paddingBottom: p.insetBottom ? 'calc(env(safe-area-inset-bottom, 0px) + 8px)' : 8 }}
      >
        <div data-create-row="options">
          <OptionChipRow label={`${c.aspect} · ${c.quality} · ${c.count}`}>
            <OptionChip ref={aspectBtn} icon={<AspectGlyph ratio={p.aspect} size={18} />} label={`${c.aspect}: ${p.aspect}`} expanded={picker === 'aspect'} onClick={() => setPicker((cur) => (cur === 'aspect' ? null : 'aspect'))} testId="chip-aspect">{p.aspect}</OptionChip>
            <OptionChip ref={qualityBtn} icon={<Gem size={18} />} label={`${c.quality}: ${tier.res}`} expanded={picker === 'quality'} onClick={() => setPicker((cur) => (cur === 'quality' ? null : 'quality'))} testId="chip-quality">{tier.res}</OptionChip>
            <OptionChip ref={countBtn} icon={<Layers size={18} />} label={`${c.count}: ${p.count}`} expanded={picker === 'count'} onClick={() => setPicker((cur) => (cur === 'count' ? null : 'count'))} testId="chip-count">{p.count}</OptionChip>
          </OptionChipRow>
        </div>
        <div data-create-row="generate">
          <GenerateButton
            label={c.generate}
            credits={credits}
            insufficient={insufficient}
            locale={p.locale}
            onClick={generate}
            testId="create-generate"
          />
        </div>
      </div>

      {/* ── pickers: a sheet on a phone, a popover on a desktop ── */}
      <OptionPicker open={picker === 'aspect'} onClose={closePicker} title={c.aspect} closeLabel={c.pickerClose} options={aspectOptions} value={p.aspect} onSelect={p.onAspect} desktop={p.desktop} anchorRef={aspectBtn} columns={5} testId="picker-aspect" />
      <OptionPicker open={picker === 'quality'} onClose={closePicker} title={c.quality} closeLabel={c.pickerClose} options={qualityOptions} value={p.quality} onSelect={p.onQuality} desktop={p.desktop} anchorRef={qualityBtn} testId="picker-quality" />
      <OptionPicker open={picker === 'count'} onClose={closePicker} title={c.countTitle} closeLabel={c.pickerClose} options={countOptions} value={p.count} onSelect={p.onCount} desktop={p.desktop} anchorRef={countBtn} testId="picker-count" />
      {/* ⚠️ No price in the model list: the request names the model and the server quotes it — the number is on Generate. */}
      <ModelPicker
        service="image"
        locale={p.locale}
        value={model.id}
        onChange={pickModel}
        runners={IMAGE_RUNNERS}
        open={picker === 'model'}
        onOpenChange={(o) => setPicker(o ? 'model' : null)}
        trigger="none"
        title={c.modelTitle}
        testId="picker-model"
      />
    </div>
  );
}
