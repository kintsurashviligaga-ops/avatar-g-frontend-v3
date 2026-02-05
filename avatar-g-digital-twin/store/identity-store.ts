import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

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
  globalAvatarId: string | null;
  globalVoiceId: string | null;
  avatar: AvatarIdentity | null;
  voice: VoiceIdentity | null;
  setAvatar: (avatar: AvatarIdentity) => void;
  setVoice: (voice: VoiceIdentity) => void;
  clearIdentity: () => void;
}

export const useIdentityStore = create<IdentityState>()(
  persist(
    immer((set) => ({
      globalAvatarId: null,
      globalVoiceId: null,
      avatar: null,
      voice: null,
      setAvatar: (avatar) => set((state) => { state.avatar = avatar; state.globalAvatarId = avatar.id; }),
      setVoice: (voice) => set((state) => { state.voice = voice; state.globalVoiceId = voice.id; }),
      clearIdentity: () => set((state) => { state.avatar = null; state.voice = null; state.globalAvatarId = null; state.globalVoiceId = null; }),
    })),
    { name: 'avatar-g-identity' }
  )
);
