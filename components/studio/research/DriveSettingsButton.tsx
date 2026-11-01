'use client';

import { useEffect, useState } from 'react';
import { Cloud } from 'lucide-react';
import { fetchConnectors } from './api';
import { researchActions } from './store';

/** Drive remains reachable even when Deep Research is disabled. Access is decided by the server. */
export function DriveSettingsButton({ className, onOpen }: { className: string; onOpen: () => void }) {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    let active = true;
    void fetchConnectors().then((r) => {
      if (active && r.ok) setAvailable(r.connectors.some((c) => c.id === 'google_drive' && c.status === 'connectable'));
    });
    return () => { active = false; };
  }, []);
  if (!available) return null;
  return <button type="button" className={className} onClick={() => { onOpen(); researchActions.openConnectors(); }}>
    <Cloud className="h-[18px] w-[18px] text-app-muted" aria-hidden="true" /> Google Drive
  </button>;
}
