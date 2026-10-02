'use client';

/**
 * InteriorCreatePanel — the INTERIOR DESIGNER's settings, in the creation grammar of the owner's reference (docs/DESIGN.md
 * §8): header (the tool's name, a chevron to switch tools, ✕) · a dashed card for the room photos (1–3, or none) · the room
 * type · a carousel of styles · the prompt card · the chip row (aspect · quality · count) · the Generate pill with its price.
 *
 * A pure view. Everything it shows and every change it makes comes through props from useShootStudio
 * (components/studio/create/newtools), which OmniStudio calls once; nothing here reaches a route. The number on the button
 * is `credits` — shootCredits(photos, count) = quoteCredits({ tool:'image', count: renders }), the function
 * /api/nanobanana/image charges with per render — and a tap on it is the hook's `generate`: a guest is sent to sign-in, a
 * short balance to the top-up, before anything is submitted.
 */
import { Armchair } from 'lucide-react';
import { INTERIOR_TEMPLATES, ROOM_TYPES, interiorAddsLine, interiorTemplate } from '@/lib/studio/templates.interior';
import { templateLang } from '@/lib/studio/templates';
import { toolName } from '@/lib/studio/tools';
import { SHOOT_MAX_PHOTOS } from '@/lib/studio/shootQuote';
import { PanelHeader, PromptCard, ChipScroller, UploadCard } from './newtools/PanelParts';
import { ShootChips, ShootFooter } from './newtools/shared';
import { TemplateCarousel } from './newtools/TemplateCarousel';
import { SHOOT_COPY, shootLang } from './newtools/copy';
import type { InteriorForm } from './newtools/useShootStudio';

export interface InteriorPanelProps {
  locale: string;
  form: InteriorForm;
  /** The quote for one press — shootCredits(photos, count), the route's own function. */
  credits: number;
  /** Renders in one press (photos × count). */
  tiles: number;
  insufficient: boolean;
  canGenerate: boolean;
  notice: string | null;
  onPatch: (p: Partial<InteriorForm>) => void;
  onAddPhotos: (files: File[]) => void;
  onRemovePhoto: (id: string) => void;
  onGenerate: () => void;
  onClose: () => void;
  onSwitchTool: () => void;
}

export function InteriorCreatePanel(p: InteriorPanelProps) {
  const lang = shootLang(p.locale);
  const copy = SHOOT_COPY[lang];
  const c = copy.interior;
  const tl = templateLang(p.locale);
  const picked = interiorTemplate(p.form.template);
  return (
    <div data-testid="interior-panel" className="space-y-4 pb-1">
      <PanelHeader Icon={Armchair} title={toolName('interior', p.locale)} copy={copy} onSwitch={p.onSwitchTool} onClose={p.onClose} testId="interior" />
      <UploadCard photos={p.form.photos} max={SHOOT_MAX_PHOTOS} title={c.uploadTitle} limit={c.uploadLimit} note={c.uploadNote}
        notice={p.notice} copy={copy} onFiles={p.onAddPhotos} onRemove={p.onRemovePhoto} testId="interior" />
      <ChipScroller label={copy.roomType} testId="interior-room"
        options={ROOM_TYPES.map((r) => ({ value: r.id, label: r.label[lang] }))}
        value={p.form.room} onChange={(v) => { if (v) p.onPatch({ room: v }); }} />
      <TemplateCarousel label={c.carousel} testId="interior-styles" Icon={Armchair}
        items={INTERIOR_TEMPLATES.map((t) => ({
          id: t.id, label: t.label[tl], hint: t.hint[tl], adds: interiorAddsLine(t, tl), thumb: t.thumb, palette: t.palette,
        }))}
        activeId={p.form.template} onPick={(id) => p.onPatch({ template: id })}
        addsLine={picked ? interiorAddsLine(picked, tl) : null} emptyLine={c.carouselNone} />
      <PromptCard value={p.form.brief} onChange={(brief) => p.onPatch({ brief })} placeholder={c.prompt} copy={copy} testId="interior" />
      <ShootChips aspect={p.form.aspect} quality={p.form.quality} count={p.form.count} photos={p.form.photos} copy={copy}
        onAspect={(aspect) => p.onPatch({ aspect })} onQuality={(quality) => p.onPatch({ quality })} onCount={(count) => p.onPatch({ count })} testId="interior" />
      <ShootFooter copy={copy} locale={p.locale} photos={p.form.photos.length} count={p.form.count} tiles={p.tiles} credits={p.credits}
        insufficient={p.insufficient} canGenerate={p.canGenerate} needSomething={c.needSomething} onGenerate={p.onGenerate} testId="interior" />
    </div>
  );
}

export default InteriorCreatePanel;
