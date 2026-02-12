// Music Studio State Management (Zustand)

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  Track,
  LyricsMode,
  Language,
  VoiceSlot,
  MusicStylePreset
} from '@/types/music-video';

interface MusicStudioState {
  // View state
  mode: 'create' | 'library';
  activeTab: 'generate' | 'lyrics' | 'style' | 'voice';
  
  // Generation config
  prompt: string;
  lyrics: string;
  lyricsMode: LyricsMode;
  genre?: string;
  mood?: string;
  era?: string;
  tempo?: string;
  language: Language | 'instrumental';
  styleTags: string[];
  
  // Voice config
  useCustomVocals: boolean;
  selectedVoiceSlots: VoiceSlot[];
  duetMode: boolean;
  harmonizationLevel: number; // 0-1
  
  // Generation state
  generating: boolean;
  jobId?: string;
  progress: number;
  error?: string;
  
  // Generated tracks (variations)
  variations: Track[];
  selectedTrack?: Track;
  
  // Player state
  playing: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  
  // Library
  libraryTracks: Track[];
  libraryLoading: boolean;
  libraryFilter: 'all' | 'favorites' | 'recent';
  librarySearch: string;
  
  // Actions
  setMode: (mode: 'create' | 'library') => void;
  setActiveTab: (tab: MusicStudioState['activeTab']) => void;
  setPrompt: (prompt: string) => void;
  setLyrics: (lyrics: string) => void;
  setLyricsMode: (mode: LyricsMode) => void;
  setGenre: (genre?: string) => void;
  setMood: (mood?: string) => void;
  setEra: (era?: string) => void;
  setTempo: (tempo?: string) => void;
  setLanguage: (language: Language | 'instrumental') => void;
  toggleStyleTag: (tag: string) => void;
  setStyleTags: (tags: string[]) => void;
  applyStylePreset: (preset: MusicStylePreset) => void;
  
  // Voice actions
  toggleCustomVocals: () => void;
  toggleVoiceSlot: (slot: VoiceSlot) => void;
  setDuetMode: (enabled: boolean) => void;
  setHarmonizationLevel: (level: number) => void;
  
  // Generation actions
  startGeneration: (jobId: string) => void;
  updateProgress: (progress: number) => void;
  setGenerationError: (error: string) => void;
  completeGeneration: (tracks: Track[]) => void;
  resetGeneration: () => void;
  
  // Track actions
  selectTrack: (track: Track) => void;
  deselectTrack: () => void;
  addToLibrary: (track: Track) => void;
  removeFromLibrary: (trackId: string) => void;
  toggleFavorite: (trackId: string) => void;
  
  // Player actions
  play: () => void;
  pause: () => void;
  seek: (time: number) => void;
  setVolume: (volume: number) => void;
  updateCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  
  // Library actions
  loadLibrary: (tracks: Track[]) => void;
  setLibraryFilter: (filter: MusicStudioState['libraryFilter']) => void;
  setLibrarySearch: (search: string) => void;
  
  // Reset
  reset: () => void;
}

const defaultState = {
  mode: 'create' as const,
  activeTab: 'generate' as const,
  prompt: '',
  lyrics: '',
  lyricsMode: 'auto' as LyricsMode,
  language: 'en' as Language,
  styleTags: [],
  useCustomVocals: false,
  selectedVoiceSlots: [],
  duetMode: false,
  harmonizationLevel: 0.5,
  generating: false,
  progress: 0,
  variations: [],
  playing: false,
  currentTime: 0,
  duration: 0,
  volume: 0.8,
  libraryTracks: [],
  libraryLoading: false,
  libraryFilter: 'all' as const,
  librarySearch: ''
};

export const useMusicStudio = create<MusicStudioState>()(
  persist(
    (set, get) => ({
      ...defaultState,

      // View actions
      setMode: (mode) => set({ mode }),
      setActiveTab: (activeTab) => set({ activeTab }),
      
      // Config actions
      setPrompt: (prompt) => set({ prompt }),
      setLyrics: (lyrics) => set({ lyrics }),
      setLyricsMode: (lyricsMode) => set({ lyricsMode }),
      setGenre: (genre) => set({ genre }),
      setMood: (mood) => set({ mood }),
      setEra: (era) => set({ era }),
      setTempo: (tempo) => set({ tempo }),
      setLanguage: (language) => set({ language }),
      
      toggleStyleTag: (tag) => set((state) => ({
        styleTags: state.styleTags.includes(tag)
          ? state.styleTags.filter(t => t !== tag)
          : [...state.styleTags, tag]
      })),
      
      setStyleTags: (styleTags) => set({ styleTags }),
      
      applyStylePreset: (preset) => set({
        genre: preset.genre,
        mood: preset.mood,
        era: preset.era,
        tempo: preset.tempo,
        styleTags: preset.style_tags,
        prompt: preset.example_prompt || get().prompt
      }),
      
      // Voice actions
      toggleCustomVocals: () => set((state) => ({ 
        useCustomVocals: !state.useCustomVocals 
      })),
      
      toggleVoiceSlot: (slot) => set((state) => ({
        selectedVoiceSlots: state.selectedVoiceSlots.includes(slot)
          ? state.selectedVoiceSlots.filter(s => s !== slot)
          : [...state.selectedVoiceSlots, slot]
      })),
      
      setDuetMode: (duetMode) => set({ duetMode }),
      setHarmonizationLevel: (harmonizationLevel) => set({ harmonizationLevel }),
      
      // Generation actions
      startGeneration: (jobId) => set({ 
        generating: true, 
        jobId, 
        progress: 0,
        error: undefined,
        variations: []
      }),
      
      updateProgress: (progress) => set({ progress }),
      
      setGenerationError: (error) => set({ 
        generating: false, 
        error 
      }),
      
      completeGeneration: (tracks) => set({ 
        generating: false,
        progress: 100,
        variations: tracks,
        selectedTrack: tracks[0]
      }),
      
      resetGeneration: () => set({
        generating: false,
        jobId: undefined,
        progress: 0,
        error: undefined,
        variations: [],
        selectedTrack: undefined
      }),
      
      // Track actions
      selectTrack: (track) => set({ selectedTrack: track }),
      deselectTrack: () => set({ selectedTrack: undefined }),
      
      addToLibrary: (track) => set((state) => ({
        libraryTracks: [track, ...state.libraryTracks]
      })),
      
      removeFromLibrary: (trackId) => set((state) => ({
        libraryTracks: state.libraryTracks.filter(t => t.id !== trackId)
      })),
      
      toggleFavorite: (trackId) => set((state) => ({
        libraryTracks: state.libraryTracks.map(track =>
          track.id === trackId
            ? { ...track, is_favorite: !track.is_favorite }
            : track
        ),
        variations: state.variations.map(track =>
          track.id === trackId
            ? { ...track, is_favorite: !track.is_favorite }
            : track
        )
      })),
      
      // Player actions
      play: () => set({ playing: true }),
      pause: () => set({ playing: false }),
      seek: (time) => set({ currentTime: time }),
      setVolume: (volume) => set({ volume }),
      updateCurrentTime: (currentTime) => set({ currentTime }),
      setDuration: (duration) => set({ duration }),
      
      // Library actions
      loadLibrary: (tracks) => set({ 
        libraryTracks: tracks, 
        libraryLoading: false 
      }),
      
      setLibraryFilter: (libraryFilter) => set({ libraryFilter }),
      setLibrarySearch: (librarySearch) => set({ librarySearch }),
      
      // Reset
      reset: () => set(defaultState)
    }),
    {
      name: 'music-studio-storage',
      partialize: (state) => ({
        // Only persist these fields
        volume: state.volume,
        libraryFilter: state.libraryFilter,
        language: state.language
      })
    }
  )
);
