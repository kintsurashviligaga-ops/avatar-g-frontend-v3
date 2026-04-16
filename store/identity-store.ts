import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

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
  speechPatterns: Record<string, unknown>;
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
  devtools(
    persist(
      (set) => ({
        avatar: null,
        voice: null,
        setAvatar: (avatar) => set({ avatar }, false, 'identity/setAvatar'),
        setVoice: (voice) => set({ voice }, false, 'identity/setVoice'),
        clearIdentity: () => set({ avatar: null, voice: null }, false, 'identity/clear'),
      }),
      { name: 'avatar-g-identity' }
    ),
    { name: 'IdentityStore', enabled: process.env.NODE_ENV === 'development' }
  )
);
