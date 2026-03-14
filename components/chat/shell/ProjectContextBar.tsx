'use client';

/**
 * components/chat/shell/ProjectContextBar.tsx
 * =============================================
 * Shows live project context when a project is active:
 * project name chip, asset count, workflow status.
 */

import { FolderOpen } from 'lucide-react';
import type { ProjectContext } from '@/lib/chat/types';

interface Props {
  project: ProjectContext;
  language: string;
}

export function ProjectContextBar({ project }: Props) {
  return (
    <div
      className="flex-shrink-0 flex items-center gap-2 px-4 py-2 overflow-x-auto"
      style={{ borderBottom: '1px solid var(--color-border)', backgroundColor: 'rgba(34,211,238,0.04)' }}
    >
      <span
        className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full flex-shrink-0"
        style={{ backgroundColor: 'var(--color-accent-soft)', color: 'var(--color-accent)' }}
      >
        <FolderOpen className="w-3 h-3" />
        {project.projectName}
      </span>
      {project.recentAssets.length > 0 && (
        <span className="text-[10px] px-2 py-0.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text-tertiary)' }}>
          {project.recentAssets.length} asset{project.recentAssets.length !== 1 ? 's' : ''}
        </span>
      )}
      {project.activeWorkflowId && (
        <span className="text-[10px] px-2 py-0.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: 'rgba(34,197,94,0.1)', color: '#22c55e' }}>
          ⚡ Workflow active
        </span>
      )}
    </div>
  );
}
