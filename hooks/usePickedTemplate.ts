import { useCallback, useEffect, useState } from 'react';
import { requestTemplateId } from '@/lib/studio/templates';

/**
 * Which template card a studio panel's REQUESTS may name (lib/studio/templates `requestTemplateId`).
 *
 * ⚠️ A LIT CARD IS NOT A PICKED CARD. The gallery lights whichever card the panel's values equal, and some panels
 * start out equal to one (the video defaults are the Reel; the image defaults plus the Photorealistic chip are the
 * Product shot). Sending the lit card's id gave every default film the Reel's look and director note, and every
 * Photorealistic image the catalogue-studio suffix, although nobody chose a card. So a request names a card only
 * after the user PICKED it (`pick`, called from the panel's apply*Preset), and only while `liveId` (the panel's
 * `match*Template`) still equals it.
 *
 * The first edit away FORGETS the pick: setting a field back re-lights the card, but its context is not sent again
 * until the user picks it again, so a card's context never returns without a deliberate choice.
 */
export function usePickedTemplate(liveId: string | null): { templateId: string | null; pick: (id: string) => void } {
  const [picked, setPicked] = useState<string | null>(null);
  useEffect(() => {
    if (picked !== null && liveId !== picked) setPicked(null);
  }, [picked, liveId]);
  const pick = useCallback((id: string) => setPicked(id), []);
  return { templateId: requestTemplateId(picked, liveId), pick };
}
