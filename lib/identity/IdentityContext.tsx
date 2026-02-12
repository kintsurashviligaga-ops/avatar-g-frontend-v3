"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

interface IdentityContextType {
  globalAvatarId: string | null;
  globalVoiceId: string | null;
  setGlobalAvatarId: (id: string | null) => void;
  setGlobalVoiceId: (id: string | null) => void;
  verifyIdentity: () => boolean;
  injectIdentity: <T extends Record<string, unknown>>(data: T) => T & {
    _identity: {
      avatarId: string | null;
      voiceId: string | null;
      timestamp: string;
    };
  };
  clearIdentity: () => void;
}

const IdentityContext = createContext<IdentityContextType | undefined>(undefined);

export function IdentityProvider({ children }: { children: ReactNode }) {
  const [globalAvatarId, setGlobalAvatarIdState] = useState<string | null>(null);
  const [globalVoiceId, setGlobalVoiceIdState] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    const storedAvatarId = localStorage.getItem("GLOBAL_AVATAR_ID");
    const storedVoiceId = localStorage.getItem("GLOBAL_VOICE_ID");
    
    if (storedAvatarId) setGlobalAvatarIdState(storedAvatarId);
    if (storedVoiceId) setGlobalVoiceIdState(storedVoiceId);
    
    setIsLoaded(true);
  }, []);

  const setGlobalAvatarId = (id: string | null) => {
    setGlobalAvatarIdState(id);
    if (id) {
      localStorage.setItem("GLOBAL_AVATAR_ID", id);
    } else {
      localStorage.removeItem("GLOBAL_AVATAR_ID");
    }
  };

  const setGlobalVoiceId = (id: string | null) => {
    setGlobalVoiceIdState(id);
    if (id) {
      localStorage.setItem("GLOBAL_VOICE_ID", id);
    } else {
      localStorage.removeItem("GLOBAL_VOICE_ID");
    }
  };

  const verifyIdentity = () => {
    return !!globalAvatarId && !!globalVoiceId;
  };

  const injectIdentity = <T extends Record<string, unknown>>(data: T) => {
    return {
      ...data,
      _identity: {
        avatarId: globalAvatarId,
        voiceId: globalVoiceId,
        timestamp: new Date().toISOString()
      }
    };
  };

  const clearIdentity = () => {
    setGlobalAvatarIdState(null);
    setGlobalVoiceIdState(null);
    localStorage.removeItem("GLOBAL_AVATAR_ID");
    localStorage.removeItem("GLOBAL_VOICE_ID");
  };

  if (!isLoaded) {
    return null;
  }

  return (
    <IdentityContext.Provider
      value={{
        globalAvatarId,
        globalVoiceId,
        setGlobalAvatarId,
        setGlobalVoiceId,
        verifyIdentity,
        injectIdentity,
        clearIdentity
      }}
    >
      {children}
    </IdentityContext.Provider>
  );
}

export function useIdentity() {
  const context = useContext(IdentityContext);
  if (context === undefined) {
    throw new Error("useIdentity must be used within an IdentityProvider");
  }
  return context;
}
