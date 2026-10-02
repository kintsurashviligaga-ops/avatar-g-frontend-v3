'use client';

/**
 * "Extend" (ref5): add a video, add references, pick a direction, describe what happens next, Generate.
 *
 * ⚠️ THIS TAB IS DRAWN COMPLETE AND LOCKED — it never pretends. There is no way to extend a video yet: lib/veo takes a first
 * frame, a first + last frame pair or up to three asset references (never a video), and the honest continuation — the last
 * frame of the clip as the first frame of a new one, then a stitch — has no route that stitches an UPLOADED video with a new
 * clip. So nothing here is clickable, the button says "Soon" and carries no price, and a plain line says why. The request
 * the route will take is already specified and tested (lib/video/createPanel `buildExtendRequest`); a Prequel is shown as
 * impossible because Veo has no "last frame only" mode.
 */
import { ChevronDown, Clock, Video } from 'lucide-react';
import { GenerateButton } from '@/components/studio/ui/GenerateButton';
import { EXTEND_DIRECTIONS } from '@/lib/video/createPanel';
import { VIDEO_COPY, vc } from './videoCreateCopy';
import { CARD, VideoGenerateBar, VideoRefsCard } from './videoCreateParts';

export function VideoExtendTab({ locale, surface }: { locale: string; surface: 'sheet' | 'panel' }) {
  const noop = () => undefined;
  return (
    <div id="video-tabpanel-extend" role="tabpanel" aria-labelledby="video-tab-extend" data-testid="video-extend" className="space-y-3">
      <p role="status" data-testid="video-extend-soon"
        className="flex items-start gap-2.5 rounded-2xl bg-app-accent/10 px-3.5 py-3 text-[13px] leading-snug text-app-text/90">
        <Clock size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-app-accent" />
        <span>{vc(VIDEO_COPY.extendSoon, locale)}</span>
      </p>

      <div aria-disabled="true" className="space-y-3 opacity-55">
        <div className="flex min-h-[130px] flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-app-border/30 bg-app-elevated/40 px-4 py-5 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-app-border/15 text-app-text/80"><Video size={22} aria-hidden="true" /></span>
          <p className="text-[17px] font-medium leading-snug text-app-text/90">{vc(VIDEO_COPY.addVideoToExtend, locale)}</p>
        </div>

        <VideoRefsCard locale={locale} images={[]} maxImages={0} onAddImage={noop} onRemoveImage={noop} audio={null} audioBusy={false}
          onAddAudio={noop} onRemoveAudio={noop} locked title={vc(VIDEO_COPY.extendRefsTitle, locale)} />

        <label className="block rounded-2xl border border-app-border/10 bg-app-elevated px-4 py-2.5">
          <span className="block text-[13.5px] text-app-muted">{vc(VIDEO_COPY.direction, locale)}</span>
          <span className="relative mt-0.5 flex items-center">
            <select disabled defaultValue="sequel" aria-label={vc(VIDEO_COPY.direction, locale)}
              className="min-h-[32px] w-full appearance-none border-0 bg-transparent p-0 pr-8 text-[17px] font-medium text-app-text outline-none">
              {EXTEND_DIRECTIONS.map((d) => (
                <option key={d.id} value={d.id} disabled={!d.supported}>{vc(d.id === 'sequel' ? VIDEO_COPY.sequel : VIDEO_COPY.prequel, locale)}</option>
              ))}
            </select>
            <ChevronDown size={18} aria-hidden="true" className="pointer-events-none absolute right-0 text-app-muted" />
          </span>
        </label>

        <div className={`${CARD} p-4`}>
          <p className="text-[15px] font-medium text-app-muted">{vc(VIDEO_COPY.prompt, locale)}</p>
          <p className="mt-1.5 min-h-[104px] text-[16px] leading-relaxed text-app-muted/70">{vc(VIDEO_COPY.extendPlaceholder, locale)}</p>
        </div>
      </div>

      <VideoGenerateBar surface={surface}>
        <GenerateButton label={vc(VIDEO_COPY.soon, locale)} disabled onClick={noop} locale={locale} testId="video-extend-generate" />
      </VideoGenerateBar>
    </div>
  );
}
