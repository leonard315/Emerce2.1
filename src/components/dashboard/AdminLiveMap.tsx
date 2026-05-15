"use client";

import 'leaflet/dist/leaflet.css';
import { useEffect } from 'react';
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

function MapUpdater({ alerts }: { alerts: Alert[] }) {
  const map = useMap();
  useEffect(() => {
    const first = alerts.find(a => a.location);
    if (first?.location) {
      map.setView([first.location.lat, first.location.lng], 13, { animate: true });
    }
  }, [alerts.map(a => a.id).join(',')]); // re-center whenever alert list changes
  return null;
}

export default function AdminLiveMap({ activeAlerts }: AdminLiveMapProps) {
  return (
    <MapContainer
      center={[12.8797, 121.774]}
      zoom={7}
      style={{ height: '100%', width: '100%' }}
      zoomControl={false}
      scrollWheelZoom={false}
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
              <div style={{ minWidth: 140 }}>
                <p style={{ fontWeight: 'bold', fontSize: 12, marginBottom: 4 }}>
                  {alert.type.toUpperCase()} Emergency
                </p>
                <p style={{ fontSize: 11, color: '#555' }}>{alert.userName}</p>
              </div>
            </Popup>
          </Marker>
        ) : null
      )}
    </MapContainer>
  );
}
