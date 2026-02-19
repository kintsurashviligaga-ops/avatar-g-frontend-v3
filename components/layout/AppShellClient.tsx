"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@/lib/supabase/browser';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopBar } from '@/components/layout/TopBar';

type AppShellClientProps = {
  userEmail: string;
  children: React.ReactNode;
};

export function AppShellClient({ userEmail, children }: AppShellClientProps) {
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      const supabase = createBrowserClient();
      await supabase.auth.signOut();
    } finally {
      router.replace('/auth');
      router.refresh();
      setIsLoggingOut(false);
    }
  };

  return (
    <div className="min-h-screen bg-transparent">
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar userEmail={userEmail} onLogout={handleLogout} isLoggingOut={isLoggingOut} />
          <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-5 md:px-6">{children}</main>
        </div>
      </div>
    </div>
  );
}