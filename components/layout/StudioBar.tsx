'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useStudioStore } from '@/store/useStudioStore';
import { useLanguage } from '@/lib/i18n/useLanguage';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Sparkles,
  Music,
  Film,
  User,
  ChevronRight,
  Trash2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface StudioBarProps {
  className?: string;
}

export function StudioBar({ className }: StudioBarProps) {
  const {
    selectedAvatarId,
    selectedAvatarPreviewUrl,
    selectedTrackId,
    selectedTrackCoverUrl,
    selectedVideoId,
    selectedVideoThumbnailUrl,
    clearAllSelections,
    clearSelectedAvatar,
    clearSelectedTrack,
    clearSelectedVideo
  } = useStudioStore();

  const { t } = useLanguage();

  // Don't show if nothing selected
  const hasSelections =
    selectedAvatarId || selectedTrackId || selectedVideoId;

  if (!hasSelections) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: -60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -60, opacity: 0 }}
        transition={{ type: 'spring', damping: 20 }}
        className={cn(
          'sticky top-0 z-40 bg-gradient-to-r from-slate-900/95 to-slate-800/95 backdrop-blur-xl border-b border-cyan-500/20 px-4 py-3',
          'shadow-lg shadow-cyan-500/10',
          className
        )}
      >
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              <span className="text-xs font-semibold text-cyan-400 uppercase tracking-wider">
                {t('studio.active_selections')}
              </span>
            </div>
            <button
              onClick={clearAllSelections}
              className="text-xs text-red-400 hover:text-red-300 transition flex items-center gap-1"
              title="Clear all selections"
            >
              <Trash2 size={14} />
              {t('common.clear_all')}
            </button>
          </div>

          {/* Selection Pills */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Avatar Chip */}
            {selectedAvatarId && (
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                className="relative group"
              >
                <Link
                  href="/services/avatar-builder"
                  className={cn(
                    'flex items-center gap-2 px-3 py-1.5 rounded-full',
                    'bg-gradient-to-r from-purple-500/20 to-purple-600/20 border border-purple-400/40',
                    'hover:from-purple-500/30 hover:to-purple-600/30 hover:border-purple-400/60',
                    'transition duration-200',
                    'group-hover:shadow-lg group-hover:shadow-purple-500/20'
                  )}
                >
                  {selectedAvatarPreviewUrl && (
                    <Image
                      src={selectedAvatarPreviewUrl}
                      alt="Selected Avatar"
                      width={24}
                      height={24}
                      className="w-6 h-6 rounded-full object-cover"
                    />
                  )}
                  {!selectedAvatarPreviewUrl && (
                    <User size={16} className="text-purple-400" />
                  )}
                  <span className="text-xs font-medium text-purple-200 truncate max-w-[100px]">
                    {t('studio.avatar')}
                  </span>
                </Link>
                <button
                  onClick={clearSelectedAvatar}
                  className="absolute -top-1 -right-1 p-0.5 rounded-full bg-red-500/80 hover:bg-red-600 opacity-0 group-hover:opacity-100 transition"
                >
                  <X size={12} className="text-white" />
                </button>
              </motion.div>
            )}

            {selectedAvatarId && selectedTrackId && (
              <ChevronRight size={16} className="text-cyan-400/60" />
            )}

            {/* Track Chip */}
            {selectedTrackId && (
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                className="relative group"
              >
                <Link
                  href="/services/music-studio"
                  className={cn(
                    'flex items-center gap-2 px-3 py-1.5 rounded-full',
                    'bg-gradient-to-r from-cyan-500/20 to-blue-600/20 border border-cyan-400/40',
                    'hover:from-cyan-500/30 hover:to-blue-600/30 hover:border-cyan-400/60',
                    'transition duration-200',
                    'group-hover:shadow-lg group-hover:shadow-cyan-500/20'
                  )}
                >
                  {selectedTrackCoverUrl && (
                    <Image
                      src={selectedTrackCoverUrl}
                      alt="Track Cover"
                      width={24}
                      height={24}
                      className="w-6 h-6 rounded object-cover"
                    />
                  )}
                  {!selectedTrackCoverUrl && (
                    <Music size={16} className="text-cyan-400" />
                  )}
                  <span className="text-xs font-medium text-cyan-200 truncate max-w-[100px]">
                    {t('studio.song')}
                  </span>
                </Link>
                <button
                  onClick={clearSelectedTrack}
                  className="absolute -top-1 -right-1 p-0.5 rounded-full bg-red-500/80 hover:bg-red-600 opacity-0 group-hover:opacity-100 transition"
                >
                  <X size={12} className="text-white" />
                </button>
              </motion.div>
            )}

            {(selectedAvatarId || selectedTrackId) && selectedVideoId && (
              <ChevronRight size={16} className="text-cyan-400/60" />
            )}

            {/* Video Chip */}
            {selectedVideoId && (
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                className="relative group"
              >
                <Link
                  href="/services/media-production"
                  className={cn(
                    'flex items-center gap-2 px-3 py-1.5 rounded-full',
                    'bg-gradient-to-r from-green-500/20 to-emerald-600/20 border border-green-400/40',
                    'hover:from-green-500/30 hover:to-emerald-600/30 hover:border-green-400/60',
                    'transition duration-200',
                    'group-hover:shadow-lg group-hover:shadow-green-500/20'
                  )}
                >
                  {selectedVideoThumbnailUrl && (
                    <Image
                      src={selectedVideoThumbnailUrl}
                      alt="Video Thumbnail"
                      width={24}
                      height={24}
                      className="w-6 h-6 rounded object-cover"
                    />
                  )}
                  {!selectedVideoThumbnailUrl && (
                    <Film size={16} className="text-green-400" />
                  )}
                  <span className="text-xs font-medium text-green-200 truncate max-w-[100px]">
                    {t('studio.video')}
                  </span>
                </Link>
                <button
                  onClick={clearSelectedVideo}
                  className="absolute -top-1 -right-1 p-0.5 rounded-full bg-red-500/80 hover:bg-red-600 opacity-0 group-hover:opacity-100 transition"
                >
                  <X size={12} className="text-white" />
                </button>
              </motion.div>
            )}

            {/* Quick Action: Go to next service */}
            {selectedAvatarId && !selectedTrackId && (
              <Link
                href="/services/music-studio"
                className="ml-auto"
              >
                <Button
                  size="sm"
                  variant="outline"
                  className={cn(
                    'border-cyan-400/40 text-cyan-300 hover:bg-cyan-500/20',
                    'flex items-center gap-1'
                  )}
                >
                  <Music size={14} />
                  {t('studio.create_song')}
                  <ChevronRight size={14} />
                </Button>
              </Link>
            )}

            {selectedTrackId && !selectedVideoId && (
              <Link
                href="/services/media-production"
                className="ml-auto"
              >
                <Button
                  size="sm"
                  variant="outline"
                  className={cn(
                    'border-green-400/40 text-green-300 hover:bg-green-500/20',
                    'flex items-center gap-1'
                  )}
                >
                  <Film size={14} />
                  {t('studio.create_video')}
                  <ChevronRight size={14} />
                </Button>
              </Link>
            )}

            {selectedVideoId && (
              <Button
                size="sm"
                variant="outline"
                className={cn(
                  'ml-auto border-emerald-400/40 text-emerald-300 hover:bg-emerald-500/20',
                  'flex items-center gap-1'
                )}
              >
                <Sparkles size={14} />
                {t('studio.complete')}
              </Button>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
