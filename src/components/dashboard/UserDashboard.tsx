"use client";

import { useState, useEffect } from 'react';
import { collection, doc, setDoc, writeBatch, query, orderBy, serverTimestamp as firestoreTimestamp } from 'firebase/firestore';
import { ref, push, serverTimestamp as rtdbTimestamp } from 'firebase/database';
import { useFirestore, useCollection, useDatabase, useMemoFirebase } from '@/firebase';
import { EmergencyAlert, EmergencyType } from '@/lib/types';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Flame, Shield, Activity, AlertTriangle, Star, Zap, Info, Radio, Menu, MapPin, Clock, Loader2, Navigation, ClipboardList, Camera } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import { signOut } from 'firebase/auth';
import { useAuth as useFirebaseAuth } from '@/firebase';
import { clearLoginTimestamp } from '@/firebase';
import { useRouter } from 'next/navigation';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { DashboardHeader } from "./DashboardHeader";
import { UserSidebar } from "./UserSidebar";
import dynamic from 'next/dynamic';

const UserLiveMap = dynamic(() => import('./UserLiveMap'), { ssr: false });

export function UserDashboard() {
  const { profile } = useAuth();
  const auth = useFirebaseAuth();
  const router = useRouter();
  const db = useFirestore();
  const rtdb = useDatabase();
  const { toast } = useToast();

  const handleLogout = async () => {
    clearLoginTimestamp();
    await signOut(auth);
    router.push('/auth');
  };
  const [currentView, setCurrentView] = useState("home");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<EmergencyType | 'all' | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'acquiring' | 'acquired' | 'denied'>('idle');
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [exactAddress, setExactAddress] = useState<string>('');
  const [mapMounted, setMapMounted] = useState(false);
  const [manualLocation, setManualLocation] = useState('');
  const [photoEvidence, setPhotoEvidence] = useState<File | null>(null);

  const reverseGeocode = async (lat: number, lng: number): Promise<string> => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
        { headers: { 'Accept-Language': 'en' } }
      );
      const data = await res.json();
      return data.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    } catch {
      return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    }
  };

  useEffect(() => {
    setMapMounted(true);
  }, []);

  const [easeOfUse, setEaseOfUse] = useState([3]);
  const [reliability, setReliability] = useState([3]);
  const [comments, setComments] = useState("");

  const alertsQuery = useMemoFirebase(() => {
    if (!profile || !db) return null;
    return query(
      collection(db, 'users', profile.uid, 'alerts'),
      orderBy('timestamp', 'desc')
    );
  }, [db, profile?.uid]);

  const { data: alertsData, isLoading: alertsLoading } = useCollection<EmergencyAlert>(alertsQuery);
  const alerts = alertsData || [];

  const confirmAlert = async () => {
    if (!selectedType || !profile || !db) return;
    setIsSubmitting(true);
    setConfirmOpen(false);
    setGpsStatus('acquiring');

    let location = null;
    try {
      toast({ title: "📍 Acquiring GPS...", description: "Getting your location for responders." });
      const pos = await new Promise<GeolocationPosition>((res, rej) => 
        navigator.geolocation.getCurrentPosition(res, rej, { timeout: 8000, enableHighAccuracy: true })
      );
      location = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setUserLocation([pos.coords.latitude, pos.coords.longitude]);
      setGpsStatus('acquired');
      const address = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
      setExactAddress(address);
      toast({ title: "✅ Location acquired", description: address.slice(0, 60) });
    } catch (e) {
      setGpsStatus('denied');
      toast({ 
        variant: "destructive", 
        title: "⚠️ Location unavailable", 
        description: "Alert sent without GPS. Please enable location for faster response." 
      });
    }

    const alertId = doc(collection(db, 'temp')).id;
    const baseAlertData = {
      id: alertId,
      userId: profile.uid,
      userName: profile.name,
      userAge: profile.age ?? null,
      userSex: profile.sex ?? null,
      userEmail: profile.email ?? null,
      userPhotoURL: profile.photoURL ?? null,
      exactAddress: exactAddress || null,
      color: selectedType === 'fire' ? 'orange' : selectedType === 'crime' ? 'blue' : 'red',
      location,
      status: 'pending' as const,
      timestamp: firestoreTimestamp(),
    };

    const batch = writeBatch(db);

    if (selectedType === 'all') {
      // Send to all three agencies with their correct type
      const fireData = { ...baseAlertData, type: 'fire' as const, color: 'orange' };
      const policeData = { ...baseAlertData, type: 'crime' as const, color: 'blue' };
      const medicalData = { ...baseAlertData, type: 'medical' as const, color: 'red' };
      batch.set(doc(db, 'users', profile.uid, 'alerts', alertId), fireData);
      batch.set(doc(db, 'agency_alerts_fire', alertId), fireData);
      batch.set(doc(db, 'agency_alerts_police', alertId), policeData);
      batch.set(doc(db, 'agency_alerts_medical', alertId), medicalData);
      batch.set(doc(db, 'all_alerts', alertId), { ...fireData, type: 'fire' });
    } else {
      const alertData = {
        ...baseAlertData,
        type: selectedType,
        color: selectedType === 'fire' ? 'orange' : selectedType === 'crime' ? 'blue' : 'red',
      };
      batch.set(doc(db, 'users', profile.uid, 'alerts', alertId), alertData);
      const agencyCollection = selectedType === 'fire' ? 'agency_alerts_fire' :
        selectedType === 'crime' ? 'agency_alerts_police' :
        'agency_alerts_medical';
      batch.set(doc(db, agencyCollection, alertId), alertData);
      batch.set(doc(db, 'all_alerts', alertId), alertData);
    }
    
    await batch.commit();

    if (rtdb) {
      push(ref(rtdb, 'live-logs'), {
        action: `Emergency Node Triggered: ${selectedType.toUpperCase()}`,
        userName: profile.name,
        timestamp: rtdbTimestamp()
      });
    }

    toast({ title: "SIGNAL TRANSMITTED", description: "Emergency units have been notified." });
    setIsSubmitting(false);
    setSelectedType(null);
  };

  const submitFeedback = async () => {
    if (!profile || !db) return;
    const feedbackId = doc(collection(db, 'temp')).id;
    const feedbackData = {
      id: feedbackId,
      userId: profile.uid,
      easeOfUse: easeOfUse[0],
      reliability: reliability[0],
      comments,
      timestamp: firestoreTimestamp(),
    };

    const batch = writeBatch(db);
    batch.set(doc(db, 'users', profile.uid, 'questionnaire_responses', feedbackId), feedbackData);
    batch.set(doc(db, 'all_questionnaire_responses', feedbackId), feedbackData);
    await batch.commit();
    toast({ title: "Feedback Received" });
    setFeedbackOpen(false);
  };

  const emergencyButtons = [
    { type: 'fire' as const, color: 'bg-[#f97316]', icon: Flame, title: 'FIRE', subtitle: 'Bureau of Fire Protection' },
    { type: 'crime' as const, color: 'bg-[#2563eb]', icon: Shield, title: 'POLICE', subtitle: 'Philippine National Police' },
    { type: 'medical' as const, color: 'bg-[#dc2626]', icon: Activity, title: 'RESCUE & MEDICAL', subtitle: 'Emergency Medical Services' },
    { type: 'all' as const, color: 'bg-[#1e293b]', icon: AlertTriangle, title: 'ALL AGENCIES', subtitle: 'BFP + PNP + EMS' },
  ];

  const satelliteMapImg = PlaceHolderImages.find(img => img.id === 'satellite-map')?.imageUrl;

  return (
    <>
      {/* ── MOBILE layout (hidden on md+) ─────────────────────────────────── */}
      <div className="md:hidden flex flex-col h-screen bg-[#020617]">
        {/* Mobile top navbar */}
        <header className="h-14 flex items-center justify-between px-4 border-b border-white/5 bg-[#020617]/90 backdrop-blur-xl sticky top-0 z-50 flex-shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setCurrentView(currentView === '__menu__' ? 'home' : '__menu__')}
              className="h-9 w-9 rounded-xl border border-white/10 bg-slate-900/60 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2">
              <img src="/icons/logo.png" alt="Logo" className="w-7 h-7 rounded-lg object-cover" />
              <span className="text-sm font-bold text-white">Emergency Hotline</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-400">{profile?.name}</span>
            <img
              src={profile?.photoURL || `https://picsum.photos/seed/${profile?.uid}/200`}
              alt="avatar"
              className="h-8 w-8 rounded-xl object-cover border border-white/10"
            />
          </div>
        </header>

        {/* Mobile slide-out menu */}
        {currentView === '__menu__' && (
          <div className="absolute inset-0 z-40 bg-[#020617] pt-14 flex flex-col">
            <nav className="flex-1 p-4 space-y-1">
              {[
                { view: 'home', label: 'Home', icon: Menu },
                { view: 'reports', label: 'My Reports', icon: ClipboardList },
                { view: 'map', label: 'Live Map', icon: MapPin },
                { view: 'feedback', label: 'Feedback', icon: Star },
                { view: 'profile', label: 'My Profile', icon: Navigation },
              ].map(item => (
                <button
                  key={item.view}
                  onClick={() => setCurrentView(item.view)}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition-colors text-sm font-semibold"
                >
                  <item.icon className="h-5 w-5" />
                  {item.label}
                </button>
              ))}
            </nav>
            <div className="p-4 border-t border-white/5">
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-red-400 hover:bg-red-500/10 transition-colors text-sm font-semibold"
              >
                <Navigation className="h-5 w-5 rotate-180" />
                Logout
              </button>
            </div>
          </div>
        )}

        {/* Mobile content */}
        <div className="flex-1 overflow-y-auto pb-24 px-4 pt-4 space-y-4">
          {currentView === 'home' && (
            <>
              {/* Welcome */}
              <div className="bg-slate-900/60 rounded-2xl p-4 border border-white/5">
                <h1 className="text-xl font-black text-white">Hi, {profile?.name} 👋</h1>
                <p className="text-xs text-slate-500 mt-0.5 uppercase tracking-widest">Tap an emergency button to report instantly</p>
              </div>

              {/* Emergency type label */}
              <div className="flex items-center gap-2 px-1">
                <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-500">Select Emergency Type</span>
              </div>

              {/* 2x2 grid */}
              <div className="grid grid-cols-2 gap-3">
                {emergencyButtons.map((btn) => (
                  <button
                    key={btn.type}
                    onClick={() => {
                      setSelectedType(btn.type);
                      setConfirmOpen(true);
                      setGpsStatus('acquiring');
                      navigator.geolocation?.getCurrentPosition(
                        async pos => {
                          setUserLocation([pos.coords.latitude, pos.coords.longitude]);
                          setGpsStatus('acquired');
                          const address = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
                          setExactAddress(address);
                        },
                        () => setGpsStatus('denied'),
                        { timeout: 8000, enableHighAccuracy: true }
                      );
                    }}
                    disabled={isSubmitting}
                    className={cn(
                      "h-40 rounded-3xl flex flex-col items-center justify-center gap-3 transition-all active:scale-95",
                      btn.color, "shadow-xl border-none"
                    )}
                  >
                    <btn.icon className="h-10 w-10 text-white" />
                    <div className="text-center">
                      <span className="text-base font-black block text-white tracking-wide italic">{btn.title}</span>
                      <span className="text-[9px] font-bold block text-white/70 uppercase tracking-wider">{btn.subtitle}</span>
                    </div>
                  </button>
                ))}
              </div>

              {/* Recent reports */}
              <div className="bg-slate-900/60 rounded-2xl border border-white/5 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
                  <span className="text-sm font-bold text-white">My Recent Reports</span>
                  <button onClick={() => setCurrentView('reports')} className="text-xs text-red-400 font-bold">View all →</button>
                </div>
                {alerts.slice(0, 3).map(alert => (
                  <div key={alert.id} className="flex items-center gap-3 px-4 py-3 border-b border-white/5 last:border-0">
                    <div className={cn("h-8 w-8 rounded-xl flex items-center justify-center flex-shrink-0",
                      alert.type === 'fire' ? 'bg-orange-500/20' : alert.type === 'crime' ? 'bg-blue-500/20' : 'bg-red-500/20'
                    )}>
                      {alert.type === 'fire' ? <Flame className="h-4 w-4 text-orange-400" /> :
                       alert.type === 'crime' ? <Shield className="h-4 w-4 text-blue-400" /> :
                       <Activity className="h-4 w-4 text-red-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-white capitalize">{alert.type} Emergency</p>
                      <p className="text-xs text-slate-500 truncate">
                        {alert.location ? `${alert.location.lat.toFixed(4)}, ${alert.location.lng.toFixed(4)}` : 'No GPS'} · {alert.timestamp?.seconds ? format(alert.timestamp.toDate(), 'MMM d') : ''}
                      </p>
                    </div>
                    <Badge className={cn("text-[10px] font-bold border-none flex-shrink-0",
                      alert.status === 'pending' ? 'bg-red-500/10 text-red-400' :
                      alert.status === 'responding' ? 'bg-blue-500/10 text-blue-400' :
                      'bg-green-500/10 text-green-400'
                    )}>{alert.status}</Badge>
                  </div>
                ))}
                {alerts.length === 0 && (
                  <div className="px-4 py-6 text-center text-slate-500 text-xs">No reports yet</div>
                )}
              </div>
            </>
          )}

          {currentView === 'reports' && (
            <div className="space-y-4">
              <h1 className="text-xl font-black text-white">My Reports</h1>
              <div className="bg-slate-900/60 rounded-2xl border border-white/5 overflow-hidden">
                {alerts.length === 0 ? (
                  <div className="py-12 text-center text-slate-500 text-sm">No reports yet</div>
                ) : alerts.map(alert => (
                  <div key={alert.id} className="flex items-center gap-3 px-4 py-3 border-b border-white/5 last:border-0">
                    <div className={cn("h-8 w-8 rounded-xl flex items-center justify-center flex-shrink-0",
                      alert.type === 'fire' ? 'bg-orange-500/20' : alert.type === 'crime' ? 'bg-blue-500/20' : 'bg-red-500/20'
                    )}>
                      {alert.type === 'fire' ? <Flame className="h-4 w-4 text-orange-400" /> :
                       alert.type === 'crime' ? <Shield className="h-4 w-4 text-blue-400" /> :
                       <Activity className="h-4 w-4 text-red-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-white capitalize">{alert.type} Emergency</p>
                      <p className="text-xs text-slate-500 truncate">
                        {alert.location ? `${alert.location.lat.toFixed(4)}, ${alert.location.lng.toFixed(4)}` : 'No GPS'} · {alert.timestamp?.seconds ? format(alert.timestamp.toDate(), 'MMM d, h:mm a') : ''}
                      </p>
                      {alert.responderName && <p className="text-xs text-blue-400 font-semibold">Responder: {alert.responderName}</p>}
                    </div>
                    <Badge className={cn("text-[10px] font-bold border-none flex-shrink-0",
                      alert.status === 'pending' ? 'bg-red-500/10 text-red-400' :
                      alert.status === 'responding' ? 'bg-blue-500/10 text-blue-400' :
                      'bg-green-500/10 text-green-400'
                    )}>{alert.status}</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {currentView === 'map' && (
            <div className="space-y-4">
              <h1 className="text-xl font-black text-white">Live Map</h1>
              <Card className="bg-[#020617] border-white/5 rounded-2xl overflow-hidden h-[400px]">
                {mapMounted && (
                  <UserLiveMap userLocation={userLocation} />
                )}
              </Card>
            </div>
          )}

          {currentView === 'feedback' && (
            <div className="space-y-4">
              <h1 className="text-xl font-black text-white">Feedback</h1>
              <Card className="bg-slate-900/40 border-white/5 rounded-2xl p-5">
                <div className="space-y-5">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Ease of Use (1–5)</Label>
                    <Slider value={easeOfUse} onValueChange={setEaseOfUse} max={5} min={1} step={1} />
                    <p className="text-right text-xs text-white font-bold">{easeOfUse[0]}/5</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Reliability (1–5)</Label>
                    <Slider value={reliability} onValueChange={setReliability} max={5} min={1} step={1} />
                    <p className="text-right text-xs text-white font-bold">{reliability[0]}/5</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Comments</Label>
                    <Textarea value={comments} onChange={e => setComments(e.target.value)} placeholder="Share your experience..." className="bg-slate-800/50 border-white/10 text-white rounded-xl h-28 resize-none" />
                  </div>
                  <button onClick={submitFeedback} className="w-full h-12 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-sm transition-all flex items-center justify-center gap-2">
                    <Star className="h-4 w-4" /> Submit Feedback
                  </button>
                </div>
              </Card>
            </div>
          )}

          {currentView === 'profile' && (
            <div className="space-y-4">
              <div>
                <h1 className="text-xl font-black text-white">My Profile</h1>
                <p className="text-xs text-slate-500 mt-0.5">Manage your account information</p>
              </div>
              <Card className="bg-slate-900/40 border-white/5 rounded-2xl overflow-hidden">
                <div className="h-20 bg-gradient-to-r from-slate-800 to-slate-900 relative" />
                <div className="px-5 pb-5">
                  {/* Avatar with camera upload */}
                  <div className="relative -mt-10 mb-4 w-fit">
                    <div className="h-20 w-20 rounded-2xl overflow-hidden border-4 border-slate-900 bg-slate-800 relative">
                      <Image src={profile?.photoURL || `https://picsum.photos/seed/${profile?.uid}/200`} fill alt="Avatar" className="object-cover" />
                    </div>
                    <label
                      htmlFor="mobile-avatar-upload"
                      className="absolute -bottom-2 -right-2 h-8 w-8 rounded-xl bg-red-600 hover:bg-red-500 flex items-center justify-center cursor-pointer shadow-lg transition-colors"
                      title="Change photo"
                    >
                      <Camera className="h-4 w-4 text-white" />
                    </label>
                    <input
                      id="mobile-avatar-upload"
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file || !profile || !db) return;
                        try {
                          const { resizeImageToBase64 } = await import('@/lib/resize-image');
                          const dataUrl = await resizeImageToBase64(file, 200, 0.7);
                          await setDoc(doc(db, 'users', profile.uid), { photoURL: dataUrl }, { merge: true });
                          toast({ title: 'Profile photo updated' });
                        } catch (e: any) {
                          toast({ variant: 'destructive', title: 'Upload failed', description: e.message });
                        }
                      }}
                    />
                  </div>

                  <h2 className="text-lg font-black text-white">{profile?.name}</h2>
                  <p className="text-sm text-slate-400">{profile?.email}</p>
                  <Badge className="bg-primary/20 text-primary border-primary/20 text-xs font-bold capitalize mt-2">{profile?.role} sector</Badge>

                  <Separator className="bg-white/5 my-5" />

                  <div className="space-y-4">
                    <div>
                      <Label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Full Name</Label>
                      <Input
                        defaultValue={profile?.name || ''}
                        className="mt-2 bg-slate-800/50 border-white/10 text-white rounded-xl h-12"
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Email</Label>
                      <Input
                        defaultValue={profile?.email || ''}
                        type="email"
                        className="mt-2 bg-slate-800/50 border-white/10 text-white rounded-xl h-12"
                        disabled
                      />
                    </div>
                    <Button className="w-full h-12 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl">
                      Update Profile
                    </Button>
                    <button
                      onClick={handleLogout}
                      className="w-full h-12 rounded-xl border border-red-500/30 text-red-400 hover:bg-red-500/10 font-bold text-sm transition-colors flex items-center justify-center gap-2"
                    >
                      <Navigation className="h-4 w-4 rotate-180" />
                      Logout
                    </button>
                  </div>
                </div>
              </Card>
            </div>
          )}
        </div>

        {/* Mobile bottom tab bar */}
        <nav className="fixed bottom-0 inset-x-0 h-16 bg-[#020617]/95 backdrop-blur-xl border-t border-white/5 flex items-center justify-around px-2 z-50">
          {[
            { view: 'home', label: 'Home', icon: Menu },
            { view: 'map', label: 'Map', icon: MapPin },
            { view: 'sos', label: 'SOS', icon: AlertTriangle, isSOS: true },
            { view: 'reports', label: 'History', icon: ClipboardList },
            { view: 'profile', label: 'Profile', icon: Navigation },
          ].map(item => (
            item.isSOS ? (
              <button
                key="sos"
                onClick={() => { setSelectedType('medical'); setConfirmOpen(true); setGpsStatus('acquiring'); navigator.geolocation?.getCurrentPosition(pos => { setUserLocation([pos.coords.latitude, pos.coords.longitude]); setGpsStatus('acquired'); }, () => setGpsStatus('denied'), { timeout: 8000, enableHighAccuracy: true }); }}
                className="flex flex-col items-center justify-center -mt-6 h-14 w-14 rounded-full bg-red-600 shadow-[0_0_20px_rgba(220,38,38,0.5)] border-4 border-[#020617]"
              >
                <AlertTriangle className="h-6 w-6 text-white" />
              </button>
            ) : (
              <button
                key={item.view}
                onClick={() => setCurrentView(item.view)}
                className={cn("flex flex-col items-center justify-center gap-1 flex-1 py-2 transition-colors",
                  currentView === item.view ? "text-red-400" : "text-slate-500"
                )}
              >
                <item.icon className="h-5 w-5" />
                <span className="text-[10px] font-bold">{item.label}</span>
              </button>
            )
          ))}
        </nav>
      </div>

      {/* ── DESKTOP/TABLET layout (hidden on mobile) ──────────────────────── */}
      <div className="hidden md:block">
        <SidebarProvider style={{ '--sidebar-width': '18rem' } as React.CSSProperties}>
          <UserSidebar currentView={currentView} onViewChange={setCurrentView} />
          <SidebarInset className="bg-[#020617] border-l border-white/5 overflow-y-auto h-screen min-w-0 flex-1 w-0">
            <DashboardHeader sidebarTrigger={
              <SidebarTrigger className="h-9 w-9 rounded-xl border border-white/10 bg-slate-900/60 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors" />
            } />
            <div className="space-y-8 w-full p-4 md:p-6 lg:p-8 pb-20 animate-in fade-in duration-700">
          
          {currentView === "home" && (
            <>
              <div className="flex items-center gap-4 bg-slate-900/40 p-6 md:p-8 rounded-[2.5rem] border border-white/5 mb-10 shadow-2xl">
                <div className="bg-slate-800/80 p-4 rounded-2xl border border-white/10 flex-shrink-0">
                  <Menu className="h-8 w-8 text-slate-400" />
                </div>
                <div>
                  <h1 className="text-3xl md:text-4xl font-black text-white tracking-tighter uppercase italic">Hi, {profile?.name} 👋</h1>
                  <p className="text-slate-500 text-sm font-bold uppercase tracking-widest mt-1">Tap an emergency button to report instantly</p>
                </div>
              </div>

              <div className="space-y-6">
                <div className="flex items-center gap-3 px-4">
                  <div className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" />
                  <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-500">Select Emergency Type</h2>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {emergencyButtons.map((btn) => (
                    <Button 
                      key={btn.type} 
                      onClick={() => { 
                        setSelectedType(btn.type); 
                        setConfirmOpen(true);
                        // Start GPS acquisition immediately
                        setGpsStatus('acquiring');
                        navigator.geolocation?.getCurrentPosition(
                          async pos => {
                            setUserLocation([pos.coords.latitude, pos.coords.longitude]);
                            setGpsStatus('acquired');
                            const address = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
                            setExactAddress(address);
                          },
                          () => setGpsStatus('denied'),
                          { timeout: 8000, enableHighAccuracy: true }
                        );
                      }} 
                      disabled={isSubmitting} 
                      className={cn(
                        "h-[220px] md:h-[250px] lg:h-[280px] rounded-[3rem] flex flex-col items-center justify-center gap-6 transition-all active:scale-95 relative overflow-hidden",
                        btn.color,
                        "hover:brightness-110 shadow-2xl border-none"
                      )}
                    >
                      <div className="space-y-4 text-center">
                        <btn.icon className="h-14 w-14 mx-auto text-white" />
                        <div className="space-y-2">
                          <span className="text-2xl md:text-3xl font-black block text-white tracking-[0.1em] italic leading-none">{btn.title}</span>
                          <span className="text-[10px] font-black block text-white/70 uppercase tracking-[0.2em]">{btn.subtitle}</span>
                        </div>
                      </div>
                    </Button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 mt-16">
                <Card className="bg-slate-900/40 border-white/5 lg:col-span-2 overflow-hidden shadow-2xl rounded-[3rem]">
                  <CardHeader className="flex flex-row items-center justify-between border-b border-white/5 py-8 px-10">
                    <CardTitle className="text-[10px] font-black uppercase tracking-[0.4em] text-white">Transmission History</CardTitle>
                    <Dialog open={feedbackOpen} onOpenChange={setFeedbackOpen}>
                      <DialogTrigger asChild>
                        <Button variant="ghost" size="sm" className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-500 hover:text-white">
                          <Star className="h-4 w-4 mr-2" /> Evaluation
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="bg-slate-950 border-white/5 rounded-[3rem] p-10">
                        <DialogHeader>
                          <DialogTitle className="text-2xl font-black text-white uppercase tracking-tighter italic">System Evaluation</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-10 py-8">
                          <div className="space-y-4">
                            <Label className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-500">Ease of Use</Label>
                            <Slider value={easeOfUse} onValueChange={setEaseOfUse} max={5} min={1} step={1} className="py-4" />
                          </div>
                          <div className="space-y-4">
                            <Label className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-500">Reliability</Label>
                            <Slider value={reliability} onValueChange={setReliability} max={5} min={1} step={1} className="py-4" />
                          </div>
                          <div className="space-y-4">
                            <Label className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-500">Comments</Label>
                            <Textarea value={comments} onChange={(e) => setComments(e.target.value)} className="bg-slate-900 border-white/10 rounded-2xl h-32" />
                          </div>
                        </div>
                        <DialogFooter>
                          <Button onClick={submitFeedback} className="w-full h-16 bg-primary font-black uppercase tracking-[0.3em] rounded-2xl">Submit Report</Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader className="bg-white/5">
                        <TableRow className="border-b border-white/5">
                          <TableHead className="px-10 h-16 font-black uppercase text-[10px] text-slate-500 tracking-[0.3em]">Sector</TableHead>
                          <TableHead className="h-16 font-black uppercase text-[10px] text-slate-500 tracking-[0.3em]">Time</TableHead>
                          <TableHead className="px-10 h-16 font-black uppercase text-[10px] text-slate-500 tracking-[0.3em] text-right">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {alertsLoading ? (
                          <TableRow>
                            <TableCell colSpan={3} className="text-center py-16">
                              <Loader2 className="h-5 w-5 animate-spin text-slate-600 mx-auto" />
                            </TableCell>
                          </TableRow>
                        ) : alerts.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={3} className="text-center py-16">
                              <div className="flex flex-col items-center gap-3">
                                <Radio className="h-8 w-8 text-slate-700" />
                                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-600">No transmissions yet</p>
                              </div>
                            </TableCell>
                          </TableRow>
                        ) : alerts.map((alert) => (
                          <TableRow key={alert.id} className="border-b border-white/5 hover:bg-white/5">
                            <TableCell className="px-10 py-6 font-black uppercase text-sm text-white italic tracking-tight">
                              <div className="flex items-center gap-4">
                                <div className={cn("h-2.5 w-2.5 rounded-full", alert.type === 'fire' ? 'bg-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.5)]' : alert.type === 'crime' ? 'bg-blue-500 shadow-[0_0_10px_rgba(37,99,235,0.5)]' : 'bg-red-500 shadow-[0_0_10px_rgba(220,38,38,0.5)]')} />
                                {alert.type}
                              </div>
                            </TableCell>
                            <TableCell className="text-xs font-mono font-black text-slate-500">
                              {alert.timestamp?.seconds ? format(alert.timestamp.toDate(), 'HH:mm:ss') : 'SYNCING'}
                            </TableCell>
                            <TableCell className="px-10 text-right">
                              <Badge variant="outline" className={cn(
                                "font-black uppercase text-[10px] tracking-[0.3em] border-none px-4 py-2 rounded-xl",
                                alert.status === 'pending' ? 'bg-red-500/10 text-red-500' : 'bg-green-500/10 text-green-500'
                              )}>{alert.status}</Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                <Card className="bg-slate-900/40 border-white/5 rounded-[3rem] p-10 space-y-10 shadow-2xl">
                  <div className="space-y-4">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.5em] text-primary">Grid Telemetry</h3>
                    <p className="text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Secure Protocol</p>
                  </div>
                  <div className="space-y-6">
                    <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-[0.3em]">
                      <span className="text-slate-500">Latency</span><span className="text-green-500">0.4ms</span>
                    </div>
                    <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden">
                      <div className="h-full bg-primary w-full animate-pulse shadow-[0_0_15px_rgba(37,99,235,0.8)]" />
                    </div>
                    <div className="p-6 bg-slate-950/80 rounded-[2rem] border border-white/5 flex gap-5 mt-10 shadow-inner">
                      <Info className="h-6 w-6 text-primary shrink-0" />
                      <p className="text-[10px] font-bold text-slate-500 leading-relaxed uppercase tracking-tight">Biometric Mesh link established. Satellite position optimized for real-time response.</p>
                    </div>
                  </div>
                </Card>
              </div>
            </>
          )}

          {currentView === "reports" && (
            <div className="space-y-6 w-full">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-black text-white tracking-tight">My Incident Log</h1>
                  <p className="text-xs text-slate-500 mt-0.5 uppercase tracking-widest">All your submitted emergency reports</p>
                </div>
                <Badge className="bg-slate-800 text-slate-400 border-white/10 text-xs font-bold px-3 py-1.5">
                  {alerts.length} {alerts.length === 1 ? 'report' : 'reports'}
                </Badge>
              </div>

              {/* Table card */}
              <Card className="bg-slate-900/60 border-white/5 rounded-2xl overflow-hidden w-full">
                <Table className="w-full">
                  <TableHeader className="bg-white/5">
                    <TableRow className="border-white/5 hover:bg-transparent">
                      <TableHead className="px-6 h-12 font-black uppercase text-[10px] text-slate-500 tracking-widest">Signal Type</TableHead>
                      <TableHead className="h-12 font-black uppercase text-[10px] text-slate-500 tracking-widest">Vector</TableHead>
                      <TableHead className="h-12 font-black uppercase text-[10px] text-slate-500 tracking-widest">Response</TableHead>
                      <TableHead className="px-6 h-12 font-black uppercase text-[10px] text-slate-500 tracking-widest text-right">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {alertsLoading ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-20">
                          <Loader2 className="h-6 w-6 animate-spin text-slate-600 mx-auto" />
                        </TableCell>
                      </TableRow>
                    ) : alerts.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-24">
                          <div className="flex flex-col items-center gap-3">
                            <div className="h-14 w-14 rounded-2xl bg-slate-800/80 flex items-center justify-center">
                              <ClipboardList className="h-7 w-7 text-slate-600" />
                            </div>
                            <p className="text-sm font-bold text-slate-400">No incidents logged</p>
                            <p className="text-xs text-slate-600">Your emergency reports will appear here once submitted</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : alerts.map(alert => (
                      <TableRow key={alert.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                        <TableCell className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "h-2.5 w-2.5 rounded-full flex-shrink-0",
                              alert.type === 'fire' ? 'bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.6)]' :
                              alert.type === 'crime' ? 'bg-blue-500 shadow-[0_0_8px_rgba(37,99,235,0.6)]' :
                              'bg-red-500 shadow-[0_0_8px_rgba(220,38,38,0.6)]'
                            )} />
                            <span className="text-sm font-bold text-white capitalize">{alert.type}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs font-mono text-slate-500">
                          {alert.location ? `${alert.location.lat.toFixed(4)}, ${alert.location.lng.toFixed(4)}` : '—'}
                        </TableCell>
                        <TableCell className="text-xs font-semibold text-slate-400">
                          {alert.responderName || 'Awaiting responder...'}
                        </TableCell>
                        <TableCell className="px-6 text-right">
                          <Badge className={cn(
                            "text-[10px] font-bold border-none px-3 py-1 rounded-lg",
                            alert.status === 'pending' ? 'bg-red-500/10 text-red-400' :
                            alert.status === 'responding' ? 'bg-blue-500/10 text-blue-400' :
                            'bg-green-500/10 text-green-400'
                          )}>
                            {alert.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            </div>
          )}

          {currentView === "map" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h1 className="text-3xl font-black text-white uppercase tracking-tighter italic">My Location Map</h1>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-white/10 text-white hover:bg-white/5 gap-2"
                  onClick={() => {
                    setMapMounted(false);
                    setTimeout(() => setMapMounted(true), 100);
                    if (navigator.geolocation) {
                      navigator.geolocation.getCurrentPosition(pos => {
                        setUserLocation([pos.coords.latitude, pos.coords.longitude]);
                      });
                    }
                  }}
                >
                  <Navigation className="h-4 w-4" /> Refresh Location
                </Button>
              </div>

              {/* GPS status */}
              {gpsStatus === 'denied' && (
                <div className="p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-sm font-bold flex items-center gap-2">
                  ⚠️ Location access denied. Enable GPS in browser settings for accurate emergency reporting.
                </div>
              )}
              {gpsStatus === 'acquired' && userLocation && (
                <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 text-sm font-bold flex items-center gap-2">
                  ✅ GPS Active — {userLocation[0].toFixed(5)}, {userLocation[1].toFixed(5)}
                </div>
              )}

              <Card className="bg-[#020617] border-white/5 rounded-[2rem] overflow-hidden h-[500px]">
                {mapMounted && (
                  <UserLiveMap userLocation={userLocation} />
                )}
              </Card>

              {/* My alerts on map */}
              <div className="space-y-3">
                <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest">My Alert Locations</h2>
                {alerts.filter(a => a.location).length === 0 ? (
                  <p className="text-slate-500 text-sm">No alerts with GPS data yet.</p>
                ) : (
                  alerts.filter(a => a.location).map(alert => (
                    <div key={alert.id} className="flex items-center gap-3 p-3 rounded-xl bg-slate-900/40 border border-white/5">
                      <div className={cn("h-2.5 w-2.5 rounded-full flex-shrink-0",
                        alert.type === 'fire' ? 'bg-orange-500' :
                        alert.type === 'crime' ? 'bg-blue-500' : 'bg-red-500'
                      )} />
                      <div className="flex-1">
                        <p className="text-sm font-bold text-white capitalize">{alert.type}</p>
                        <p className="text-xs text-slate-500">{alert.location!.lat.toFixed(5)}, {alert.location!.lng.toFixed(5)}</p>
                      </div>
                      <Badge className={cn("text-[10px] font-bold border-none",
                        alert.status === 'pending' ? 'bg-red-500/10 text-red-400' :
                        alert.status === 'responding' ? 'bg-blue-500/10 text-blue-400' :
                        'bg-green-500/10 text-green-400'
                      )}>
                        {alert.status}
                      </Badge>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {currentView === "profile" && (
            <div className="space-y-6 w-full">
              <div>
                <h1 className="text-2xl font-black text-white tracking-tight">My Profile</h1>
                <p className="text-xs text-slate-500 mt-0.5">Manage your account information</p>
              </div>
              <Card className="bg-slate-900/40 border-white/5 rounded-2xl overflow-hidden">
                {/* Cover strip */}
                <div className="h-24 bg-gradient-to-r from-slate-800 to-slate-900 relative" />

                {/* Avatar + info */}
                <div className="px-5 md:px-8 pb-6 md:pb-8">
                  {/* Avatar with edit button */}
                  <div className="relative -mt-12 mb-5 w-fit">
                    <div className="h-20 w-20 md:h-24 md:w-24 rounded-2xl overflow-hidden border-4 border-slate-900 relative bg-slate-800">
                      <Image
                        src={profile?.photoURL || `https://picsum.photos/seed/${profile?.uid}/200`}
                        fill
                        alt="Avatar"
                        className="object-cover"
                      />
                    </div>
                    <label
                      htmlFor="avatar-upload"
                      className="absolute -bottom-2 -right-2 h-8 w-8 rounded-xl bg-red-600 hover:bg-red-500 flex items-center justify-center cursor-pointer shadow-lg transition-colors"
                      title="Change photo"
                    >
                      <Camera className="h-4 w-4 text-white" />
                    </label>
                    <input
                      id="avatar-upload"
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file || !profile || !db) return;
                        try {
                          const { resizeImageToBase64 } = await import('@/lib/resize-image');
                          const dataUrl = await resizeImageToBase64(file, 200, 0.7);
                          await setDoc(
                            doc(db, 'users', profile.uid),
                            { photoURL: dataUrl },
                            { merge: true }
                          );
                          toast({ title: 'Profile photo updated' });
                        } catch (e: any) {
                          toast({ variant: 'destructive', title: 'Upload failed', description: e.message });
                        }
                      }}
                    />
                  </div>

                  <div className="space-y-1 mb-5">
                    <h2 className="text-xl font-black text-white">{profile?.name}</h2>
                    <p className="text-sm text-slate-400">{profile?.email}</p>
                    <Badge className="bg-primary/20 text-primary border-primary/20 text-xs font-bold capitalize mt-1">
                      {profile?.role} sector
                    </Badge>
                  </div>

                  <Separator className="bg-white/5 mb-5" />

                  <div className="space-y-4">
                    <div>
                      <Label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Full Name</Label>
                      <Input
                        defaultValue={profile?.name || ''}
                        className="mt-2 bg-slate-800/50 border-white/10 text-white rounded-xl h-12"
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Email</Label>
                      <Input
                        defaultValue={profile?.email || ''}
                        type="email"
                        className="mt-2 bg-slate-800/50 border-white/10 text-white rounded-xl h-12"
                        disabled
                      />
                    </div>
                    <Button className="w-full h-12 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl">
                      Update Profile
                    </Button>
                  </div>
                </div>
              </Card>
            </div>
          )}

          {currentView === "feedback" && (
            <div className="space-y-8 w-full max-w-2xl">
              <h1 className="text-3xl font-black text-white tracking-tight">Feedback & Evaluation</h1>
              <Card className="bg-slate-900/40 border-white/5 rounded-2xl p-8">
                <div className="mb-6">
                  <h2 className="text-lg font-bold text-white">System Evaluation</h2>
                  <p className="text-sm text-slate-400 mt-1">Help us improve the Emergency Hotline system</p>
                </div>
                <div className="space-y-6">
                  <div className="space-y-3">
                    <Label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Ease of Use (1–5)</Label>
                    <Slider value={easeOfUse} onValueChange={setEaseOfUse} max={5} min={1} step={1} className="py-2" />
                    <div className="flex justify-between text-xs text-slate-500">
                      <span>1 - Very Difficult</span>
                      <span className="text-white font-bold">{easeOfUse[0]}/5</span>
                      <span>5 - Very Easy</span>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <Label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Reliability (1–5)</Label>
                    <Slider value={reliability} onValueChange={setReliability} max={5} min={1} step={1} className="py-2" />
                    <div className="flex justify-between text-xs text-slate-500">
                      <span>1 - Unreliable</span>
                      <span className="text-white font-bold">{reliability[0]}/5</span>
                      <span>5 - Very Reliable</span>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <Label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Comments (Optional)</Label>
                    <Textarea
                      value={comments}
                      onChange={(e) => setComments(e.target.value)}
                      placeholder="Share your experience or suggestions..."
                      className="bg-slate-800/50 border-white/10 text-white rounded-xl h-32 resize-none"
                    />
                  </div>
                  <button
                    onClick={submitFeedback}
                    className="w-full h-12 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-sm transition-all shadow-[0_4px_16px_rgba(220,38,38,0.4)] flex items-center justify-center gap-2"
                  >
                    <Star className="h-4 w-4" />
                    Submit Feedback
                  </button>
                </div>
              </Card>
            </div>
          )}

          {/* ── Step 1: Alert Detail Dialog ──────────────────────────────── */}
          <AlertDialog open={confirmOpen} onOpenChange={(open) => { if (!open) { setConfirmOpen(false); setSelectedType(null); setManualLocation(''); setPhotoEvidence(null); } }}>
            <AlertDialogContent className="bg-[#0d1526] border border-white/10 rounded-3xl p-0 max-w-sm w-full overflow-hidden shadow-2xl">
              <AlertDialogHeader className="sr-only">
                <AlertDialogTitle>Report Emergency</AlertDialogTitle>
              </AlertDialogHeader>
              {/* Map preview — static tile to avoid Leaflet SSR issues in dialog */}
              <div className="h-44 w-full relative overflow-hidden bg-slate-800">
                {userLocation ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`https://staticmap.openstreetmap.de/staticmap.php?center=${userLocation[0]},${userLocation[1]}&zoom=14&size=400x176&markers=${userLocation[0]},${userLocation[1]},red`}
                    alt="Location map"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      // Fallback to a simple colored div if static map fails
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                    <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
                    <p className="text-xs text-slate-500 font-bold">Acquiring GPS...</p>
                  </div>
                )}
                {/* Overlay gradient at bottom */}
                <div className="absolute bottom-0 inset-x-0 h-8 bg-gradient-to-t from-[#0d1526] to-transparent" />
              </div>

              <div className="p-5 space-y-4">
                {/* Alert type header */}
                <div className="flex flex-col items-center gap-2 text-center">
                  <div className={cn(
                    "h-12 w-12 rounded-2xl flex items-center justify-center",
                    selectedType === 'fire' ? 'bg-orange-500/20' :
                    selectedType === 'police' ? 'bg-blue-500/20' :
                    selectedType === 'medical' ? 'bg-red-500/20' : 'bg-slate-700/50'
                  )}>
                    {selectedType === 'fire' && <Flame className="h-6 w-6 text-orange-400" />}
                    {selectedType === 'police' && <Shield className="h-6 w-6 text-blue-400" />}
                    {selectedType === 'medical' && <Activity className="h-6 w-6 text-red-400" />}
                    {selectedType === 'all' && <AlertTriangle className="h-6 w-6 text-yellow-400" />}
                  </div>
                  <h2 className="text-lg font-black text-white uppercase tracking-widest">
                    {selectedType === 'all' ? 'All Agencies' : selectedType === 'medical' ? 'Rescue & Medical' : selectedType} Alert
                  </h2>
                  <div className="flex items-center gap-1.5 text-xs text-slate-400 text-center">
                    <MapPin className="h-3 w-3 flex-shrink-0" />
                    <span className="line-clamp-2">
                      {gpsStatus === 'acquired' && exactAddress
                        ? exactAddress
                        : gpsStatus === 'acquired' && userLocation
                        ? `${userLocation[0].toFixed(4)}, ${userLocation[1].toFixed(4)}`
                        : 'Detecting location...'}
                    </span>
                  </div>
                </div>

                {/* Location status — responsive to GPS state */}
                <div className="space-y-1.5">
                  {gpsStatus === 'acquired' && userLocation ? (
                    /* GPS success — green pill */
                    <div className="flex items-start justify-between px-3 py-2.5 rounded-xl bg-green-500/10 border border-green-500/20">
                      <div className="flex items-start gap-2 text-xs text-green-400 font-semibold flex-1 min-w-0">
                        <MapPin className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                        <span className="line-clamp-2">{exactAddress || `${userLocation[0].toFixed(4)}, ${userLocation[1].toFixed(4)}`}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => { setGpsStatus('denied'); setUserLocation(null); setExactAddress(''); }}
                        className="text-[10px] text-slate-400 hover:text-white font-semibold ml-2 flex-shrink-0"
                      >
                        Override
                      </button>
                    </div>
                  ) : gpsStatus === 'acquiring' || gpsStatus === 'idle' ? (
                    /* GPS acquiring — spinner pill, no manual input */
                    <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-slate-800/50 border border-white/8">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400 flex-shrink-0" />
                      <span className="text-xs text-slate-400 font-semibold">Acquiring GPS location...</span>
                    </div>
                  ) : (
                    /* GPS denied — manual input + retry */
                    <>
                      <Input
                        placeholder="Enter your location manually..."
                        value={manualLocation}
                        onChange={e => setManualLocation(e.target.value)}
                        className="bg-slate-800/50 border-white/10 text-white text-sm h-10 rounded-xl placeholder:text-slate-500"
                        autoFocus
                      />
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-yellow-400 flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" /> GPS unavailable — type your location
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setGpsStatus('acquiring');
                            navigator.geolocation?.getCurrentPosition(
                              pos => { setUserLocation([pos.coords.latitude, pos.coords.longitude]); setGpsStatus('acquired'); },
                              () => setGpsStatus('denied'),
                              { timeout: 8000, enableHighAccuracy: true }
                            );
                          }}
                          className="text-xs text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-1"
                        >
                          <Navigation className="h-3 w-3" /> Retry GPS
                        </button>
                      </div>
                    </>
                  )}
                  <p className="text-xs text-slate-500 text-center">Agency will be notified immediately.</p>
                </div>

                {/* Warning */}
                <div className="flex items-start gap-2.5 p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
                  <AlertTriangle className="h-4 w-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-yellow-300 leading-relaxed">
                    <span className="font-black">False reports are prohibited.</span> Sending fake alerts may result in account suspension after 3 violations.
                  </p>
                </div>

                {/* Photo evidence — REQUIRED */}
                <div className="space-y-1">
                  <label className={cn(
                    "flex items-center justify-center gap-2 h-12 rounded-xl border-2 cursor-pointer transition-colors text-sm font-semibold",
                    photoEvidence
                      ? "border-green-500/40 bg-green-500/10 text-green-400"
                      : "border-dashed border-red-500/40 bg-red-500/5 text-red-400 hover:border-red-400/60 hover:bg-red-500/10"
                  )}>
                    <Camera className="h-4 w-4" />
                    {photoEvidence ? `✓ ${photoEvidence.name.slice(0, 24)}...` : 'Add Photo Evidence (Required)'}
                    <input type="file" accept="image/*" className="hidden" onChange={e => setPhotoEvidence(e.target.files?.[0] || null)} />
                  </label>
                  {!photoEvidence && (
                    <p className="text-[10px] text-red-400 text-center font-semibold">Photo is required to verify your report</p>
                  )}
                </div>

                {/* Buttons */}
                <div className="flex gap-3 pt-1">
                  <button
                    onClick={() => { setConfirmOpen(false); setSelectedType(null); setManualLocation(''); setPhotoEvidence(null); }}
                    className="flex-1 h-12 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-sm transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => { setConfirmOpen(false); confirmAlert(); }}
                    disabled={!photoEvidence}
                    className={cn(
                      "flex-1 h-12 rounded-xl font-bold text-sm text-white transition-all active:scale-95 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed",
                      selectedType === 'fire' ? 'bg-orange-500 hover:bg-orange-400 shadow-orange-900/40' :
                      selectedType === 'police' ? 'bg-blue-600 hover:bg-blue-500 shadow-blue-900/40' :
                      selectedType === 'medical' ? 'bg-red-600 hover:bg-red-500 shadow-red-900/40' :
                      'bg-red-600 hover:bg-red-500 shadow-red-900/40'
                    )}
                  >
                    Send Alert
                  </button>
                </div>
              </div>
            </AlertDialogContent>
          </AlertDialog>

        </div>
      </SidebarInset>
    </SidebarProvider>
      </div>
    </>
  );
}
