"use client";

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { collection, query, orderBy, limit } from 'firebase/firestore';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { useAuth } from '@/hooks/use-auth';
import { EmergencyAlert, EmergencyType } from '@/lib/types';
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Flame, Shield, Heart, Menu, X, Navigation, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import Link from 'next/link';

// Dynamic Leaflet imports (no SSR)
const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(m => m.TileLayer), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then(m => m.Marker), { ssr: false });
const Popup = dynamic(() => import('react-leaflet').then(m => m.Popup), { ssr: false });
const Circle = dynamic(() => import('react-leaflet').then(m => m.Circle), { ssr: false });

type MapStyle = 'street' | 'satellite' | 'dark';
type FilterType = 'all' | EmergencyType;

// ─── Colored marker icons ─────────────────────────────────────────────────────
function createColoredIcon(color: string) {
  if (typeof window === 'undefined') return null;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const L = require('leaflet');
  return L.divIcon({
    className: '',
    html: `
      <div style="
        width: 28px; height: 28px;
        background: ${color};
        border: 3px solid white;
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        box-shadow: 0 2px 8px rgba(0,0,0,0.4);
      "></div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -30],
  });
}

const markerColors: Record<string, string> = {
  fire: '#f97316',
  crime: '#3b82f6',
  medical: '#ef4444',
};

// ─── Auto-center component ────────────────────────────────────────────────────
// Map centering is handled via mapRef.current.setView() instead

export function LiveMapView() {
  const db = useFirestore();
  const router = useRouter();
  const { user, loading: authLoading, profile } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [mapStyle, setMapStyle] = useState<MapStyle>('street');
  const [showFeed, setShowFeed] = useState(true);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const mapRef = useRef<any>(null);

  useEffect(() => {
    setMounted(true);
    import('leaflet/dist/leaflet.css');
    getUserLocation();
  }, []);

  // Redirect unauthenticated users
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/auth');
    }
  }, [user, authLoading, router]);

  const getUserLocation = () => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation not supported');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        setUserLocation(loc);
        setLocationError(null);
        // Pan map to user location
        if (mapRef.current) {
          mapRef.current.setView(loc, 13);
        }
      },
      (err) => {
        setLocationError('Location access denied');
        console.warn('GPS error:', err.message);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // Realtime Firestore listener via useCollection
  // Agency users only see their own alerts; admin/user see all
  const alertsQuery = useMemoFirebase(() => {
    if (!db) return null;
    const roleCollectionMap: Record<string, string> = {
      fire: 'agency_alerts_fire',
      police: 'agency_alerts_police',
      medical: 'agency_alerts_medical',
    };
    const col = profile?.role && roleCollectionMap[profile.role]
      ? roleCollectionMap[profile.role]
      : 'all_alerts';
    return query(collection(db, col), orderBy('timestamp', 'desc'), limit(200));
  }, [db, profile?.role]);

  const { data: allAlertsData } = useCollection<EmergencyAlert>(alertsQuery);
  const allAlerts = allAlertsData || [];

  // Update timestamp whenever new data arrives
  useEffect(() => {
    if (allAlerts.length > 0) setLastUpdated(new Date());
  }, [allAlerts.length]);

  // Filter alerts
  const alerts = filterType === 'all'
    ? allAlerts
    : allAlerts.filter(a => a.type === filterType);

  const activeAlerts = alerts.filter(a => a.status !== 'resolved' && a.location);

  const stats = {
    total: allAlerts.filter(a => a.status !== 'resolved' && a.location).length,
    fire: allAlerts.filter(a => a.type === 'fire' && a.status !== 'resolved').length,
    crime: allAlerts.filter(a => a.type === 'crime' && a.status !== 'resolved').length,
    medical: allAlerts.filter(a => a.type === 'medical' && a.status !== 'resolved').length,
  };

  const tileUrls: Record<MapStyle, string> = {
    street: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  };

  // Default center: Philippines
  const defaultCenter: [number, number] = userLocation ?? [12.8797, 121.7740];

  // Show loading while checking auth
  if (authLoading || !user) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#020617]">
        <div className="h-8 w-8 rounded-full border-2 border-red-500/30 border-t-red-500 animate-spin" />
      </div>
    );
  }

  if (!mounted) return null;

  return (
    <div className="relative h-screen w-screen bg-[#020617] overflow-hidden flex flex-col">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="h-14 border-b border-white/5 bg-[#020617]/95 backdrop-blur-xl flex items-center justify-between px-4 sm:px-6 z-[1000] flex-shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors">
            <Menu className="h-5 w-5" />
          </Link>
          <h1 className="text-base font-black text-white tracking-tight">Live Emergency Map</h1>
          <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse ml-1" />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400">
            Updated {format(lastUpdated, 'h:mm:ss a')}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={getUserLocation}
            className="text-slate-400 hover:text-white h-8 gap-1.5"
          >
            <Navigation className="h-3.5 w-3.5" />
            <span className="text-xs">My Location</span>
          </Button>
        </div>
      </header>

      {/* ── Stats Bar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-2 bg-[#020617]/90 border-b border-white/5 z-[999] flex-shrink-0 overflow-x-auto">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900 border border-white/5 flex-shrink-0">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Pins</span>
          <span className="text-base font-black text-white">{stats.total}</span>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-orange-500/10 border border-orange-500/20 flex-shrink-0">
          <Flame className="h-3.5 w-3.5 text-orange-500" />
          <span className="text-base font-black text-white">{stats.fire}</span>
          <span className="text-[10px] text-orange-400">Fire</span>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-blue-500/10 border border-blue-500/20 flex-shrink-0">
          <Shield className="h-3.5 w-3.5 text-blue-500" />
          <span className="text-base font-black text-white">{stats.crime}</span>
          <span className="text-[10px] text-blue-400">Crime</span>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-red-500/10 border border-red-500/20 flex-shrink-0">
          <Heart className="h-3.5 w-3.5 text-red-500" />
          <span className="text-base font-black text-white">{stats.medical}</span>
          <span className="text-[10px] text-red-400">Medical</span>
        </div>
        {locationError && (
          <span className="text-xs text-yellow-400 ml-2 flex-shrink-0">⚠ {locationError}</span>
        )}
      </div>

      {/* ── Filter Tabs ────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 py-2 bg-[#020617]/80 border-b border-white/5 z-[998] flex-shrink-0">
        {(['all', 'fire', 'crime', 'medical'] as FilterType[]).map((type) => (
          <Button
            key={type}
            onClick={() => setFilterType(type)}
            variant={filterType === type ? 'default' : 'ghost'}
            size="sm"
            className={cn(
              "rounded-xl font-bold uppercase text-xs tracking-widest h-8",
              filterType === type
                ? type === 'fire' ? 'bg-orange-500 hover:bg-orange-600 text-white' :
                  type === 'crime' ? 'bg-blue-500 hover:bg-blue-600 text-white' :
                  type === 'medical' ? 'bg-red-500 hover:bg-red-600 text-white' :
                  'bg-slate-700 hover:bg-slate-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            )}
          >
            {type === 'all' ? `All (${allAlerts.filter(a => a.status !== 'resolved').length})` :
             type === 'fire' ? `Fire (${stats.fire})` :
             type === 'crime' ? `Crime (${stats.crime})` :
             `Medical (${stats.medical})`}
          </Button>
        ))}
      </div>

      {/* ── Map + Feed ─────────────────────────────────────────────────────── */}
      <div className="flex-1 relative flex overflow-hidden">

        {/* Map */}
        <div className="flex-1 relative">
          {mounted ? (
          <MapContainer
            center={defaultCenter}
            zoom={userLocation ? 13 : 7}
            style={{ height: '100%', width: '100%' }}
            zoomControl={true}
            ref={mapRef}
          >
            <TileLayer
              url={tileUrls[mapStyle]}
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            />

            {/* User's current location */}
            {userLocation && (
              <>
                <Circle
                  center={userLocation}
                  radius={80}
                  pathOptions={{ color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.15, weight: 2 }}
                />
                <Marker
                  position={userLocation}
                  icon={typeof window !== 'undefined' ? (() => {
                    const L = require('leaflet');
                    return L.divIcon({
                      className: '',
                      html: `<div style="
                        width: 16px; height: 16px;
                        background: #3b82f6;
                        border: 3px solid white;
                        border-radius: 50%;
                        box-shadow: 0 0 0 4px rgba(59,130,246,0.3);
                      "></div>`,
                      iconSize: [16, 16],
                      iconAnchor: [8, 8],
                    });
                  })() : undefined}
                >
                  <Popup>
                    <div className="text-xs font-bold">📍 Your Location</div>
                  </Popup>
                </Marker>
              </>
            )}

            {/* Alert markers */}
            {activeAlerts.map((alert) => {
              if (!alert.location) return null;
              const icon = typeof window !== 'undefined'
                ? createColoredIcon(markerColors[alert.type] || '#ef4444')
                : undefined;
              return (
                <Marker
                  key={alert.id}
                  position={[alert.location.lat, alert.location.lng]}
                  icon={icon || undefined}
                >
                  <Popup>
                    <div style={{ minWidth: 160 }}>
                      <div style={{
                        background: markerColors[alert.type] || '#ef4444',
                        color: 'white',
                        padding: '4px 8px',
                        borderRadius: '6px',
                        fontWeight: 'bold',
                        fontSize: '11px',
                        marginBottom: '6px',
                        textTransform: 'uppercase',
                      }}>
                        {alert.type} Emergency
                      </div>
                      <p style={{ fontWeight: 'bold', fontSize: '13px', margin: '4px 0' }}>{alert.userName}</p>
                      <p style={{ fontSize: '11px', color: '#666', margin: '2px 0' }}>
                        {alert.location.lat.toFixed(5)}, {alert.location.lng.toFixed(5)}
                      </p>
                      <p style={{ fontSize: '11px', color: '#888', margin: '2px 0' }}>
                        {alert.timestamp?.seconds ? format(alert.timestamp.toDate(), 'MMM d, h:mm a') : 'Live'}
                      </p>
                      <div style={{
                        display: 'inline-block',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '10px',
                        fontWeight: 'bold',
                        marginTop: '4px',
                        background: alert.status === 'resolved' ? '#dcfce7' : '#fee2e2',
                        color: alert.status === 'resolved' ? '#16a34a' : '#dc2626',
                      }}>
                        {alert.status.toUpperCase()}
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>
          ) : (
            <div className="h-full bg-[#0d1526] flex items-center justify-center">
              <div className="h-8 w-8 rounded-full border-2 border-blue-400/30 border-t-blue-400 animate-spin" />
            </div>
          )}

          {/* Map Style Switcher */}
          <div className="absolute bottom-4 left-4 z-[1000] flex gap-2 bg-[#020617]/80 backdrop-blur-sm p-1.5 rounded-xl border border-white/10">
            {(['street', 'satellite', 'dark'] as MapStyle[]).map((style) => (
              <Button
                key={style}
                onClick={() => setMapStyle(style)}
                variant={mapStyle === style ? 'default' : 'ghost'}
                size="sm"
                className={cn(
                  "rounded-lg font-bold uppercase text-xs h-7 px-3",
                  mapStyle === style ? 'bg-white text-black' : 'text-slate-400 hover:text-white'
                )}
              >
                {style}
              </Button>
            ))}
          </div>

          {/* Toggle feed button when hidden */}
          {!showFeed && (
            <Button
              onClick={() => setShowFeed(true)}
              className="absolute top-4 right-4 z-[1000] rounded-xl bg-[#020617]/90 border border-white/10 text-white hover:bg-slate-800"
              size="sm"
            >
              Alert Feed
            </Button>
          )}
        </div>

        {/* ── Alert Feed Panel ──────────────────────────────────────────────── */}
        {showFeed && (
          <div className="w-72 bg-[#020617]/95 backdrop-blur-xl border-l border-white/5 flex flex-col overflow-hidden flex-shrink-0">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-black text-white">Alert Feed</h2>
                <Badge className="bg-red-500/10 text-red-400 border-red-500/20 text-[10px] font-bold">
                  {activeAlerts.length} active
                </Badge>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setShowFeed(false)} className="h-7 w-7 p-0 text-slate-400 hover:text-white">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {alerts.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-slate-500 text-sm">
                  No alerts
                </div>
              ) : (
                alerts.slice(0, 30).map((alert) => (
                  <div
                    key={alert.id}
                    className={cn(
                      "px-4 py-3 border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer",
                      alert.status === 'pending' && 'bg-red-500/5'
                    )}
                  >
                    <div className="flex items-start justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <div className={cn(
                          "h-2 w-2 rounded-full flex-shrink-0 mt-0.5",
                          alert.type === 'fire' ? 'bg-orange-500' :
                          alert.type === 'crime' ? 'bg-blue-500' : 'bg-red-500'
                        )} />
                        <span className={cn(
                          "text-xs font-bold capitalize",
                          alert.type === 'fire' ? 'text-orange-400' :
                          alert.type === 'crime' ? 'text-blue-400' : 'text-red-400'
                        )}>
                          {alert.type} Emergency
                        </span>
                      </div>
                      <Badge
                        className={cn(
                          "text-[9px] font-bold border-none rounded-md px-1.5 py-0.5 flex-shrink-0",
                          alert.status === 'resolved' ? 'bg-green-500/10 text-green-400' :
                          alert.status === 'responding' ? 'bg-blue-500/10 text-blue-400' :
                          'bg-red-500/10 text-red-400'
                        )}
                      >
                        {alert.status}
                      </Badge>
                    </div>
                    <p className="text-xs font-bold text-white mb-0.5">{alert.userName}</p>
                    <p className="text-[10px] text-slate-500">
                      {alert.location
                        ? `${alert.location.lat.toFixed(4)}, ${alert.location.lng.toFixed(4)}`
                        : 'No GPS data'}
                    </p>
                    <p className="text-[10px] text-slate-600 mt-0.5">
                      {alert.timestamp?.seconds ? format(alert.timestamp.toDate(), 'MMM d, h:mm a') : 'Live'}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
