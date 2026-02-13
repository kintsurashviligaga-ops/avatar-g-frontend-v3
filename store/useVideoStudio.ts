// Video Studio State Management (Zustand)

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  Track,
  VideoClip,
  VideoMode,
  VideoScene,
  AvatarAction,
  BackgroundType,
  BackgroundConfig,
  LyricsStyle,
  Resolution,
  TransitionConfig,
  FilterConfig,
  MediaAsset
} from  '@/types/music-video';
import type { Avatar } from '@/types/avatar-builder';

interface VideoStudioState {
  // View state
  mode: 'create' | 'library';
  step: 'select_assets' | 'configure' | 'preview' | 'rendering';
  
  // Selected assets (sources)
  selectedTrack?: Track;
  selectedAvatar?: Avatar;
  selectedImages: MediaAsset[];
  
  // Video configuration
  videoMode: VideoMode;
  title: string;
  scenes: VideoScene[];
  
  // Avatar settings
  avatarAction: AvatarAction;
  enableLipSync: boolean;
  
  // Background
  backgroundType: BackgroundType;
  backgroundConfig: BackgroundConfig;
  
  // Text/Lyrics
  showLyrics: boolean;
  lyricsStyle: LyricsStyle;
  
  // Quality settings
  resolution: Resolution;
  
  // Effects
  transitions: TransitionConfig;
  filters: FilterConfig;
  
  // Generation state
  rendering: boolean;
  jobId?: string;
  progress: number;
  renderStage?: 'audio' | 'frames' | 'encoding' | 'finalizing';
  error?: string;
  
  // Output
  generatedVideo?: VideoClip;
  previewUrl?: string;
  
  // Library
  libraryVideos: VideoClip[];
  libraryLoading: boolean;
  libraryFilter: 'all' | 'favorites' | 'recent';
  
  // Actions - Asset selection
  setSelectedTrack: (track?: Track) => void;
  setSelectedAvatar: (avatar?: Avatar) => void;
  addImage: (image: MediaAsset) => void;
  removeImage: (imageId: string) => void;
  clearImages: () => void;
  
  // Actions - Configuration
  setVideoMode: (mode: VideoMode) => void;
  setTitle: (title: string) => void;
  setAvatarAction: (action: AvatarAction) => void;
  toggleLipSync: () => void;
  setBackgroundType: (type: BackgroundType) => void;
  setBackgroundConfig: (config: BackgroundConfig) => void;
  toggleLyrics: () => void;
  setLyricsStyle: (style: Partial<LyricsStyle>) => void;
  setResolution: (resolution: Resolution) => void;
  setTransitions: (transitions: Partial<TransitionConfig>) => void;
  setFilters: (filters: Partial<FilterConfig>) => void;
  
  // Actions - Scene management
  addScene: (scene: VideoScene) => void;
  updateScene: (sceneId: string, updates: Partial<VideoScene>) => void;
  removeScene: (sceneId: string) => void;
  reorderScenes: (fromIndex: number, toIndex: number) => void;
  generateScenesFromAssets: () => void;
  
  // Actions - Flow
  setStep: (step: VideoStudioState['step']) => void;
  nextStep: () => void;
  previousStep: () => void;
  
  // Actions - Rendering
  startRendering: (jobId: string) => void;
  updateRenderProgress: (progress: number, stage?: VideoStudioState['renderStage']) => void;
  setRenderError: (error: string) => void;
  completeRendering: (video: VideoClip, previewUrl?: string) => void;
  resetRendering: () => void;
  
  // Actions - Library
  loadLibrary: (videos: VideoClip[]) => void;
  addToLibrary: (video: VideoClip) => void;
  removeFromLibrary: (videoId: string) => void;
  toggleFavorite: (videoId: string) => void;
  setLibraryFilter: (filter: VideoStudioState['libraryFilter']) => void;
  
  // Actions - Reset
  reset: () => void;
  resetConfiguration: () => void;
}

const defaultLyricsStyle: LyricsStyle = {
  font_family: 'Inter',
  font_size: 48,
  color: '#ffffff',
  stroke_color: '#000000',
  stroke_width: 2,
  position: 'bottom',
  animation: 'fade',
  background_opacity: 0.3
};

const defaultTransitions: TransitionConfig = {
  default: 'fade',
  duration: 0.5
};

const defaultFilters: FilterConfig = {
  brightness: 1,
  contrast: 1,
  saturation: 1,
  vignette: 0,
  film_grain: 0
};

const defaultBackgroundConfig: BackgroundConfig = {
  color: '#0a0a1e',
  animation: 'static'
};

const defaultState = {
  mode: 'create' as const,
  step: 'select_assets' as const,
  selectedImages: [],
  videoMode: 'avatar_performance' as VideoMode,
  title: '',
  scenes: [],
  avatarAction: 'singing' as AvatarAction,
  enableLipSync: true,
  backgroundType: 'gradient' as BackgroundType,
  backgroundConfig: defaultBackgroundConfig,
  showLyrics: false,
  lyricsStyle: defaultLyricsStyle,
  resolution: '1080p' as Resolution,
  transitions: defaultTransitions,
  filters: defaultFilters,
  rendering: false,
  progress: 0,
  libraryVideos: [],
  libraryLoading: false,
  libraryFilter: 'all' as const
};

export const useVideoStudio = create<VideoStudioState>()(
  persist(
    (set, get) => ({
      ...defaultState,

      // Asset selection
      setSelectedTrack: (selectedTrack) => set({ selectedTrack }),
      setSelectedAvatar: (selectedAvatar) => set({ selectedAvatar }),
      
      addImage: (image) => set((state) => ({
        selectedImages: [...state.selectedImages, image]
      })),
      
      removeImage: (imageId) => set((state) => ({
        selectedImages: state.selectedImages.filter(img => img.id !== imageId)
      })),
      
      clearImages: () => set({ selectedImages: [] }),
      
      // Configuration
      setVideoMode: (videoMode) => set({ videoMode }),
      setTitle: (title) => set({ title }),
      setAvatarAction: (avatarAction) => set({ avatarAction }),
      toggleLipSync: () => set((state) => ({ enableLipSync: !state.enableLipSync })),
      setBackgroundType: (backgroundType) => set({ backgroundType }),
      
      setBackgroundConfig: (config) => set((state) => ({
        backgroundConfig: { ...state.backgroundConfig, ...config }
      })),
      
      toggleLyrics: () => set((state) => ({ showLyrics: !state.showLyrics })),
      
      setLyricsStyle: (style) => set((state) => ({
        lyricsStyle: { ...state.lyricsStyle, ...style }
      })),
      
      setResolution: (resolution) => set({ resolution }),
      
      setTransitions: (transitions) => set((state) => ({
        transitions: { ...state.transitions, ...transitions }
      })),
      
      setFilters: (filters) => set((state) => ({
        filters: { ...state.filters, ...filters }
      })),
      
      // Scene management
      addScene: (scene) => set((state) => ({
        scenes: [...state.scenes, scene]
      })),
      
      updateScene: (sceneId, updates) => set((state) => ({
        scenes: state.scenes.map(scene =>
          scene.id === sceneId ? { ...scene, ...updates } : scene
        )
      })),
      
      removeScene: (sceneId) => set((state) => ({
        scenes: state.scenes.filter(scene => scene.id !== sceneId)
      })),
      
      reorderScenes: (fromIndex, toIndex) => set((state) => {
        const scenes = [...state.scenes];
        const [removed] = scenes.splice(fromIndex, 1);
        if (!removed) {
          return { scenes };
        }
        scenes.splice(toIndex, 0, removed);
        return { scenes };
      }),
      
      generateScenesFromAssets: () => {
        const state = get();
        const scenes: VideoScene[] = [];
        const trackDuration = state.selectedTrack?.duration_seconds || 180;
        
        if (state.videoMode === 'avatar_performance' && state.selectedAvatar) {
          // Single scene with avatar
          scenes.push({
            id: `scene-${Date.now()}`,
            type: 'avatar',
            asset_id: state.selectedAvatar.id,
            duration: trackDuration,
            start_time: 0
          });
        } else if (state.videoMode === 'image_animation' && state.selectedImages.length > 0) {
          // Distribute images across duration
          const durationPerImage = trackDuration / state.selectedImages.length;
          
          state.selectedImages.forEach((image, index) => {
            scenes.push({
              id: `scene-${Date.now()}-${index}`,
              type: 'image',
              asset_id: image.id,
              duration: durationPerImage,
              start_time: index * durationPerImage,
              transition_in: index === 0 ? 'none' : 'fade',
              transition_out: index === state.selectedImages.length - 1 ? 'fade' : 'dissolve'
            });
          });
        } else if (state.videoMode === 'mixed') {
          // Alternate between avatar and images
          let currentTime = 0;
          const segmentDuration = trackDuration / (state.selectedImages.length + 1);
          
          if (state.selectedAvatar) {
            scenes.push({
              id: `scene-avatar-0`,
              type: 'avatar',
              asset_id: state.selectedAvatar.id,
              duration: segmentDuration,
              start_time: currentTime
            });
            currentTime += segmentDuration;
          }
          
          state.selectedImages.forEach((image, index) => {
            scenes.push({
              id: `scene-image-${index}`,
              type: 'image',
              asset_id: image.id,
              duration: segmentDuration,
              start_time: currentTime,
              transition_in: 'fade'
            });
            currentTime += segmentDuration;
          });
        }
        
        set({ scenes });
      },
      
      // Flow control
      setStep: (step) => set({ step }),
      
      nextStep: () => {
        const state = get();
        const steps: VideoStudioState['step'][] = ['select_assets', 'configure', 'preview', 'rendering'];
        const currentIndex = steps.indexOf(state.step);
        if (currentIndex < steps.length - 1) {
          set({ step: steps[currentIndex + 1] });
        }
      },
      
      previousStep: () => {
        const state = get();
        const steps: VideoStudioState['step'][] = ['select_assets', 'configure', 'preview', 'rendering'];
        const currentIndex = steps.indexOf(state.step);
        if (currentIndex > 0) {
          set({ step: steps[currentIndex - 1] });
        }
      },
      
      // Rendering
      startRendering: (jobId) => set({
        rendering: true,
        jobId,
        progress: 0,
        error: undefined,
        step: 'rendering'
      }),
      
      updateRenderProgress: (progress, renderStage) => set({ progress, renderStage }),
      
      setRenderError: (error) => set({
        rendering: false,
        error
      }),
      
      completeRendering: (video, previewUrl) => set({
        rendering: false,
        progress: 100,
        generatedVideo: video,
        previewUrl
      }),
      
      resetRendering: () => set({
        rendering: false,
        jobId: undefined,
        progress: 0,
        renderStage: undefined,
        error: undefined,
        generatedVideo: undefined,
        previewUrl: undefined
      }),
      
      // Library
      loadLibrary: (videos) => set({
        libraryVideos: videos,
        libraryLoading: false
      }),
      
      addToLibrary: (video) => set((state) => ({
        libraryVideos: [video, ...state.libraryVideos]
      })),
      
      removeFromLibrary: (videoId) => set((state) => ({
        libraryVideos: state.libraryVideos.filter(v => v.id !== videoId)
      })),
      
      toggleFavorite: (videoId) => set((state) => ({
        libraryVideos: state.libraryVideos.map(video =>
          video.id === videoId
            ? { ...video, is_favorite: !video.is_favorite }
            : video
        )
      })),
      
      setLibraryFilter: (libraryFilter) => set({ libraryFilter }),
      
      // Reset
      reset: () => set(defaultState),
      
      resetConfiguration: () => set({
        title: '',
        scenes: [],
        avatarAction: 'singing',
        enableLipSync: true,
        backgroundType: 'gradient',
        backgroundConfig: defaultBackgroundConfig,
        showLyrics: false,
        lyricsStyle: defaultLyricsStyle,
        resolution: '1080p',
        transitions: defaultTransitions,
        filters: defaultFilters
      })
    }),
    {
      name: 'video-studio-storage',
      partialize: (state) => ({
        // Only persist these fields
        resolution: state.resolution,
        libraryFilter: state.libraryFilter,
        lyricsStyle: state.lyricsStyle,
        filters: state.filters
      })
    }
  )
);
