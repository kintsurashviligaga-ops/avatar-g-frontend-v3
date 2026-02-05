import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface AvatarIdentity {
  id: string;
  name: string;
  imageUrl: string;
  facialGeometry: Record<string, number>;
  stylePreferences: string[];
  createdAt: string;
}

export interface VoiceIdentity {
  id: string;
  name: string;
  voiceId: string;
  sampleUrl: string;
  speechPatterns: Record<string, any>;
  createdAt: string;
}

interface IdentityState {
  avatar: AvatarIdentity | null;
  voice: VoiceIdentity | null;
  setAvatar: (avatar: AvatarIdentity) => void;
  setVoice: (voice: VoiceIdentity) => void;
  clearIdentity: () => void;
}

export const useIdentityStore = create<IdentityState>()(
  persist(
    (set) => ({
      avatar: null,
      voice: null,
      setAvatar: (avatar) => set({ avatar }),
      setVoice: (voice) => set({ voice }),
      clearIdentity: () => set({ avatar: null, voice: null }),
    }),
    { name: 'avatar-g-identity' }
  )
);
