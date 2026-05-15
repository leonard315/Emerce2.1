"use client";

import { useState, useEffect, useRef } from 'react';
import { collection, query, orderBy, doc, writeBatch, serverTimestamp as firestoreTimestamp } from 'firebase/firestore';
import { ref, push, serverTimestamp as rtdbTimestamp } from 'firebase/database';
import { useFirestore, useCollection, useDatabase, useMemoFirebase } from '@/firebase';
import { EmergencyAlert } from '@/lib/types';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from '@/hooks/use-auth';
import { useToast } from "@/hooks/use-toast";
import {
  ShieldCheck, CheckCircle2, Navigation, MapPin, Zap, BrainCircuit,
  Radio, Clock, User, ChevronRight, AlertTriangle
} from 'lucide-react';
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
      status === 'pending' ? 'bg-blue-500/15 text-blue-400' :
      status === 'responding' ? 'bg-purple-500/15 text-purple-400' :
      'bg-green-500/15 text-green-400'
    )}>
      <span className={cn(
        "h-1.5 w-1.5 rounded-full",
        status === 'pending' ? 'bg-blue-400 animate-pulse' :
        status === 'responding' ? 'bg-purple-400 animate-pulse' :
        'bg-green-400'
      )} />
      {status}
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
    if (!profile || !db) return null;
    return query(collection(db, 'agency_alerts_police'), orderBy('timestamp', 'desc'));
  }, [db, profile?.uid]);

  const { data: alertsData, isLoading } = useCollection<EmergencyAlert>(alertsQuery);
  const alerts = alertsData || [];

  const { soundEnabled, toggleSound, playNewIncident, playSiren, stopSiren, sirenActive } = useAlertSound();
  const prevCountRef = useRef<number | null>(null);

  useEffect(() => {
    const pending = alerts.filter(a => a.status === 'pending').length;
    if (prevCountRef.current !== null && pending > prevCountRef.current) {
      playNewIncident('police');
      playSiren('police');
    }
    prevCountRef.current = pending;
  }, [alerts, playNewIncident, playSiren]);

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
    batch.update(doc(db, 'agency_alerts_police', alert.id), data);
    batch.update(doc(db, 'users', alert.userId, 'alerts', alert.id), data);
    batch.update(doc(db, 'all_alerts', alert.id), data);
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
    const batch = writeBatch(db);
    const data = { status: 'false_report' as any, falseReportBy: profile.name, falseReportTime: firestoreTimestamp() };
    batch.update(doc(db, 'agency_alerts_police', alert.id), data);
    batch.update(doc(db, 'users', alert.userId, 'alerts', alert.id), data);
    batch.update(doc(db, 'all_alerts', alert.id), data);
    const { getDoc, updateDoc } = await import('firebase/firestore');
    const userRef = doc(db, 'users', alert.userId);
    const userSnap = await getDoc(userRef);
    const violations = (userSnap.data()?.violations || 0) + 1;
    await updateDoc(userRef, { violations });
    await batch.commit();
    toast({
      variant: 'destructive',
      title: 'Marked as False Report',
      description: `${alert.userName} now has ${violations} violation${violations > 1 ? 's' : ''}${violations >= 3 ? ' — account flagged for suspension' : ''}.`,
    });
  };

  return (
    <SidebarProvider style={{ '--sidebar-width': '18rem' } as React.CSSProperties}>
      <AgencySidebar currentView={currentView} onViewChange={setCurrentView} />
      <SidebarInset className="bg-[#080d1a] border-l border-white/5 overflow-y-auto h-screen min-w-0 flex-1 w-0">

        {currentView === 'profile' && (
          <div className="p-6">
            <AgencyProfileView
              agencyColor="text-blue-400"
              badgeClass="bg-blue-500/10 text-blue-400 border-blue-500/20"
            />
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
                  <h1 className="text-2xl font-black text-white tracking-tight">Police Agency Dashboard</h1>
                  <p className="text-xs text-slate-400 mt-0.5">Philippine National Police — Real-time incident management</p>
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

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
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
                  alerts.map(alert => (
                    <div key={alert.id} className={cn(
                      "rounded-2xl border overflow-hidden transition-all duration-300",
                      alert.status === 'pending' ? 'bg-blue-500/5 border-blue-500/30 shadow-[0_0_20px_rgba(59,130,246,0.08)]' :
                      alert.status === 'responding' ? 'bg-purple-500/5 border-purple-500/20' :
                      'bg-slate-900/40 border-white/5'
                    )}>
                      <div className={cn("h-1 w-full",
                        alert.status === 'pending' ? 'bg-blue-500' :
                        alert.status === 'responding' ? 'bg-purple-500' : 'bg-slate-700'
                      )} />
                      <div className="p-5">
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex items-start gap-3">
                            <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0",
                              alert.status === 'pending' ? 'bg-blue-500/15' :
                              alert.status === 'responding' ? 'bg-purple-500/15' : 'bg-slate-800'
                            )}>
                              <ShieldCheck className={cn("h-5 w-5",
                                alert.status === 'pending' ? 'text-blue-400' :
                                alert.status === 'responding' ? 'text-purple-400' : 'text-slate-500'
                              )} />
                            </div>
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-base font-black text-white">{alert.userName}</span>
                                {alert.status === 'pending' && (
                                  <span className="text-[10px] font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full animate-pulse">URGENT</span>
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
                        <div className="mb-4 p-3 rounded-xl bg-slate-800/60 border border-white/5 space-y-1.5">
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

                        {alert.responderName && (
                          <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-xl bg-purple-500/10 border border-purple-500/20">
                            <User className="h-3.5 w-3.5 text-purple-400" />
                            <span className="text-xs text-purple-300 font-bold">Responding: {alert.responderName}</span>
                          </div>
                        )}

                        {alert.aiAnalysis ? (
                          <div className="mb-4 p-4 rounded-xl bg-slate-900/60 border border-blue-500/10">
                            <div className="flex items-center gap-2 mb-2">
                              <BrainCircuit className="h-3.5 w-3.5 text-blue-400" />
                              <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">AI Tactical Analysis</span>
                            </div>
                            <p className="text-sm text-slate-300 leading-relaxed">{alert.aiAnalysis}</p>
                          </div>
                        ) : (
                          <Button variant="outline" size="sm"
                            className="w-full mb-4 border-blue-500/20 bg-blue-500/5 hover:bg-blue-500/10 text-blue-400 font-bold gap-2"
                            onClick={() => performAIAnalysis(alert)}
                            disabled={analyzingId === alert.id}
                          >
                            {analyzingId === alert.id ? <Zap className="h-4 w-4 animate-spin" /> : <BrainCircuit className="h-4 w-4" />}
                            {analyzingId === alert.id ? 'Analyzing...' : 'Run AI Analysis'}
                          </Button>
                        )}

                        <div className="flex gap-3 flex-wrap">
                          {alert.status === 'pending' && (
                            <Button onClick={() => updateStatus(alert, 'responding')}
                              className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold gap-2 shadow-lg shadow-blue-900/30">
                              <Navigation className="h-4 w-4" /> Respond
                            </Button>
                          )}
                          {alert.status === 'responding' && (
                            <Button onClick={() => updateStatus(alert, 'resolved')}
                              className="flex-1 bg-green-600 hover:bg-green-500 text-white font-bold gap-2 shadow-lg shadow-green-900/30">
                              <CheckCircle2 className="h-4 w-4" /> Mark Resolved
                            </Button>
                          )}
                          {alert.status !== 'resolved' && alert.status !== 'false_report' as any && (
                            <Button variant="outline" size="sm"
                              onClick={() => markFalseReport(alert)}
                              className="border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300 gap-1.5 font-bold">
                              <AlertTriangle className="h-3.5 w-3.5" /> False Report
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
                                      // No GPS — just show the destination
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
                  ))
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
