"use client";

import { useRouter } from "next/navigation";
import { useEffect, useCallback } from "react";

const SAFE_ROUTE = "/workspace";
const SAFE_BACK_KEY = "avatar_g_safe_back_route";

/**
 * Hook that provides safe navigation back functionality.
 * If user came from external link or direct URL entry, goes to /workspace.
 * Otherwise, uses browser back.
 */
export function useSafeBack() {
  const router = useRouter();

  useEffect(() => {
    // Track the current route as potential safe back route
    if (typeof window !== "undefined") {
      const currentPath = window.location.pathname;
      if (currentPath === SAFE_ROUTE) {
        // We're at workspace, clear the safe back route
        sessionStorage.removeItem(SAFE_BACK_KEY);
      } else {
        // We're on a service page, set workspace as safe back
        sessionStorage.setItem(SAFE_BACK_KEY, SAFE_ROUTE);
      }
    }
  }, []);

  const safeBack = useCallback(() => {
    if (typeof window === "undefined") return;

    // Check if we have navigation history
    const hasHistory = window.history.length > 1;
    const safeRoute = sessionStorage.getItem(SAFE_BACK_KEY) || SAFE_ROUTE;

    // Check if user came from another page in our app
    const referrer = document.referrer;
    const isInternalReferrer =
      referrer && referrer.includes(window.location.origin);

    if (hasHistory && isInternalReferrer) {
      // Safe to go back in history
      router.back();
    } else {
      // No safe history, go to workspace
      router.push(safeRoute);
    }
  }, [router]);

  return safeBack;
}
