// Component: StyleSelector - Select music style, genre, mood, etc.

'use client';

import { motion } from 'framer-motion';
import { useLanguage } from '@/lib/i18n/useLanguage';
import { cn } from '@/lib/utils';

interface StyleOption {
  id: string;
  label: string;
  icon?: string;
}

interface StyleSelectorProps {
  genres?: StyleOption[];
  moods?: StyleOption[];
  eras?: StyleOption[];
  tempos?: StyleOption[];
  
  selectedGenres?: string[];
  selectedMoods?: string[];
  selectedEras?: string[];
  selectedTempos?: string[];
  
  onGenreChange?: (genres: string[]) => void;
  onMoodChange?: (moods: string[]) => void;
  onEraChange?: (eras: string[]) => void;
  onTempoChange?: (tempos: string[]) => void;
  
  multiSelect?: boolean;
  className?: string;
}

const DEFAULT_GENRES: StyleOption[] = [
  { id: 'pop', label: 'Pop' },
  { id: 'hiphop', label: 'Hip-Hop' },
  { id: 'electronic', label: 'Electronic' },
  { id: 'acoustic', label: 'Acoustic' },
  { id: 'rock', label: 'Rock' },
  { id: 'folk', label: 'Folk' },
  { id: 'jazz', label: 'Jazz' },
  { id: 'classical', label: 'Classical' }
];

const DEFAULT_MOODS: StyleOption[] = [
  { id: 'energetic', label: '⚡ Energetic' },
  { id: 'calm', label: '😌 Calm' },
  { id: 'emotional', label: '💔 Emotional' },
  { id: 'joyful', label: '😊 Joyful' },
  { id: 'dark', label: '🌑 Dark' },
  { id: 'romantic', label: '❤️ Romantic' },
  { id: 'epic', label: '⚔️ Epic' },
  { id: 'playful', label: '🎮 Playful' }
];

const DEFAULT_ERAS: StyleOption[] = [
  { id: 'retro', label: 'Retro' },
  { id: 'vintage', label: 'Vintage' },
  { id: 'modern', label: 'Modern' },
  { id: 'contemporary', label: 'Contemporary' },
  { id: 'futuristic', label: 'Futuristic' }
];

const DEFAULT_TEMPOS: StyleOption[] = [
  { id: 'slow', label: 'Slow' },
  { id: 'moderate', label: 'Moderate' },
  { id: 'upbeat', label: 'Upbeat' },
  { id: 'fast', label: 'Fast' }
];

export function StyleSelector({
  genres = DEFAULT_GENRES,
  moods = DEFAULT_MOODS,
  eras = DEFAULT_ERAS,
  tempos = DEFAULT_TEMPOS,
  
  selectedGenres = [],
  selectedMoods = [],
  selectedEras = [],
  selectedTempos = [],
  
  onGenreChange,
  onMoodChange,
  onEraChange,
  onTempoChange,
  
  multiSelect = false,
  className
}: StyleSelectorProps) {
  const { t } = useLanguage();

  const toggleSelection = (
    current: string[],
    id: string,
    onChange?: (items: string[]) => void
  ) => {
    if (!onChange) return;

    if (multiSelect) {
      if (current.includes(id)) {
        onChange(current.filter(item => item !== id));
      } else {
        onChange([...current, id]);
      }
    } else {
      onChange(current[0] === id ? [] : [id]);
    }
  };

  const PillButton = ({
    selected,
    onClick,
    label
  }: {
    selected: boolean;
    onClick: () => void;
    label: string;
  }) => (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className={cn(
        'px-3 py-1.5 rounded-full text-sm font-medium transition duration-200',
        selected
          ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/40'
          : 'bg-slate-700/50 text-slate-300 border border-slate-600/40 hover:bg-slate-600/50'
      )}
    >
      {label}
    </motion.button>
  );

  return (
    <div className={cn('space-y-4', className)}>
      {/* Genre Selection */}
      <div>
        <label className="text-sm font-semibold text-slate-200 mb-2 block">
          {t('music.genre')}
        </label>
        <div className="flex flex-wrap gap-2">
          {genres.map((genre) => (
            <PillButton
              key={genre.id}
              selected={selectedGenres.includes(genre.id)}
              onClick={() => toggleSelection(selectedGenres, genre.id, onGenreChange)}
              label={genre.label}
            />
          ))}
        </div>
      </div>

      {/* Mood Selection */}
      <div>
        <label className="text-sm font-semibold text-slate-200 mb-2 block">
          {t('music.mood')}
        </label>
        <div className="flex flex-wrap gap-2">
          {moods.map((mood) => (
            <PillButton
              key={mood.id}
              selected={selectedMoods.includes(mood.id)}
              onClick={() => toggleSelection(selectedMoods, mood.id, onMoodChange)}
              label={mood.label}
            />
          ))}
        </div>
      </div>

      {/* Era Selection */}
      <div>
        <label className="text-sm font-semibold text-slate-200 mb-2 block">
          {t('music.era')}
        </label>
        <div className="flex flex-wrap gap-2">
          {eras.map((era) => (
            <PillButton
              key={era.id}
              selected={selectedEras.includes(era.id)}
              onClick={() => toggleSelection(selectedEras, era.id, onEraChange)}
              label={era.label}
            />
          ))}
        </div>
      </div>

      {/* Tempo Selection */}
      <div>
        <label className="text-sm font-semibold text-slate-200 mb-2 block">
          {t('music.tempo')}
        </label>
        <div className="flex flex-wrap gap-2">
          {tempos.map((tempo) => (
            <PillButton
              key={tempo.id}
              selected={selectedTempos.includes(tempo.id)}
              onClick={() => toggleSelection(selectedTempos, tempo.id, onTempoChange)}
              label={tempo.label}
            />
          ))}
        </div>
      </div>

      {/* Quick Presets */}
      <div className="pt-2 border-t border-slate-700/40">
        <label className="text-sm font-semibold text-slate-200 mb-2 block">
          {t('music.templates')}
        </label>
        <div className="grid grid-cols-2 gap-2">
          {[
            { genre: 'pop', mood: 'joyful', era: 'modern', tempo: 'upbeat', name: 'Georgian Pop' },
            { genre: 'hiphop', mood: 'energetic', era: 'modern', tempo: 'upbeat', name: 'Georgian Hip-Hop' },
            { genre: 'acoustic', mood: 'emotional', era: 'timeless', tempo: 'slow', name: 'Georgian Acoustic' },
            { genre: 'electronic', mood: 'joyful', era: 'futuristic', tempo: 'fast', name: 'Georgian Electronic' }
          ].map((preset) => (
            <button
              key={preset.name}
              onClick={() => {
                onGenreChange?.([preset.genre]);
                onMoodChange?.([preset.mood]);
                onEraChange?.([preset.era]);
                onTempoChange?.([preset.tempo]);
              }}
              className={cn(
                'p-2 rounded-lg text-xs font-medium text-left transition',
                'bg-slate-700/40 border border-slate-600/40 hover:bg-slate-600/60 hover:border-cyan-400/40',
                'text-slate-300'
              )}
            >
              <div className="truncate">{preset.name}</div>
              <div className="text-xs text-slate-500 truncate mt-0.5">
                {preset.genre} • {preset.mood}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
