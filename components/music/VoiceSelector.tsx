// Component: VoiceSelector - Select voice profiles for vocals

'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Mic, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/lib/i18n/useLanguage';
import { cn } from '@/lib/utils';
import type { VoiceSlot, VoiceProfile } from '@/types/platform';

interface VoiceSelectorProps {
  voices?: VoiceProfile[];
  selectedSlots?: VoiceSlot[];
  duetMode?: boolean;
  onSlotToggle?: (slot: VoiceSlot) => void;
  onDuetToggle?: (enabled: boolean) => void;
  onTrainVoice?: (slot: VoiceSlot) => void;
  mixLevel?: number;
  harmonyLevel?: number;
  onMixLevelChange?: (value: number) => void;
  onHarmonyLevelChange?: (value: number) => void;
  className?: string;
}

export function VoiceSelector({
  voices = [],
  selectedSlots = [],
  onSlotToggle,
  onDuetToggle,
  onTrainVoice,
  mixLevel,
  harmonyLevel,
  onMixLevelChange,
  onHarmonyLevelChange,
  className
}: VoiceSelectorProps) {
  const { t } = useLanguage();
  const allSlots: VoiceSlot[] = ['A', 'B', 'C'];
  const [localMix, setLocalMix] = useState(0.5);
  const [localHarmony, setLocalHarmony] = useState(0.5);

  const resolvedMix = mixLevel ?? localMix;
  const resolvedHarmony = harmonyLevel ?? localHarmony;
  const isMultiVoice = selectedSlots.length > 1;

  const applySelection = (slots: VoiceSlot[]) => {
    if (!onSlotToggle) return;

    const current = new Set(selectedSlots);
    const desired = new Set(slots);

    allSlots.forEach((slot) => {
      const isSelected = current.has(slot);
      const shouldSelect = desired.has(slot);

      if (isSelected !== shouldSelect) {
        onSlotToggle(slot);
      }
    });

    onDuetToggle?.(slots.length > 1);
  };

  const selectedMode = selectedSlots.length === 0
    ? 'default'
    : selectedSlots.length === 1
    ? 'A'
    : selectedSlots.length === 2
    ? 'AB'
    : 'ABC';

  const getVoiceNameForSlot = (slot: VoiceSlot): string => {
    const voice = voices.find((v) => v.slot === slot);
    return voice ? voice.name : `Voice ${slot}`;
  };

  const getSlotStatus = (slot: VoiceSlot) => {
    const voice = voices.find((v) => v.slot === slot);
    if (!voice) return 'training';
    if (voice.status === 'ready') return 'ready';
    return 'training';
  };

  const SlotCard = ({ slot }: { slot: VoiceSlot }) => {
    const isSelected = selectedSlots.includes(slot);
    const status = getSlotStatus(slot);
    const name = getVoiceNameForSlot(slot);

    return (
      <motion.div
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => onSlotToggle?.(slot)}
        className={cn(
          'p-4 rounded-xl border-2 cursor-pointer transition',
          isSelected
            ? 'bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border-cyan-400/60 shadow-lg shadow-cyan-500/20'
            : 'bg-slate-800/50 border-slate-700/40 hover:border-cyan-400/40'
        )}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <div
              className={cn(
                'w-10 h-10 rounded-full flex items-center justify-center font-bold',
                status === 'ready'
                  ? 'bg-gradient-to-br from-green-500 to-emerald-600 text-white'
                  : 'bg-slate-700/60 text-slate-400'
              )}
            >
              {slot}
            </div>
            <div>
              <p className="font-semibold text-slate-100">{name}</p>
              <p className="text-xs text-slate-400">
                {status === 'ready' ? '✓ Ready' : '⏳ Training'}
              </p>
            </div>
          </div>

          {isSelected && (
            <div className="w-5 h-5 rounded-full bg-green-400 flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-slate-900" />
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-2 border-t border-slate-700/40">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onTrainVoice?.(slot);
            }}
            className="flex-1 px-2 py-1 text-xs rounded bg-slate-700/40 text-slate-300 hover:bg-slate-600/40 transition flex items-center justify-center gap-1"
          >
            <Mic size={12} />
            {status === 'ready' ? 'Update' : 'Train'}
          </button>
        </div>
      </motion.div>
    );
  };

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-200">{t('music.voice_profiles')}</h3>
      </div>

      {/* Quick Mode Selector */}
      <div className="grid grid-cols-2 gap-2">
        {[
          { id: 'default', label: t('music.voice_default', 'Default AI Voice'), slots: [] },
          { id: 'A', label: t('music.voice_a', 'Voice A'), slots: ['A'] as VoiceSlot[] },
          { id: 'AB', label: t('music.voice_duet', 'Duet (A + B)'), slots: ['A', 'B'] as VoiceSlot[] },
          { id: 'ABC', label: t('music.voice_trio', 'Trio (A + B + C)'), slots: ['A', 'B', 'C'] as VoiceSlot[] }
        ].map((option) => (
          <motion.button
            key={option.id}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => applySelection(option.slots)}
            className={cn(
              'px-3 py-2 rounded-lg text-sm font-medium transition border',
              selectedMode === option.id
                ? 'bg-gradient-to-r from-cyan-500/30 to-blue-600/30 border-cyan-400/60 text-cyan-100'
                : 'bg-slate-800/50 border-slate-700/40 text-slate-300 hover:border-cyan-400/40'
            )}
          >
            {option.label}
          </motion.button>
        ))}
      </div>

      {/* Mix & Harmony Controls */}
      {isMultiVoice && (
        <div className="space-y-3 rounded-lg border border-slate-700/40 bg-slate-800/40 p-3">
          <div>
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>{t('music.voice_mix', 'Duet/Trio Mix')}</span>
              <span>{Math.round(resolvedMix * 100)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={resolvedMix}
              onChange={(e) => {
                const value = Number(e.target.value);
                onMixLevelChange?.(value);
                if (!onMixLevelChange) setLocalMix(value);
              }}
              className="w-full"
            />
          </div>
          <div>
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>{t('music.voice_harmony', 'Harmony Strength')}</span>
              <span>{Math.round(resolvedHarmony * 100)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={resolvedHarmony}
              onChange={(e) => {
                const value = Number(e.target.value);
                onHarmonyLevelChange?.(value);
                if (!onHarmonyLevelChange) setLocalHarmony(value);
              }}
              className="w-full"
            />
          </div>
        </div>
      )}

      {/* Voice Slots Grid */}
      <div className="grid grid-cols-2 gap-3">
        {allSlots.map((slot) => (
          <SlotCard key={slot} slot={slot} />
        ))}
      </div>

      {/* Info Box */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(
          'p-3 rounded-lg',
          'bg-gradient-to-br from-purple-500/10 to-pink-600/10 border border-purple-400/20'
        )}
      >
        <p className="text-xs text-purple-200">
          💡 {t('music.voice_tip', 'Choose a voice mode to control your vocal blend.')}
        </p>
        <p className="text-xs text-purple-200 mt-1">
          🔐 {t('music.voice_consent', 'Only your own voice samples can be used.')}
        </p>
      </motion.div>

      {/* Add New Voice Button */}
      <Button
        size="sm"
        variant="outline"
        className="w-full border-purple-400/40 text-purple-300 hover:bg-purple-500/20 flex items-center justify-center gap-2"
        onClick={() => onTrainVoice?.('A')}
      >
        <Plus size={16} />
        {t('voice.train_voice')}
      </Button>

      {/* Selected Slots Summary */}
      {selectedSlots.length > 0 && (
        <div className="p-3 rounded-lg bg-cyan-500/10 border border-cyan-400/20">
          <p className="text-sm text-cyan-200 font-medium">
            Selected: {selectedSlots.map((s) => getVoiceNameForSlot(s)).join(' + ')}
          </p>
        </div>
      )}
    </div>
  );
}
