'use client';

/**
 * useSignedIn — who is signed in, for a host ChatChrome mounts (Deep Research).
 *
 * ChatChrome passes its own state AND publishes the same facts on <html data-authed data-uid> (the studio's publish-once
 * flags). Either is enough: a host mounted before ChatChrome's effect has run still learns the account as soon as the flags
 * land, and the two can never disagree in the product (one owner writes both).
 */
import { useEffect, useState } from 'react';

export function useSignedIn(authedProp: boolean, userIdProp: string | null): { authed: boolean; userId: string | null } {
  const [flags, setFlags] = useState<{ authed: boolean; uid: string | null }>({ authed: false, uid: null });
  useEffect(() => {
    const el = document.documentElement;
    const read = () => {
      const authed = el.dataset.authed === '1';
      const uid = el.dataset.uid || null;
      setFlags((cur) => (cur.authed === authed && cur.uid === uid ? cur : { authed, uid }));
    };
    read();
    const mo = new MutationObserver(read);
    mo.observe(el, { attributes: true, attributeFilter: ['data-authed', 'data-uid'] });
    return () => mo.disconnect();
  }, []);
  return { authed: authedProp || flags.authed, userId: userIdProp ?? flags.uid };
}
