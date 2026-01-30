"use client";

import { useRouter, usePathname } from "next/navigation";
import { useEffect, useCallback } from "react";

const SAFE_ROUTE_KEY = "ag_last_safe_route";
const ONBOARDING_KEY = "ag_onboarding_done";

export function useSafeNavigation() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const safeRoutes = ["/workspace", "/settings", "/pricing", "/memory"];
    const isService = pathname.startsWith("/") && 
      !["/onboarding", "/404"].includes(pathname) &&
      pathname !== "/";
    
    if (safeRoutes.includes(pathname) || isService) {
      sessionStorage.setItem(SAFE_ROUTE_KEY, pathname);
    }
  }, [pathname]);

  const safeBack = useCallback((fallback: string = "/workspace") => {
    const lastSafe = sessionStorage.getItem(SAFE_ROUTE_KEY);
    const currentPath = window.location.pathname;
    
    if (lastSafe && lastSafe !== currentPath) {
      router.push(lastSafe);
      return;
    }
    
    router.push(fallback);
  }, [router]);

  const goToWorkspace = useCallback(() => {
    router.push("/workspace");
  }, [router]);

  return { safeBack, goToWorkspace, router };
}

export function useOnboarding() {
  const isComplete = () => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(ONBOARDING_KEY) === "true";
  };

  const complete = () => {
    localStorage.setItem(ONBOARDING_KEY, "true");
  };

  const reset = () => {
    localStorage.removeItem(ONBOARDING_KEY);
  };

  return { isComplete, complete, reset };
}
