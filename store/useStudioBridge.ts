import { create } from 'zustand';

/**
 * Cross-service Studio Bridge — carries a result from one service (image / music) into
 * the Video studio without prop-drilling. The image gallery + TrackPlayer live in
 * components that don't own OmniStudio's state, so they drop the payload here; OmniStudio
 * reads it on the next render and populates the right slot (character ref / soundtrack),
 * then clears it. Purely additive: nothing reads this store unless a bridge button fires.
 */
export interface AudioBridgeMeta {
  /** Track length in seconds (0 when unknown). */
  duration: number;
  filename: string;
  /** Downsampled 0..1 peaks for the soundtrack waveform preview. */
  waveform: number[];
}

interface StudioBridgeStore {
  transitCharacterUrl: string | null;
  transitAudioUrl: string | null;
  transitAudioMeta: AudioBridgeMeta | null;

  setTransitCharacter: (url: string) => void;
  setTransitAudio: (url: string, meta: AudioBridgeMeta) => void;
  clearCharacter: () => void;
  clearAudio: () => void;
}

export const useStudioBridge = create<StudioBridgeStore>((set) => ({
  transitCharacterUrl: null,
  transitAudioUrl: null,
  transitAudioMeta: null,

  setTransitCharacter: (url) => set({ transitCharacterUrl: url }),
  setTransitAudio: (url, meta) => set({ transitAudioUrl: url, transitAudioMeta: meta }),
  clearCharacter: () => set({ transitCharacterUrl: null }),
  clearAudio: () => set({ transitAudioUrl: null, transitAudioMeta: null }),
}));
