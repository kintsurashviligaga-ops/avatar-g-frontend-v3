'use client';

import { Film } from 'lucide-react';
import { AgentShell } from '@/components/shared/AgentShell';

export default function VideoStudioPage() {
  return (
    <AgentShell
      agent="video"
      title="Video Generator"
      subtitle="Shot-by-shot AI video scripts · 15 credits"
      icon={<Film size={18} className="text-white" />}
      gradient="from-rose-500 to-orange-500"
      placeholderPrompt={
        'Describe the video you want to produce.\n\n' +
        'e.g. "A 30-second product ad for a Georgian craft beer brand. ' +
        'Opening wide shot of Tbilisi old town at dusk, ' +
        'close-up of amber liquid being poured, ' +
        'lifestyle scenes of friends toasting. Upbeat, modern energy."'
      }
      showContextInput
      contextLabel="Target platform / duration / tone (optional)"
      backHref="/dashboard"
    />
  );
}
