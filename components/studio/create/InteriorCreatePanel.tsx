'use client';

/**
 * InteriorCreatePanel — the INTERIOR DESIGNER's settings, in the creation grammar of the owner's reference (docs/DESIGN.md
 * §8), in the order of GG's 2026-10-18 plan: header (the tool's name, a chevron to switch tools, ✕) · the prompt card · a
 * dashed card for the room photos (1–3, or none) · the room type · a carousel of styles · Advanced settings, shut (the model;
 * no size, GG 2026-10-23 "Hide") · the chip row (aspect · count) · the Generate pill with its price.
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
import { SHOOT_BRIEF_MAX, SHOOT_MAX_PHOTOS, nearestAspect } from '@/lib/studio/shootQuote';
import { ROOM_EDITS, addRoomEdit, interiorSummaryLine, interiorUxV2Copy, interiorUxV2On } from './newtools/interiorUxV2';
import { PanelHeader, PromptCard, ChipScroller, ProSettings, UploadCard } from './newtools/PanelParts';
import { ShootFooter } from './newtools/shared';
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
  // Phase 7.6 I1 · I4 (NEXT_PUBLIC_INTERIOR_UX_V2, off): a room photo is REDESIGNED, said so; a "You will get" line.
  const v2 = interiorUxV2On();
  const v2c = interiorUxV2Copy(lang);
  const editing = v2 && p.form.photos.length > 0;
  const first = p.form.photos[0];
  const aspectShown = p.form.aspect !== 'auto' ? p.form.aspect : first && first.w > 0 && first.h > 0 ? `${copy.auto} · ${nearestAspect(first.w, first.h)}` : copy.auto;
  const summary = v2 ? `${v2c.youGet} ${interiorSummaryLine({ tilesLine: copy.tilesLine(p.form.photos.length, p.form.count, p.tiles), aspect: aspectShown, credits: p.credits })}` : undefined;
  return (
    <div data-testid="interior-panel" className="space-y-4 pb-1">
      <PanelHeader Icon={Armchair} title={toolName('interior', p.locale)} copy={copy} onSwitch={p.onSwitchTool} onClose={p.onClose} testId="interior" />
      {editing && <p data-testid="interior-edit-banner" role="note" className="rounded-2xl bg-app-accent/10 px-4 py-2.5 text-[13px] leading-snug text-app-text ring-1 ring-app-accent/25">{v2c.banner}</p>}
      <PromptCard value={p.form.brief} onChange={(brief) => p.onPatch({ brief })} placeholder={editing ? v2c.placeholder : c.prompt} testId="interior" />
      {editing && (
        <div data-testid="interior-quick-edits" role="group" aria-label={v2c.quickEdits} className="flex flex-wrap gap-1.5">
          {ROOM_EDITS.map((e) => (
            <button key={e} type="button" data-testid={`interior-edit-${e}`}
              onClick={() => p.onPatch({ brief: addRoomEdit(p.form.brief, e, lang, SHOOT_BRIEF_MAX) })}
              className="min-h-[36px] rounded-full bg-app-elevated/55 px-3 text-[12.5px] text-app-text ring-1 ring-app-border/10 transition-colors hover:bg-app-elevated/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60">
              {v2c.edit[e].label}
            </button>
          ))}
        </div>
      )}
      <UploadCard photos={p.form.photos} max={SHOOT_MAX_PHOTOS} title={c.uploadTitle} limit={c.uploadLimit} note={p.form.photos.length ? c.uploadNoteWithPhoto : c.uploadNote}
        notice={p.notice} copy={copy} onFiles={p.onAddPhotos} onRemove={p.onRemovePhoto} testId="interior" />
      <ChipScroller label={copy.roomType} testId="interior-room"
        options={ROOM_TYPES.map((r) => ({ value: r.id, label: r.label[lang] }))}
        value={p.form.room} onChange={(v) => { if (v) p.onPatch({ room: v }); }} />
      <TemplateCarousel label={c.carousel} testId="interior-styles" scrollLabels={{ prev: copy.prev, next: copy.next }} Icon={Armchair}
        items={INTERIOR_TEMPLATES.map((t) => ({
          id: t.id, label: t.label[tl], hint: t.hint[tl], adds: interiorAddsLine(t, tl), thumb: t.thumb, palette: t.palette,
        }))}
        activeId={p.form.template} onPick={(id) => p.onPatch({ template: id })}
        addsLine={picked ? interiorAddsLine(picked, tl) : null} emptyLine={c.carouselNone} />
      <ProSettings copy={copy} summary={copy.modelValue} testId="interior" />
      <ShootFooter service="image.interior" copy={copy} locale={p.locale} form={p.form} tiles={p.tiles} credits={p.credits} insufficient={p.insufficient}
        canGenerate={p.canGenerate} needSomething={c.needSomething} onGenerate={p.onGenerate} testId="interior"
        {...(editing ? { generateLabel: v2c.redesign } : {})} {...(summary ? { summary } : {})}
        onAspect={(aspect) => p.onPatch({ aspect })} onCount={(count) => p.onPatch({ count })} />
    </div>
  );
}

export default InteriorCreatePanel;
