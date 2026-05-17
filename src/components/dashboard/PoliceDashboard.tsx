"use client";

import { useState, useEffect, useRef } from 'react';
import { collection, query, orderBy, doc, writeBatch, serverTimestamp as firestoreTimestamp, getDoc, deleteDoc } from 'firebase/firestore';
import { ref, push, serverTimestamp as rtdbTimestamp } from 'firebase/database';
import { useFirestore, useCollection, useDatabase, useMemoFirebase } from '@/firebase';
import { EmergencyAlert, AlertStatus } from '@/lib/types';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from '@/hooks/use-auth';
import { useToast } from "@/hooks/use-toast";
import {
  ShieldCheck, CheckCircle2, Navigation, MapPin, Zap, BrainCircuit,
  Radio, Clock, User, ChevronRight, AlertTriangle, Trash2
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
import { SectorVectorGrid } from "./SectorVectorGrid";
import { DashboardHeader } from "./DashboardHeader";
import Link from 'next/link';

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide",
      status === 'pending' ? 'bg-blue-500/15 text-blue-400' :
      status === 'responding' ? 'bg-purple-500/15 text-purple-400' :
      status === 'false_report' ? 'bg-red-900/40 text-red-400' :
      'bg-green-500/15 text-green-400'
    )}>
      <span className={cn(
        "h-1.5 w-1.5 rounded-full",
        status === 'pending' ? 'bg-blue-400 animate-pulse' :
        status === 'responding' ? 'bg-purple-400 animate-pulse' :
        status === 'false_report' ? 'bg-red-400' :
        'bg-green-400'
      )} />
      {status === 'false_report' ? 'False Report' : status}
    </span>
  );
}

export function PoliceDashboard() {
  const { profile } = useAuth();
  const db = useFirestore();
  const rtdb = useDatabase();
  const { toast } = useToast();
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState("dashboard");

  const alertsQuery = useMemoFirebase(() => {
    if (!db) return null;
    return query(collection(db, 'agency_alerts_police'), orderBy('timestamp', 'desc'));
  }, [db]);

  const { data: alertsData, isLoading } = useCollection<EmergencyAlert>(alertsQuery);
  const alerts = alertsData || [];

  const mediaQuery = useMemoFirebase(() => {
    if (!db) return null;
    return query(collection(db, 'alert_media'), orderBy('timestamp', 'desc'));
  }, [db]);
  const { data: mediaData } = useCollection<any>(mediaQuery);
  const mediaMap = (mediaData || []).reduce((acc: Record<string, any>, m: any) => {
    acc[m.alertId] = m; return acc;
  }, {});

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
      playNewIncident('police');
      playSiren('police');
    } else if (pending < prevCountRef.current) {
      stopSiren();
    }
    prevCountRef.current = pending;
  }, [alerts, isLoading, playNewIncident, playSiren, stopSiren]);

  const performAIAnalysis = async (alert: EmergencyAlert) => {
    if (!db) return;
    setAnalyzingId(alert.id);
    try {
      const result = await analyzeSituation({
        type: 'crime',
        userName: alert.userName,
        locationContext: alert.location
          ? `LAT ${alert.location.lat.toFixed(6)}, LNG ${alert.location.lng.toFixed(6)}`
          : 'UNKNOWN LOCATION',
      });
      const batch = writeBatch(db);
      const update = { aiAnalysis: result.analysis };
      batch.update(doc(db, 'agency_alerts_police', alert.id), update);
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
    const batch = writeBatch(db);
    const data: Record<string, unknown> = { status };
    if (status === 'responding') {
      data.responderId = profile.uid;
      data.responderName = profile.name;
      data.responseStartTime = firestoreTimestamp();
    } else {
      data.resolvedTime = firestoreTimestamp();
    }
    batch.set(doc(db, 'agency_alerts_police', alert.id), data, { merge: true });
    batch.set(doc(db, 'users', alert.userId, 'alerts', alert.id), data, { merge: true });
    batch.set(doc(db, 'all_alerts', alert.id), data, { merge: true });

    // Notify reporter of status change
    const notifRef = doc(collection(db, 'users', alert.userId, 'notifications'));
    batch.set(notifRef, {
      id: notifRef.id,
      type: 'status_update',
      title: status === 'responding' ? 'Responder On The Way' : 'Incident Resolved',
      message: status === 'responding'
        ? `${profile.name} from Security is responding to your report.`
        : `Your incident report has been resolved by ${profile.name}.`,
      timestamp: firestoreTimestamp(),
      read: false,
    });

    await batch.commit();
    toast({ title: `Alert marked as ${status}` });
    if (rtdb) {
      push(ref(rtdb, 'live-logs'), {
        action: `Police: ${profile.name} → ${status}`,
        userName: profile.name,
        timestamp: rtdbTimestamp(),
      });
    }
  };

  const pendingAlerts = alerts.filter(a => a.status === 'pending');
  const respondingAlerts = alerts.filter(a => a.status === 'responding');
  const resolvedAlerts = alerts.filter(a => a.status === 'resolved');
  const activeAlerts = alerts.filter(a => a.status !== 'resolved' && a.location);

  const markFalseReport = async (alert: EmergencyAlert) => {
    if (!profile || !db) return;
    const userRef = doc(db, 'users', alert.userId);
    const userSnap = await getDoc(userRef);
    const current = (userSnap.data()?.falseReportCount || 0);
    const next = current + 1;
    const shouldDeactivate = next >= 3;

    const batch = writeBatch(db);
    const alertData = { status: 'false_report' as AlertStatus, falseReportBy: profile.name, falseReportTime: firestoreTimestamp() };
    // Use set+merge so the batch never fails due to a missing document
    batch.set(doc(db, 'agency_alerts_police', alert.id), alertData, { merge: true });
    batch.set(doc(db, 'users', alert.userId, 'alerts', alert.id), alertData, { merge: true });
    batch.set(doc(db, 'all_alerts', alert.id), alertData, { merge: true });

    // Update user: increment falseReportCount, deactivate if threshold reached
    const userUpdate: Record<string, any> = { falseReportCount: next };
    if (shouldDeactivate) userUpdate.isDeactivated = true;
    batch.set(userRef, userUpdate, { merge: true });

    // Write in-app warning notification to the user
    const notifRef = doc(collection(db, 'users', alert.userId, 'notifications'));
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
      await Promise.all([
        deleteDoc(doc(db, 'agency_alerts_police', alert.id)),
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

        {currentView === 'profile' && (
          <div className="p-6">
            <AgencyProfileView
              agencyColor="text-blue-400"
              badgeClass="bg-blue-500/10 text-blue-400 border-blue-500/20"
            />
          </div>
        )}

        {currentView === 'settings' && (
          <div className="p-6">
            <AgencySettings />
          </div>
        )}

        {currentView === 'dashboard' && (
          <div className="p-6 space-y-6 animate-in fade-in duration-500">

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-2xl bg-blue-500/15 border border-blue-500/20 flex items-center justify-center">
                  <ShieldCheck className="h-6 w-6 text-blue-500" />
                </div>
                <div>
                  <h1 className="text-2xl font-black text-white tracking-tight">Security Dashboard</h1>
                  <p className="text-xs text-slate-400 mt-0.5">School Security Department — Real-time incident management</p>
                </div>
              </div>
              <AlertSoundButton
                soundEnabled={soundEnabled}
                sirenActive={sirenActive}
                onToggleSound={toggleSound}
                onPlaySiren={() => playSiren('police')}
                onStopSiren={stopSiren}
                pendingCount={pendingAlerts.length}
                accentColor="blue"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'Pending', value: pendingAlerts.length, color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
                { label: 'Responding', value: respondingAlerts.length, color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20' },
                { label: 'Resolved', value: resolvedAlerts.length, color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/20' },
              ].map(s => (
                <div key={s.label} className={cn("rounded-2xl border p-4", s.bg)}>
                  <p className="text-xs text-slate-400 uppercase tracking-widest font-bold">{s.label}</p>
                  <p className={cn("text-3xl font-black mt-1", s.color)}>{s.value}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="xl:col-span-2 space-y-4">
                {isLoading ? (
                  <div className="flex items-center justify-center py-24">
                    <Radio className="h-8 w-8 animate-spin text-blue-500/30" />
                  </div>
                ) : alerts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-24 rounded-2xl bg-slate-900/40 border border-white/5">
                    <div className="h-16 w-16 rounded-2xl bg-green-500/10 border border-green-500/20 flex items-center justify-center mb-4">
                      <CheckCircle2 className="h-8 w-8 text-green-500" />
                    </div>
                    <h3 className="text-lg font-bold text-white">All Clear</h3>
                    <p className="text-sm text-slate-400 mt-1">No active crime incidents</p>
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
                    <div key={alert.id} className={cn(
                      "rounded-2xl border overflow-hidden transition-all duration-300",
                      isPending ? 'bg-blue-500/5 border-blue-500/40 shadow-[0_0_24px_rgba(59,130,246,0.12)]' :
                      isResponding ? 'bg-purple-500/5 border-purple-500/30' :
                      isFalse ? 'bg-red-900/10 border-red-900/30' :
                      'bg-slate-900/40 border-white/5'
                    )}>
                      <div className={cn("h-1 w-full", isPending ? 'bg-blue-500' : isResponding ? 'bg-purple-500' : isFalse ? 'bg-red-700' : 'bg-slate-700')} />
                      <div className="p-4 sm:p-5 space-y-4">
                        {/* Header */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={cn("h-11 w-11 rounded-2xl flex items-center justify-center flex-shrink-0",
                              isPending ? 'bg-blue-500/20' : isResponding ? 'bg-purple-500/20' : 'bg-slate-800'
                            )}>
                              {(alert as any).userPhotoURL
                                ? <img src={(alert as any).userPhotoURL} alt="" className="h-11 w-11 rounded-2xl object-cover" />
                                : <ShieldCheck className={cn("h-5 w-5", isPending ? 'text-blue-400' : isResponding ? 'text-purple-400' : 'text-slate-500')} />}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-base font-black text-white truncate">{alert.userName}</span>
                                {isPending && <span className="text-[10px] font-bold text-blue-400 bg-blue-500/15 px-2 py-0.5 rounded-full animate-pulse shrink-0">URGENT</span>}
                              </div>
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 text-[11px] text-slate-400">
                                <span className="flex items-center gap-1"><MapPin className="h-3 w-3 shrink-0" />{alert.location ? `${alert.location.lat.toFixed(4)}, ${alert.location.lng.toFixed(4)}` : 'No GPS'}</span>
                                <span className="flex items-center gap-1"><Clock className="h-3 w-3 shrink-0" />{alert.timestamp?.seconds ? format(alert.timestamp.toDate(), 'MMM d, h:mm a') : 'Live'}</span>
                              </div>
                            </div>
                          </div>
                          <StatusBadge status={alert.status} />
                        </div>
                        {/* Reporter info */}
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
                        </div>
                        {/* Photo */}
                        {photo && (
                          <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-slate-800/50 border border-white/10">
                            <a href={photo} target="_blank" rel="noopener noreferrer" className="flex-shrink-0">
                              <img src={photo} alt="Evidence" className="h-12 w-12 rounded-lg object-cover border border-white/10 hover:opacity-80 transition-opacity cursor-zoom-in" />
                            </a>
                            <div className="flex-1 min-w-0">
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Photo Evidence</p>
                              <p className="text-xs text-slate-500 mt-0.5 truncate">Tap thumbnail to view full size</p>
                            </div>
                            <a href={photo} target="_blank" rel="noopener noreferrer" className="text-[10px] font-bold text-blue-400 hover:text-blue-300 shrink-0 transition-colors">View →</a>
                          </div>
                        )}
                        {/* Voice */}
                        {voice && (
                          <div className="rounded-xl border border-white/10 bg-slate-800/50 overflow-hidden">
                            <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5">
                              <Activity className="h-3.5 w-3.5 text-slate-400" />
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Voice Note</p>
                            </div>
                            <div className="px-3 py-2"><audio src={voice} controls className="w-full h-8" /></div>
                          </div>
                        )}
                        {/* Responder */}
                        {alert.responderName && (
                          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-purple-500/10 border border-purple-500/20">
                            <User className="h-3.5 w-3.5 text-purple-400 shrink-0" />
                            <span className="text-xs text-purple-300 font-bold truncate">Responding: {alert.responderName}</span>
                          </div>
                        )}
                        {/* AI */}
                        {alert.aiAnalysis ? (
                          <div className="p-3 rounded-xl bg-slate-900/60 border border-blue-500/10">
                            <div className="flex items-center gap-2 mb-2"><BrainCircuit className="h-3.5 w-3.5 text-blue-400 shrink-0" /><span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">AI Tactical Analysis</span></div>
                            <p className="text-xs text-slate-300 leading-relaxed">{alert.aiAnalysis}</p>
                          </div>
                        ) : (
                          <Button variant="outline" size="sm" className="w-full border-blue-500/20 bg-blue-500/5 hover:bg-blue-500/10 text-blue-400 font-bold gap-2" onClick={() => performAIAnalysis(alert)} disabled={analyzingId === alert.id}>
                            {analyzingId === alert.id ? <Zap className="h-4 w-4 animate-spin" /> : <BrainCircuit className="h-4 w-4" />}
                            {analyzingId === alert.id ? 'Analyzing...' : 'Run AI Analysis'}
                          </Button>
                        )}
                        {/* Actions */}
                        <div className="flex flex-wrap gap-2 pt-1">
                          {isPending && <Button onClick={() => updateStatus(alert, 'responding')} className="flex-1 min-w-[120px] bg-blue-600 hover:bg-blue-500 text-white font-bold gap-2 h-10"><Navigation className="h-4 w-4" /> Respond</Button>}
                          {isResponding && <Button onClick={() => updateStatus(alert, 'resolved')} className="flex-1 min-w-[120px] bg-green-600 hover:bg-green-500 text-white font-bold gap-2 h-10"><CheckCircle2 className="h-4 w-4" /> Mark Resolved</Button>}
                          {!isResolved && !isFalse && <Button variant="outline" size="sm" onClick={() => markFalseReport(alert)} className="h-10 border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300 gap-1.5 font-bold"><AlertTriangle className="h-3.5 w-3.5" /> False Report</Button>}
                          {(isResolved || isFalse) && <Button variant="outline" size="sm" onClick={() => deleteAlert(alert)} className="h-10 border-white/10 text-slate-500 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30 gap-1.5"><Trash2 className="h-3.5 w-3.5" /> Delete</Button>}
                          {alert.location && (
                            <Button variant="outline" size="sm" className="h-10 border-white/10 text-slate-400 hover:text-white hover:bg-white/5 gap-1.5"
                              onClick={() => { const { lat, lng } = alert.location!; if (navigator.geolocation) { navigator.geolocation.getCurrentPosition(pos => window.open(`https://www.google.com/maps/dir/${pos.coords.latitude},${pos.coords.longitude}/${lat},${lng}`, '_blank'), () => window.open(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`, '_blank')); } else window.open(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`, '_blank'); }}>
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

              <div className="space-y-4">
                <SectorVectorGrid
                  headerColor="bg-blue-600"
                  activeAlerts={activeAlerts}
                  alertColor="#3b82f6"
                  agencyLabel="🚔 Crime Emergency"
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
                          alert.status === 'pending' ? 'bg-blue-400 animate-pulse' :
                          alert.status === 'responding' ? 'bg-purple-400' : 'bg-green-400'
                        )} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-white truncate">{alert.userName}</p>
                          <p className="text-[10px] text-slate-500">{alert.timestamp?.seconds ? format(alert.timestamp.toDate(), 'h:mm a') : 'Live'}</p>
                        </div>
                        <StatusBadge status={alert.status} />
                      </div>
                    ))}
                    {alerts.length === 0 && <div className="px-4 py-6 text-center text-slate-500 text-xs">No incidents yet</div>}
                  </div>
                </div>

                <div className="rounded-2xl border border-white/5 bg-slate-900/40 p-4">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Responder Status</p>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-300">Active responders</span>
                      <span className="text-sm font-black text-blue-400">{respondingAlerts.length}</span>
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
