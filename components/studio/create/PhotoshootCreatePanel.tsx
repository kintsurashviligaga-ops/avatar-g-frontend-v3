'use client';

/**
 * PhotoshootCreatePanel — the PHOTOGRAPHER's settings, in the same creation grammar as the Interior designer's
 * (InteriorCreatePanel): header · a dashed card for your product / person photos (optional, up to 3 — each shot separately) ·
 * a carousel of shoot presets · the camera (lens · light · angle · depth of field, as chips) · the prompt card · the chip row
 * (aspect · quality · count) · the Generate pill with its price.
 *
 * ⚠️ NOT THE `photo` TOOL. `photo` is on-device culling (no upload, no credits); this one makes new pictures and spends
 * credits per image. A pure view bound through props to useShootStudio — the price is the route's own function
 * (shootCredits), a picked preset suggests its shape ONCE (the hook sets the aspect; the chip stays free), and a camera chip
 * left on „Preset" leaves the preset's own look (the server appends a camera directive only for a chip that was picked).
 */
import { Camera } from 'lucide-react';
import {
  ANGLE_OPTIONS, DOF_OPTIONS, LENS_OPTIONS, LIGHT_OPTIONS, PHOTOSHOOT_TEMPLATES, photoshootAddsLine, photoshootTemplate,
} from '@/lib/studio/templates.photoshoot';
import { templateLang } from '@/lib/studio/templates';
import { toolName } from '@/lib/studio/tools';
import { SHOOT_MAX_PHOTOS } from '@/lib/studio/shootQuote';
import { ChipScroller, PanelHeader, PromptCard, UploadCard } from './newtools/PanelParts';
import { ShootFooter } from './newtools/shared';
import { TemplateCarousel } from './newtools/TemplateCarousel';
import { SHOOT_COPY, shootLang } from './newtools/copy';
import type { PhotoshootForm } from './newtools/useShootStudio';

export interface PhotoshootPanelProps {
  locale: string;
  form: PhotoshootForm;
  credits: number;
  tiles: number;
  insufficient: boolean;
  canGenerate: boolean;
  notice: string | null;
  onPatch: (p: Partial<PhotoshootForm>) => void;
  /** Picking a preset: sets the card AND suggests its shape (useShootStudio.pickPhotoshoot). */
  onPickPreset: (id: string) => void;
  onAddPhotos: (files: File[]) => void;
  onRemovePhoto: (id: string) => void;
  onGenerate: () => void;
  onClose: () => void;
  onSwitchTool: () => void;
}

export function PhotoshootCreatePanel(p: PhotoshootPanelProps) {
  const lang = shootLang(p.locale);
  const copy = SHOOT_COPY[lang];
  const c = copy.photoshoot;
  const tl = templateLang(p.locale);
  const picked = photoshootTemplate(p.form.template);
  const preset = { value: null, label: copy.fromPreset } as const;
  return (
    <div data-testid="photoshoot-panel" className="space-y-4 pb-1">
      <PanelHeader Icon={Camera} title={toolName('photoshoot', p.locale)} copy={copy} onSwitch={p.onSwitchTool} onClose={p.onClose} testId="photoshoot" />
      <UploadCard photos={p.form.photos} max={SHOOT_MAX_PHOTOS} title={c.uploadTitle} limit={c.uploadLimit} note={p.form.photos.length ? c.uploadNoteWithPhoto : c.uploadNote}
        notice={p.notice} copy={copy} onFiles={p.onAddPhotos} onRemove={p.onRemovePhoto} testId="photoshoot" />
      <TemplateCarousel label={c.carousel} testId="photoshoot-presets" scrollLabels={{ prev: copy.prev, next: copy.next }} Icon={Camera}
        items={PHOTOSHOOT_TEMPLATES.map((t) => ({
          id: t.id, label: t.label[tl], hint: t.hint[tl], adds: photoshootAddsLine(t, tl), thumb: t.thumb, palette: t.palette, meta: t.aspect,
        }))}
        activeId={p.form.template}
        onPick={(id) => { if (id) p.onPickPreset(id); else p.onPatch({ template: null }); }}
        addsLine={picked ? photoshootAddsLine(picked, tl) : null} emptyLine={c.carouselNone} />
      <section data-testid="photoshoot-camera" aria-label={copy.lens} className="space-y-3 rounded-3xl bg-app-elevated/40 p-4 ring-1 ring-app-border/10">
        <ChipScroller label={copy.lens} testId="photoshoot-lens" options={[preset, ...LENS_OPTIONS.map((o) => ({ value: o.id, label: o.label[lang] }))]}
          value={p.form.lens} onChange={(lens) => p.onPatch({ lens })} />
        <ChipScroller label={copy.light} testId="photoshoot-light" options={[preset, ...LIGHT_OPTIONS.map((o) => ({ value: o.id, label: o.label[lang] }))]}
          value={p.form.light} onChange={(light) => p.onPatch({ light })} />
        <ChipScroller label={copy.angle} testId="photoshoot-angle" options={[preset, ...ANGLE_OPTIONS.map((o) => ({ value: o.id, label: o.label[lang] }))]}
          value={p.form.angle} onChange={(angle) => p.onPatch({ angle })} />
        <ChipScroller label={copy.dof} testId="photoshoot-dof" options={[preset, ...DOF_OPTIONS.map((o) => ({ value: o.id, label: o.label[lang] }))]}
          value={p.form.dof} onChange={(dof) => p.onPatch({ dof })} />
      </section>
      <PromptCard value={p.form.brief} onChange={(brief) => p.onPatch({ brief })} placeholder={c.prompt} copy={copy} testId="photoshoot" />
      <ShootFooter service="image.photoshoot" copy={copy} locale={p.locale} form={p.form} tiles={p.tiles} credits={p.credits} insufficient={p.insufficient}
        canGenerate={p.canGenerate} needSomething={c.needSomething} onGenerate={p.onGenerate} testId="photoshoot"
        onAspect={(aspect) => p.onPatch({ aspect })} onQuality={(quality) => p.onPatch({ quality })} onCount={(count) => p.onPatch({ count })} />
    </div>
  );
}

export default PhotoshootCreatePanel;
