"use client";

// This component is ONLY loaded via dynamic(..., { ssr: false }) so it is
// safe to import Leaflet CSS and react-leaflet here — they never run on the server.
import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';

interface Alert {
  id: string;
  type: string;
  userName: string;
  location: { lat: number; lng: number } | null;
}

interface AdminLiveMapProps {
  activeAlerts: Alert[];
}

export default function AdminLiveMap({ activeAlerts }: AdminLiveMapProps) {
  return (
    <MapContainer
      center={[12.8797, 121.774]}
      zoom={7}
      style={{ height: '100%', width: '100%' }}
      zoomControl={false}
      scrollWheelZoom={false}
    >
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {activeAlerts.map(
        (alert) =>
          alert.location && (
            <Marker
              key={alert.id}
              position={[alert.location.lat, alert.location.lng]}
            >
              <Popup>
                <div className="text-xs">
                  <p className="font-bold">{alert.type.toUpperCase()}</p>
                  <p>{alert.userName}</p>
                </div>
              </Popup>
            </Marker>
          )
      )}
    </MapContainer>
  );
}
