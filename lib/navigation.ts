"use client";

import { useRouter } from "next/navigation";
import { useState, useCallback } from "react";

interface UseNavigationReturn {
  isComplete: boolean;
  complete: () => void;
  reset: () => void;
  goBack: (fallback?: string) => void;
}

export function useNavigation(): UseNavigationReturn {
  const router = useRouter();
  const [isComplete, setIsComplete] = useState(false);

  const complete = useCallback(() => {
    setIsComplete(true);
  }, []);

  const reset = useCallback(() => {
    setIsComplete(false);
  }, []);

  const goBack = useCallback((fallback: string = "/workspace") => {
    if (typeof window !== "undefined") {
      // Check if there's history to go back to
      if (window.history.length > 2) {
        router.back();
      } else {
        router.push(fallback);
      }
    }
  }, [router]);

  return { isComplete, complete, reset, goBack };
}

// For tracking navigation history
export function useNavigationHistory() {
  const [history, setHistory] = useState<string[]>([]);

  const push = useCallback((path: string) => {
    setHistory((prev) => [...prev, path]);
  }, []);

  const canGoBack = useCallback(() => {
    return history.length > 1;
  }, [history]);

  return { history, push, canGoBack };
}
