"use client";

import { useRef, useState, useEffect, useCallback } from 'react';

const ALERT_DURATION_MS = 60_000; // 1 minute

// ─── Fire alarm ───────────────────────────────────────────────────────────────
function createFireAlarm(ctx: AudioContext) {
  const ringFreq = 880;
  const ringDuration = 0.08;
  const ringGap = 0.04;
  const burstRings = 6;
  const burstGap = 0.5;
  const burstPeriod = burstRings * (ringDuration + ringGap) + burstGap;
  const totalBursts = Math.floor(ALERT_DURATION_MS / (burstPeriod * 1000));

  for (let b = 0; b < totalBursts; b++) {
    const burstStart = b * burstPeriod;
    for (let r = 0; r < burstRings; r++) {
      const t = ctx.currentTime + burstStart + r * (ringDuration + ringGap);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(ringFreq, t);
      osc.frequency.linearRampToValueAtTime(ringFreq * 1.02, t + ringDuration * 0.3);
      osc.frequency.linearRampToValueAtTime(ringFreq * 0.98, t + ringDuration);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.7, t + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.01, t + ringDuration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + ringDuration + 0.01);
    }
  }
}

// ─── Police siren ─────────────────────────────────────────────────────────────
function createPoliceSiren(ctx: AudioContext) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sawtooth';
  gain.gain.setValueAtTime(0.4, ctx.currentTime);
  osc.connect(gain);
  gain.connect(ctx.destination);

  const sweepDuration = 0.5;
  const totalSweeps = Math.floor(ALERT_DURATION_MS / (sweepDuration * 1000));
  for (let i = 0; i < totalSweeps; i++) {
    const t = ctx.currentTime + i * sweepDuration;
    if (i % 2 === 0) {
      osc.frequency.setValueAtTime(600, t);
      osc.frequency.linearRampToValueAtTime(1200, t + sweepDuration);
    } else {
      osc.frequency.setValueAtTime(1200, t);
      osc.frequency.linearRampToValueAtTime(600, t + sweepDuration);
    }
  }
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + ALERT_DURATION_MS / 1000 + 0.1);
}

// ─── Ambulance siren ──────────────────────────────────────────────────────────
function createAmbulanceSiren(ctx: AudioContext) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  gain.gain.setValueAtTime(0.45, ctx.currentTime);
  osc.connect(gain);
  gain.connect(ctx.destination);

  const toneDuration = 0.4;
  const totalTones = Math.floor(ALERT_DURATION_MS / (toneDuration * 1000));
  for (let i = 0; i < totalTones; i++) {
    const t = ctx.currentTime + i * toneDuration;
    const freq = i % 2 === 0 ? 960 : 770;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.linearRampToValueAtTime(freq, t + toneDuration - 0.02);
  }
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + ALERT_DURATION_MS / 1000 + 0.1);
}

// ─── Escape alarm ─────────────────────────────────────────────────────────────
function createEscapeAlarm(ctx: AudioContext) {
  const ATTEMPT_DURATION = 5.0;
  const ATTEMPT_GAP = 1.0;
  const TOTAL_ATTEMPTS = 3;

  for (let attempt = 0; attempt < TOTAL_ATTEMPTS; attempt++) {
    const attemptStart = attempt * (ATTEMPT_DURATION + ATTEMPT_GAP);
    const pulseInterval = 0.05;
    const totalPulses = Math.floor(ATTEMPT_DURATION / pulseInterval);
    for (let p = 0; p < totalPulses; p++) {
      const t = ctx.currentTime + attemptStart + p * pulseInterval;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(p % 2 === 0 ? 1800 : 1400, t);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.4, t + 0.01);
      gain.gain.linearRampToValueAtTime(0, t + 0.04);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.05);
    }
  }
}

// ─── Alert beep ───────────────────────────────────────────────────────────────
function playAlertBeep(ctx: AudioContext, type: 'fire' | 'police' | 'medical' | 'all' = 'fire') {
  const configs = {
    fire:    [{ f: 880,  t: 0 }, { f: 880,  t: 0.15 }, { f: 880,  t: 0.3 }],
    police:  [{ f: 800,  t: 0 }, { f: 1200, t: 0.4 },  { f: 800,  t: 0.8 }],
    medical: [{ f: 960,  t: 0 }, { f: 770,  t: 0.4 },  { f: 960,  t: 0.8 }],
    all:     [{ f: 1800, t: 0 }, { f: 1400, t: 0.2 },  { f: 1800, t: 0.4 }, { f: 1400, t: 0.6 }],
  };
  configs[type].forEach(({ f, t }) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type === 'all' ? 'square' : 'sawtooth';
    osc.frequency.setValueAtTime(f, ctx.currentTime + t);
    gain.gain.setValueAtTime(0, ctx.currentTime + t);
    gain.gain.linearRampToValueAtTime(0.45, ctx.currentTime + t + 0.02);
    gain.gain.setValueAtTime(0.45, ctx.currentTime + t + 0.28);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + t + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime + t);
    osc.stop(ctx.currentTime + t + 0.37);
  });
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export type AgencyType = 'fire' | 'police' | 'medical' | 'all';

interface UseAlertSoundReturn {
  soundEnabled: boolean;
  toggleSound: () => void;
  playNewIncident: (type?: AgencyType) => void;
  playSiren: (type?: AgencyType) => void;
  stopSiren: () => void;
  sirenActive: boolean;
}

export function useAlertSound(): UseAlertSoundReturn {
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [sirenActive, setSirenActive] = useState(false);

  // We keep a ref to the CURRENT siren AudioContext so we can close it on demand
  const sirenCtxRef = useRef<AudioContext | null>(null);
  // Separate context for short beeps so closing siren ctx doesn't cut beeps
  const beepCtxRef = useRef<AudioContext | null>(null);
  const autoStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Immediately silence the siren by suspending its AudioContext ────────────
  const stopSiren = useCallback(() => {
    if (autoStopTimerRef.current) {
      clearTimeout(autoStopTimerRef.current);
      autoStopTimerRef.current = null;
    }
    if (sirenCtxRef.current) {
      // suspend() mutes output instantly without destroying the context
      sirenCtxRef.current.suspend().catch(() => {});
      // Then close it so it gets GC'd
      sirenCtxRef.current.close().catch(() => {});
      sirenCtxRef.current = null;
    }
    setSirenActive(false);
  }, []);

  const playNewIncident = useCallback((type: AgencyType = 'fire') => {
    if (!soundEnabled) return;
    try {
      if (!beepCtxRef.current || beepCtxRef.current.state === 'closed') {
        beepCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      if (beepCtxRef.current.state === 'suspended') beepCtxRef.current.resume();
      playAlertBeep(beepCtxRef.current, type);
    } catch (e) {
      console.warn('Beep failed:', e);
    }
  }, [soundEnabled]);

  const playSiren = useCallback((type: AgencyType = 'fire') => {
    if (!soundEnabled) return;
    try {
      // Stop any currently playing siren first
      stopSiren();

      // Create a fresh AudioContext exclusively for this siren
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      sirenCtxRef.current = ctx;

      switch (type) {
        case 'fire':    createFireAlarm(ctx);      break;
        case 'police':  createPoliceSiren(ctx);    break;
        case 'medical': createAmbulanceSiren(ctx); break;
        case 'all':     createEscapeAlarm(ctx);    break;
        default:        createFireAlarm(ctx);
      }

      setSirenActive(true);

      const duration = type === 'all'
        ? 3 * (5000 + 1000) + 200
        : ALERT_DURATION_MS + 200;

      autoStopTimerRef.current = setTimeout(() => {
        stopSiren();
      }, duration);

    } catch (e) {
      console.warn('Siren failed:', e);
    }
  }, [soundEnabled, stopSiren]);

  const toggleSound = useCallback(() => {
    setSoundEnabled(prev => {
      if (prev) stopSiren(); // turning off — kill siren immediately
      return !prev;
    });
  }, [stopSiren]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (autoStopTimerRef.current) clearTimeout(autoStopTimerRef.current);
      sirenCtxRef.current?.close().catch(() => {});
      beepCtxRef.current?.close().catch(() => {});
    };
  }, []);

  return { soundEnabled, toggleSound, playNewIncident, playSiren, stopSiren, sirenActive };
}
