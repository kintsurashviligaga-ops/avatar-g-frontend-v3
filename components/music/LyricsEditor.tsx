// Component: LyricsEditor - Edit song lyrics with character counter

'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Copy, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/lib/i18n/useLanguage';
import { cn } from '@/lib/utils';

interface LyricsEditorProps {
  value: string;
  onChange: (lyrics: string) => void;
  mode: 'auto' | 'custom' | 'instrumental';
  onModeChange: (mode: 'auto' | 'custom' | 'instrumental') => void;
  maxLength?: number;
  placeholder?: string;
  onGenerate?: () => void;
  className?: string;
}

export function LyricsEditor({
  value,
  onChange,
  mode,
  onModeChange,
  maxLength = 2000,
  placeholder = 'Write your custom lyrics here...',
  onGenerate,
  className
}: LyricsEditorProps) {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getCharacterClass = (current: number) => {
    const percentage = current / maxLength;
    if (percentage < 0.7) return 'text-slate-400';
    if (percentage < 0.9) return 'text-yellow-400';
    return 'text-red-400';
  };

  const modeOptions: Array<{ id: LyricsEditorProps['mode']; label: string }> = [
    { id: 'auto', label: t('music.auto_lyrics') },
    { id: 'custom', label: t('music.custom_lyrics') },
    { id: 'instrumental', label: t('music.instrumental') }
  ];

  return (
    <div className={cn('space-y-3', className)}>
      {/* Mode Selector */}
      <div className="flex gap-2">
        {modeOptions.map((option) => (
          <motion.button
            key={option.id}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onModeChange(option.id)}
            className={cn(
              'px-3 py-1.5 rounded-lg font-medium text-sm transition',
              mode === option.id
                ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/40'
                : 'bg-slate-700/50 text-slate-300 border border-slate-600/40 hover:bg-slate-600/50'
            )}
          >
            {option.label}
          </motion.button>
        ))}
      </div>

      {/* Editor (only show for custom mode) */}
      {mode === 'custom' && (
        <div className="space-y-2">
          <div className="relative">
            <textarea
              value={value}
              onChange={(e) => onChange(e.target.value.slice(0, maxLength))}
              placeholder={placeholder}
              maxLength={maxLength}
              className={cn(
                'w-full min-h-[200px] p-3 rounded-lg',
                'bg-slate-800/50 border border-slate-700/40',
                'text-slate-100 placeholder-slate-500',
                'focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent',
                'resize-none transition'
              )}
            />
          </div>

          {/* Character counter and actions */}
          <div className="flex items-center justify-between">
            <span className={cn('text-xs font-medium', getCharacterClass(value.length))}>
              {value.length} / {maxLength} {t('common.copy')}
            </span>

            <div className="flex gap-2">
              {onGenerate && (
                <Button
                  size="sm"
                  variant="outline"
                  className="border-purple-400/40 text-purple-300 hover:bg-purple-500/20 flex items-center gap-1"
                  onClick={onGenerate}
                >
                  <Wand2 size={14} />
                  Suggest
                </Button>
              )}

              <Button
                size="sm"
                variant="outline"
                className={cn(
                  'border-slate-600/40 transition',
                  copied
                    ? 'bg-green-500/20 text-green-300 border-green-400/40'
                    : 'text-slate-300 hover:bg-slate-600/20'
                )}
                onClick={handleCopy}
              >
                <Copy size={14} />
              </Button>
            </div>
          </div>

          {/* Tips */}
          <div className="text-xs text-slate-400 space-y-1">
            <p>💡 {t('music.prompt_placeholder')}</p>
            <p>🎵 Include verse, chorus, and bridge sections for best results</p>
            <p>📝 Use line breaks between verses for clarity</p>
          </div>
        </div>
      )}

      {/* Info for auto mode */}
      {mode === 'auto' && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            'p-3 rounded-lg',
            'bg-gradient-to-br from-cyan-500/10 to-blue-600/10 border border-cyan-400/20'
          )}
        >
          <p className="text-sm text-cyan-200">
            ✨ The AI will automatically generate lyrics based on your song description and style.
          </p>
        </motion.div>
      )}

      {/* Info for instrumental mode */}
      {mode === 'instrumental' && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            'p-3 rounded-lg',
            'bg-gradient-to-br from-green-500/10 to-emerald-600/10 border border-green-400/20'
          )}
        >
          <p className="text-sm text-green-200">
            🎼 Generate an instrumental track without vocals.
          </p>
        </motion.div>
      )}
    </div>
  );
}
