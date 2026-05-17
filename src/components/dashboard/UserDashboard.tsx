"use client";

import { useState, useEffect, useRef } from 'react';
import { collection, doc, setDoc, writeBatch, query, orderBy, serverTimestamp as firestoreTimestamp, updateDoc } from 'firebase/firestore';
import { ref, push, serverTimestamp as rtdbTimestamp } from 'firebase/database';
import { useFirestore, useCollection, useDatabase, useMemoFirebase } from '@/firebase';
import { EmergencyAlert, EmergencyType, UserNotification } from '@/lib/types';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Flame, Shield, Activity, AlertTriangle, Star, Zap, Info, Radio, Menu, MapPin, Clock, Loader2, Navigation, ClipboardList, Camera, Bell, BellOff, X, Mic, MicOff, Square, Stethoscope } from 'lucide-react';
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
  const [voiceNote, setVoiceNote] = useState<string | null>(null); // base64 audio
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

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

  // ── Continuous GPS tracking ───────────────────────────────────────────────
  useEffect(() => {
    if (!navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setUserLocation([lat, lng]);
        setGpsStatus('acquired');
        // Update address only when location changes significantly (>50m)
        setExactAddress(prev => {
          // We'll update address lazily — don't block the state update
          reverseGeocode(lat, lng).then(addr => setExactAddress(addr));
          return prev;
        });
      },
      () => {
        // Don't set denied if we already have a location
        setGpsStatus(prev => prev === 'acquired' ? 'acquired' : 'denied');
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  const startRecording = async () => {
    // Check if getUserMedia is available (requires HTTPS or localhost)
    if (!navigator.mediaDevices?.getUserMedia) {
      toast({ variant: 'destructive', title: 'Voice recording not supported', description: 'Voice notes require a secure connection (HTTPS).' });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Detect supported MIME type — Safari needs audio/mp4, Chrome/Firefox use audio/webm
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : '';
      const mr = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      audioChunksRef.current = [];
      mr.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: mr.mimeType || 'audio/webm' });
        const reader = new FileReader();
        reader.onload = () => setVoiceNote(reader.result as string);
        reader.readAsDataURL(blob);
        stream.getTracks().forEach(t => t.stop());
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setIsRecording(true);
    } catch (err: any) {
      const isDenied = err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError';
      const isNotFound = err?.name === 'NotFoundError' || err?.name === 'DevicesNotFoundError';
      toast({
        variant: 'destructive',
        title: isDenied ? 'Microphone Permission Denied' : isNotFound ? 'No Microphone Found' : 'Voice Recording Failed',
        description: isDenied
          ? 'Please allow microphone access in your browser settings, then try again.'
          : isNotFound
          ? 'No microphone detected on this device.'
          : 'Could not start recording. Please try again.',
      });
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  };

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

  // ── Notifications (false report warnings) ────────────────────────────────
  const notificationsQuery = useMemoFirebase(() => {
    if (!profile || !db) return null;
    return query(
      collection(db, 'users', profile.uid, 'notifications'),
      orderBy('timestamp', 'desc')
    );
  }, [db, profile?.uid]);

  const { data: notificationsData } = useCollection<UserNotification>(notificationsQuery);
  const notifications = notificationsData || [];
  const unreadNotifications = notifications.filter(n => !n.read);

  const markNotificationRead = async (notifId: string) => {
    if (!profile || !db) return;
    await updateDoc(doc(db, 'users', profile.uid, 'notifications', notifId), { read: true });
  };

  const markAllNotificationsRead = async () => {
    if (!profile || !db || unreadNotifications.length === 0) return;
    const batch = writeBatch(db);
    unreadNotifications.forEach(n => {
      batch.update(doc(db, 'users', profile.uid, 'notifications', n.id), { read: true });
    });
    await batch.commit();
  };

  const isDeactivated = profile?.isDeactivated === true;

  const confirmAlert = async () => {
    if (!selectedType || !profile || !db) return;
    if (isDeactivated) {
      toast({
        variant: 'destructive',
        title: 'Account Deactivated',
        description: 'Your account has been deactivated. You cannot submit emergency reports. Please contact the administrator.',
      });
      setConfirmOpen(false);
      return;
    }
    setIsSubmitting(true);
    setConfirmOpen(false);

    // Use already-tracked GPS location, or request fresh if not available
    let location: { lat: number; lng: number } | null = userLocation
      ? { lat: userLocation[0], lng: userLocation[1] }
      : null;

    if (!location) {
      setGpsStatus('acquiring');
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
    } else {
      toast({ title: "📍 Location ready", description: exactAddress?.slice(0, 60) || `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}` });
    }

    const alertId = doc(collection(db, 'temp')).id;

    // Get description from textarea
    const descriptionEl = document.getElementById('incident-description') as HTMLTextAreaElement;
    const description = descriptionEl?.value?.trim() || null;

    // Compress photo aggressively — target < 200KB base64
    let photoEvidenceUrl: string | null = null;
    if (photoEvidence) {
      try {
        const { resizeImageToBase64 } = await import('@/lib/resize-image');
        photoEvidenceUrl = await resizeImageToBase64(photoEvidence, 320, 0.45);
      } catch {
        toast({ variant: 'destructive', title: 'Photo upload failed', description: 'Alert sent without photo.' });
      }
    }

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
      hasPhoto: !!photoEvidenceUrl,
      hasVoice: !!voiceNote,
      ...(description ? { description } : {}),
    };

    const batch = writeBatch(db);

    if (selectedType === 'all') {
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

    // Store media in a separate document to avoid Firestore 1MB limit on the alert doc
    if (photoEvidenceUrl || voiceNote) {
      try {
        const { setDoc: fsSetDoc } = await import('firebase/firestore');
        await fsSetDoc(doc(db, 'alert_media', alertId), {
          alertId,
          userId: profile.uid,
          ...(photoEvidenceUrl ? { photoEvidenceUrl } : {}),
          ...(voiceNote ? { voiceNoteUrl: voiceNote } : {}),
          timestamp: firestoreTimestamp(),
        });
      } catch {
        toast({ variant: 'destructive', title: 'Media upload failed', description: 'Alert sent but media could not be saved.' });
      }
    }

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
    setVoiceNote(null);
    setPhotoEvidence(null);
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
    { type: 'crime' as const, color: 'bg-[#2563eb]', icon: Shield, title: 'SECURITY', subtitle: 'School Security Office' },
    { type: 'fire' as const, color: 'bg-[#f97316]', icon: AlertTriangle, title: 'DRRM', subtitle: 'Disaster Risk Reduction' },
    { type: 'medical' as const, color: 'bg-[#dc2626]', icon: Stethoscope, title: 'CLINIC', subtitle: 'School Medical Office' },
    { type: 'all' as const, color: 'bg-[#1e293b]', icon: AlertTriangle, title: 'ALL OFFICES', subtitle: 'Security + DRRM + Clinic' },
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
              <span className="text-sm font-bold text-white">School Emergency</span>
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
              {/* Deactivated / warning banner */}
              {isDeactivated ? (
                <div className="bg-red-900/40 border border-red-500/40 rounded-2xl p-4 flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-black text-red-300">Account Deactivated</p>
                    <p className="text-xs text-red-400/80 mt-0.5">Your account has been deactivated due to false emergency reports. You cannot submit new reports. Contact the administrator to appeal.</p>
                  </div>
                </div>
              ) : (profile?.falseReportCount ?? 0) > 0 ? (
                <div className="bg-yellow-900/30 border border-yellow-500/30 rounded-2xl p-4 flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-black text-yellow-300">False Report Warning</p>
                    <p className="text-xs text-yellow-400/80 mt-0.5">You have {profile?.falseReportCount}/3 false report violations. Your account will be deactivated at 3.</p>
                  </div>
                </div>
              ) : null}

              {/* Unread notifications */}
              {unreadNotifications.length > 0 && (
                <div className="bg-slate-900/60 rounded-2xl border border-white/5 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
                    <div className="flex items-center gap-2">
                      <Bell className="h-4 w-4 text-red-400" />
                      <span className="text-sm font-bold text-white">Notifications</span>
                      <span className="h-5 w-5 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center">{unreadNotifications.length}</span>
                    </div>
                    <button onClick={markAllNotificationsRead} className="text-xs text-slate-400 hover:text-white font-semibold">Mark all read</button>
                  </div>
                  {unreadNotifications.slice(0, 3).map(notif => (
                    <div key={notif.id} className={cn(
                      "flex items-start gap-3 px-4 py-3 border-b border-white/5 last:border-0",
                      notif.type === 'deactivated' ? 'bg-red-900/20' : 'bg-yellow-900/10'
                    )}>
                      <AlertTriangle className={cn("h-4 w-4 flex-shrink-0 mt-0.5", notif.type === 'deactivated' ? 'text-red-400' : 'text-yellow-400')} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-white">{notif.title}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5 leading-relaxed">{notif.message}</p>
                      </div>
                      <button onClick={() => markNotificationRead(notif.id)} className="text-slate-500 hover:text-white flex-shrink-0">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Welcome */}
              <div className="bg-slate-900/60 rounded-2xl p-4 border border-white/5">
                <h1 className="text-xl font-black text-white">Hi, {profile?.name} 👋</h1>
                <p className="text-xs text-slate-500 mt-0.5 uppercase tracking-widest">Tap a button to report an incident</p>
              </div>

              {/* Emergency type label */}
              <div className="flex items-center gap-2 px-1">
                <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Select Incident Type</span>
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
                    disabled={isSubmitting || isDeactivated}
                    className={cn(
                      "group relative aspect-square rounded-3xl flex flex-col items-center justify-center gap-3 transition-all active:scale-95 overflow-hidden",
                      btn.color,
                      isDeactivated && "opacity-40 cursor-not-allowed"
                    )}
                  >
                    <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    <btn.icon className="h-10 w-10 text-white relative z-10" strokeWidth={1.5} />
                    <div className="text-center relative z-10 px-3">
                      <span className="text-lg font-black text-white tracking-wide block leading-tight">{btn.title}</span>
                      <span className="text-[10px] font-medium block text-white/70 mt-0.5">{btn.subtitle}</span>
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
            <div className="space-y-3">
              <h1 className="text-xl font-black text-white">My Reports</h1>
              {alerts.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-sm rounded-2xl bg-slate-900/40 border border-white/5">No reports yet</div>
              ) : alerts.map(alert => {
                const typeLabel = alert.type === 'fire' ? 'DRRM' : alert.type === 'crime' ? 'Security' : 'Clinic';
                const typeColor = alert.type === 'fire' ? 'bg-orange-500' : alert.type === 'crime' ? 'bg-blue-500' : 'bg-red-500';
                const typeBg = alert.type === 'fire' ? 'bg-orange-500/10 text-orange-400' : alert.type === 'crime' ? 'bg-blue-500/10 text-blue-400' : 'bg-red-500/10 text-red-400';
                return (
                  <div key={alert.id} className="bg-slate-900/60 rounded-2xl border border-white/5 p-4 space-y-3">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={cn("h-2 w-2 rounded-full flex-shrink-0 mt-1", typeColor)} />
                        <div className="min-w-0">
                          <span className={cn("text-xs font-black px-2 py-0.5 rounded-lg", typeBg)}>{typeLabel}</span>
                          <p className="text-[10px] text-slate-500 mt-1">
                            {alert.timestamp?.seconds ? format(alert.timestamp.toDate(), 'MMM d, h:mm a') : 'Live'}
                          </p>
                          {(alert as any).exactAddress && <p className="text-xs text-slate-400 mt-0.5 truncate">{(alert as any).exactAddress}</p>}
                        </div>
                      </div>
                      <Badge className={cn("text-[10px] font-bold border-none rounded-lg px-2 py-0.5 flex-shrink-0",
                        alert.status === 'pending' ? 'bg-yellow-500/10 text-yellow-400' :
                        alert.status === 'responding' ? 'bg-blue-500/10 text-blue-400' :
                        alert.status === 'resolved' ? 'bg-green-500/10 text-green-400' :
                        'bg-red-500/10 text-red-400'
                      )}>{alert.status}</Badge>
                    </div>

                    {/* Responder */}
                    {alert.responderName && (
                      <div className="flex items-center gap-1.5 text-xs text-slate-400">
                        <Navigation className="h-3 w-3 text-blue-400 flex-shrink-0" />
                        <span>Responder: <span className="text-white font-semibold">{alert.responderName}</span></span>
                      </div>
                    )}

                    {/* Photo evidence */}
                    {(alert as any).hasPhoto && (
                      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800/50 border border-white/10">
                        <Camera className="h-4 w-4 text-slate-400 flex-shrink-0" />
                        <span className="text-xs text-slate-400">Photo evidence attached</span>
                      </div>
                    )}

                    {/* Voice note */}
                    {(alert as any).hasVoice && (
                      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800/50 border border-white/10">
                        <Mic className="h-4 w-4 text-slate-400 flex-shrink-0" />
                        <span className="text-xs text-slate-400">Voice note attached</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {currentView === 'map' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h1 className="text-xl font-black text-white">Live Map</h1>
                <div className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold",
                  gpsStatus === 'acquired' ? 'bg-green-500/10 border border-green-500/20 text-green-400' :
                  gpsStatus === 'acquiring' ? 'bg-yellow-500/10 border border-yellow-500/20 text-yellow-400' :
                  'bg-red-500/10 border border-red-500/20 text-red-400'
                )}>
                  <span className={cn("h-1.5 w-1.5 rounded-full",
                    gpsStatus === 'acquired' ? 'bg-green-500 animate-pulse' :
                    gpsStatus === 'acquiring' ? 'bg-yellow-500 animate-pulse' : 'bg-red-500'
                  )} />
                  {gpsStatus === 'acquired' ? 'GPS Active' : gpsStatus === 'acquiring' ? 'Acquiring...' : 'GPS Off'}
                </div>
              </div>

              {userLocation && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900/60 border border-white/5 text-xs text-slate-400">
                  <MapPin className="h-3.5 w-3.5 text-blue-400 flex-shrink-0" />
                  <span className="truncate">{exactAddress || `${userLocation[0].toFixed(5)}, ${userLocation[1].toFixed(5)}`}</span>
                </div>
              )}

              <Card className="bg-[#020617] border-white/5 rounded-2xl overflow-hidden h-[400px] relative">
                {mapMounted ? (
                  <UserLiveMap userLocation={userLocation} />
                ) : (
                  <div className="h-full flex items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
                  </div>
                )}
                {gpsStatus === 'denied' && (
                  <div className="absolute bottom-4 inset-x-4 bg-slate-900/95 border border-red-500/30 rounded-xl p-3 flex items-center gap-3">
                    <AlertTriangle className="h-4 w-4 text-red-400 flex-shrink-0" />
                    <p className="text-xs text-slate-300 flex-1">Location access denied. Enable GPS in browser settings.</p>
                    <button
                      onClick={() => { setGpsStatus('acquiring'); navigator.geolocation?.getCurrentPosition(pos => { setUserLocation([pos.coords.latitude, pos.coords.longitude]); setGpsStatus('acquired'); }, () => setGpsStatus('denied'), { enableHighAccuracy: true }); }}
                      className="text-xs text-blue-400 font-bold flex-shrink-0"
                    >Retry</button>
                  </div>
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
              {/* Deactivated / warning banner — desktop */}
              {isDeactivated ? (
                <div className="bg-red-900/40 border border-red-500/40 rounded-2xl p-5 flex items-start gap-4">
                  <AlertTriangle className="h-6 w-6 text-red-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-base font-black text-red-300">Account Deactivated</p>
                    <p className="text-sm text-red-400/80 mt-1">Your account has been deactivated due to false emergency reports. You cannot submit new reports. Contact the administrator to appeal.</p>
                  </div>
                </div>
              ) : (profile?.falseReportCount ?? 0) > 0 ? (
                <div className="bg-yellow-900/30 border border-yellow-500/30 rounded-2xl p-5 flex items-start gap-4">
                  <AlertTriangle className="h-6 w-6 text-yellow-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-base font-black text-yellow-300">False Report Warning</p>
                    <p className="text-sm text-yellow-400/80 mt-1">You have {profile?.falseReportCount}/3 false report violations. Your account will be deactivated upon reaching 3.</p>
                  </div>
                </div>
              ) : null}

              {/* Unread notifications — desktop */}
              {unreadNotifications.length > 0 && (
                <div className="bg-slate-900/60 rounded-2xl border border-white/5 overflow-hidden">
                  <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
                    <div className="flex items-center gap-3">
                      <Bell className="h-4 w-4 text-red-400" />
                      <span className="text-sm font-bold text-white">Notifications</span>
                      <span className="h-5 w-5 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center">{unreadNotifications.length}</span>
                    </div>
                    <button onClick={markAllNotificationsRead} className="text-xs text-slate-400 hover:text-white font-semibold transition-colors">Mark all read</button>
                  </div>
                  {unreadNotifications.map(notif => (
                    <div key={notif.id} className={cn(
                      "flex items-start gap-4 px-6 py-4 border-b border-white/5 last:border-0",
                      notif.type === 'deactivated' ? 'bg-red-900/20' : 'bg-yellow-900/10'
                    )}>
                      <AlertTriangle className={cn("h-5 w-5 flex-shrink-0 mt-0.5", notif.type === 'deactivated' ? 'text-red-400' : 'text-yellow-400')} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-white">{notif.title}</p>
                        <p className="text-xs text-slate-400 mt-1 leading-relaxed">{notif.message}</p>
                      </div>
                      <button onClick={() => markNotificationRead(notif.id)} className="text-slate-500 hover:text-white flex-shrink-0 transition-colors">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-4 bg-slate-900/40 p-5 rounded-2xl border border-white/5 shadow-lg">
                <div className="relative flex-shrink-0">
                  <div className="h-12 w-12 rounded-2xl bg-slate-800 border border-white/10 overflow-hidden">
                    {profile?.photoURL
                      ? <img src={profile.photoURL} alt="avatar" className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center text-white font-black text-lg">{profile?.name?.charAt(0)?.toUpperCase()}</div>}
                  </div>
                  <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-green-500 border-2 border-[#020617]" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-xl font-black text-white truncate">Hi, {profile?.name} 👋</h1>
                  <p className="text-xs text-slate-500 mt-0.5">Select an incident type to report instantly</p>
                </div>
                <div className="ml-auto flex items-center gap-2 flex-shrink-0">
                  <span className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/20 text-[11px] font-bold text-green-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />System Active
                  </span>
                </div>
              </div>

              <div className="space-y-4">
                {/* Office dots */}
                <div className="flex items-center gap-5 text-xs text-slate-400">
                  <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-blue-500 inline-block" />Security</span>
                  <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-orange-500 inline-block" />DRRM</span>
                  <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-red-500 inline-block" />Clinic</span>
                </div>

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
                      disabled={isSubmitting || isDeactivated}
                      className={cn(
                        "group relative aspect-square rounded-3xl flex flex-col items-center justify-center gap-3 transition-all duration-200 active:scale-95 overflow-hidden",
                        btn.color,
                        "hover:brightness-110 hover:scale-[1.02]",
                        isDeactivated && "opacity-40 cursor-not-allowed"
                      )}
                    >
                      <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                      <btn.icon className="h-10 w-10 text-white relative z-10" strokeWidth={1.5} />
                      <div className="text-center relative z-10 px-4">
                        <span className="text-lg font-black text-white tracking-wide block leading-tight">{btn.title}</span>
                        <span className="text-xs text-white/70 font-medium mt-1 block">{btn.subtitle}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-4">
                <Card className="bg-slate-900/40 border-white/5 lg:col-span-2 overflow-hidden rounded-2xl">
                  <CardHeader className="flex flex-row items-center justify-between border-b border-white/5 py-4 px-5">
                    <CardTitle className="text-sm font-bold text-white">Recent Reports</CardTitle>
                    <Dialog open={feedbackOpen} onOpenChange={setFeedbackOpen}>
                      <DialogTrigger asChild>
                        <Button variant="ghost" size="sm" className="text-xs font-semibold text-slate-400 hover:text-white gap-1.5">
                          <Star className="h-3.5 w-3.5" /> Feedback
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="bg-slate-950 border-white/5 rounded-2xl p-6">
                        <DialogHeader>
                          <DialogTitle className="text-lg font-black text-white">Submit Feedback</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-5 py-3">
                          <div className="space-y-2">
                            <Label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Ease of Use</Label>
                            <Slider value={easeOfUse} onValueChange={setEaseOfUse} max={5} min={1} step={1} className="py-2" />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Reliability</Label>
                            <Slider value={reliability} onValueChange={setReliability} max={5} min={1} step={1} className="py-2" />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Comments</Label>
                            <Textarea value={comments} onChange={(e) => setComments(e.target.value)} className="bg-slate-900 border-white/10 rounded-xl h-24 resize-none" />
                          </div>
                        </div>
                        <DialogFooter>
                          <Button onClick={submitFeedback} className="w-full h-11 bg-red-600 hover:bg-red-500 font-bold rounded-xl">Submit Feedback</Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="divide-y divide-white/5">
                      {alertsLoading ? (
                        <div className="py-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-slate-600" /></div>
                      ) : alerts.length === 0 ? (
                        <div className="py-10 text-center text-slate-500 text-sm">No reports yet</div>
                      ) : alerts.slice(0, 8).map((alert) => {
                        const typeLabel = alert.type === 'fire' ? 'DRRM' : alert.type === 'crime' ? 'Security' : 'Clinic';
                        const dotColor = alert.type === 'fire' ? 'bg-orange-500' : alert.type === 'crime' ? 'bg-blue-500' : 'bg-red-500';
                        return (
                          <div key={alert.id} className="flex items-center gap-3 px-5 py-3 hover:bg-white/5 transition-colors">
                            <div className={cn("h-2 w-2 rounded-full flex-shrink-0", dotColor)} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-white">{typeLabel}</span>
                                {((alert as any).hasPhoto || (alert as any).photoEvidenceUrl) && <Camera className="h-3 w-3 text-slate-500" />}
                                {((alert as any).hasVoice || (alert as any).voiceNoteUrl) && <Mic className="h-3 w-3 text-slate-500" />}
                              </div>
                              <p className="text-[10px] text-slate-500 mt-0.5">
                                {alert.timestamp?.seconds ? format(alert.timestamp.toDate(), 'MMM d, h:mm a') : '—'}
                                {alert.responderName && <span className="ml-2 text-blue-400">· {alert.responderName}</span>}
                              </p>
                            </div>
                            <Badge className={cn("text-[10px] font-bold border-none rounded-lg px-2 py-0.5 flex-shrink-0",
                              alert.status === 'pending' ? 'bg-yellow-500/10 text-yellow-400' :
                              alert.status === 'responding' ? 'bg-blue-500/10 text-blue-400' :
                              alert.status === 'resolved' ? 'bg-green-500/10 text-green-400' :
                              'bg-red-500/10 text-red-400'
                            )}>{alert.status}</Badge>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-slate-900/40 border-white/5 rounded-2xl p-6 space-y-5 shadow-2xl">
                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">System Status</h3>
                      <p className="text-xl font-black text-white mt-1">Your Account</p>
                    </div>
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/20">
                      <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                      <span className="text-[11px] font-bold text-green-400">Online</span>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: 'Total Reports', value: alerts.length, color: 'text-white' },
                      { label: 'Pending', value: alerts.filter(a => a.status === 'pending').length, color: 'text-yellow-400' },
                      { label: 'Resolved', value: alerts.filter(a => a.status === 'resolved').length, color: 'text-green-400' },
                    ].map(s => (
                      <div key={s.label} className="bg-slate-800/50 rounded-xl p-3 text-center border border-white/5">
                        <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wide mt-0.5">{s.label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Account health */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400 font-semibold">Account Standing</span>
                      <span className={profile?.falseReportCount ? 'text-yellow-400 font-bold' : 'text-green-400 font-bold'}>
                        {profile?.falseReportCount ? `${profile.falseReportCount}/3 violations` : 'Good Standing'}
                      </span>
                    </div>
                    <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          (profile?.falseReportCount ?? 0) >= 2 ? 'bg-red-500' :
                          (profile?.falseReportCount ?? 0) >= 1 ? 'bg-yellow-500' : 'bg-green-500'
                        }`}
                        style={{ width: `${Math.max(5, ((profile?.falseReportCount ?? 0) / 3) * 100)}%` }}
                      />
                    </div>
                  </div>

                  {/* Info row */}
                  <div className="flex items-start gap-3 p-3 bg-slate-800/40 rounded-xl border border-white/5">
                    <Info className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Your reports are sent directly to the relevant response office. Always provide accurate information.
                    </p>
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
                  <h1 className="text-2xl font-black text-white tracking-tight">My Reports</h1>
                  <p className="text-xs text-slate-500 mt-0.5">All your submitted incident reports</p>
                </div>
                <Badge className="bg-slate-800 text-slate-400 border-white/10 text-xs font-bold px-3 py-1.5">
                  {alerts.length} {alerts.length === 1 ? 'report' : 'reports'}
                </Badge>
              </div>

              {/* Report cards */}
              <div className="space-y-3">
                {alertsLoading ? (
                  <div className="flex items-center justify-center py-16">
                    <Loader2 className="h-6 w-6 animate-spin text-slate-600" />
                  </div>
                ) : alerts.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 py-20 rounded-2xl bg-slate-900/40 border border-white/5">
                    <div className="h-14 w-14 rounded-2xl bg-slate-800/80 flex items-center justify-center">
                      <ClipboardList className="h-7 w-7 text-slate-600" />
                    </div>
                    <p className="text-sm font-bold text-slate-400">No reports yet</p>
                    <p className="text-xs text-slate-600">Your incident reports will appear here</p>
                  </div>
                ) : alerts.map(alert => {
                  const typeColor = alert.type === 'fire' ? 'bg-orange-500' : alert.type === 'crime' ? 'bg-blue-500' : 'bg-red-500';
                  const typeLabel = alert.type === 'fire' ? 'DRRM' : alert.type === 'crime' ? 'Security' : 'Clinic';
                  const typeBg = alert.type === 'fire' ? 'bg-orange-500/10' : alert.type === 'crime' ? 'bg-blue-500/10' : 'bg-red-500/10';
                  const typeText = alert.type === 'fire' ? 'text-orange-400' : alert.type === 'crime' ? 'text-blue-400' : 'text-red-400';
                  return (
                    <div key={alert.id} className="bg-slate-900/60 border border-white/5 rounded-2xl p-4 space-y-3">
                      {/* Top row */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={cn("h-2.5 w-2.5 rounded-full flex-shrink-0 mt-1", typeColor)} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={cn("text-xs font-black px-2 py-0.5 rounded-lg", typeBg, typeText)}>{typeLabel}</span>
                              <span className="text-xs text-slate-500">
                                {alert.timestamp?.seconds ? format(alert.timestamp.toDate(), 'MMM d, h:mm a') : 'Live'}
                              </span>
                            </div>
                            {(alert as any).exactAddress && (
                              <p className="text-xs text-slate-400 mt-1 truncate">{(alert as any).exactAddress}</p>
                            )}
                            {!((alert as any).exactAddress) && alert.location && (
                              <p className="text-xs text-slate-500 mt-1 font-mono">{alert.location.lat.toFixed(4)}, {alert.location.lng.toFixed(4)}</p>
                            )}
                          </div>
                        </div>
                        <Badge className={cn("text-[10px] font-bold border-none px-2.5 py-1 rounded-lg flex-shrink-0",
                          alert.status === 'pending' ? 'bg-yellow-500/10 text-yellow-400' :
                          alert.status === 'responding' ? 'bg-blue-500/10 text-blue-400' :
                          alert.status === 'resolved' ? 'bg-green-500/10 text-green-400' :
                          'bg-red-500/10 text-red-400'
                        )}>{alert.status}</Badge>
                      </div>

                      {/* Responder */}
                      {alert.responderName && (
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                          <Navigation className="h-3 w-3 text-blue-400 flex-shrink-0" />
                          <span>Responder: <span className="text-white font-semibold">{alert.responderName}</span></span>
                        </div>
                      )}

                      {/* Media row */}
                      {((alert as any).hasPhoto || (alert as any).hasVoice || (alert as any).photoEvidenceUrl || (alert as any).voiceNoteUrl) && (
                        <div className="flex items-center gap-2 flex-wrap">
                          {((alert as any).hasPhoto || (alert as any).photoEvidenceUrl) && (
                            <span className="flex items-center gap-1 text-[10px] font-bold text-slate-400 bg-slate-800 px-2 py-1 rounded-lg">
                              <Camera className="h-3 w-3" /> Photo attached
                            </span>
                          )}
                          {((alert as any).hasVoice || (alert as any).voiceNoteUrl) && (
                            <span className="flex items-center gap-1 text-[10px] font-bold text-slate-400 bg-slate-800 px-2 py-1 rounded-lg">
                              <Mic className="h-3 w-3" /> Voice note attached
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {currentView === "map" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-black text-white tracking-tight">Live Map</h1>
                  <p className="text-xs text-slate-500 mt-0.5">Your real-time location</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold",
                    gpsStatus === 'acquired' ? 'bg-green-500/10 border border-green-500/20 text-green-400' :
                    gpsStatus === 'acquiring' ? 'bg-yellow-500/10 border border-yellow-500/20 text-yellow-400' :
                    'bg-red-500/10 border border-red-500/20 text-red-400'
                  )}>
                    <span className={cn("h-1.5 w-1.5 rounded-full",
                      gpsStatus === 'acquired' ? 'bg-green-500 animate-pulse' :
                      gpsStatus === 'acquiring' ? 'bg-yellow-500 animate-pulse' : 'bg-red-500'
                    )} />
                    {gpsStatus === 'acquired' ? 'GPS Active' : gpsStatus === 'acquiring' ? 'Acquiring GPS...' : 'GPS Unavailable'}
                  </div>
                  <Button variant="outline" size="sm" className="border-white/10 text-white hover:bg-white/5 gap-2"
                    onClick={() => {
                      setGpsStatus('acquiring');
                      navigator.geolocation?.getCurrentPosition(
                        async pos => {
                          setUserLocation([pos.coords.latitude, pos.coords.longitude]);
                          setGpsStatus('acquired');
                          const addr = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
                          setExactAddress(addr);
                        },
                        () => setGpsStatus('denied'),
                        { enableHighAccuracy: true, timeout: 8000 }
                      );
                    }}>
                    <Navigation className="h-4 w-4" /> Locate Me
                  </Button>
                </div>
              </div>

              {/* Address bar */}
              {userLocation && (
                <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-slate-900/60 border border-white/5">
                  <MapPin className="h-4 w-4 text-blue-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white font-semibold truncate">{exactAddress || 'Getting address...'}</p>
                    <p className="text-[11px] text-slate-500 font-mono mt-0.5">{userLocation[0].toFixed(6)}, {userLocation[1].toFixed(6)}</p>
                  </div>
                </div>
              )}

              {gpsStatus === 'denied' && (
                <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-bold flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                  Location access denied. Enable GPS in your browser settings for accurate reporting.
                </div>
              )}

              <Card className="bg-[#020617] border-white/5 rounded-2xl overflow-hidden h-[500px] relative">
                {mapMounted ? (
                  <UserLiveMap userLocation={userLocation} />
                ) : (
                  <div className="h-full flex items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
                  </div>
                )}
              </Card>
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
                        id="profile-name-input"
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
                    <Button
                      className="w-full h-12 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl"
                      onClick={async () => {
                        const input = document.getElementById('profile-name-input') as HTMLInputElement;
                        const newName = input?.value?.trim();
                        if (!newName || !profile || !db) return;
                        try {
                          await setDoc(doc(db, 'users', profile.uid), { name: newName }, { merge: true });
                          toast({ title: 'Profile updated', description: 'Your name has been saved.' });
                        } catch (e: any) {
                          toast({ variant: 'destructive', title: 'Update failed', description: e.message });
                        }
                      }}
                    >
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
                  <p className="text-sm text-slate-400 mt-1">Help us improve the School Emergency system</p>
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
          <AlertDialog open={confirmOpen} onOpenChange={(open) => { if (!open) { setConfirmOpen(false); setSelectedType(null); setManualLocation(''); setPhotoEvidence(null); setVoiceNote(null); if (isRecording) stopRecording(); } }}>
            <AlertDialogContent className="bg-[#0d1526] border border-white/10 rounded-3xl p-0 max-w-sm w-full overflow-hidden shadow-2xl">
              <AlertDialogHeader className="sr-only">
                <AlertDialogTitle>Report Emergency</AlertDialogTitle>
              </AlertDialogHeader>

              {/* Map preview — only shown when GPS acquired */}
              {gpsStatus === 'acquired' && userLocation && (
                <div className="h-28 w-full relative overflow-hidden bg-slate-800">
                  <img
                    src={`https://staticmap.openstreetmap.de/staticmap.php?center=${userLocation[0]},${userLocation[1]}&zoom=14&size=400x112&markers=${userLocation[0]},${userLocation[1]},red`}
                    alt="Location map"
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                  <div className="absolute bottom-0 inset-x-0 h-6 bg-gradient-to-t from-[#0d1526] to-transparent" />
                </div>
              )}

              <div className="p-5 space-y-3">
                {/* Alert type header */}
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "h-11 w-11 rounded-2xl flex items-center justify-center flex-shrink-0",
                    selectedType === 'fire' ? 'bg-orange-500/20' :
                    selectedType === 'police' ? 'bg-blue-500/20' :
                    selectedType === 'medical' ? 'bg-red-500/20' : 'bg-slate-700/50'
                  )}>
                    {selectedType === 'fire' && <AlertTriangle className="h-5 w-5 text-orange-400" />}
                    {selectedType === 'crime' && <Shield className="h-5 w-5 text-blue-400" />}
                    {selectedType === 'medical' && <Stethoscope className="h-5 w-5 text-red-400" />}
                    {selectedType === 'all' && <AlertTriangle className="h-5 w-5 text-slate-400" />}
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-base font-black text-white uppercase tracking-widest leading-tight">
                      {selectedType === 'all' ? 'All Offices' :
                       selectedType === 'fire' ? 'DRRM' :
                       selectedType === 'crime' ? 'Security' :
                       'Clinic'} Alert
                    </h2>
                    <div className="flex items-center gap-1 text-[11px] text-slate-400 mt-0.5">
                      <MapPin className="h-3 w-3 flex-shrink-0" />
                      <span className="truncate">
                        {gpsStatus === 'acquired' && exactAddress
                          ? exactAddress.slice(0, 50)
                          : gpsStatus === 'acquired' && userLocation
                          ? `${userLocation[0].toFixed(4)}, ${userLocation[1].toFixed(4)}`
                          : 'Detecting location...'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Location status */}
                <div className="space-y-1.5">
                  {gpsStatus === 'acquired' && userLocation ? (
                    <div className="flex items-start justify-between px-3 py-2 rounded-xl bg-green-500/10 border border-green-500/20">
                      <div className="flex items-start gap-2 text-xs text-green-400 font-semibold flex-1 min-w-0">
                        <MapPin className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                        <span className="line-clamp-2">{exactAddress || `${userLocation[0].toFixed(4)}, ${userLocation[1].toFixed(4)}`}</span>
                      </div>
                      <button type="button" onClick={() => { setGpsStatus('denied'); setUserLocation(null); setExactAddress(''); }} className="text-[10px] text-slate-400 hover:text-white font-semibold ml-2 flex-shrink-0">Override</button>
                    </div>
                  ) : gpsStatus === 'acquiring' || gpsStatus === 'idle' ? (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800/50 border border-white/8">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400 flex-shrink-0" />
                      <span className="text-xs text-slate-400 font-semibold">Acquiring GPS location...</span>
                    </div>
                  ) : (
                    <>
                      <Input placeholder="Enter your location manually..." value={manualLocation} onChange={e => setManualLocation(e.target.value)} className="bg-slate-800/50 border-white/10 text-white text-sm h-10 rounded-xl placeholder:text-slate-500" autoFocus />
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-yellow-400 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> GPS unavailable</p>
                        <button type="button" onClick={() => { setGpsStatus('acquiring'); navigator.geolocation?.getCurrentPosition(pos => { setUserLocation([pos.coords.latitude, pos.coords.longitude]); setGpsStatus('acquired'); }, () => setGpsStatus('denied'), { timeout: 8000, enableHighAccuracy: true }); }} className="text-xs text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-1"><Navigation className="h-3 w-3" /> Retry GPS</button>
                      </div>
                    </>
                  )}
                  <p className="text-[11px] text-slate-500 text-center">Agency will be notified immediately.</p>
                </div>
                <div className="flex items-start gap-2.5 p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
                  <AlertTriangle className="h-4 w-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-yellow-300 leading-relaxed">
                    <span className="font-black">False reports are prohibited.</span> Sending fake alerts may result in account suspension after 3 violations.
                  </p>
                </div>

                {/* Incident description — optional */}
                <textarea
                  id="incident-description"
                  placeholder="Describe what's happening... (optional)"
                  rows={2}
                  className="w-full bg-slate-800/50 border border-white/10 text-white text-xs rounded-xl px-3 py-2.5 placeholder:text-slate-500 resize-none focus:outline-none focus:border-white/20"
                />

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

                {/* Voice note — optional */}
                <div className="space-y-1">
                  {voiceNote ? (
                    <div className="rounded-xl bg-slate-800/60 border border-white/10 p-3 flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-green-500/20 flex items-center justify-center flex-shrink-0">
                        <Mic className="h-4 w-4 text-green-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-green-400">Voice note recorded ✓</p>
                        <audio src={voiceNote} controls className="w-full h-7 mt-1" />
                      </div>
                      <button onClick={() => setVoiceNote(null)} className="text-slate-500 hover:text-red-400 transition-colors flex-shrink-0">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={isRecording ? stopRecording : startRecording}
                      className={cn(
                        "w-full flex items-center justify-center gap-2 h-12 rounded-xl border-2 text-sm font-semibold transition-colors",
                        isRecording
                          ? "border-red-500/60 bg-red-500/10 text-red-400 animate-pulse"
                          : "border-dashed border-white/20 bg-white/5 text-slate-400 hover:border-white/30 hover:text-white"
                      )}
                    >
                      {isRecording ? <><Square className="h-4 w-4" /> Stop Recording</> : <><Mic className="h-4 w-4" /> Add Voice Note (Optional)</>}
                    </button>
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
