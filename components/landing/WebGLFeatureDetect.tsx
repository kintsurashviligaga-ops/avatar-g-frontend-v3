import React, { useState } from 'react';

export function WebGLFeatureDetect({ children, fallback }: { children: React.ReactNode, fallback: React.ReactNode }) {
  const [supported, setSupported] = useState<boolean | null>(null);

  React.useEffect(() => {
    let isSupported = false;
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      isSupported = !!gl;
    } catch {
      isSupported = false;
    }
    if (!isSupported) {
      // Warn for debugging
      // eslint-disable-next-line no-console
      console.warn('[WebGLFeatureDetect] WebGL is not supported on this device/browser. 3D features will be disabled.');
    }
    setSupported(isSupported);
  }, []);

  if (supported === null) return null; // Wait for detection
  if (!supported) return fallback;
  return <>{children}</>;
}
