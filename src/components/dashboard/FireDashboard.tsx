"use client";

import { useState, useEffect, useRef } from 'react';
import { collection, query, orderBy, doc, writeBatch, serverTimestamp as firestoreTimestamp, getDoc, deleteDoc, increment, updateDoc } from 'firebase/firestore';
import { ref, push, onValue, off, serverTimestamp as rtdbTimestamp } from 'firebase/database';
import { useFirestore, useCollection, useDatabase, useMemoFirebase } from '@/firebase';
import { EmergencyAlert, AlertStatus } from '@/lib/types';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from '@/hooks/use-auth';
import { useToast } from "@/hooks/use-toast";
import {
  Flame, CheckCircle2, Navigation, MapPin, Zap, BrainCircuit,
  Radio, Activity, Clock, User, AlertTriangle, ChevronRight, Trash2, Video, Phone, PhoneOff
} from 'lucide-react';
import { format } from 'date-fns';
import { analyzeSituation } from '@/ai/flows/analyze-situation-flow';
import { cn } from '@/lib/utils';
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AgencySidebar } from "./AgencySidebar";
import { AgencyProfileView } from "./AgencyProfileView";
import { AgencySettings } from "./AgencySettings";
import { AlertSoundButton } from "./AlertSoundButton";
import { useAlertSound } from "@/hooks/use-alert-sound";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { useFCMToken } from "@/hooks/use-fcm-token";
import { SectorVectorGrid } from "./SectorVectorGrid";
import { DashboardHeader } from "./DashboardHeader";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import Link from 'next/link';
import { VideoCall } from "./VideoCall";

// ─── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide",
      status === 'pending' ? 'bg-orange-500/15 text-orange-400' :
      status === 'responding' ? 'bg-blue-500/15 text-blue-400' :
      status === 'false_report' ? 'bg-red-900/40 text-red-400' :
      'bg-green-500/15 text-green-400'
    )}>
      <span className={cn(
        "h-1.5 w-1.5 rounded-full",
        status === 'pending' ? 'bg-orange-400 animate-pulse' :
        status === 'responding' ? 'bg-blue-400 animate-pulse' :
        status === 'false_report' ? 'bg-red-400' :
        'bg-green-400'
      )} />
      {status === 'false_report' ? 'False Report' : status}
    </span>
  );
}

export function FireDashboard() {
  const { profile } = useAuth();
  const db = useFirestore();
  const rtdb = useDatabase();
  const { toast } = useToast();
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState("dashboard");
  const [falseReportConfirm, setFalseReportConfirm] = useState<EmergencyAlert | null>(null);
  const [videoCallOpen, setVideoCallOpen] = useState(false);
  const [incomingAgencyCall, setIncomingAgencyCall] = useState<{roomId: string; callerName: string} | null>(null);

  // ── Listen for incoming video calls from users ────────────────────────────
  useEffect(() => {
    if (!rtdb) return;
    const callRef = ref(rtdb, 'agency_calls/drrm');
    const unsub = onValue(callRef, (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        if (Date.now() - data.createdAt < 60000) {
          setIncomingAgencyCall({ roomId: data.roomId, callerName: data.callerName });
        }
      } else {
        setIncomingAgencyCall(null);
      }
    });
    return () => off(callRef);
  }, [rtdb]);

  const alertsQuery = useMemoFirebase(() => {
    if (!db) return null;
    return query(collection(db, 'agency_alerts_fire'), orderBy('timestamp', 'desc'));
  }, [db]);

  const { data: alertsData, isLoading } = useCollection<EmergencyAlert>(alertsQuery);
  const alerts = alertsData || [];

  // Fetch media (photo + voice) stored separately to avoid Firestore 1MB limit
  const mediaQuery = useMemoFirebase(() => {
    if (!db) return null;
    return query(collection(db, 'alert_media'), orderBy('timestamp', 'desc'));
  }, [db]);
  const { data: mediaData } = useCollection<any>(mediaQuery);
  const mediaMap = (mediaData || []).reduce((acc: Record<string, any>, m: any) => {
    acc[m.alertId] = m; return acc;
  }, {});

  const { soundEnabled, toggleSound, playNewIncident, playSiren, stopSiren, sirenActive } = useAlertSound();
  const { showNotification, requestPermission } = usePushNotifications();
  useFCMToken(profile?.uid); // Register for background push notifications
  const prevCountRef = useRef<number | null>(null);

  useEffect(() => {
    if (isLoading) return;
    const pending = alerts.filter(a => a.status === 'pending').length;
    if (prevCountRef.current === null) {
      prevCountRef.current = pending;
      return;
    }
    if (pending > prevCountRef.current) {
      playNewIncident('fire');
      playSiren('fire');
      // Push notification — works even when tab is in background
      const newest = alerts.find(a => a.status === 'pending');
      showNotification('🔥 New DRRM Emergency Alert', {
        body: newest ? `${newest.userName} reported a fire/disaster emergency${newest.exactAddress ? ` at ${newest.exactAddress}` : ''}` : 'A new fire emergency has been reported.',
        tag: 'fire-alert',
        requireInteraction: true,
        data: { url: '/dashboard' },
      });
    } else if (pending < prevCountRef.current) {
      stopSiren();
    }
    prevCountRef.current = pending;
  }, [alerts, isLoading, playNewIncident, playSiren, stopSiren, showNotification]);

  const performAIAnalysis = async (alert: EmergencyAlert) => {
    if (!db) return;
    setAnalyzingId(alert.id);
    try {
      const result = await analyzeSituation({
        type: 'fire',
        userName: alert.userName,
        locationContext: alert.location
          ? `LAT ${alert.location.lat.toFixed(6)}, LNG ${alert.location.lng.toFixed(6)}`
          : 'UNKNOWN LOCATION',
      });
      const batch = writeBatch(db);
      const update = { aiAnalysis: result.analysis };
      batch.update(doc(db, 'agency_alerts_fire', alert.id), update);
      batch.update(doc(db, 'users', alert.userId, 'alerts', alert.id), update);
      batch.update(doc(db, 'all_alerts', alert.id), update);
      await batch.commit();
      toast({ title: 'AI Analysis complete' });
    } catch {
      toast({ variant: 'destructive', title: 'AI Analysis failed' });
    } finally {
      setAnalyzingId(null);
    }
  };

  const updateStatus = async (alert: EmergencyAlert, status: 'responding' | 'resolved') => {
    if (!profile || !db) return;
    try {
      const batch = writeBatch(db);
      const data: Record<string, unknown> = { status };
      if (status === 'responding') {
        data.responderId = profile.uid;
        data.responderName = profile.name;
        data.responseStartTime = firestoreTimestamp();
      } else {
        data.resolvedTime = firestoreTimestamp();
      }
      batch.set(doc(db, 'agency_alerts_fire', alert.id), data, { merge: true });
      batch.set(doc(db, 'users', alert.userId, 'alerts', alert.id), data, { merge: true });
      batch.set(doc(db, 'all_alerts', alert.id), data, { merge: true });

      const notifRef = doc(collection(db, 'users', alert.userId, 'notifications'));
      batch.set(notifRef, {
        id: notifRef.id,
        type: 'status_update',
        title: status === 'responding' ? 'Responder On The Way' : 'Incident Resolved',
        message: status === 'responding'
          ? `${profile.name} from DRRM is responding to your report.`
          : `Your incident report has been resolved by ${profile.name}.`,
        timestamp: firestoreTimestamp(),
        read: false,
      });

      await batch.commit();
      toast({ title: `Alert marked as ${status}` });
      if (rtdb) {
        push(ref(rtdb, 'live-logs'), {
          action: `Fire: ${profile.name} → ${status}`,
          userName: profile.name,
          timestamp: rtdbTimestamp(),
        });
      }
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Failed to update status', description: e.message });
    }
  };

  const pendingAlerts = alerts.filter(a => a.status === 'pending');
  const respondingAlerts = alerts.filter(a => a.status === 'responding');
  const resolvedAlerts = alerts.filter(a => a.status === 'resolved');
  const activeAlerts = alerts.filter(a => a.status !== 'resolved' && a.location);

  const markFalseReport = async (alert: EmergencyAlert) => {
    if (!profile || !db) return;
    try {
      const alertData = { status: 'false_report' as AlertStatus, falseReportBy: profile.name, falseReportTime: firestoreTimestamp() };

      // Commit alert status FIRST — before any async reads — so the listener
      // immediately gets false_report and the UI stops reverting to responding.
      const statusBatch = writeBatch(db);
      statusBatch.set(doc(db, 'agency_alerts_fire', alert.id), alertData, { merge: true });
      statusBatch.set(doc(db, 'users', alert.userId, 'alerts', alert.id), alertData, { merge: true });
      statusBatch.set(doc(db, 'all_alerts', alert.id), alertData, { merge: true });
      await statusBatch.commit();

      // Now do the user penalty (getDoc is safe here — alert is already false_report)
      const userRef = doc(db, 'users', alert.userId);
      const userSnap = await getDoc(userRef);
      const current = userSnap.data()?.falseReportCount || 0;
      const next = current + 1;
      const shouldDeactivate = next >= 3;

      const penaltyBatch = writeBatch(db);
      const userUpdate: Record<string, any> = { falseReportCount: increment(1) };
      if (shouldDeactivate) userUpdate.isDeactivated = true;
      penaltyBatch.set(userRef, userUpdate, { merge: true });

      const notifRef = doc(collection(db, 'users', alert.userId, 'notifications'));
      penaltyBatch.set(notifRef, {
        id: notifRef.id,
        type: shouldDeactivate ? 'deactivated' : 'warning',
        title: shouldDeactivate ? 'Account Deactivated' : `False Report Warning (${next}/3)`,
        message: shouldDeactivate
          ? 'Your account has been deactivated due to 3 false emergency reports. Please contact the administrator to appeal.'
          : `Your report was marked as false by a responder. You have ${next} of 3 allowed violations. Your account will be deactivated upon reaching 3 false reports.`,
        timestamp: firestoreTimestamp(),
        read: false,
      });
      await penaltyBatch.commit();

      toast({
        variant: 'destructive',
        title: 'Marked as False Report',
        description: shouldDeactivate
          ? `${alert.userName}'s account has been deactivated (3 false reports).`
          : `${alert.userName} now has ${next}/3 false report violation${next > 1 ? 's' : ''}.`,
      });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Failed to mark false report', description: e.message });
    }
  };

  const deleteAlert = async (alert: EmergencyAlert) => {
    if (!db) return;
    try {
      await Promise.all([
        deleteDoc(doc(db, 'agency_alerts_fire', alert.id)),
        deleteDoc(doc(db, 'users', alert.userId, 'alerts', alert.id)).catch(() => {}),
        deleteDoc(doc(db, 'all_alerts', alert.id)).catch(() => {}),
      ]);
      toast({ title: 'Alert deleted' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Delete failed', description: e.message });
    }
  };

  return (
    <SidebarProvider style={{ '--sidebar-width': '18rem' } as React.CSSProperties}>
      <AgencySidebar currentView={currentView} onViewChange={setCurrentView} pendingCount={pendingAlerts.length} />
      <SidebarInset className="bg-[#080d1a] border-l border-white/5 overflow-y-auto h-screen min-w-0 flex-1 w-0">

        {/* ── Profile view ─────────────────────────────────────────────────── */}
        {currentView === 'profile' && (
          <div className="p-6">
            <AgencyProfileView
              agencyColor="text-orange-400"
              badgeClass="bg-orange-500/10 text-orange-400 border-orange-500/20"
            />
          </div>
        )}

        {/* ── Settings view ─────────────────────────────────────────────────── */}
        {currentView === 'settings' && (
          <div className="p-6">
            <AgencySettings />
          </div>
        )}

        {/* ── Dashboard view ────────────────────────────────────────────────── */}
        {currentView === 'dashboard' && (
          <div className="p-6 space-y-6 animate-in fade-in duration-500">

            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-2xl bg-orange-500/15 border border-orange-500/20 flex items-center justify-center">
                  <Flame className="h-6 w-6 text-orange-500" />
                </div>
                <div>
                  <h1 className="text-2xl font-black text-white tracking-tight">DRRM Dashboard</h1>
                  <p className="text-xs text-slate-400 mt-0.5">Disaster Risk Reduction — Real-time incident management</p>
                </div>
              </div>
              <AlertSoundButton
                soundEnabled={soundEnabled}
                sirenActive={sirenActive}
                onToggleSound={toggleSound}
                onPlaySiren={() => playSiren('fire')}
                onStopSiren={stopSiren}
                pendingCount={pendingAlerts.length}
                accentColor="orange"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (incomingAgencyCall) {
                    setVideoCallOpen(true);
                  } else {
                    toast({ title: 'No incoming call', description: 'Waiting for a user to call this office.' });
                  }
                }}
                className={cn(
                  "h-10 px-3 gap-2 font-bold",
                  incomingAgencyCall
                    ? "border-green-500/50 text-green-400 hover:bg-green-500/10 animate-pulse"
                    : "border-orange-500/30 text-orange-400 hover:bg-orange-500/10"
                )}
              >
                <Video className="h-4 w-4" />
                {incomingAgencyCall ? 'Answer Call' : 'Video Call'}
              </Button>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'Pending', value: pendingAlerts.length, color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20' },
                { label: 'Responding', value: respondingAlerts.length, color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
                { label: 'Resolved', value: resolvedAlerts.length, color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/20' },
              ].map(s => (
                <div key={s.label} className={cn("rounded-2xl border p-4", s.bg)}>
                  <p className="text-xs text-slate-400 uppercase tracking-widest font-bold">{s.label}</p>
                  <p className={cn("text-3xl font-black mt-1", s.color)}>{s.value}</p>
                </div>
              ))}
            </div>

            {/* Main grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

              {/* Alert list */}
              <div className="xl:col-span-2 space-y-4">
                {isLoading ? (
                  <div className="flex items-center justify-center py-24">
                    <Radio className="h-8 w-8 animate-spin text-orange-500/30" />
                  </div>
                ) : alerts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-24 rounded-2xl bg-slate-900/40 border border-white/5">
                    <div className="h-16 w-16 rounded-2xl bg-green-500/10 border border-green-500/20 flex items-center justify-center mb-4">
                      <CheckCircle2 className="h-8 w-8 text-green-500" />
                    </div>
                    <h3 className="text-lg font-bold text-white">All Clear</h3>
                    <p className="text-sm text-slate-400 mt-1">No active fire incidents</p>
                  </div>
                ) : (
                  alerts.map(alert => {
                    const photo = (alert as any).photoEvidenceUrl || mediaMap[alert.id]?.photoEvidenceUrl;
                    const voice = (alert as any).voiceNoteUrl || mediaMap[alert.id]?.voiceNoteUrl;
                    const isPending = alert.status === 'pending';
                    const isResponding = alert.status === 'responding';
                    const isResolved = alert.status === 'resolved';
                    const isFalse = alert.status === 'false_report';
                    return (
                    <div
                      key={alert.id}
                      className={cn(
                        "rounded-2xl border overflow-hidden transition-all duration-300",
                        isPending ? 'bg-orange-500/5 border-orange-500/40 shadow-[0_0_24px_rgba(249,115,22,0.12)]' :
                        isResponding ? 'bg-blue-500/5 border-blue-500/30' :
                        isFalse ? 'bg-red-900/10 border-red-900/30' :
                        'bg-slate-900/40 border-white/5'
                      )}
                    >
                      {/* Status bar */}
                      <div className={cn("h-1 w-full", isPending ? 'bg-orange-500' : isResponding ? 'bg-blue-500' : isFalse ? 'bg-red-700' : 'bg-slate-700')} />

                      <div className="p-4 sm:p-5 space-y-4">

                        {/* ── Header row ── */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={cn(
                              "h-11 w-11 rounded-2xl flex items-center justify-center flex-shrink-0",
                              isPending ? 'bg-orange-500/20' : isResponding ? 'bg-blue-500/20' : 'bg-slate-800'
                            )}>
                              {(alert as any).userPhotoURL ? (
                                <img src={(alert as any).userPhotoURL} alt="" className="h-11 w-11 rounded-2xl object-cover" />
                              ) : (
                                <Flame className={cn("h-5 w-5", isPending ? 'text-orange-400' : isResponding ? 'text-blue-400' : 'text-slate-500')} />
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-base font-black text-white truncate">{alert.userName}</span>
                                {isPending && <span className="text-[10px] font-bold text-orange-400 bg-orange-500/15 px-2 py-0.5 rounded-full animate-pulse shrink-0">URGENT</span>}
                              </div>
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 text-[11px] text-slate-400">
                                <span className="flex items-center gap-1">
                                  <MapPin className="h-3 w-3 shrink-0" />
                                  {alert.location ? `${alert.location.lat.toFixed(4)}, ${alert.location.lng.toFixed(4)}` : 'No GPS'}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3 shrink-0" />
                                  {alert.timestamp?.seconds ? format(alert.timestamp.toDate(), 'MMM d, h:mm a') : 'Live'}
                                </span>
                              </div>
                            </div>
                          </div>
                          <StatusBadge status={alert.status} />
                        </div>

                        {/* ── Reporter info ── */}
                        <div className="rounded-xl bg-slate-800/50 border border-white/5 p-3">
                          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Reporter Info</p>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 text-xs">
                            {[
                              { label: 'Name', value: alert.userName },
                              (alert as any).userAge && { label: 'Age', value: (alert as any).userAge },
                              (alert as any).userSex && { label: 'Sex', value: (alert as any).userSex },
                              (alert as any).userEmail && { label: 'Email', value: (alert as any).userEmail },
                              (alert as any).exactAddress && { label: 'Address', value: (alert as any).exactAddress },
                            ].filter(Boolean).map((item: any) => (
                              <div key={item.label} className="min-w-0">
                                <p className="text-slate-500 text-[10px] uppercase tracking-wide">{item.label}</p>
                                <p className="text-white font-semibold truncate mt-0.5">{item.value}</p>
                              </div>
                            ))}
                          </div>
                          {/* Description */}
                          {(alert as any).description && (
                            <div className="mt-2 pt-2 border-t border-white/5">
                              <p className="text-slate-500 text-[10px] uppercase tracking-wide mb-1">Description</p>
                              <p className="text-white text-xs leading-relaxed">{(alert as any).description}</p>
                            </div>
                          )}
                        </div>

                        {/* ── Incident Timeline ── */}
                        {(alert.responseStartTime || alert.resolvedTime) && (
                          <div className="rounded-xl bg-slate-800/50 border border-white/5 p-3">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Timeline</p>
                            <div className="space-y-1.5">
                              <div className="flex items-center gap-2 text-xs">
                                <span className="h-1.5 w-1.5 rounded-full bg-yellow-400 flex-shrink-0" />
                                <span className="text-slate-400">Reported:</span>
                                <span className="text-white font-semibold">{alert.timestamp?.seconds ? format(alert.timestamp.toDate(), 'MMM d, h:mm a') : '—'}</span>
                              </div>
                              {alert.responseStartTime?.seconds && (
                                <div className="flex items-center gap-2 text-xs">
                                  <span className="h-1.5 w-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                                  <span className="text-slate-400">Responded:</span>
                                  <span className="text-white font-semibold">{format(alert.responseStartTime.toDate(), 'MMM d, h:mm a')}</span>
                                  {alert.timestamp?.seconds && (
                                    <span className="text-slate-500 text-[10px]">
                                      (+{Math.round((alert.responseStartTime.seconds - alert.timestamp.seconds) / 60)}m)
                                    </span>
                                  )}
                                </div>
                              )}
                              {alert.resolvedTime?.seconds && (
                                <div className="flex items-center gap-2 text-xs">
                                  <span className="h-1.5 w-1.5 rounded-full bg-green-400 flex-shrink-0" />
                                  <span className="text-slate-400">Resolved:</span>
                                  <span className="text-white font-semibold">{format(alert.resolvedTime.toDate(), 'MMM d, h:mm a')}</span>
                                  {alert.responseStartTime?.seconds && (
                                    <span className="text-slate-500 text-[10px]">
                                      (+{Math.round((alert.resolvedTime.seconds - alert.responseStartTime.seconds) / 60)}m)
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* ── Photo Evidence ── */}
                        {photo && (
                          <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-slate-800/50 border border-white/10">
                            <button onClick={() => {
                              if (photo.startsWith('data:')) {
                                const arr = photo.split(','); const mime = arr[0].match(/:(.*?);/)![1];
                                const bstr = atob(arr[1]); let n = bstr.length; const u8 = new Uint8Array(n);
                                while (n--) u8[n] = bstr.charCodeAt(n);
                                const url = URL.createObjectURL(new Blob([u8], { type: mime }));
                                window.open(url, '_blank');
                              } else { window.open(photo, '_blank'); }
                            }} className="flex-shrink-0">
                              <img src={photo} alt="Evidence" className="h-12 w-12 rounded-lg object-cover border border-white/10 hover:opacity-80 transition-opacity cursor-zoom-in" />
                            </button>
                            <div className="flex-1 min-w-0">
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Photo Evidence</p>
                              <p className="text-xs text-slate-500 mt-0.5 truncate">Tap thumbnail to view full size</p>
                            </div>
                            <button onClick={() => {
                              if (photo.startsWith('data:')) {
                                const arr = photo.split(','); const mime = arr[0].match(/:(.*?);/)![1];
                                const bstr = atob(arr[1]); let n = bstr.length; const u8 = new Uint8Array(n);
                                while (n--) u8[n] = bstr.charCodeAt(n);
                                const url = URL.createObjectURL(new Blob([u8], { type: mime }));
                                window.open(url, '_blank');
                              } else { window.open(photo, '_blank'); }
                            }} className="text-[10px] font-bold text-orange-400 hover:text-orange-300 shrink-0 transition-colors">View →</button>
                          </div>
                        )}

                        {/* ── Voice Note ── */}
                        {voice && (
                          <div className="rounded-xl border border-white/10 bg-slate-800/50 overflow-hidden">
                            <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5">
                              <Activity className="h-3.5 w-3.5 text-slate-400" />
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Voice Note</p>
                            </div>
                            <div className="px-3 py-2">
                              <audio src={voice} controls className="w-full h-8" />
                            </div>
                          </div>
                        )}

                        {/* ── Responder info ── */}
                        {alert.responderName && (
                          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-500/10 border border-blue-500/20">
                            <User className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                            <span className="text-xs text-blue-300 font-bold truncate">Responding: {alert.responderName}</span>
                          </div>
                        )}

                        {/* ── AI Analysis ── */}
                        {alert.aiAnalysis ? (
                          <div className="p-3 rounded-xl bg-slate-900/60 border border-orange-500/10">
                            <div className="flex items-center gap-2 mb-2">
                              <BrainCircuit className="h-3.5 w-3.5 text-orange-400 shrink-0" />
                              <span className="text-[10px] font-bold text-orange-400 uppercase tracking-widest">AI Tactical Analysis</span>
                            </div>
                            <p className="text-xs text-slate-300 leading-relaxed">{alert.aiAnalysis}</p>
                          </div>
                        ) : (
                          <Button variant="outline" size="sm"
                            className="w-full border-orange-500/20 bg-orange-500/5 hover:bg-orange-500/10 text-orange-400 font-bold gap-2"
                            onClick={() => performAIAnalysis(alert)} disabled={analyzingId === alert.id}>
                            {analyzingId === alert.id ? <Zap className="h-4 w-4 animate-spin" /> : <BrainCircuit className="h-4 w-4" />}
                            {analyzingId === alert.id ? 'Analyzing...' : 'Run AI Analysis'}
                          </Button>
                        )}

                        {/* ── Action buttons ── */}
                        <div className="flex flex-wrap gap-2 pt-1">
                          {isPending && (
                            <Button onClick={() => updateStatus(alert, 'responding')}
                              className="flex-1 min-w-[120px] bg-orange-600 hover:bg-orange-500 text-white font-bold gap-2 shadow-lg shadow-orange-900/30 h-10">
                              <Navigation className="h-4 w-4" /> Respond
                            </Button>
                          )}
                          {isResponding && (
                            <Button onClick={() => updateStatus(alert, 'resolved')}
                              className="flex-1 min-w-[120px] bg-green-600 hover:bg-green-500 text-white font-bold gap-2 shadow-lg shadow-green-900/30 h-10">
                              <CheckCircle2 className="h-4 w-4" /> Mark Resolved
                            </Button>
                          )}
                          {!isResolved && !isFalse && (
                            <Button variant="outline" size="sm" onClick={() => setFalseReportConfirm(alert)}
                              className="h-10 border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300 gap-1.5 font-bold">
                              <AlertTriangle className="h-3.5 w-3.5" /> False Report
                            </Button>
                          )}
                          {(isResolved || isFalse) && (
                            <Button variant="outline" size="sm" onClick={() => deleteAlert(alert)}
                              className="h-10 border-white/10 text-slate-500 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30 gap-1.5">
                              <Trash2 className="h-3.5 w-3.5" /> Delete
                            </Button>
                          )}
                          {alert.location && (
                            <Button variant="outline" size="sm"
                              className="h-10 border-white/10 text-slate-400 hover:text-white hover:bg-white/5 gap-1.5"
                              onClick={() => {
                                const { lat, lng } = alert.location!;
                                if (navigator.geolocation) {
                                  navigator.geolocation.getCurrentPosition(
                                    pos => window.open(`https://www.google.com/maps/dir/${pos.coords.latitude},${pos.coords.longitude}/${lat},${lng}`, '_blank'),
                                    () => window.open(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`, '_blank')
                                  );
                                } else window.open(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`, '_blank');
                              }}>
                              <MapPin className="h-4 w-4" /> View on Map
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                    );
                  })
                )}
              </div>

              {/* Right panel — live map + stats */}
              <div className="space-y-4">

                {/* Sector Vector Grid */}
                <SectorVectorGrid
                  headerColor="bg-orange-600"
                  activeAlerts={activeAlerts}
                  alertColor="#f97316"
                  agencyLabel="🔥 Fire Emergency"
                  mapHref="/map"
                />

                {/* Recent activity */}
                <div className="rounded-2xl border border-white/5 bg-slate-900/40 overflow-hidden">
                  <div className="px-4 py-3 border-b border-white/5">
                    <span className="text-sm font-bold text-white">Recent Activity</span>
                  </div>
                  <div className="divide-y divide-white/5 max-h-64 overflow-y-auto">
                    {alerts.slice(0, 8).map(alert => (
                      <div key={alert.id} className="flex items-center gap-3 px-4 py-3">
                        <div className={cn(
                          "h-2 w-2 rounded-full flex-shrink-0",
                          alert.status === 'pending' ? 'bg-orange-400 animate-pulse' :
                          alert.status === 'responding' ? 'bg-blue-400' : 'bg-green-400'
                        )} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-white truncate">{alert.userName}</p>
                          <p className="text-[10px] text-slate-500">
                            {alert.timestamp?.seconds ? format(alert.timestamp.toDate(), 'h:mm a') : 'Live'}
                          </p>
                        </div>
                        <StatusBadge status={alert.status} />
                      </div>
                    ))}
                    {alerts.length === 0 && (
                      <div className="px-4 py-6 text-center text-slate-500 text-xs">No incidents yet</div>
                    )}
                  </div>
                </div>

                {/* Responder status */}
                <div className="rounded-2xl border border-white/5 bg-slate-900/40 p-4">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Responder Status</p>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-300">Active responders</span>
                      <span className="text-sm font-black text-orange-400">{respondingAlerts.length}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-300">Incidents today</span>
                      <span className="text-sm font-black text-white">{alerts.length}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-300">Resolution rate</span>
                      <span className="text-sm font-black text-green-400">
                        {alerts.length > 0 ? Math.round((resolvedAlerts.length / alerts.length) * 100) : 0}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </SidebarInset>

      {/* ── False Report Confirmation Dialog ─────────────────────────────── */}
      <AlertDialog open={falseReportConfirm !== null} onOpenChange={(open) => { if (!open) setFalseReportConfirm(null); }}>
        <AlertDialogContent className="bg-slate-950 border-white/10 rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Mark as False Report?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              This will mark <span className="text-white font-bold">{falseReportConfirm?.userName}</span>'s report as a false report and record a violation on their account. At 3 violations, their account will be deactivated.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-800 border-white/10 text-white hover:bg-slate-700">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-500 text-white"
              onClick={() => {
                if (falseReportConfirm) {
                  markFalseReport(falseReportConfirm);
                  setFalseReportConfirm(null);
                }
              }}
            >
              Confirm False Report
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Incoming call banner ─────────────────────────────────────────── */}
      {incomingAgencyCall && !videoCallOpen && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[150] animate-in slide-in-from-bottom-4 duration-300">
          <div className="bg-[#0d1526] border border-orange-500/50 rounded-2xl px-5 py-4 shadow-2xl flex items-center gap-4 min-w-[320px] max-w-sm">
            {/* Pulsing avatar */}
            <div className="relative flex-shrink-0">
              <div className="absolute inset-0 rounded-full bg-orange-500/20 animate-ping" />
              <div className="h-11 w-11 rounded-full bg-orange-500/20 border border-orange-500/40 flex items-center justify-center">
                <Video className="h-5 w-5 text-orange-400" />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black text-white">Incoming Video Call</p>
              <p className="text-xs text-slate-400 truncate mt-0.5">From: {incomingAgencyCall.callerName}</p>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <button
                onClick={() => setIncomingAgencyCall(null)}
                className="h-10 w-10 rounded-full bg-red-600 hover:bg-red-500 flex items-center justify-center transition-colors"
                aria-label="Decline"
              >
                <PhoneOff className="h-4 w-4 text-white" />
              </button>
              <button
                onClick={() => setVideoCallOpen(true)}
                className="h-10 w-10 rounded-full bg-green-500 hover:bg-green-400 flex items-center justify-center transition-colors animate-pulse"
                aria-label="Answer"
              >
                <Phone className="h-4 w-4 text-white" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Video Call ───────────────────────────────────────────────────── */}
      {videoCallOpen && (
        <VideoCall
          onClose={() => { setVideoCallOpen(false); setIncomingAgencyCall(null); }}
          incomingRoomId={incomingAgencyCall?.roomId}
          incomingCallerNameProp={incomingAgencyCall?.callerName}
        />
      )}
    </SidebarProvider>
  );
}
