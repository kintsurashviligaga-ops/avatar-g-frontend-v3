import { create } from 'zustand'

type PageState = 
  | 'IDLE' 
  | 'VALIDATING' 
  | 'GENERATING' 
  | 'SUCCESS' 
  | 'ERROR_VALIDATION' 
  | 'ERROR_RUNTIME'

type SegmentStatus = 'pending' | 'in_progress' | 'completed' | 'error'

interface Segment {
  id: string
  label: string
  status: SegmentStatus
  progress: number
}

interface MusicStudioState {
  // Page state
  pageState: PageState
  setPageState: (state: PageState) => void

  // Inputs
  lyrics: string
  setLyrics: (text: string) => void
  description: string
  setDescription: (text: string) => void
  
  // Smart Sync
  isSynced: boolean
  setIsSynced: (synced: boolean) => void
  
  // Project Setup
  genre: string
  setGenre: (genre: string) => void
  instruments: string[]
  setInstruments: (instruments: string[]) => void
  mood: string
  setMood: (mood: string) => void
  
  // Timeline
  segments: Segment[]
  activeSegmentId: string | null
  updateSegment: (id: string, updates: Partial<Segment>) => void
  
  // Voice
  voiceMode: 'AI' | 'MY'
  setVoiceMode: (mode: 'AI' | 'MY') => void
  voiceStyle: string
  setVoiceStyle: (style: string) => void
  voiceConnected: boolean
  setVoiceConnected: (connected: boolean) => void
  
  // Visual
  visualEnabled: boolean
  setVisualEnabled: (enabled: boolean) => void
  visualStyle: string
  setVisualStyle: (style: string) => void
  coverUrl: string | null
  setCoverUrl: (url: string | null) => void
  
  // Results
  audioUrl: string | null
  setAudioUrl: (url: string | null) => void
  videoUrl: string | null
  setVideoUrl: (url: string | null) => void
  
  // Advanced
  advancedOpen: boolean
  setAdvancedOpen: (open: boolean) => void
  
  // Chat
  chatOpen: boolean
  setChatOpen: (open: boolean) => void
  
  // Reset
  reset: () => void
}

export const useMusicStudioStore = create<MusicStudioState>((set) => ({
  // Initial state
  pageState: 'IDLE',
  setPageState: (state) => set({ pageState: state }),
  
  lyrics: '',
  setLyrics: (text) => set({ lyrics: text, isSynced: false }),
  description: '',
  setDescription: (text) => set({ description: text, isSynced: false }),
  
  isSynced: false,
  setIsSynced: (synced) => set({ isSynced: synced }),
  
  genre: 'Alt Rock',
  setGenre: (genre) => set({ genre }),
  instruments: ['Guitar', 'Drums'],
  setInstruments: (instruments) => set({ instruments }),
  mood: 'Energetic',
  setMood: (mood) => set({ mood }),
  
  segments: [
    { id: 'intro', label: 'Intro', status: 'pending', progress: 0 },
    { id: 'verse1', label: 'Verse 1', status: 'pending', progress: 0 },
    { id: 'chorus', label: 'Chorus', status: 'pending', progress: 0 },
    { id: 'verse2', label: 'Verse 2', status: 'pending', progress: 0 },
    { id: 'outro', label: 'Outro', status: 'pending', progress: 0 },
  ],
  activeSegmentId: null,
  updateSegment: (id, updates) => set((state) => ({
    segments: state.segments.map(seg => 
      seg.id === id ? { ...seg, ...updates } : seg
    )
  })),
  
  voiceMode: 'AI',
  setVoiceMode: (mode) => set({ voiceMode: mode }),
  voiceStyle: 'Neutral',
  setVoiceStyle: (style) => set({ voiceStyle: style }),
  voiceConnected: false,
  setVoiceConnected: (connected) => set({ voiceConnected: connected }),
  
  visualEnabled: false,
  setVisualEnabled: (enabled) => set({ visualEnabled: enabled }),
  visualStyle: 'Cinematic',
  setVisualStyle: (style) => set({ visualStyle: style }),
  coverUrl: null,
  setCoverUrl: (url) => set({ coverUrl: url }),
  
  audioUrl: null,
  setAudioUrl: (url) => set({ audioUrl: url }),
  videoUrl: null,
  setVideoUrl: (url) => set({ videoUrl: url }),
  
  advancedOpen: false,
  setAdvancedOpen: (open) => set({ advancedOpen: open }),
  
  chatOpen: false,
  setChatOpen: (open) => set({ chatOpen: open }),
  
  reset: () => set({
    pageState: 'IDLE',
    lyrics: '',
    description: '',
    isSynced: false,
    audioUrl: null,
    videoUrl: null,
    coverUrl: null,
    segments: [
      { id: 'intro', label: 'Intro', status: 'pending', progress: 0 },
      { id: 'verse1', label: 'Verse 1', status: 'pending', progress: 0 },
      { id: 'chorus', label: 'Chorus', status: 'pending', progress: 0 },
      { id: 'verse2', label: 'Verse 2', status: 'pending', progress: 0 },
      { id: 'outro', label: 'Outro', status: 'pending', progress: 0 },
    ],
  }),
}))
