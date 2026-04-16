'use client';

import { FileText } from 'lucide-react';
import { AgentShell } from '@/components/shared/AgentShell';

export default function CopyStudioPage() {
  return (
    <AgentShell
      agent="copy"
      title="Copy / SEO Generator"
      subtitle="Headlines, body copy & meta tags · 3 credits"
      icon={<FileText size={18} className="text-white" />}
      gradient="from-amber-500 to-yellow-500"
      placeholderPrompt={
        'Describe what you need copy for.\n\n' +
        'e.g. "Landing page hero section for an AI avatar SaaS targeting Georgian SMEs. ' +
        'Tone: modern, trustworthy, slightly bold. ' +
        'Include headline, subheadline, 3-sentence body, CTA, and SEO meta tags."'
      }
      showContextInput
      contextLabel="Brand voice / target keywords / audience (optional)"
      backHref="/dashboard"
    />
  );
}
