'use client';

import { UserCircle2 } from 'lucide-react';
import { AgentShell } from '@/components/shared/AgentShell';

export default function AvatarStudioPage() {
  return (
    <AgentShell
      agent="avatar"
      title="Avatar Generator"
      subtitle="AI-powered avatar creation · 10 credits"
      icon={<UserCircle2 size={18} className="text-white" />}
      gradient="from-cyan-500 to-blue-600"
      placeholderPrompt={
        'Describe your avatar in detail.\n\n' +
        'e.g. "A professional Georgian woman in her 30s with dark hair, ' +
        'confident expression, corporate style, warm and approachable personality. ' +
        'Voice: clear, authoritative. Use-case: business presentations."'
      }
      showContextInput
      contextLabel="Brand / personality context (optional)"
      backHref="/dashboard"
    />
  );
}
