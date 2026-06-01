'use client';

import { useEffect, useRef, useCallback } from 'react';

/**
 * Plays a phone ringtone using Web Audio API.
 * No audio file needed — generated programmatically.
 * Call startRing() to begin, stopRing() to stop.
 */
export function useRingtone() {
  const ctxRef = useRef<AudioContext | null>(null);
  const stoppedRef = useRef(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopRing = useCallback(() => {
    stoppedRef.current = true;
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
  }, []);

  const startRing = useCallback(() => {
    // Don't start if already ringing
    if (!stoppedRef.current) return;
    stoppedRef.current = false;

    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      ctxRef.current = ctx;

      const playOnce = (startAt: number) => {
        if (stoppedRef.current) return;
        // Two-tone phone ring: 440Hz + 480Hz mixed, 2s on / 2s off
        [440, 480].forEach(freq => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.value = freq;
          gain.gain.setValueAtTime(0, startAt);
          gain.gain.linearRampToValueAtTime(0.25, startAt + 0.05);
          gain.gain.setValueAtTime(0.25, startAt + 1.9);
          gain.gain.linearRampToValueAtTime(0, startAt + 2.0);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(startAt);
          osc.stop(startAt + 2.1);
        });
        // Schedule next ring after 4s (2s ring + 2s silence)
        timerRef.current = setTimeout(() => playOnce(ctx.currentTime), 4000);
      };

      playOnce(ctx.currentTime);
    } catch {
      // Web Audio not supported — silent fail
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => () => stopRing(), [stopRing]);

  return { startRing, stopRing };
}
