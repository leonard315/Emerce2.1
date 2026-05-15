"use client";

import { useEffect, useState } from 'react';
import { Navigation } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import dynamic from 'next/dynamic';
import { EmergencyAlert } from '@/lib/types';

const SectorMap = dynamic(() => import('./SectorMap'), { ssr: false });

// Colored teardrop marker
function createColoredIcon(color: string) {
  if (typeof window === 'undefined') return undefined;
  const L = require('leaflet');
  return L.divIcon({
    className: '',
    html: `<div style="
      width:24px;height:24px;
      background:${color};
      border:2.5px solid white;
      border-radius:50% 50% 50% 0;
      transform:rotate(-45deg);
      box-shadow:0 2px 8px rgba(0,0,0,0.5);
    "></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 24],
    popupAnchor: [0, -26],
  });
}

interface SectorVectorGridProps {
  headerColor?: string;
  activeAlerts?: EmergencyAlert[];
  alertColor?: string;   // hex color for markers e.g. '#f97316'
  mapHref?: string;
  agencyLabel?: string;  // e.g. '🔥 Fire Emergency'
}

export function SectorVectorGrid({
  headerColor = 'bg-blue-600',
  activeAlerts = [],
  alertColor = '#f97316',
  mapHref = '/map',
  agencyLabel = 'Emergency',
}: SectorVectorGridProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Center on first active alert or default to Philippines
  const center: [number, number] = activeAlerts[0]?.location
    ? [activeAlerts[0].location.lat, activeAlerts[0].location.lng]
    : [12.8797, 121.7740];

  const zoom = activeAlerts[0]?.location ? 13 : 7;

  return (
    <div className="rounded-2xl overflow-hidden border border-white/8 bg-[#080d1a]" style={{ isolation: 'isolate' }}>
      {/* Header bar */}
      <div className={cn('flex items-center justify-between px-5 py-3.5', headerColor)}>
        <div className="flex items-center gap-2.5">
          <Navigation className="h-4 w-4 text-white/80" strokeWidth={1.5} />
          <span className="text-xs font-black text-white uppercase tracking-[0.25em]">
            Sector Vector Grid
          </span>
          {activeAlerts.length > 0 && (
            <span className="ml-1 flex items-center gap-1 bg-white/20 rounded-full px-2 py-0.5 text-[10px] font-bold text-white">
              <span className="h-1.5 w-1.5 rounded-full bg-white animate-ping inline-block" />
              {activeAlerts.length} active
            </span>
          )}
        </div>
        <Link
          href={mapHref}
          className="text-[10px] font-bold text-white/80 hover:text-white uppercase tracking-widest transition-colors"
        >
          Expand →
        </Link>
      </div>

      {/* Map */}
      <div className="h-64 relative" style={{ zIndex: 0 }}>
        {mounted ? (
          <SectorMap
            activeAlerts={activeAlerts}
            alertColor={alertColor}
            agencyLabel={agencyLabel}
          />
        ) : (
          /* Loading skeleton */
          <div className="h-full bg-[#0d1526] flex items-center justify-center">
            <div className="h-8 w-8 rounded-full border-2 border-blue-400/30 border-t-blue-400 animate-spin" />
          </div>
        )}
      </div>
    </div>
  );
}
