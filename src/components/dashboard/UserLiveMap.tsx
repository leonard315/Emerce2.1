"use client";

import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';

interface UserLiveMapProps {
  userLocation: [number, number] | null;
}

export default function UserLiveMap({ userLocation }: UserLiveMapProps) {
  return (
    <MapContainer
      center={userLocation ?? [12.8797, 121.774]}
      zoom={userLocation ? 15 : 7}
      style={{ height: '100%', width: '100%' }}
      key={userLocation ? `${userLocation[0]}-${userLocation[1]}` : 'default'}
    >
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {userLocation && (
        <>
          <Circle
            center={userLocation}
            radius={100}
            pathOptions={{ color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.15, weight: 2 }}
          />
          <Marker position={userLocation}>
            <Popup>
              <p className="text-xs font-bold">📍 Your Location</p>
            </Popup>
          </Marker>
        </>
      )}
    </MapContainer>
  );
}
