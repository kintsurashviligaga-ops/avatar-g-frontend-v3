'use client';

import { AlertOctagon, Mic2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FloatingActionsProps {
  showVoiceToggle?: boolean;
  isVoiceActive?: boolean;
  voiceToggleOnLabel?: string;
  voiceToggleOffLabel?: string;
  emergencyStopLabel?: string;
  onToggleVoice?: () => void;
  onEmergencyStop?: () => void;
}

export function FloatingActions({
  showVoiceToggle = true,
  isVoiceActive = false,
  voiceToggleOnLabel = 'Voice mode on',
  voiceToggleOffLabel = 'Voice mode off',
  emergencyStopLabel = 'Emergency Stop',
  onToggleVoice,
  onEmergencyStop,
}: FloatingActionsProps) {
  return (
    <div className="fixed bottom-5 right-5 z-40 flex flex-col gap-3">
      {showVoiceToggle && (
        <button
          type="button"
          onClick={() => onToggleVoice?.()}
          className={cn(
            'inline-flex items-center gap-2 rounded-full border px-4 py-3 text-sm font-semibold shadow-[0_16px_40px_rgba(2,12,27,0.35)] backdrop-blur-xl transition-all',
            isVoiceActive
              ? 'border-fuchsia-400/30 bg-fuchsia-400/15 text-fuchsia-100'
              : 'border-white/10 bg-black/45 text-slate-200 hover:border-white/20 hover:bg-white/[0.08]'
          )}
        >
          <Mic2 className="h-4 w-4" />
          {isVoiceActive ? voiceToggleOnLabel : voiceToggleOffLabel}
        </button>
      )}
      <button
        type="button"
        onClick={() => onEmergencyStop?.()}
        className="inline-flex items-center gap-2 rounded-full border border-rose-400/25 bg-rose-400/12 px-4 py-3 text-sm font-semibold text-rose-100 shadow-[0_16px_40px_rgba(2,12,27,0.35)] backdrop-blur-xl transition-colors hover:bg-rose-400/18"
      >
        <AlertOctagon className="h-4 w-4" />
        {emergencyStopLabel}
      </button>
    </div>
  );
}