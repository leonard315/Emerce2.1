"use client";

import { useMemo, useState } from 'react';
import { collection, query, where, orderBy, doc, updateDoc, serverTimestamp as firestoreTimestamp } from 'firebase/firestore';
import { ref, push, serverTimestamp as rtdbTimestamp } from 'firebase/database';
import { useFirestore, useCollection, useDatabase } from '@/firebase';
import { EmergencyAlert } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from '@/hooks/use-auth';
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, Navigation, MapPin, Zap, BrainCircuit, Clock, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { analyzeSituation } from '@/ai/flows/analyze-situation-flow';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';

export function AgencyDashboard() {
  const { profile } = useAuth();
  const db = useFirestore();
  const rtdb = useDatabase();
  const { toast } = useToast();
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);

  const agencyTypeMap: Record<string, string> = {
    fire: 'fire',
    police: 'crime',
    medical: 'medical'
  };

  const emergencyType = profile ? agencyTypeMap[profile.role] : null;

  const alertsQuery = useMemo(() => {
    if (!profile || !db || !emergencyType) return null;
    return query(
      collection(db, 'alerts'),
      where('type', '==', emergencyType),
      orderBy('timestamp', 'desc')
    );
  }, [db, profile, emergencyType]);

  const { data: alertsRaw } = useCollection<EmergencyAlert>(alertsQuery);
  const alerts: EmergencyAlert[] = alertsRaw ?? [];

  const performAIAnalysis = async (alert: EmergencyAlert) => {
    if (!db) return;
    setAnalyzingId(alert.id);
    try {
      const result = await analyzeSituation({
        type: alert.type,
        userName: alert.userName,
        locationContext: alert.location ? `LAT ${alert.location.lat}, LNG ${alert.location.lng}` : 'Unknown'
      });

      const alertRef = doc(db, 'alerts', alert.id);
      updateDoc(alertRef, { aiAnalysis: result.analysis });
      toast({ title: "AI Intelligence Updated", description: "Tactical advice has been added to the alert." });
    } catch (e) {
      toast({ variant: "destructive", title: "AI Analysis Failed" });
    } finally {
      setAnalyzingId(null);
    }
  };

  const updateStatus = (alertId: string, status: 'responding' | 'resolved') => {
    if (!profile || !db) return;
    const alertRef = doc(db, 'alerts', alertId);
    
    const updateData: any = { status };
    if (status === 'responding') {
      updateData.responderId = profile.uid;
      updateData.responderName = profile.name;
      updateData.responseStartTime = firestoreTimestamp();
    } else if (status === 'resolved') {
      updateData.resolvedTime = firestoreTimestamp();
    }

    updateDoc(alertRef, updateData)
      .then(() => {
        toast({ title: `Alert ${status === 'responding' ? 'Accepted' : 'Resolved'}` });
        if (rtdb) {
          push(ref(rtdb, 'live-logs'), {
            action: `${profile.name} updated alert status to ${status}`,
            userName: profile.name,
            timestamp: rtdbTimestamp()
          });
        }
      })
      .catch(async (error) => {
        const permissionError = new FirestorePermissionError({
          path: alertRef.path,
          operation: 'update',
          requestResourceData: updateData,
        } satisfies SecurityRuleContext);
        errorEmitter.emit('permission-error', permissionError);
      });
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black tracking-tight uppercase flex items-center gap-3">
            {profile?.role} Operations <Badge className="bg-primary/10 text-primary animate-pulse border-primary/20">Active Command</Badge>
          </h1>
          <p className="text-muted-foreground mt-1">Real-time dispatch and tactical intelligence center.</p>
        </div>
        <div className="flex items-center gap-4 bg-white/50 p-2 rounded-2xl border shadow-sm backdrop-blur-sm">
           <div className="text-right px-4">
              <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Global Status</p>
              <p className="text-sm font-black text-green-600">CONNECTED</p>
           </div>
           <div className="h-10 w-[1px] bg-border" />
           <Zap className="text-yellow-500 h-6 w-6 mr-2" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          {alerts.length === 0 ? (
            <Card className="glass flex flex-col items-center justify-center py-24 text-center">
              <div className="h-20 w-20 rounded-full bg-green-50 flex items-center justify-center mb-4">
                <CheckCircle2 className="h-10 w-10 text-green-500" />
              </div>
              <h2 className="text-xl font-bold">No Active Emergencies</h2>
              <p className="text-muted-foreground">The community is currently safe. Stay vigilant.</p>
            </Card>
          ) : (
            alerts.map(alert => (
              <Card key={alert.id} className={`glass overflow-hidden border-l-[12px] transition-all duration-500 ${alert.status === 'pending' ? 'border-l-destructive shadow-2xl animate-in slide-in-from-right-4' : 'border-l-primary'}`}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                       <Badge className={`px-4 py-1 font-black ${alert.type === 'fire' ? 'bg-fire' : alert.type === 'crime' ? 'bg-crime' : 'bg-medical'}`}>
                        {alert.type.toUpperCase()}
                      </Badge>
                      {alert.status === 'pending' && <Badge variant="destructive" className="animate-pulse">CRITICAL</Badge>}
                    </div>
                    <CardTitle className="text-3xl font-black pt-2">{alert.userName}</CardTitle>
                    <CardDescription className="flex items-center gap-2 text-md">
                      <MapPin className="h-4 w-4" /> 
                      {alert.location ? `${alert.location.lat.toFixed(6)}, ${alert.location.lng.toFixed(6)}` : 'Location Not Provided'}
                    </CardDescription>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-tighter">Alert Time</p>
                    <p className="text-2xl font-mono font-bold">
                       {alert.timestamp?.seconds ? format(alert.timestamp.toDate(), 'HH:mm:ss') : '--:--:--'}
                    </p>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {alert.aiAnalysis ? (
                    <div className="bg-primary/5 border border-primary/10 p-4 rounded-2xl space-y-2">
                       <div className="flex items-center gap-2 text-primary font-bold text-xs">
                          <BrainCircuit className="h-4 w-4" /> AI TACTICAL ADVICE
                       </div>
                       <p className="text-sm italic text-foreground/80 leading-relaxed">{alert.aiAnalysis}</p>
                    </div>
                  ) : (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full border-dashed border-2 hover:bg-primary/5 group"
                      onClick={() => performAIAnalysis(alert)}
                      disabled={analyzingId === alert.id}
                    >
                      {analyzingId === alert.id ? (
                        <Zap className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <BrainCircuit className="h-4 w-4 mr-2 group-hover:animate-bounce" />
                      )}
                      Generate Situation Intelligence
                    </Button>
                  )}
                </CardContent>
                <CardFooter className="bg-slate-50/50 border-t flex justify-between items-center p-6">
                  <div className="flex items-center gap-3 text-sm font-medium">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    Status: <Badge variant={alert.status === 'pending' ? 'destructive' : 'default'} className="capitalize">{alert.status}</Badge>
                  </div>
                  <div className="flex gap-2">
                    {alert.status === 'pending' && (
                      <Button onClick={() => updateStatus(alert.id, 'responding')} className="bg-primary hover:shadow-lg font-bold">
                        <Navigation className="mr-2 h-4 w-4" /> Accept & Respond
                      </Button>
                    )}
                    {alert.status === 'responding' && (
                      <Button onClick={() => updateStatus(alert.id, 'resolved')} className="bg-green-600 hover:bg-green-700 font-bold">
                        <CheckCircle2 className="mr-2 h-4 w-4" /> Resolve Incident
                      </Button>
                    )}
                  </div>
                </CardFooter>
              </Card>
            ))
          )}
        </div>

        <div className="space-y-6">
          <Card className="glass overflow-hidden h-[400px]">
             <CardHeader className="bg-slate-900 text-white">
                <CardTitle className="text-sm flex items-center gap-2 uppercase tracking-widest font-black">
                   <Navigation className="h-4 w-4 text-primary" /> Live Vector Map
                </CardTitle>
             </CardHeader>
             <CardContent className="p-0 relative h-full bg-slate-100 flex items-center justify-center">
                <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ backgroundImage: 'radial-gradient(#000 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
                <div className="text-center space-y-2">
                   <AlertCircle className="h-8 w-8 text-slate-400 mx-auto" />
                   <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Rendering Active Grid...</p>
                </div>
                {alerts.filter(a => a.status !== 'resolved').map((a, i) => (
                   <div 
                      key={a.id} 
                      className={`absolute h-4 w-4 rounded-full border-2 border-white shadow-lg animate-ping ${a.type === 'fire' ? 'bg-fire' : a.type === 'crime' ? 'bg-crime' : 'bg-medical'}`}
                      style={{ top: `${20 + i * 15}%`, left: `${30 + i * 20}%` }}
                   />
                ))}
             </CardContent>
          </Card>

          <Card className="glass">
             <CardHeader><CardTitle className="text-sm">Team Activity</CardTitle></CardHeader>
             <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-3 rounded-xl border bg-white/50">
                   <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">JD</div>
                      <p className="text-xs font-bold">John Dispatch</p>
                   </div>
                   <Badge variant="outline" className="text-[10px] text-green-600">ON STANDBY</Badge>
                </div>
                <div className="flex items-center justify-between p-3 rounded-xl border bg-white/50">
                   <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-fire/10 flex items-center justify-center text-fire font-bold">FM</div>
                      <p className="text-xs font-bold">Fire Unit 402</p>
                   </div>
                   <Badge variant="outline" className="text-[10px] text-fire">EN ROUTE</Badge>
                </div>
             </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}