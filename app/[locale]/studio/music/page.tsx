'use client';

import { Music2 } from 'lucide-react';
import { AgentShell } from '@/components/shared/AgentShell';

export default function MusicStudioPage() {
  return (
    <AgentShell
      agent="music"
      title="Music Generator"
      subtitle="AI composition & generation prompts · 8 credits"
      icon={<Music2 size={18} className="text-white" />}
      gradient="from-emerald-500 to-teal-600"
      placeholderPrompt={
        'Describe the music you want to compose.\n\n' +
        'e.g. "An uplifting 90-second background track for a Georgian tech startup video. ' +
        'Cinematic electronic with subtle traditional polyphony influences, ' +
        '120 BPM, builds to a hopeful crescendo."'
      }
      showContextInput
      contextLabel="Use-case / mood / reference tracks (optional)"
      backHref="/dashboard"
    />
  );
}
