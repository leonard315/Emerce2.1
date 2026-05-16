"use client";

import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';

interface Alert {
  id: string;
  type: string;
  userName: string;
  location: { lat: number; lng: number } | null;
}

interface AdminLiveMapProps {
  activeAlerts: Alert[];
}

const TYPE_COLORS: Record<string, string> = {
  fire: '#f97316',
  crime: '#3b82f6',
  medical: '#ef4444',
};

function createColoredIcon(color: string) {
  if (typeof window === 'undefined') return undefined;
  const L = require('leaflet');
  return L.divIcon({
    className: '',
    html: `<div style="
      width:22px;height:22px;
      background:${color};
      border:2.5px solid white;
      border-radius:50% 50% 50% 0;
      transform:rotate(-45deg);
      box-shadow:0 2px 8px rgba(0,0,0,0.5);
    "></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 22],
    popupAnchor: [0, -24],
  });
}

// Only recenters when a NEW alert arrives (count increases), not on every render
function MapUpdater({ alerts }: { alerts: Alert[] }) {
  const map = useMap();
  const prevCountRef = useRef(0);

  useEffect(() => {
    const withLocation = alerts.filter(a => a.location);
    if (withLocation.length > prevCountRef.current) {
      // New alert — fly to it
      const newest = withLocation[withLocation.length - 1];
      if (newest?.location) {
        map.flyTo([newest.location.lat, newest.location.lng], 14, { animate: true, duration: 1 });
      }
    } else if (withLocation.length > 0 && prevCountRef.current === 0) {
      // First load with alerts — fit all markers
      const bounds = withLocation.map(a => [a.location!.lat, a.location!.lng] as [number, number]);
      if (bounds.length === 1) {
        map.setView(bounds[0], 14, { animate: true });
      } else {
        map.fitBounds(bounds, { padding: [40, 40], animate: true });
      }
    }
    prevCountRef.current = withLocation.length;
  }, [alerts.length]);

  return null;
}

export default function AdminLiveMap({ activeAlerts }: AdminLiveMapProps) {
  return (
    <MapContainer
      center={[12.8797, 121.774]}
      zoom={7}
      style={{ height: '100%', width: '100%' }}
      zoomControl={true}
      scrollWheelZoom={true}
      attributionControl={false}
    >
      <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
      <MapUpdater alerts={activeAlerts} />
      {activeAlerts.map(alert =>
        alert.location ? (
          <Marker
            key={alert.id}
            position={[alert.location.lat, alert.location.lng]}
            icon={createColoredIcon(TYPE_COLORS[alert.type] || '#ef4444')}
          >
            <Popup>
              <div style={{ minWidth: 160 }}>
                <p style={{ fontWeight: 'bold', fontSize: 12, marginBottom: 4 }}>
                  {alert.type.toUpperCase()} Incident
                </p>
                <p style={{ fontSize: 11, color: '#444', marginBottom: 2 }}>{alert.userName}</p>
                <p style={{ fontSize: 10, color: '#888' }}>
                  {alert.location.lat.toFixed(5)}, {alert.location.lng.toFixed(5)}
                </p>
              </div>
            </Popup>
          </Marker>
        ) : null
      )}
    </MapContainer>
  );
}
