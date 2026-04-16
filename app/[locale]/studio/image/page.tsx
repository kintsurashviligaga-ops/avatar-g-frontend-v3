'use client';

import { ImageIcon } from 'lucide-react';
import { AgentShell } from '@/components/shared/AgentShell';

export default function ImageStudioPage() {
  return (
    <AgentShell
      agent="image"
      title="Image Generator"
      subtitle="AI-optimised diffusion prompts · 5 credits"
      icon={<ImageIcon size={18} className="text-white" />}
      gradient="from-violet-500 to-fuchsia-600"
      placeholderPrompt={
        'Describe the image you want to create.\n\n' +
        'e.g. "A futuristic Georgian city at golden hour, cinematic wide shot, ' +
        'vibrant neon reflections on wet cobblestones, ultra-detailed, 8K."'
      }
      showContextInput
      contextLabel="Style reference or model preference (optional)"
      backHref="/dashboard"
    />
  );
}
