"use client";

// Loaded only via dynamic(..., { ssr: false }) — safe to import Leaflet here
import 'leaflet/dist/leaflet.css';
import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { EmergencyAlert } from '@/lib/types';

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

// Recenter map when alerts change
function MapUpdater({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom, { animate: true });
  }, [center[0], center[1], zoom]);
  return null;
}

interface SectorMapProps {
  activeAlerts: EmergencyAlert[];
  alertColor: string;
  agencyLabel: string;
}

export default function SectorMap({ activeAlerts, alertColor, agencyLabel }: SectorMapProps) {
  const center: [number, number] = activeAlerts[0]?.location
    ? [activeAlerts[0].location.lat, activeAlerts[0].location.lng]
    : [12.8797, 121.774];
  const zoom = activeAlerts[0]?.location ? 13 : 7;

  return (
    <MapContainer
      center={center}
      zoom={zoom}
      style={{ height: '100%', width: '100%' }}
      zoomControl={false}
      scrollWheelZoom={false}
      attributionControl={false}
    >
      <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
      <MapUpdater center={center} zoom={zoom} />
      {activeAlerts.map(alert =>
        alert.location ? (
          <Marker
            key={alert.id}
            position={[alert.location.lat, alert.location.lng]}
            icon={createColoredIcon(alertColor)}
          >
            <Popup>
              <div style={{ minWidth: 140 }}>
                <p style={{ fontWeight: 'bold', fontSize: 12, marginBottom: 4 }}>{agencyLabel}</p>
                <p style={{ fontSize: 11, color: '#555' }}>{alert.userName}</p>
                <p style={{ fontSize: 10, color: '#888', marginTop: 2 }}>
                  {alert.location.lat.toFixed(4)}, {alert.location.lng.toFixed(4)}
                </p>
              </div>
            </Popup>
          </Marker>
        ) : null
      )}
    </MapContainer>
  );
}
