// Component: TrackCard - Display a generated track with controls

'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Play,
  Pause,
  Download,
  Heart,
  Trash2,
  Copy,
  Volume2,
  MoreVertical,
  Radio
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/lib/i18n/useLanguage';
import { useStudioStore } from '@/store/useStudioStore';
import type { Track } from '@/types/platform';
import { cn } from '@/lib/utils';

interface TrackCardProps {
  track: Track;
  onSelect?: (track: Track) => void;
  onDelete?: (trackId: string) => void;
  onUseInVideo?: (track: Track) => void;
  compact?: boolean;
  isPlaying?: boolean;
}

export function TrackCard({
  track,
  onSelect,
  onDelete,
  onUseInVideo,
  compact = false,
  isPlaying = false
}: TrackCardProps) {
  const { t } = useLanguage();
  const [showMenu, setShowMenu] = useState(false);
  const { setSelectedTrack } = useStudioStore();

  const handleUseInVideo = () => {
    setSelectedTrack(track);
    onUseInVideo?.(track);
  };

  const getDurationDisplay = (seconds?: number) => {
    if (!seconds) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'from-green-500/20 to-emerald-600/20 border-green-400/40';
      case 'processing':
        return 'from-cyan-500/20 to-blue-600/20 border-cyan-400/40 animate-pulse';
      case 'error':
        return 'from-red-500/20 to-red-600/20 border-red-400/40';
      default:
        return 'from-slate-500/20 to-slate-600/20 border-slate-400/40';
    }
  };

  if (compact) {
    return (
      <motion.div
        whileHover={{ y: -4 }}
        transition={{ type: 'spring', damping: 20 }}
        className={cn(
          'p-2 rounded-lg cursor-pointer',
          'bg-gradient-to-br from-slate-800/50 to-slate-900/50 border border-slate-700/40',
          'hover:from-slate-800/70 hover:to-slate-900/70 hover:border-cyan-400/30',
          'transition duration-200'
        )}
        onClick={() => onSelect?.(track)}
      >
        {track.cover_url && (
          <div className="relative mb-2 rounded overflow-hidden aspect-square">
            <img
              src={track.cover_url}
              alt={track.title || 'Track'}
              className="w-full h-full object-cover"
            />
            {isPlaying && (
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                <div className="w-3 h-3 bg-cyan-400 rounded-full animate-pulse" />
              </div>
            )}
          </div>
        )}
        <div className="space-y-1">
          <p className="text-xs font-semibold text-slate-100 truncate">
            {track.title || 'Untitled'}
          </p>
          <p className="text-xs text-slate-400 truncate">
            {track.genre || 'Song'}
          </p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      whileHover={{ y: -2 }}
      transition={{ type: 'spring', damping: 20 }}
      className={cn(
        'p-4 rounded-xl border-2 overflow-hidden',
        'bg-gradient-to-br',
        getStatusColor(track.status)
      )}
    >
      {/* Header with cover image */}
      <div className="flex gap-4 mb-3">
        {track.cover_url && (
          <div className="flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden">
            <img
              src={track.cover_url}
              alt={track.title || 'Track'}
              className="w-full h-full object-cover"
            />
          </div>
        )}

        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-slate-100 truncate">
            {track.title || 'Untitled Track'}
          </h3>
          <p className="text-sm text-slate-400 truncate">
            {track.genre}
            {track.mood && ` • ${track.mood}`}
          </p>

          {track.status === 'processing' && (
            <div className="mt-2 flex items-center gap-2">
              <div className="w-full max-w-xs h-1.5 bg-slate-700/50 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${track.progress}%` }}
                  transition={{ duration: 0.3 }}
                  className="h-full bg-gradient-to-r from-cyan-400 to-blue-500"
                />
              </div>
              <span className="text-xs text-cyan-300 font-medium whitespace-nowrap">
                {track.progress}%
              </span>
            </div>
          )}

          {track.status === 'completed' && (
            <div className="mt-2 flex items-center gap-2 text-xs text-slate-300">
              <Radio size={12} className="text-green-400" />
              <span>{getDurationDisplay(track.duration_seconds)}</span>
              {track.bpm && <span>• {track.bpm} BPM</span>}
            </div>
          )}
        </div>

        {/* Menu button */}
        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-1 text-slate-400 hover:text-slate-200 transition"
          >
            <MoreVertical size={16} />
          </button>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 flex-wrap">
        {track.status === 'completed' && track.audio_url && (
          <>
            <Button
              size="sm"
              variant="outline"
              className="border-cyan-400/40 text-cyan-300 hover:bg-cyan-500/20"
              onClick={() => onSelect?.(track)}
            >
              <Play size={14} />
              {t('common.download')}
            </Button>

            <Button
              size="sm"
              variant="outline"
              className="border-green-400/40 text-green-300 hover:bg-green-500/20"
              onClick={handleUseInVideo}
            >
              {t('music.use_in_video')}
            </Button>
          </>
        )}

        {track.status === 'error' && (
          <div className="text-xs text-red-400 py-1">
            {t('error.generation_failed')}: {track.error}
          </div>
        )}

        <div className="ml-auto flex gap-1">
          <button
            className="p-1 text-slate-400 hover:text-red-400 transition"
            onClick={() => onDelete?.(track.id)}
            title="Delete"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
