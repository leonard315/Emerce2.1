"use client";

import { useState, useEffect, useRef } from 'react';
import { collection, query, orderBy, doc, writeBatch, serverTimestamp as firestoreTimestamp } from 'firebase/firestore';
import { ref, push, serverTimestamp as rtdbTimestamp } from 'firebase/database';
import { useFirestore, useCollection, useDatabase, useMemoFirebase } from '@/firebase';
import { EmergencyAlert, AlertStatus } from '@/lib/types';
import { Button } from "@/components/ui/button";
import { useAuth } from '@/hooks/use-auth';
import { useToast } from "@/hooks/use-toast";
import { HeartPulse, CheckCircle2, Navigation, MapPin, Zap, BrainCircuit, Radio, Clock, User, ChevronRight, AlertTriangle, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { analyzeSituation } from '@/ai/flows/analyze-situation-flow';
import { cn } from '@/lib/utils';
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AgencySidebar } from "./AgencySidebar";
import { AgencyProfileView } from "./AgencyProfileView";
import { AlertSoundButton } from "./AlertSoundButton";
import { useAlertSound } from "@/hooks/use-alert-sound";
import { SectorVectorGrid } from "./SectorVectorGrid";
import { DashboardHeader } from "./DashboardHeader";
import Link from 'next/link';

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide",
      status === 'pending' ? 'bg-red-500/15 text-red-400' :
      status === 'responding' ? 'bg-blue-500/15 text-blue-400' :
      status === 'false_report' ? 'bg-red-900/40 text-red-400' :
      'bg-green-500/15 text-green-400'
    )}>
      <span className={cn("h-1.5 w-1.5 rounded-full",
        status === 'pending' ? 'bg-red-400 animate-pulse' :
        status === 'responding' ? 'bg-blue-400 animate-pulse' :
        status === 'false_report' ? 'bg-red-400' :
        'bg-green-400'
      )} />
      {status === 'false_report' ? 'False Report' : status}
    </span>
  );
}

export function MedicalDashboard() {
  const { profile } = useAuth();
  const db = useFirestore();
  const rtdb = useDatabase();
  const { toast } = useToast();
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState("dashboard");

  const alertsQuery = useMemoFirebase(() => {
    if (!db) return null;
    return query(collection(db, 'agency_alerts_medical'), orderBy('timestamp', 'desc'));
  }, [db]);

  const { data: alertsData, isLoading } = useCollection<EmergencyAlert>(alertsQuery);
  const alerts = alertsData || [];

  const { soundEnabled, toggleSound, playNewIncident, playSiren, stopSiren, sirenActive } = useAlertSound();
  const prevCountRef = useRef<number | null>(null);

  useEffect(() => {
    if (isLoading) return;
    const pending = alerts.filter(a => a.status === 'pending').length;
    if (prevCountRef.current === null) {
      prevCountRef.current = pending;
      return;
    }
    if (pending > prevCountRef.current) {
      playNewIncident('medical');
      playSiren('medical');
    } else if (pending < prevCountRef.current) {
      stopSiren();
    }
    prevCountRef.current = pending;
  }, [alerts, isLoading, playNewIncident, playSiren, stopSiren]);

  const performAIAnalysis = async (alert: EmergencyAlert) => {
    if (!db) return;
    setAnalyzingId(alert.id);
    try {
      const result = await analyzeSituation({ type: 'medical', userName: alert.userName,
        locationContext: alert.location ? `LAT ${alert.location.lat.toFixed(6)}, LNG ${alert.location.lng.toFixed(6)}` : 'UNKNOWN' });
      const batch = writeBatch(db);
      const update = { aiAnalysis: result.analysis };
      batch.update(doc(db, 'agency_alerts_medical', alert.id), update);
      batch.update(doc(db, 'users', alert.userId, 'alerts', alert.id), update);
      batch.update(doc(db, 'all_alerts', alert.id), update);
      await batch.commit();
      toast({ title: 'AI Triage complete' });
    } catch { toast({ variant: 'destructive', title: 'AI Analysis failed' }); }
    finally { setAnalyzingId(null); }
  };

  const updateStatus = async (alert: EmergencyAlert, status: 'responding' | 'resolved') => {
    if (!profile || !db) return;
    const batch = writeBatch(db);
    const data: Record<string, unknown> = { status };
    if (status === 'responding') { data.responderId = profile.uid; data.responderName = profile.name; data.responseStartTime = firestoreTimestamp(); }
    else { data.resolvedTime = firestoreTimestamp(); }
    batch.set(doc(db, 'agency_alerts_medical', alert.id), data, { merge: true });
    batch.set(doc(db, 'users', alert.userId, 'alerts', alert.id), data, { merge: true });
    batch.set(doc(db, 'all_alerts', alert.id), data, { merge: true });
    await batch.commit();
    toast({ title: `Alert marked as ${status}` });
    if (rtdb) push(ref(rtdb, 'live-logs'), { action: `Medical: ${profile.name} → ${status}`, userName: profile.name, timestamp: rtdbTimestamp() });
  };

  const pendingAlerts = alerts.filter(a => a.status === 'pending');
  const respondingAlerts = alerts.filter(a => a.status === 'responding');
  const resolvedAlerts = alerts.filter(a => a.status === 'resolved');
  const activeAlerts = alerts.filter(a => a.status !== 'resolved' && a.location);

  const markFalseReport = async (alert: EmergencyAlert) => {
    if (!profile || !db) return;
    const { getDoc, collection: fsCollection } = await import('firebase/firestore');
    const userRef = doc(db, 'users', alert.userId);
    const userSnap = await getDoc(userRef);
    const current = (userSnap.data()?.falseReportCount || 0);
    const next = current + 1;
    const shouldDeactivate = next >= 3;

    const batch = writeBatch(db);
    const alertData = { status: 'false_report' as AlertStatus, falseReportBy: profile.name, falseReportTime: firestoreTimestamp() };
    // Use set+merge so the batch never fails due to a missing document
    batch.set(doc(db, 'agency_alerts_medical', alert.id), alertData, { merge: true });
    batch.set(doc(db, 'users', alert.userId, 'alerts', alert.id), alertData, { merge: true });
    batch.set(doc(db, 'all_alerts', alert.id), alertData, { merge: true });

    // Update user: increment falseReportCount, deactivate if threshold reached
    const userUpdate: Record<string, any> = { falseReportCount: next };
    if (shouldDeactivate) userUpdate.isDeactivated = true;
    batch.set(userRef, userUpdate, { merge: true });

    // Write in-app warning notification to the user
    const notifRef = doc(fsCollection(db, 'users', alert.userId, 'notifications'));
    batch.set(notifRef, {
      id: notifRef.id,
      type: shouldDeactivate ? 'deactivated' : 'warning',
      title: shouldDeactivate
        ? 'Account Deactivated'
        : `False Report Warning (${next}/3)`,
      message: shouldDeactivate
        ? 'Your account has been deactivated due to 3 false emergency reports. Please contact the administrator to appeal.'
        : `Your report was marked as false by a responder. You have ${next} of 3 allowed violations. Your account will be deactivated upon reaching 3 false reports.`,
      timestamp: firestoreTimestamp(),
      read: false,
    });

    await batch.commit();
    toast({
      variant: 'destructive',
      title: 'Marked as False Report',
      description: shouldDeactivate
        ? `${alert.userName}'s account has been deactivated (3 false reports).`
        : `${alert.userName} now has ${next}/3 false report violation${next > 1 ? 's' : ''}.`,
    });
  };

  const deleteAlert = async (alert: EmergencyAlert) => {
    if (!db) return;
    try {
      const { deleteDoc } = await import('firebase/firestore');
      await Promise.all([
        deleteDoc(doc(db, 'agency_alerts_medical', alert.id)),
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
      <AgencySidebar currentView={currentView} onViewChange={setCurrentView} />
      <SidebarInset className="bg-[#080d1a] border-l border-white/5 overflow-y-auto h-screen min-w-0 flex-1 w-0">

        {currentView === 'profile' && (
          <div className="p-6">
            <AgencyProfileView agencyColor="text-red-400" badgeClass="bg-red-500/10 text-red-400 border-red-500/20" />
          </div>
        )}

        {currentView === 'dashboard' && (
          <div className="p-6 space-y-6 animate-in fade-in duration-500">

            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-2xl bg-red-500/15 border border-red-500/20 flex items-center justify-center">
                  <HeartPulse className="h-6 w-6 text-red-500" />
                </div>
                <div>
                  <h1 className="text-2xl font-black text-white tracking-tight">Medical Agency Dashboard</h1>
                  <p className="text-xs text-slate-400 mt-0.5">Emergency Medical Services — Real-time incident management</p>
                </div>
              </div>
              <AlertSoundButton soundEnabled={soundEnabled} sirenActive={sirenActive} onToggleSound={toggleSound}
                onPlaySiren={() => playSiren('medical')} onStopSiren={stopSiren} pendingCount={pendingAlerts.length} accentColor="red" />
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'Pending', value: pendingAlerts.length, color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
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
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

              {/* Alert list */}
              <div className="xl:col-span-2 space-y-4">
                {isLoading ? (
                  <div className="flex items-center justify-center py-24">
                    <Radio className="h-8 w-8 animate-spin text-red-500/30" />
                  </div>
                ) : alerts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-24 rounded-2xl bg-slate-900/40 border border-white/5">
                    <div className="h-16 w-16 rounded-2xl bg-green-500/10 border border-green-500/20 flex items-center justify-center mb-4">
                      <CheckCircle2 className="h-8 w-8 text-green-500" />
                    </div>
                    <h3 className="text-lg font-bold text-white">All Clear</h3>
                    <p className="text-sm text-slate-400 mt-1">No active medical incidents</p>
                  </div>
                ) : alerts.map(alert => (
                  <div key={alert.id} className={cn(
                    "rounded-2xl border overflow-hidden transition-all duration-300",
                    alert.status === 'pending' ? 'bg-red-500/5 border-red-500/30 shadow-[0_0_20px_rgba(239,68,68,0.08)]' :
                    alert.status === 'responding' ? 'bg-blue-500/5 border-blue-500/20' : 'bg-slate-900/40 border-white/5'
                  )}>
                    <div className={cn("h-1 w-full",
                      alert.status === 'pending' ? 'bg-red-500' :
                      alert.status === 'responding' ? 'bg-blue-500' : 'bg-slate-700'
                    )} />
                    <div className="p-5">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-start gap-3">
                          <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0",
                            alert.status === 'pending' ? 'bg-red-500/15' :
                            alert.status === 'responding' ? 'bg-blue-500/15' : 'bg-slate-800'
                          )}>
                            <HeartPulse className={cn("h-5 w-5",
                              alert.status === 'pending' ? 'text-red-400' :
                              alert.status === 'responding' ? 'text-blue-400' : 'text-slate-500'
                            )} />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-base font-black text-white">{alert.userName}</span>
                              {alert.status === 'pending' && (
                                <span className="text-[10px] font-bold text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full animate-pulse">CRITICAL</span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-xs text-slate-400">
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {alert.location ? `${alert.location.lat.toFixed(4)}, ${alert.location.lng.toFixed(4)}` : 'No GPS'}
                              </span>
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {alert.timestamp?.seconds ? format(alert.timestamp.toDate(), 'MMM d, h:mm a') : 'Live'}
                              </span>
                            </div>
                          </div>
                        </div>
                        <StatusBadge status={alert.status} />
                      </div>

                      {/* Reporter details */}
                      <div className="mb-4 p-3 rounded-xl bg-slate-800/60 border border-white/5">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Reporter Info</p>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                          <span className="text-slate-500">Name</span>
                          <span className="text-white font-semibold">{alert.userName}</span>
                          {(alert as any).userAge && <><span className="text-slate-500">Age</span><span className="text-white font-semibold">{(alert as any).userAge}</span></>}
                          {(alert as any).userSex && <><span className="text-slate-500">Sex</span><span className="text-white font-semibold">{(alert as any).userSex}</span></>}
                          {(alert as any).userEmail && <><span className="text-slate-500">Email</span><span className="text-white font-semibold truncate">{(alert as any).userEmail}</span></>}
                          {(alert as any).exactAddress && <><span className="text-slate-500">Address</span><span className="text-white font-semibold text-[11px] leading-tight">{(alert as any).exactAddress}</span></>}
                        </div>
                      </div>

                      {/* Photo Evidence */}
                      {(alert as any).photoEvidenceUrl && (
                        <div className="mb-4 rounded-xl overflow-hidden border border-white/10">
                          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-3 py-2 bg-slate-800/60 border-b border-white/5">Photo Evidence</p>
                          <a href={(alert as any).photoEvidenceUrl} target="_blank" rel="noopener noreferrer">
                            <img
                              src={(alert as any).photoEvidenceUrl}
                              alt="Photo evidence"
                              className="w-full max-h-56 object-cover hover:opacity-90 transition-opacity cursor-zoom-in"
                            />
                          </a>
                        </div>
                      )}

                      {alert.responderName && (
                        <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-xl bg-blue-500/10 border border-blue-500/20">
                          <User className="h-3.5 w-3.5 text-blue-400" />
                          <span className="text-xs text-blue-300 font-bold">Responding: {alert.responderName}</span>
                        </div>
                      )}

                      {alert.aiAnalysis ? (
                        <div className="mb-4 p-4 rounded-xl bg-slate-900/60 border border-red-500/10">
                          <div className="flex items-center gap-2 mb-2">
                            <BrainCircuit className="h-3.5 w-3.5 text-red-400" />
                            <span className="text-[10px] font-bold text-red-400 uppercase tracking-widest">AI Triage Analysis</span>
                          </div>
                          <p className="text-sm text-slate-300 leading-relaxed">{alert.aiAnalysis}</p>
                        </div>
                      ) : (
                        <Button variant="outline" size="sm"
                          className="w-full mb-4 border-red-500/20 bg-red-500/5 hover:bg-red-500/10 text-red-400 font-bold gap-2"
                          onClick={() => performAIAnalysis(alert)} disabled={analyzingId === alert.id}>
                          {analyzingId === alert.id ? <Zap className="h-4 w-4 animate-spin" /> : <BrainCircuit className="h-4 w-4" />}
                          {analyzingId === alert.id ? 'Analyzing...' : 'Run AI Triage Analysis'}
                        </Button>
                      )}

                      <div className="flex gap-3 flex-wrap">
                        {alert.status === 'pending' && (
                          <Button onClick={() => updateStatus(alert, 'responding')}
                            className="flex-1 bg-red-600 hover:bg-red-500 text-white font-bold gap-2 shadow-lg shadow-red-900/30">
                            <Navigation className="h-4 w-4" /> Dispatch Unit
                          </Button>
                        )}
                        {alert.status === 'responding' && (
                          <Button onClick={() => updateStatus(alert, 'resolved')}
                            className="flex-1 bg-green-600 hover:bg-green-500 text-white font-bold gap-2 shadow-lg shadow-green-900/30">
                            <CheckCircle2 className="h-4 w-4" /> Patient Stabilized
                          </Button>
                        )}
                        {alert.status !== 'resolved' && alert.status !== 'false_report' && (
                          <Button variant="outline" size="sm"
                            onClick={() => markFalseReport(alert)}
                            className="border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300 gap-1.5 font-bold">
                            <AlertTriangle className="h-3.5 w-3.5" /> False Report
                          </Button>
                        )}
                        {(alert.status === 'resolved' || alert.status === 'false_report') && (
                          <Button variant="outline" size="sm"
                            onClick={() => deleteAlert(alert)}
                            className="border-white/10 text-slate-500 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30 gap-1.5">
                            <Trash2 className="h-3.5 w-3.5" /> Delete
                          </Button>
                        )}
                        {alert.location && (
                          <Button variant="outline" size="sm"
                            className="border-white/10 text-slate-400 hover:text-white hover:bg-white/5 gap-1.5"
                            onClick={() => {
                              if (!alert.location) return;
                              const { lat, lng } = alert.location;
                              if (navigator.geolocation) {
                                navigator.geolocation.getCurrentPosition(
                                  (pos) => {
                                    const origin = `${pos.coords.latitude},${pos.coords.longitude}`;
                                    const dest = `${lat},${lng}`;
                                    window.open(`https://www.google.com/maps/dir/${origin}/${dest}`, '_blank');
                                  },
                                  () => {
                                    window.open(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`, '_blank');
                                  }
                                );
                              } else {
                                window.open(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`, '_blank');
                              }
                            }}
                          >
                            <MapPin className="h-4 w-4" /> View on Map
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Right panel */}
              <div className="space-y-4">
                <SectorVectorGrid
                  headerColor="bg-red-600"
                  activeAlerts={activeAlerts}
                  alertColor="#ef4444"
                  agencyLabel="🚑 Medical Emergency"
                  mapHref="/map"
                />

                <div className="rounded-2xl border border-white/5 bg-slate-900/40 overflow-hidden">
                  <div className="px-4 py-3 border-b border-white/5">
                    <span className="text-sm font-bold text-white">Recent Activity</span>
                  </div>
                  <div className="divide-y divide-white/5 max-h-64 overflow-y-auto">
                    {alerts.slice(0, 8).map(alert => (
                      <div key={alert.id} className="flex items-center gap-3 px-4 py-3">
                        <div className={cn("h-2 w-2 rounded-full flex-shrink-0",
                          alert.status === 'pending' ? 'bg-red-400 animate-pulse' :
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
                    {alerts.length === 0 && <div className="px-4 py-6 text-center text-slate-500 text-xs">No incidents yet</div>}
                  </div>
                </div>

                <div className="rounded-2xl border border-white/5 bg-slate-900/40 p-4">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Unit Status</p>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-300">Active units</span>
                      <span className="text-sm font-black text-red-400">{respondingAlerts.length}</span>
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
    </SidebarProvider>
  );
}
