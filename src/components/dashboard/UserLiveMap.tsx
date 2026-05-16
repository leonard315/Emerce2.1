"use client";

import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';

interface UserLiveMapProps {
  userLocation: [number, number] | null;
}

// Smoothly pan to new location without destroying/recreating the map
function LocationUpdater({ location }: { location: [number, number] | null }) {
  const map = useMap();
  const prevRef = useRef<[number, number] | null>(null);

  useEffect(() => {
    if (!location) return;
    const [lat, lng] = location;
    const prev = prevRef.current;
    if (!prev || Math.abs(prev[0] - lat) > 0.0001 || Math.abs(prev[1] - lng) > 0.0001) {
      map.flyTo([lat, lng], 15, { animate: true, duration: 1.2 });
      prevRef.current = location;
    }
  }, [location?.[0], location?.[1]]);

  return null;
}

export default function UserLiveMap({ userLocation }: UserLiveMapProps) {
  return (
    <MapContainer
      center={userLocation ?? [12.8797, 121.774]}
      zoom={userLocation ? 15 : 7}
      style={{ height: '100%', width: '100%' }}
      zoomControl={true}
      scrollWheelZoom={true}
      attributionControl={false}
    >
      <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
      <LocationUpdater location={userLocation} />
      {userLocation && (
        <>
          <Circle
            center={userLocation}
            radius={80}
            pathOptions={{ color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.15, weight: 2 }}
          />
          <Marker position={userLocation}>
            <Popup>
              <div style={{ minWidth: 140 }}>
                <p style={{ fontWeight: 'bold', fontSize: 12, marginBottom: 4 }}>📍 Your Location</p>
                <p style={{ fontSize: 10, color: '#888' }}>
                  {userLocation[0].toFixed(5)}, {userLocation[1].toFixed(5)}
                </p>
              </div>
            </Popup>
          </Marker>
        </>
      )}
    </MapContainer>
  );
}
