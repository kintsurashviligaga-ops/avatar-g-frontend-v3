"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    // Check if user has completed onboarding
    const hasOnboarded = localStorage.getItem("avatar-g-onboarded");
    
    if (hasOnboarded === "true") {
      router.push("/workspace");
    } else {
      router.push("/onboarding");
    }
    
    setIsChecking(false);
  }, [router]);

  // Loading state while checking
  return (
    <div className="fixed inset-0 bg-[#05070A] flex items-center justify-center">
      <div className="w-12 h-12 rounded-full border-4 border-cyan-500/30 border-t-cyan-400 animate-spin" />
    </div>
  );
}
