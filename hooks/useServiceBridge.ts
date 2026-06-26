'use client';

import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { useStudioBridge } from '@/store/useStudioBridge';

/**
 * Cross-service navigation: hand a generated result to the Video studio.
 * - sendImageToVideo: a generated image → the Video character-reference slot.
 * - sendMusicToMusicVideo: a generated/uploaded track → the Music-Video soundtrack slot.
 *
 * Both drop the payload in the bridge store and route to /[locale]/dashboard (the Video
 * studio lives there). On the SAME page this is a soft nav; from another route (Library)
 * it navigates. OmniStudio's bridge effect reads the store and populates the slot.
 */
export function useServiceBridge() {
  const router = useRouter();
  const locale = useLocale();
  const bridge = useStudioBridge();

  const sendImageToVideo = (imageUrl: string) => {
    if (!imageUrl) return;
    bridge.setTransitCharacter(imageUrl);
    router.push(`/${locale}/dashboard?service=video&from=image`);
  };

  const sendMusicToMusicVideo = (audioUrl: string, duration: number, filename: string, waveform?: number[]) => {
    if (!audioUrl) return;
    // Use real peaks when the caller has them; else a gentle pseudo-waveform so the
    // soundtrack preview still reads as audio.
    const peaks = waveform && waveform.length
      ? waveform
      : Array.from({ length: 48 }, (_, i) => {
          const base = Math.sin(i * 0.3) * 0.3 + 0.5;
          return Math.max(0.1, Math.min(0.95, base + (Math.random() - 0.5) * 0.3));
        });
    bridge.setTransitAudio(audioUrl, { duration: duration || 0, filename: filename || 'track.mp3', waveform: peaks });
    router.push(`/${locale}/dashboard?service=video&mode=musicvideo&from=music`);
  };

  return { sendImageToVideo, sendMusicToMusicVideo };
}
