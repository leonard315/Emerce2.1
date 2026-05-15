"use client";

// Loaded only via dynamic(..., { ssr: false }) — safe to import Leaflet here
import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';

interface AgencyLocationMapProps {
  userLocation: [number, number];
}

export default function AgencyLocationMap({ userLocation }: AgencyLocationMapProps) {
  return (
    <MapContainer
      center={userLocation}
      zoom={15}
      style={{ height: '100%', width: '100%' }}
      zoomControl={false}
    >
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <Circle
        center={userLocation}
        radius={80}
        pathOptions={{ color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.15, weight: 2 }}
      />
      <Marker position={userLocation}>
        <Popup>
          <div className="text-xs font-bold">📍 Your Location</div>
        </Popup>
      </Marker>
    </MapContainer>
  );
}
