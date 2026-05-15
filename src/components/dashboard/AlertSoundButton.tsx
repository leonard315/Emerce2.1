"use client";

import { useEffect, useState, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Volume2, VolumeX, Siren, Timer } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AlertSoundButtonProps {
  soundEnabled: boolean;
  sirenActive: boolean;
  onToggleSound: () => void;
  onPlaySiren: () => void;
  onStopSiren: () => void;
  pendingCount?: number;
  accentColor?: string;
}

// Duration in seconds per agency type
const SIREN_DURATIONS: Record<string, number> = {
  orange: 60,  // Fire — 1 minute
  blue:   60,  // Police — 1 minute
  red:    60,  // Medical — 1 minute
};

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}:${s.toString().padStart(2, '0')}` : `${s}s`;
}

export function AlertSoundButton({
  soundEnabled,
  sirenActive,
  onToggleSound,
  onPlaySiren,
  onStopSiren,
  pendingCount = 0,
  accentColor = 'red',
}: AlertSoundButtonProps) {
  const [remaining, setRemaining] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const totalDuration = SIREN_DURATIONS[accentColor] ?? 60;

  // Start/stop countdown when sirenActive changes
  useEffect(() => {
    if (sirenActive) {
      setRemaining(totalDuration);
      intervalRef.current = setInterval(() => {
        setRemaining(prev => {
          if (prev <= 1) {
            if (intervalRef.current) clearInterval(intervalRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setRemaining(0);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [sirenActive, totalDuration]);

  const colorMap: Record<string, { siren: string; badge: string; progress: string }> = {
    orange: {
      siren: 'bg-orange-600 hover:bg-orange-500 shadow-orange-900/40',
      badge: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
      progress: 'bg-orange-500',
    },
    blue: {
      siren: 'bg-blue-600 hover:bg-blue-500 shadow-blue-900/40',
      badge: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
      progress: 'bg-blue-500',
    },
    red: {
      siren: 'bg-red-600 hover:bg-red-500 shadow-red-900/40',
      badge: 'bg-red-500/10 text-red-400 border-red-500/20',
      progress: 'bg-red-500',
    },
  };

  const colors = colorMap[accentColor] ?? colorMap.red;
  const progressPct = sirenActive ? (remaining / totalDuration) * 100 : 0;

  const sirenLabel =
    accentColor === 'orange' ? '🔥 Fire Alarm' :
    accentColor === 'blue'   ? '🚔 Patrol Siren' :
    '🚑 Ambulance';

  return (
    <div className="flex items-center gap-2">
      {/* Pending count badge */}
      {pendingCount > 0 && (
        <Badge className={cn("text-xs font-bold border animate-pulse", colors.badge)}>
          {pendingCount} pending
        </Badge>
      )}

      {/* Duration countdown — shown while siren is active */}
      {sirenActive && remaining > 0 && (
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800/80 border border-white/10">
          <Timer className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
          <div className="flex flex-col gap-0.5 min-w-[36px]">
            <span className="text-xs font-black text-white leading-none">{formatTime(remaining)}</span>
            {/* Progress bar */}
            <div className="h-1 w-full bg-slate-700 rounded-full overflow-hidden">
              <div
                className={cn("h-full rounded-full transition-all duration-1000", colors.progress)}
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Mute/unmute toggle */}
      <Button
        variant="outline"
        size="sm"
        onClick={onToggleSound}
        className={cn(
          "h-9 gap-1.5 border-white/10 font-semibold text-xs",
          soundEnabled ? "text-white hover:bg-white/5" : "text-slate-500 hover:bg-white/5"
        )}
        title={soundEnabled ? 'Mute alerts' : 'Unmute alerts'}
      >
        {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
        <span className="hidden sm:inline">{soundEnabled ? 'Sound On' : 'Muted'}</span>
      </Button>

      {/* Siren toggle */}
      <Button
        size="sm"
        onClick={sirenActive ? onStopSiren : onPlaySiren}
        className={cn(
          "h-9 gap-1.5 font-semibold text-xs text-white shadow-lg transition-all",
          sirenActive ? "bg-slate-700 hover:bg-slate-600 animate-pulse" : colors.siren
        )}
        title={sirenActive ? 'Stop siren' : 'Activate siren'}
      >
        <Siren className={cn("h-4 w-4", sirenActive && "animate-spin")} />
        <span className="hidden sm:inline">
          {sirenActive ? 'Stop Siren' : sirenLabel}
        </span>
      </Button>
    </div>
  );
}
