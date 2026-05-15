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
  Flame, CheckCircle2, Navigation, MapPin, Zap, BrainCircuit,
  Radio, Activity, Clock, User, AlertTriangle, ChevronRight
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

// ─── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide",
      status === 'pending' ? 'bg-orange-500/15 text-orange-400' :
      status === 'responding' ? 'bg-blue-500/15 text-blue-400' :
      'bg-green-500/15 text-green-400'
    )}>
      <span className={cn(
        "h-1.5 w-1.5 rounded-full",
        status === 'pending' ? 'bg-orange-400 animate-pulse' :
        status === 'responding' ? 'bg-blue-400 animate-pulse' :
        'bg-green-400'
      )} />
      {status}
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

  const alertsQuery = useMemoFirebase(() => {
    if (!profile || !db) return null;
    return query(collection(db, 'agency_alerts_fire'), orderBy('timestamp', 'desc'));
  }, [db, profile?.uid]);

  const { data: alertsData, isLoading } = useCollection<EmergencyAlert>(alertsQuery);
  const alerts = alertsData || [];

  const { soundEnabled, toggleSound, playNewIncident, playSiren, stopSiren, sirenActive } = useAlertSound();
  const prevCountRef = useRef<number | null>(null);

  useEffect(() => {
    const pending = alerts.filter(a => a.status === 'pending').length;
    // prevCountRef.current === null means first load — don't sound on initial render
    if (prevCountRef.current !== null && pending > prevCountRef.current) {
      playNewIncident('fire');
      playSiren('fire');
    }
    prevCountRef.current = pending;
  }, [alerts, playNewIncident, playSiren]);

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
    const batch = writeBatch(db);
    const data: Record<string, unknown> = { status };
    if (status === 'responding') {
      data.responderId = profile.uid;
      data.responderName = profile.name;
      data.responseStartTime = firestoreTimestamp();
    } else {
      data.resolvedTime = firestoreTimestamp();
    }
    batch.update(doc(db, 'agency_alerts_fire', alert.id), data);
    batch.update(doc(db, 'users', alert.userId, 'alerts', alert.id), data);
    batch.update(doc(db, 'all_alerts', alert.id), data);
    await batch.commit();
    toast({ title: `Alert marked as ${status}` });
    if (rtdb) {
      push(ref(rtdb, 'live-logs'), {
        action: `Fire: ${profile.name} → ${status}`,
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
    batch.update(doc(db, 'agency_alerts_fire', alert.id), data);
    batch.update(doc(db, 'users', alert.userId, 'alerts', alert.id), data);
    batch.update(doc(db, 'all_alerts', alert.id), data);
    // Increment violation count on the user
    const userRef = doc(db, 'users', alert.userId);
    const { getDoc, updateDoc, increment } = await import('firebase/firestore');
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

        {/* ── Profile view ─────────────────────────────────────────────────── */}
        {currentView === 'profile' && (
          <div className="p-6">
            <AgencyProfileView
              agencyColor="text-orange-400"
              badgeClass="bg-orange-500/10 text-orange-400 border-orange-500/20"
            />
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
                  <h1 className="text-2xl font-black text-white tracking-tight">Fire Agency Dashboard</h1>
                  <p className="text-xs text-slate-400 mt-0.5">Bureau of Fire Protection — Real-time incident management</p>
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
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

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
                  alerts.map(alert => (
                    <div
                      key={alert.id}
                      className={cn(
                        "rounded-2xl border overflow-hidden transition-all duration-300",
                        alert.status === 'pending'
                          ? 'bg-orange-500/5 border-orange-500/30 shadow-[0_0_20px_rgba(249,115,22,0.08)]'
                          : alert.status === 'responding'
                          ? 'bg-blue-500/5 border-blue-500/20'
                          : 'bg-slate-900/40 border-white/5'
                      )}
                    >
                      {/* Top accent bar */}
                      <div className={cn(
                        "h-1 w-full",
                        alert.status === 'pending' ? 'bg-orange-500' :
                        alert.status === 'responding' ? 'bg-blue-500' : 'bg-slate-700'
                      )} />

                      <div className="p-5">
                        {/* Alert header */}
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex items-start gap-3">
                            <div className={cn(
                              "h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0",
                              alert.status === 'pending' ? 'bg-orange-500/15' :
                              alert.status === 'responding' ? 'bg-blue-500/15' : 'bg-slate-800'
                            )}>
                              <Flame className={cn(
                                "h-5 w-5",
                                alert.status === 'pending' ? 'text-orange-400' :
                                alert.status === 'responding' ? 'text-blue-400' : 'text-slate-500'
                              )} />
                            </div>
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-base font-black text-white">{alert.userName}</span>
                                {alert.status === 'pending' && (
                                  <span className="text-[10px] font-bold text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded-full animate-pulse">
                                    URGENT
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-3 text-xs text-slate-400">
                                <span className="flex items-center gap-1">
                                  <MapPin className="h-3 w-3" />
                                  {alert.location
                                    ? `${alert.location.lat.toFixed(4)}, ${alert.location.lng.toFixed(4)}`
                                    : 'No GPS'}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {alert.timestamp?.seconds
                                    ? format(alert.timestamp.toDate(), 'MMM d, h:mm a')
                                    : 'Live'}
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
                            {(alert as any).userAge && <>
                              <span className="text-slate-500">Age</span>
                              <span className="text-white font-semibold">{(alert as any).userAge}</span>
                            </>}
                            {(alert as any).userSex && <>
                              <span className="text-slate-500">Sex</span>
                              <span className="text-white font-semibold">{(alert as any).userSex}</span>
                            </>}
                            {(alert as any).userEmail && <>
                              <span className="text-slate-500">Email</span>
                              <span className="text-white font-semibold truncate">{(alert as any).userEmail}</span>
                            </>}
                            {(alert as any).exactAddress && <>
                              <span className="text-slate-500">Address</span>
                              <span className="text-white font-semibold text-[11px] leading-tight">{(alert as any).exactAddress}</span>
                            </>}
                          </div>
                        </div>

                        {/* Responder info */}
                        {alert.responderName && (
                          <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-xl bg-blue-500/10 border border-blue-500/20">
                            <User className="h-3.5 w-3.5 text-blue-400" />
                            <span className="text-xs text-blue-300 font-bold">Responding: {alert.responderName}</span>
                          </div>
                        )}

                        {/* AI Analysis */}
                        {alert.aiAnalysis ? (
                          <div className="mb-4 p-4 rounded-xl bg-slate-900/60 border border-orange-500/10">
                            <div className="flex items-center gap-2 mb-2">
                              <BrainCircuit className="h-3.5 w-3.5 text-orange-400" />
                              <span className="text-[10px] font-bold text-orange-400 uppercase tracking-widest">AI Tactical Analysis</span>
                            </div>
                            <p className="text-sm text-slate-300 leading-relaxed">{alert.aiAnalysis}</p>
                          </div>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full mb-4 border-orange-500/20 bg-orange-500/5 hover:bg-orange-500/10 text-orange-400 font-bold gap-2"
                            onClick={() => performAIAnalysis(alert)}
                            disabled={analyzingId === alert.id}
                          >
                            {analyzingId === alert.id
                              ? <Zap className="h-4 w-4 animate-spin" />
                              : <BrainCircuit className="h-4 w-4" />}
                            {analyzingId === alert.id ? 'Analyzing...' : 'Run AI Analysis'}
                          </Button>
                        )}

                        {/* Action buttons */}
                        <div className="flex gap-3 flex-wrap">
                          {alert.status === 'pending' && (
                            <Button
                              onClick={() => updateStatus(alert, 'responding')}
                              className="flex-1 bg-orange-600 hover:bg-orange-500 text-white font-bold gap-2 shadow-lg shadow-orange-900/30"
                            >
                              <Navigation className="h-4 w-4" /> Respond
                            </Button>
                          )}
                          {alert.status === 'responding' && (
                            <Button
                              onClick={() => updateStatus(alert, 'resolved')}
                              className="flex-1 bg-green-600 hover:bg-green-500 text-white font-bold gap-2 shadow-lg shadow-green-900/30"
                            >
                              <CheckCircle2 className="h-4 w-4" /> Mark Resolved
                            </Button>
                          )}
                          {alert.status !== 'resolved' && alert.status !== 'false_report' as any && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => markFalseReport(alert)}
                              className="border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300 gap-1.5 font-bold"
                            >
                              <AlertTriangle className="h-3.5 w-3.5" /> False Report
                            </Button>
                          )}
                          {alert.location && (
                            <Button
                              variant="outline"
                              size="sm"
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
                  ))
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
    </SidebarProvider>
  );
}
