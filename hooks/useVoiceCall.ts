'use client';

import type Vapi from '@vapi-ai/web';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { createBrowserClient } from '@/lib/supabase/browser';
import { MINIMUM_CREDITS_TO_START_CALL } from '@/lib/voice/credits';
import { isValidGeorgianMobile, normalizePhoneNumber } from '@/lib/voice/phone';
import { getVapiWebClient, isVapiWebConfigured } from '@/lib/vapi-web';
import type { VoiceCallRecord } from '@/types/voice';

type VoiceCallPhase = 'idle' | 'requesting_phone' | 'calling' | 'ringing' | 'active' | 'ended';

type CallbackInput = {
  phoneNumber?: string;
  savePhone?: boolean;
  reason?: string;
};

const HISTORY_POLL_INTERVAL_MS = 5000;
const CONNECT_TIMEOUT_MS = 15000;

function detectBrowserGuide(): string {
  const ua = navigator.userAgent.toLowerCase();

  if (ua.includes('chrome') || ua.includes('edg')) {
    return 'chrome';
  }

  if (ua.includes('safari') && !ua.includes('chrome')) {
    return 'safari';
  }

  if (ua.includes('firefox')) {
    return 'firefox';
  }

  return 'generic';
}

function parseMessageText(payload: unknown): string {
  const record = (payload || {}) as Record<string, unknown>;

  const direct = String(record.transcript || record.text || '').trim();
  if (direct) {
    return direct;
  }

  const message = (record.message || {}) as Record<string, unknown>;
  const nested = String(message.transcript || message.content || '').trim();
  if (nested) {
    return nested;
  }

  return '';
}

function parseActiveJob(payload: unknown): string {
  const record = (payload || {}) as Record<string, unknown>;
  const text = JSON.stringify(record).toLowerCase();

  if (text.includes('create_job') || text.includes('job')) {
    return 'job';
  }

  return '';
}

export function useVoiceCall() {
  const supabase = useMemo(() => {
    try {
      return createBrowserClient() as any;
    } catch {
      return null;
    }
  }, []);

  const [userId, setUserId] = useState<string>('');
  const [callHistory, setCallHistory] = useState<VoiceCallRecord[]>([]);
  const [phase, setPhase] = useState<VoiceCallPhase>('idle');
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [errorCode, setErrorCode] = useState<string>('');
  const [countdownSeconds, setCountdownSeconds] = useState(5);
  const [phoneSheetOpen, setPhoneSheetOpen] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [activeJobTag, setActiveJobTag] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [callDropped, setCallDropped] = useState(false);
  const [browserGuide, setBrowserGuide] = useState('generic');

  const vapiRef = useRef<Vapi | null>(null);
  const listenersBoundRef = useRef(false);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const connectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeCall = useMemo(
    () => callHistory.find((row) => row.status === 'active' || row.status === 'ringing' || row.status === 'initiated') || null,
    [callHistory],
  );

  const latestCall = callHistory[0] || null;

  const refreshHistory = useCallback(async () => {
    if (!userId) {
      return;
    }

    try {
      const response = await fetch(`/api/voice/history?userId=${encodeURIComponent(userId)}`, {
        cache: 'no-store',
      });

      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as { calls?: VoiceCallRecord[] };
      const calls = Array.isArray(payload.calls) ? payload.calls : [];

      setCallHistory(calls);

      if (phoneSheetOpen) {
        setPhase('requesting_phone');
      } else if (calls.some((row) => row.status === 'active')) {
        setPhase('active');
      } else if (calls.some((row) => row.status === 'ringing')) {
        setPhase('ringing');
      } else if (calls[0]?.status === 'ended' || calls[0]?.status === 'failed') {
        setPhase('ended');
      } else if (!pending) {
        setPhase('idle');
      }
    } catch {
      // Keep previous call history in case of transient network errors.
    }
  }, [pending, phoneSheetOpen, userId]);

  const clearTimers = useCallback(() => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }

    if (connectTimeoutRef.current) {
      clearTimeout(connectTimeoutRef.current);
      connectTimeoutRef.current = null;
    }
  }, []);

  const startCountdown = useCallback(() => {
    setCountdownSeconds(5);

    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
    }

    countdownIntervalRef.current = setInterval(() => {
      setCountdownSeconds((prev) => {
        if (prev <= 1) {
          if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
            countdownIntervalRef.current = null;
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const bindVapiListeners = useCallback(() => {
    if (!vapiRef.current || listenersBoundRef.current) {
      return;
    }

    listenersBoundRef.current = true;

    vapiRef.current.on('call-start', () => {
      clearTimers();
      setPending(false);
      setPhase('active');
      setErrorCode('');
      setCallDropped(false);
      void refreshHistory();
    });

    vapiRef.current.on('call-end', () => {
      clearTimers();
      setPending(false);
      setPhase('ended');
      setActiveJobTag('');
      setLiveTranscript('');
      void refreshHistory();
    });

    vapiRef.current.on('message', (message: unknown) => {
      const transcript = parseMessageText(message);
      if (transcript) {
        setLiveTranscript(transcript);
      }

      const activeJob = parseActiveJob(message);
      if (activeJob) {
        setActiveJobTag(activeJob);
      }
    });

    vapiRef.current.on('error', () => {
      clearTimers();
      setPending(false);
      setPhase('ended');
      setErrorCode('call_failed');
      setCallDropped(true);
    });
  }, [clearTimers, refreshHistory]);

  const resolveUser = useCallback(async () => {
    if (!supabase?.auth?.getUser) {
      return;
    }

    const { data } = await supabase.auth.getUser();
    const id = String(data?.user?.id || '').trim();

    if (id) {
      setUserId(id);
    }
  }, [supabase]);

  useEffect(() => {
    void resolveUser();
  }, [resolveUser]);

  useEffect(() => {
    setBrowserGuide(typeof window !== 'undefined' ? detectBrowserGuide() : 'generic');
  }, []);

  useEffect(() => {
    if (!userId) {
      return;
    }

    setLoading(true);
    void refreshHistory().finally(() => setLoading(false));

    const intervalId = setInterval(() => {
      void refreshHistory();
    }, HISTORY_POLL_INTERVAL_MS);

    let channel: any = null;

    if (supabase?.channel && typeof supabase.channel === 'function') {
      try {
        channel = supabase
          .channel(`voice-calls-${userId}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'voice_calls',
              filter: `user_id=eq.${userId}`,
            },
            () => {
              void refreshHistory();
            },
          )
          .subscribe();
      } catch {
        channel = null;
      }
    }

    return () => {
      clearInterval(intervalId);
      if (channel && supabase?.removeChannel) {
        supabase.removeChannel(channel);
      }
    };
  }, [refreshHistory, supabase, userId]);

  useEffect(() => {
    return () => {
      clearTimers();
      if (vapiRef.current) {
        vapiRef.current.removeAllListeners();
      }
    };
  }, [clearTimers]);

  const initiateCallback = useCallback(
    async ({ phoneNumber, savePhone, reason }: CallbackInput = {}) => {
      const normalizedPhone = normalizePhoneNumber(phoneNumber || '');
      if (!normalizedPhone) {
        setPhoneSheetOpen(true);
        setPhase('requesting_phone');
        return { ok: false };
      }

      if (!userId) {
        setErrorCode('call_failed');
        return { ok: false };
      }

      if (phoneNumber && phoneNumber.replace(/\D/g, '').startsWith('5') && !isValidGeorgianMobile(normalizedPhone)) {
        setErrorCode('invalid_phone');
        return { ok: false };
      }

      setPending(true);
      setErrorCode('');
      setPhase('calling');
      startCountdown();

      try {
        const response = await fetch('/api/voice/outbound', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userId,
            phoneNumber: normalizedPhone,
            reason: reason || 'dashboard_callback',
            savePhone: Boolean(savePhone),
          }),
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { error?: string };
          setPending(false);
          setPhase('idle');
          setErrorCode(payload.error || 'call_failed');
          clearTimers();
          return { ok: false };
        }

        setPhoneSheetOpen(false);
        setPhase('ringing');
        setPending(false);
        void refreshHistory();
        return { ok: true };
      } catch {
        setPending(false);
        setPhase('idle');
        setErrorCode('call_failed');
        clearTimers();
        return { ok: false };
      }
    },
    [clearTimers, refreshHistory, startCountdown, userId],
  );

  const initiateWebCall = useCallback(async () => {
    if (!userId) {
      setErrorCode('call_failed');
      return { ok: false };
    }

    if (!isVapiWebConfigured()) {
      setErrorCode('call_failed');
      return { ok: false };
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorCode('mic_denied');
      return { ok: false };
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
    } catch {
      setErrorCode('mic_denied');
      return { ok: false };
    }

    setErrorCode('');
    setPending(true);
    setPhase('calling');
    setCallDropped(false);
    startCountdown();

    try {
      const tokenResponse = await fetch('/api/voice/web-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId }),
      });

      if (!tokenResponse.ok) {
        const payload = (await tokenResponse.json().catch(() => ({}))) as { error?: string };
        setPending(false);
        setPhase('idle');
        setErrorCode(payload.error || 'call_failed');
        clearTimers();
        return { ok: false };
      }

      const payload = (await tokenResponse.json()) as {
        token?: string;
        assistantId?: string | null;
        assistant?: Record<string, unknown>;
      };

      const vapiClient = getVapiWebClient(payload.token);
      if (!vapiClient) {
        setPending(false);
        setPhase('idle');
        setErrorCode('call_failed');
        clearTimers();
        return { ok: false };
      }

      vapiRef.current = vapiClient;
      bindVapiListeners();

      if (connectTimeoutRef.current) {
        clearTimeout(connectTimeoutRef.current);
      }

      connectTimeoutRef.current = setTimeout(() => {
        setPending(false);
        setPhase('ended');
        setErrorCode('call_failed');
      }, CONNECT_TIMEOUT_MS);

      if (payload.assistantId) {
        await vapiClient.start(payload.assistantId);
      } else {
        await vapiClient.start((payload.assistant || {}) as any);
      }

      return { ok: true };
    } catch {
      setPending(false);
      setPhase('idle');
      setErrorCode('call_failed');
      clearTimers();
      return { ok: false };
    }
  }, [bindVapiListeners, clearTimers, startCountdown, userId]);

  const endCall = useCallback(async () => {
    if (vapiRef.current) {
      vapiRef.current.end();
    }

    clearTimers();
    setPending(false);
    setPhase('ended');
    setActiveJobTag('');
    setLiveTranscript('');
    await refreshHistory();
  }, [clearTimers, refreshHistory]);

  const toggleMute = useCallback(() => {
    if (!vapiRef.current) {
      return;
    }

    const next = !isMuted;
    vapiRef.current.setMuted(next);
    setIsMuted(next);
  }, [isMuted]);

  const clearError = useCallback(() => {
    setErrorCode('');
  }, []);

  const retryLastAction = useCallback(async () => {
    if (callDropped || errorCode === 'call_failed') {
      await initiateWebCall();
    }
  }, [callDropped, errorCode, initiateWebCall]);

  return {
    MINIMUM_CREDITS_TO_START_CALL,
    userId,
    loading,
    pending,
    phase,
    countdownSeconds,
    errorCode,
    clearError,
    browserGuide,
    phoneSheetOpen,
    setPhoneSheetOpen,
    callHistory,
    activeCall,
    latestCall,
    liveTranscript,
    activeJobTag,
    isMuted,
    callDropped,
    initiateCallback,
    initiateWebCall,
    toggleMute,
    endCall,
    retryLastAction,
    refreshHistory,
  };
}
