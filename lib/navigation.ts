"use client";

import { useRouter, usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

interface NavigationState {
  history: string[];
  canGoBack: boolean;
}

export function useSafeNavigation() {
  const router = useRouter();
  const pathname = usePathname();
  const [navState, setNavState] = useState<NavigationState>({
    history: [],
    canGoBack: false,
  });

  // Track navigation history
  useEffect(() => {
    setNavState((prev) => {
      const newHistory = [...prev.history, pathname];
      // Keep only last 10 entries
      if (newHistory.length > 10) newHistory.shift();
      return {
        history: newHistory,
        canGoBack: newHistory.length > 1,
      };
    });
  }, [pathname]);

  const safeBack = useCallback(
    (fallback: string = "/workspace") => {
      // ALWAYS go to workspace - blueprint rule
      router.push("/workspace");
    },
    [router]
  );

  const navigateToService = useCallback(
    (servicePath: string) => {
      router.push(servicePath);
    },
    [router]
  );

  return {
    safeBack,
    navigateToService,
    currentPath: pathname,
    canGoBack: navState.canGoBack,
  };
}

// Hook for checking if user came from workspace
export function useCameFromWorkspace() {
  const [cameFromWorkspace, setCameFromWorkspace] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const referrer = document.referrer;
      setCameFromWorkspace(referrer.includes("/workspace"));
    }
  }, []);

  return cameFromWorkspace;
}
