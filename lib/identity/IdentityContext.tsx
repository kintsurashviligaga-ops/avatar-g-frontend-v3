"use client";

import React, { createContext, useContext, useState, useCallback, ReactNode } from "react";

interface IdentityState {
  globalAvatarId: string | null;
  globalVoiceId: string | null;
  avatarConfig: {
    facialGeometry: number[];
    style: string;
    skinTone: string;
    eyeColor: string;
  } | null;
  voiceConfig: {
    sampleDuration: number;
    qualityScore: number;
    emotionProfiles: string[];
  } | null;
}

interface IdentityContextType extends IdentityState {
  setGlobalAvatarId: (id: string) => void;
  setGlobalVoiceId: (id: string) => void;
  setAvatarConfig: (config: IdentityState["avatarConfig"]) => void;
  setVoiceConfig: (config: IdentityState["voiceConfig"]) => void;
  injectIdentity: (content: any) => any;
  verifyIdentity: () => boolean;
}

const IdentityContext = createContext<IdentityContextType | undefined>(undefined);

export function IdentityProvider({ children }: { children: ReactNode }) {
  const [identity, setIdentity] = useState<IdentityState>({
    globalAvatarId: null,
    globalVoiceId: null,
    avatarConfig: null,
    voiceConfig: null
  });

  const setGlobalAvatarId = useCallback((id: string) => {
    setIdentity(prev => ({ ...prev, globalAvatarId: id }));
    // Persist to localStorage for session continuity
    localStorage.setItem("GLOBAL_AVATAR_ID", id);
  }, []);

  const setGlobalVoiceId = useCallback((id: string) => {
    setIdentity(prev => ({ ...prev, globalVoiceId: id }));
    localStorage.setItem("GLOBAL_VOICE_ID", id);
  }, []);

  const setAvatarConfig = useCallback((config: IdentityState["avatarConfig"]) => {
    setIdentity(prev => ({ ...prev, avatarConfig: config }));
    localStorage.setItem("AVATAR_CONFIG", JSON.stringify(config));
  }, []);

  const setVoiceConfig = useCallback((config: IdentityState["voiceConfig"]) => {
    setIdentity(prev => ({ ...prev, voiceConfig: config }));
    localStorage.setItem("VOICE_CONFIG", JSON.stringify(config));
  }, []);

  // MANDATORY: Identity Injection Protocol
  const injectIdentity = useCallback((content: any) => {
    if (!identity.globalAvatarId || !identity.globalVoiceId) {
      throw new Error("IdentityIntegrityError: Missing global identity");
    }

    return {
      ...content,
      _identity: {
        avatarId: identity.globalAvatarId,
        voiceId: identity.globalVoiceId,
        timestamp: new Date().toISOString(),
        version: "1.0"
      },
      _constraints: {
        visualIdentity: identity.globalAvatarId,
        audioIdentity: identity.globalVoiceId,
        styleConsistency: "STRICT"
      }
    };
  }, [identity]);

  const verifyIdentity = useCallback(() => {
    return !!(identity.globalAvatarId && identity.globalVoiceId);
  }, [identity]);

  return (
    <IdentityContext.Provider
      value={{
        ...identity,
        setGlobalAvatarId,
        setGlobalVoiceId,
        setAvatarConfig,
        setVoiceConfig,
        injectIdentity,
        verifyIdentity
      }}
    >
      {children}
    </IdentityContext.Provider>
  );
}

export function useIdentity() {
  const context = useContext(IdentityContext);
  if (context === undefined) {
    throw new Error("useIdentity must be used within IdentityProvider");
  }
  return context;
}
