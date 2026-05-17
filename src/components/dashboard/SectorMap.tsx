"use client";

import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { EmergencyAlert } from '@/lib/types';

// Fix Leaflet default icon broken in Next.js
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

function createColoredIcon(color: string) {
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

function MapUpdater({ alerts }: { alerts: EmergencyAlert[] }) {
  const map = useMap();
  const prevCountRef = useRef(0);

  useEffect(() => {
    const withLocation = alerts.filter(a => a.location);
    if (withLocation.length > prevCountRef.current) {
      const newest = withLocation[withLocation.length - 1];
      if (newest?.location) {
        map.flyTo([newest.location.lat, newest.location.lng], 14, { animate: true, duration: 1 });
      }
    } else if (withLocation.length > 0 && prevCountRef.current === 0) {
      if (withLocation.length === 1) {
        map.setView([withLocation[0].location!.lat, withLocation[0].location!.lng], 14, { animate: true });
      } else {
        const bounds = withLocation.map(a => [a.location!.lat, a.location!.lng] as [number, number]);
        map.fitBounds(bounds as any, { padding: [30, 30], animate: true });
      }
    }
    prevCountRef.current = withLocation.length;
  }, [alerts.length]);

  return null;
}

interface SectorMapProps {
  activeAlerts: EmergencyAlert[];
  alertColor: string;
  agencyLabel: string;
}

export default function SectorMap({ activeAlerts, alertColor, agencyLabel }: SectorMapProps) {
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
            icon={createColoredIcon(alertColor)}
          >
            <Popup>
              <div style={{ minWidth: 160 }}>
                <p style={{ fontWeight: 'bold', fontSize: 12, marginBottom: 4 }}>{agencyLabel}</p>
                <p style={{ fontSize: 11, color: '#444', marginBottom: 2 }}>{alert.userName}</p>
                <p style={{ fontSize: 10, color: '#888' }}>
                  {alert.location.lat.toFixed(5)}, {alert.location.lng.toFixed(5)}
                </p>
                {(alert as any).exactAddress && (
                  <p style={{ fontSize: 10, color: '#666', marginTop: 2 }}>{(alert as any).exactAddress}</p>
                )}
              </div>
            </Popup>
          </Marker>
        ) : null
      )}
    </MapContainer>
  );
}
