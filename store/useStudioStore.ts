// Shared Studio State Store - Cross-service Asset Management
// This store manages selections across Avatar Builder, Music Studio, and Video Studio

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Avatar, Track, VideoClip, Language } from '@/types/platform';

interface StudioStore {
  // ============================================
  // LANGUAGE & UI STATE
  // ============================================
  language: Language;
  setLanguage: (language: Language) => void;

  // ============================================
  // AVATAR SPEECH (Talk Panel)
  // ============================================
  avatarSpeechText: string;
  setAvatarSpeechText: (text: string) => void;

  // ============================================
  // AVATAR SELECTION
  // ============================================
  selectedAvatarId: string | null;
  selectedAvatarPreviewUrl: string | null;
  selectedAvatar: Avatar | null;
  
  setSelectedAvatar: (avatar: Avatar | null) => void;
  setSelectedAvatarId: (id: string | null) => void;
  setSelectedAvatarPreviewUrl: (url: string | null) => void;
  clearSelectedAvatar: () => void;

  // ============================================
  // TRACK (MUSIC/SONG) SELECTION
  // ============================================
  selectedTrackId: string | null;
  selectedTrackAudioUrl: string | null;
  selectedTrackCoverUrl: string | null;
  selectedTrack: Track | null;
  
  setSelectedTrack: (track: Track | null) => void;
  setSelectedTrackId: (id: string | null) => void;
  setSelectedTrackAudioUrl: (url: string | null) => void;
  setSelectedTrackCoverUrl: (url: string | null) => void;
  clearSelectedTrack: () => void;

  // ============================================
  // VIDEO SELECTION
  // ============================================
  selectedVideoId: string | null;
  selectedVideoThumbnailUrl: string | null;
  selectedVideo: VideoClip | null;
  
  setSelectedVideo: (video: VideoClip | null) => void;
  setSelectedVideoId: (id: string | null) => void;
  setSelectedVideoThumbnailUrl: (url: string | null) => void;
  clearSelectedVideo: () => void;

  // ============================================
  // RECENT SELECTIONS (History)
  // ============================================
  recentAvatars: Avatar[];
  recentTracks: Track[];
  recentVideos: VideoClip[];
  
  addRecentAvatar: (avatar: Avatar) => void;
  addRecentTrack: (track: Track) => void;
  addRecentVideo: (video: VideoClip) => void;
  clearHistory: () => void;

  // ============================================
  // BULK OPERATIONS
  // ============================================
  clearAllSelections: () => void;
  
  // For multi-asset workflows (avatar → track → video)
  startWorkflow: () => void; // Clears previous video but keeps avatar/track
  completeWorkflow: (video: VideoClip) => void; // Save final video to recent
}

export const useStudioStore = create<StudioStore>()(
  persist(
    (set) => ({
      // ============================================
      // LANGUAGE & UI STATE
      // ============================================
      language: 'ka',
      setLanguage: (language) => set({ language }),

      // ============================================
      // AVATAR SPEECH
      // ============================================
      avatarSpeechText: '',
      setAvatarSpeechText: (text) => set({ avatarSpeechText: text }),

      // ============================================
      // AVATAR SELECTION
      // ============================================
      selectedAvatarId: null,
      selectedAvatarPreviewUrl: null,
      selectedAvatar: null,

      setSelectedAvatar: (avatar) =>
        set({
          selectedAvatar: avatar,
          selectedAvatarId: avatar?.id || null,
          selectedAvatarPreviewUrl: avatar?.preview_image_url || null
        }),

      setSelectedAvatarId: (id) => set({ selectedAvatarId: id }),
      setSelectedAvatarPreviewUrl: (url) => set({ selectedAvatarPreviewUrl: url }),

      clearSelectedAvatar: () =>
        set({
          selectedAvatarId: null,
          selectedAvatarPreviewUrl: null,
          selectedAvatar: null
        }),

      // ============================================
      // TRACK SELECTION
      // ============================================
      selectedTrackId: null,
      selectedTrackAudioUrl: null,
      selectedTrackCoverUrl: null,
      selectedTrack: null,

      setSelectedTrack: (track) =>
        set({
          selectedTrack: track,
          selectedTrackId: track?.id || null,
          selectedTrackAudioUrl: track?.audio_url || null,
          selectedTrackCoverUrl: track?.cover_url || null
        }),

      setSelectedTrackId: (id) => set({ selectedTrackId: id }),
      setSelectedTrackAudioUrl: (url) => set({ selectedTrackAudioUrl: url }),
      setSelectedTrackCoverUrl: (url) => set({ selectedTrackCoverUrl: url }),

      clearSelectedTrack: () =>
        set({
          selectedTrackId: null,
          selectedTrackAudioUrl: null,
          selectedTrackCoverUrl: null,
          selectedTrack: null
        }),

      // ============================================
      // VIDEO SELECTION
      // ============================================
      selectedVideoId: null,
      selectedVideoThumbnailUrl: null,
      selectedVideo: null,

      setSelectedVideo: (video) =>
        set({
          selectedVideo: video,
          selectedVideoId: video?.id || null,
          selectedVideoThumbnailUrl: video?.thumbnail_url || null
        }),

      setSelectedVideoId: (id) => set({ selectedVideoId: id }),
      setSelectedVideoThumbnailUrl: (url) => set({ selectedVideoThumbnailUrl: url }),

      clearSelectedVideo: () =>
        set({
          selectedVideoId: null,
          selectedVideoThumbnailUrl: null,
          selectedVideo: null
        }),

      // ============================================
      // RECENT SELECTIONS
      // ============================================
      recentAvatars: [],
      recentTracks: [],
      recentVideos: [],

      addRecentAvatar: (avatar) =>
        set((state) => {
          const filtered = state.recentAvatars.filter((a) => a.id !== avatar.id);
          return {
            recentAvatars: [avatar, ...filtered].slice(0, 5) // Keep last 5
          };
        }),

      addRecentTrack: (track) =>
        set((state) => {
          const filtered = state.recentTracks.filter((t) => t.id !== track.id);
          return {
            recentTracks: [track, ...filtered].slice(0, 5)
          };
        }),

      addRecentVideo: (video) =>
        set((state) => {
          const filtered = state.recentVideos.filter((v) => v.id !== video.id);
          return {
            recentVideos: [video, ...filtered].slice(0, 5)
          };
        }),

      clearHistory: () =>
        set({
          recentAvatars: [],
          recentTracks: [],
          recentVideos: []
        }),

      // ============================================
      // BULK OPERATIONS
      // ============================================
      clearAllSelections: () =>
        set({
          selectedAvatarId: null,
          selectedAvatarPreviewUrl: null,
          selectedAvatar: null,
          selectedTrackId: null,
          selectedTrackAudioUrl: null,
          selectedTrackCoverUrl: null,
          selectedTrack: null,
          selectedVideoId: null,
          selectedVideoThumbnailUrl: null,
          selectedVideo: null
        }),

      startWorkflow: () =>
        set({
          selectedVideoId: null,
          selectedVideoThumbnailUrl: null,
          selectedVideo: null
          // Keep avatar and track
        }),

      completeWorkflow: (video) =>
        set((state) => {
          const filtered = state.recentVideos.filter((v) => v.id !== video.id);
          return {
            selectedVideo: video,
            selectedVideoId: video.id,
            selectedVideoThumbnailUrl: video.thumbnail_url || null,
            recentVideos: [video, ...filtered].slice(0, 5)
          };
        })
    }),
    {
      name: 'avatar-g-studio-store',
      version: 1,
      // Persist selected language, avatar, track, video; also history
      partialize: (state) => ({
        language: state.language,
        selectedAvatarId: state.selectedAvatarId,
        selectedAvatarPreviewUrl: state.selectedAvatarPreviewUrl,
        selectedTrackId: state.selectedTrackId,
        selectedTrackAudioUrl: state.selectedTrackAudioUrl,
        selectedTrackCoverUrl: state.selectedTrackCoverUrl,
        selectedVideoId: state.selectedVideoId,
        selectedVideoThumbnailUrl: state.selectedVideoThumbnailUrl,
        recentAvatars: state.recentAvatars,
        recentTracks: state.recentTracks,
        recentVideos: state.recentVideos
      })
    }
  )
);
