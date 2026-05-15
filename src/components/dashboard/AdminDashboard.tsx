"use client";

import { useState, useEffect } from 'react';
import { collection, query, orderBy, limit, doc, setDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { EmergencyAlert, UserProfile } from '@/lib/types';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import Image from 'next/image';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import dynamic from 'next/dynamic';
import {
  Users,
  BarChart3,
  Siren,
  CheckCircle2,
  Flame,
  Shield,
  Heart,
  MapPin,
  ChevronRight,
  Activity,
  FileDown,
  Clock,
  Navigation,
  Star,
  Settings,
  Bell,
  Lock,
  Palette,
  UserCircle,
  TriangleAlert,
  Camera,
  Pencil,
  Check,
  X,
  Loader2,
  Trash2,
} from 'lucide-react';
import { format, subDays, isSameDay } from 'date-fns';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from 'recharts';
import { cn } from '@/lib/utils';
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AdminSidebar } from "./AdminSidebar";
import { AdminSettings } from "./AdminSettings";
import { UserDashboard } from "./UserDashboard";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import Link from 'next/link';

// Dynamic map — loaded as a fully isolated client component to avoid Leaflet SSR issues
const AdminLiveMap = dynamic(() => import('./AdminLiveMap'), { ssr: false });

// ─── Admin Profile View ───────────────────────────────────────────────────────
function AdminProfileView({ profile, db }: { profile: any; db: any }) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [nameValue, setNameValue] = useState(profile?.name || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!profile || !db || !nameValue.trim()) return;
    setSaving(true);
    try {
      await setDoc(doc(db, 'users', profile.uid), { name: nameValue.trim() }, { merge: true });
      toast({ title: 'Profile updated' });
      setEditing(false);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Update failed', description: e.message });
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoUpload = async (file: File) => {
    if (!profile || !db) return;
    try {
      const { resizeImageToBase64 } = await import('@/lib/resize-image');
      const dataUrl = await resizeImageToBase64(file, 200, 0.7);
      await setDoc(doc(db, 'users', profile.uid), { photoURL: dataUrl }, { merge: true });
      toast({ title: 'Profile photo updated' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Upload failed', description: e.message });
    }
  };

  return (
    <div className="space-y-4 w-full max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight">My Profile</h1>
          <p className="text-xs text-slate-500 mt-0.5">Manage your admin account</p>
        </div>
        {!editing ? (
          <Button variant="outline" size="sm" className="h-9 px-4 border-white/10 bg-white/5 hover:bg-white/10 text-white gap-2 rounded-xl"
            onClick={() => setEditing(true)}>
            <Pencil className="h-3.5 w-3.5" /> Edit Profile
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="h-9 px-3 text-slate-400 hover:text-white rounded-xl"
              onClick={() => { setEditing(false); setNameValue(profile?.name || ''); }} disabled={saving}>
              <X className="h-4 w-4" />
            </Button>
            <Button size="sm" className="h-9 px-4 bg-green-600 hover:bg-green-500 text-white font-bold rounded-xl gap-2"
              onClick={handleSave} disabled={saving || !nameValue.trim()}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Save
            </Button>
          </div>
        )}
      </div>

      <Card className="bg-slate-900/60 border-white/5 rounded-2xl overflow-hidden">
        {/* Cover */}
        <div className="h-20 bg-gradient-to-r from-purple-900/40 to-slate-900" />
        <div className="px-6 pb-6">
          {/* Avatar */}
          <div className="relative -mt-10 mb-4 w-fit">
            <div className="h-20 w-20 rounded-2xl bg-purple-500/10 border-4 border-slate-900 overflow-hidden flex items-center justify-center text-purple-400 font-black text-3xl relative">
              {profile?.photoURL ? (
                <Image src={profile.photoURL} alt="Avatar" fill className="object-cover" />
              ) : (
                profile?.name?.charAt(0)?.toUpperCase() || 'A'
              )}
            </div>
            <label htmlFor="admin-avatar-upload"
              className="absolute -bottom-1.5 -right-1.5 h-7 w-7 rounded-lg bg-slate-700 hover:bg-slate-600 border border-white/10 flex items-center justify-center cursor-pointer transition-colors"
              title="Change photo">
              <Camera className="h-3.5 w-3.5 text-white" />
            </label>
            <input id="admin-avatar-upload" type="file" accept="image/*" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handlePhotoUpload(f); }} />
          </div>

          <div className="mb-5">
            <h2 className="text-xl font-black text-white">{profile?.name || 'Admin'}</h2>
            <p className="text-sm text-slate-400">{profile?.email}</p>
            <Badge className="bg-purple-500/10 text-purple-400 border-purple-500/20 text-xs font-bold mt-2">Admin</Badge>
          </div>

          <Separator className="bg-white/5 mb-5" />

          <div className="space-y-4">
            <div>
              <Label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Full Name</Label>
              <Input value={nameValue} onChange={e => setNameValue(e.target.value)}
                className={cn("mt-2 border-white/10 text-white transition-colors",
                  editing ? "bg-slate-800 border-white/20" : "bg-slate-800/50 cursor-default")}
                readOnly={!editing}
                onKeyDown={e => { if (e.key === 'Enter' && editing) handleSave(); }} />
            </div>
            <div>
              <Label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Email</Label>
              <Input value={profile?.email || ''} className="mt-2 bg-slate-800/50 border-white/10 text-slate-400 cursor-default" readOnly />
              <p className="text-[10px] text-slate-600 mt-1">Email cannot be changed</p>
            </div>
            <div>
              <Label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Role</Label>
              <Input value="ADMIN" className="mt-2 bg-slate-800/50 border-white/10 text-slate-400 cursor-default" readOnly />
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

export function AdminDashboard() {
  const db = useFirestore();
  const [mounted, setMounted] = useState(false);
  const [currentView, setCurrentView] = useState("overview");
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [editRole, setEditRole] = useState<string>('');
  const [savingRole, setSavingRole] = useState(false);
  const [savingViolation, setSavingViolation] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletingUser, setDeletingUser] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    setMounted(true);
  }, []);

  const alertsQuery = useMemoFirebase(() => {
    if (!db) return null;
    return query(collection(db, 'all_alerts'), orderBy('timestamp', 'desc'), limit(100));
  }, [db]);

  const usersQuery = useMemoFirebase(() => {
    if (!db) return null;
    return query(collection(db, 'users'), orderBy('createdAt', 'desc'), limit(20));
  }, [db]);

  const feedbackQuery = useMemoFirebase(() => {
    if (!db) return null;
    return query(collection(db, 'all_questionnaire_responses'), orderBy('timestamp', 'desc'), limit(50));
  }, [db]);

  const { data: alertsData } = useCollection<EmergencyAlert>(alertsQuery);
  const { data: usersData } = useCollection<UserProfile>(usersQuery);
  const { data: feedbackData } = useCollection<any>(feedbackQuery);

  const alerts = alertsData || [];
  const users = usersData || [];
  const feedbacks = feedbackData || [];
  const { profile } = useAuth();

  const chartData = useMemoFirebase(() => {
    return Array.from({ length: 7 }).map((_, i) => {
      const date = subDays(new Date(), 6 - i);
      const count = alerts.filter(a => {
        if (!a.timestamp) return false;
        return isSameDay(a.timestamp.toDate(), date);
      }).length;
      return { name: format(date, 'MMM d'), count: count || 0 };
    });
  }, [alerts]);

  const activeAlerts = alerts.filter(a => a.location && a.status !== 'resolved');

  const handleViewUser = (user: UserProfile) => {
    setSelectedUser(user);
    setEditRole(user.role);
  };

  const handleSaveRole = async () => {
    if (!selectedUser || !db || editRole === selectedUser.role) return;
    setSavingRole(true);
    try {
      await setDoc(doc(db, 'users', selectedUser.uid), { role: editRole }, { merge: true });
      toast({ title: 'Role updated', description: `${selectedUser.name} is now ${editRole}` });
      setSelectedUser(prev => prev ? { ...prev, role: editRole as any } : null);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Update failed', description: e.message });
    } finally {
      setSavingRole(false);
    }
  };

  const handleAddViolation = async () => {
    if (!selectedUser || !db) return;
    setSavingViolation(true);
    try {
      const current = selectedUser.falseReportCount ?? 0;
      const next = current + 1;
      const shouldDeactivate = next >= 3;

      const batch = writeBatch(db);
      const userUpdate: Record<string, any> = { falseReportCount: next };
      if (shouldDeactivate) userUpdate.isDeactivated = true;
      batch.set(doc(db, 'users', selectedUser.uid), userUpdate, { merge: true });

      // Write in-app warning notification to the user
      const notifRef = doc(collection(db, 'users', selectedUser.uid, 'notifications'));
      batch.set(notifRef, {
        id: notifRef.id,
        type: shouldDeactivate ? 'deactivated' : 'warning',
        title: shouldDeactivate
          ? 'Account Deactivated'
          : `False Report Warning (${next}/3)`,
        message: shouldDeactivate
          ? 'Your account has been deactivated due to 3 false emergency reports. Please contact the administrator to appeal.'
          : `A violation has been recorded on your account by an administrator. You have ${next} of 3 allowed violations. Your account will be deactivated upon reaching 3 false reports.`,
        timestamp: new Date(),
        read: false,
      });

      await batch.commit();
      setSelectedUser(prev => prev ? {
        ...prev,
        falseReportCount: next,
        isDeactivated: shouldDeactivate ? true : prev.isDeactivated,
      } : null);
      if (shouldDeactivate) {
        toast({ variant: 'destructive', title: 'Account deactivated', description: `${selectedUser.name} reached 3 false reports.` });
      } else {
        toast({ title: 'Violation recorded', description: `${selectedUser.name} now has ${next}/3 violations.` });
      }
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Failed', description: e.message });
    } finally {
      setSavingViolation(false);
    }
  };

  const handleToggleDeactivate = async () => {
    if (!selectedUser || !db) return;
    setSavingViolation(true);
    try {
      const next = !selectedUser.isDeactivated;
      await setDoc(doc(db, 'users', selectedUser.uid), { isDeactivated: next }, { merge: true });
      setSelectedUser(prev => prev ? { ...prev, isDeactivated: next } : null);
      toast({ title: next ? 'Account deactivated' : 'Account reactivated', description: selectedUser.name });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Failed', description: e.message });
    } finally {
      setSavingViolation(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!selectedUser || !db) return;
    if (selectedUser.role === 'admin') {
      toast({ variant: 'destructive', title: 'Cannot delete admin', description: 'Admin accounts are protected and cannot be deleted.' });
      setDeleteConfirmOpen(false);
      return;
    }
    setDeletingUser(true);
    try {
      const { getDocs, query: fsQuery, where, deleteDoc: fsDeleteDoc, collection: fsCollection } = await import('firebase/firestore');

      // 1. Collect all alert IDs from the user's subcollection first
      const userAlertsSnap = await getDocs(fsCollection(db, 'users', selectedUser.uid, 'alerts'));
      const alertIds = userAlertsSnap.docs.map(d => d.id);

      // 2. Delete from all agency + global collections using those IDs
      const agencyCollections = ['agency_alerts_fire', 'agency_alerts_police', 'agency_alerts_medical', 'all_alerts'];
      for (const alertId of alertIds) {
        for (const col of agencyCollections) {
          try { await fsDeleteDoc(doc(db, col, alertId)); } catch {}
        }
      }

      // 3. Also query by userId in case some alerts weren't in the subcollection
      for (const col of agencyCollections) {
        try {
          const snap = await getDocs(fsQuery(fsCollection(db, col), where('userId', '==', selectedUser.uid)));
          for (const d of snap.docs) { await fsDeleteDoc(d.ref); }
        } catch {}
      }

      // 4. Delete role collections + user doc
      const roleCollections = [
        'roles_admin', 'roles_fire_agency', 'roles_police_agency',
        'roles_medical_agency', 'roles_general_users',
      ];
      const batch = writeBatch(db);
      roleCollections.forEach(col => batch.delete(doc(db, col, selectedUser.uid)));
      batch.delete(doc(db, 'users', selectedUser.uid));
      await batch.commit();

      toast({ title: 'Account deleted', description: `${selectedUser.name}'s account and all associated data have been permanently deleted.` });
      setDeleteConfirmOpen(false);
      setSelectedUser(null);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Delete failed', description: e.message });
    } finally {
      setDeletingUser(false);
    }
  };

  if (!mounted) return null;

  return (
    <SidebarProvider style={{ '--sidebar-width': '18rem' } as React.CSSProperties}>
      <AdminSidebar currentView={currentView} onViewChange={setCurrentView} />
      <SidebarInset className="bg-[#0a0f1e] border-l border-white/5 overflow-y-auto h-screen min-w-0 flex-1 w-0">
        <div className="w-full p-4 lg:p-6 space-y-4 animate-in fade-in duration-500">

          {/* ── Overview ─────────────────────────────────────────────────── */}
          {currentView === "overview" && (
            <>
              {/* Page header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <SidebarTrigger className="xl:hidden h-9 w-9 rounded-xl border border-white/10 bg-slate-900/60 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors flex-shrink-0" />
                  <div>
                    <h1 className="text-xl font-black text-white tracking-tight">Admin Dashboard</h1>
                    <p className="text-xs text-slate-500 mt-0.5">Welcome back, Admin</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" className="h-8 text-xs border-white/10 text-slate-300 hover:bg-white/5 gap-1.5"
                    onClick={() => setDemoMode(true)}>
                    <Users className="h-3.5 w-3.5" /> View as User
                  </Button>
                  <Badge className="bg-green-500/10 text-green-500 border-green-500/20 text-xs font-bold gap-1.5 px-3 py-1.5">
                    <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" /> System Online
                  </Badge>
                </div>
              </div>

              {/* Sub-header bar */}
              <div className="flex items-center justify-between py-2 px-4 rounded-xl bg-slate-900/50 border border-white/5">
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <Clock className="h-3.5 w-3.5" />
                  <span>Avg response: <span className="text-white font-bold">2 min</span></span>
                </div>
                <Button variant="ghost" size="sm" className="h-7 text-xs text-green-400 hover:text-green-300 gap-1.5">
                  <FileDown className="h-3.5 w-3.5" /> Export CSV
                </Button>
              </div>

              {/* Stats row 1 — main counts */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  { label: 'Registered Users', value: users.length, icon: Users, sub: 'Total', color: 'text-slate-400', iconBg: 'bg-slate-800' },
                  { label: 'Total Alerts', value: alerts.length, icon: BarChart3, sub: 'All time', color: 'text-slate-400', iconBg: 'bg-slate-800' },
                  { label: 'Active Alerts', value: alerts.filter(a => a.status === 'pending').length, icon: Siren, sub: 'Live', color: 'text-red-400', iconBg: 'bg-red-500/10', live: true },
                  { label: 'Resolved Alerts', value: alerts.filter(a => a.status === 'resolved').length, icon: CheckCircle2, sub: 'Done', color: 'text-green-400', iconBg: 'bg-green-500/10' },
                ].map((stat, i) => (
                  <Card key={i} className="bg-slate-900/60 border-white/5 rounded-2xl p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div className={cn("p-2 rounded-xl", stat.iconBg)}>
                        <stat.icon className={cn("h-4 w-4", stat.color)} />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-slate-500 uppercase tracking-widest">{stat.sub}</span>
                        {stat.live && <div className="h-1.5 w-1.5 rounded-full bg-red-500 animate-ping" />}
                      </div>
                    </div>
                    <div className="text-3xl font-black text-white">{stat.value}</div>
                    <p className="text-xs text-slate-500 mt-1">{stat.label}</p>
                  </Card>
                ))}
              </div>

              {/* Stats row 2 — agency breakdown */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  { label: 'Fire', sub: 'Bureau of Fire Protection', value: alerts.filter(a => a.type === 'fire').length, icon: Flame, color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20' },
                  { label: 'Crime', sub: 'Philippine National Police', value: alerts.filter(a => a.type === 'crime').length, icon: Shield, color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
                  { label: 'Medical', sub: 'Emergency Medical Care', value: alerts.filter(a => a.type === 'medical').length, icon: Heart, color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20' },
                  { label: 'Responding', sub: 'On their way', value: alerts.filter(a => a.status === 'responding').length, icon: Navigation, color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20' },
                ].map((item, i) => (
                  <Card key={i} className={cn("rounded-2xl p-4 border", item.bg, item.border)}>
                    <div className="flex items-center gap-3">
                      <item.icon className={cn("h-5 w-5", item.color)} />
                      <div>
                        <div className="text-2xl font-black text-white">{item.value}</div>
                        <div className="text-xs font-bold text-white/80">{item.label}</div>
                        <div className="text-[10px] text-white/40 mt-0.5">{item.sub}</div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>

              {/* Main content grid */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

                {/* Left — chart + map */}
                <div className="lg:col-span-2 space-y-4">

                  {/* Bar chart */}
                  <Card className="bg-slate-900/60 border-white/5 rounded-2xl overflow-hidden">
                    <CardHeader className="flex flex-row items-center justify-between py-4 px-6 border-b border-white/5">
                      <CardTitle className="text-sm font-bold text-white">
                        Alerts · Last 7 Days
                      </CardTitle>
                      <Button variant="ghost" size="sm" className="text-xs text-slate-400 h-7">Go to History</Button>
                    </CardHeader>
                    <CardContent className="p-4 h-[220px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} barCategoryGap="30%">
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ffffff08" />
                          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#475569', fontSize: 10 }} dy={8} />
                          <YAxis axisLine={false} tickLine={false} tick={{ fill: '#475569', fontSize: 10 }} width={24} />
                          <Tooltip
                            cursor={{ fill: '#ffffff05' }}
                            contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #ffffff10', borderRadius: '12px', fontSize: 12 }}
                            itemStyle={{ color: '#f87171' }}
                          />
                          <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                            {chartData.map((_, index) => (
                              <Cell key={`cell-${index}`} fill="#7f1d1d" stroke="#ef4444" strokeWidth={1} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  {/* Live Emergency Map */}
                  <Card className="bg-slate-900/60 border-white/5 rounded-2xl overflow-hidden">
                    <CardHeader className="flex flex-row items-center justify-between py-3 px-5 border-b border-white/5">
                      <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                        Live Emergency Map
                        <Badge className="bg-red-500/10 text-red-400 border-red-500/20 text-[10px] font-bold ml-1">
                          {activeAlerts.length} active
                        </Badge>
                      </CardTitle>
                      <Link href="/map" className="text-xs text-blue-400 hover:text-blue-300 font-bold flex items-center gap-1">
                        Full map <ChevronRight className="h-3 w-3" />
                      </Link>
                    </CardHeader>
                    <CardContent className="p-0 h-[280px]">
                      {mounted && (
                        <AdminLiveMap activeAlerts={activeAlerts} />
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* Right — recent alerts + users */}
                <div className="space-y-4">

                  {/* Recent Alerts */}
                  <Card className="bg-slate-900/60 border-white/5 rounded-2xl overflow-hidden">
                    <CardHeader className="flex flex-row items-center justify-between py-3 px-5 border-b border-white/5">
                      <CardTitle className="text-sm font-bold text-white">Recent Alerts</CardTitle>
                      <Button variant="ghost" size="sm" className="text-xs text-blue-400 h-7 px-2">All →</Button>
                    </CardHeader>
                    <CardContent className="p-0 max-h-[280px] overflow-y-auto">
                      {alerts.slice(0, 8).map((alert) => (
                        <div key={alert.id} className="flex items-start gap-3 px-5 py-3 border-b border-white/5 hover:bg-white/5 transition-colors">
                          <div className={cn(
                            "h-8 w-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5",
                            alert.type === 'fire' ? 'bg-orange-500/15 text-orange-400' :
                            alert.type === 'crime' ? 'bg-blue-500/15 text-blue-400' :
                            'bg-red-500/15 text-red-400'
                          )}>
                            {alert.type === 'fire' ? <Flame className="h-4 w-4" /> :
                             alert.type === 'crime' ? <Shield className="h-4 w-4" /> :
                             <Heart className="h-4 w-4" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-white capitalize">{alert.type} Emergency</p>
                            <p className="text-[10px] text-slate-500 truncate">
                              {alert.location
                                ? `${alert.location.lat.toFixed(4)}, ${alert.location.lng.toFixed(4)}`
                                : 'Location unknown'}
                            </p>
                            <p className="text-[10px] text-slate-600">{alert.userName}</p>
                          </div>
                          <Badge className={cn(
                            "text-[9px] font-bold border-none rounded-lg px-2 py-0.5 flex-shrink-0",
                            alert.status === 'resolved' ? 'bg-green-500/10 text-green-400' :
                            alert.status === 'responding' ? 'bg-blue-500/10 text-blue-400' :
                            'bg-red-500/10 text-red-400'
                          )}>
                            {alert.status}
                          </Badge>
                        </div>
                      ))}
                    </CardContent>
                  </Card>

                  {/* Registered Users */}
                  <Card className="bg-slate-900/60 border-white/5 rounded-2xl overflow-hidden">
                    <CardHeader className="flex flex-row items-center justify-between py-3 px-5 border-b border-white/5">
                      <CardTitle className="text-sm font-bold text-white">Registered Users</CardTitle>
                      <Button variant="ghost" size="sm" className="text-xs text-blue-400 h-7 px-2">Manage →</Button>
                    </CardHeader>
                    <CardContent className="p-0 max-h-[220px] overflow-y-auto">
                      {users.slice(0, 6).map((user) => (
                        <div key={user.uid} className="flex items-center gap-3 px-5 py-3 border-b border-white/5 hover:bg-white/5 transition-colors">
                          <div className="h-8 w-8 rounded-xl bg-slate-700 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                            {user.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-white truncate">{user.name}</p>
                            <p className="text-[10px] text-slate-500 truncate">{user.email}</p>
                          </div>
                          <Button variant="ghost" size="sm" className="text-[10px] text-slate-400 h-6 px-2 hover:text-white"
                            onClick={() => handleViewUser(user)}>
                            View
                          </Button>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </div>
              </div>
            </>
          )}

          {/* ── Alerts view ──────────────────────────────────────────────── */}
          {currentView === "alerts" && (
            <div className="space-y-4 w-full">
              <h1 className="text-2xl font-black text-white">Manage Alerts</h1>
              <Card className="bg-slate-900/60 border-white/5 rounded-2xl overflow-hidden w-full">
                {/* Mobile card list */}
                <div className="md:hidden divide-y divide-white/5">
                  {alerts.map((alert) => (
                    <div key={alert.id} className="flex items-center gap-3 px-4 py-3">
                      <div className={cn(
                        "h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0",
                        alert.type === 'fire' ? 'bg-orange-500/15' : alert.type === 'crime' ? 'bg-blue-500/15' : 'bg-red-500/15'
                      )}>
                        {alert.type === 'fire' ? <Flame className="h-4 w-4 text-orange-400" /> :
                         alert.type === 'crime' ? <Shield className="h-4 w-4 text-blue-400" /> :
                         <Heart className="h-4 w-4 text-red-400" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-white capitalize">{alert.type} Emergency</p>
                        <p className="text-xs text-slate-500 truncate">{alert.userName}</p>
                        <p className="text-[10px] text-slate-600">
                          {alert.timestamp?.seconds ? format(alert.timestamp.toDate(), 'MMM d, HH:mm') : 'Live'}
                        </p>
                      </div>
                      <Badge className={cn(
                        "text-[9px] font-bold border-none rounded-lg px-2 py-0.5 flex-shrink-0",
                        alert.status === 'resolved' ? 'bg-green-500/10 text-green-400' :
                        alert.status === 'responding' ? 'bg-blue-500/10 text-blue-400' :
                        'bg-red-500/10 text-red-400'
                      )}>
                        {alert.status}
                      </Badge>
                    </div>
                  ))}
                  {alerts.length === 0 && (
                    <div className="py-12 text-center text-slate-500 text-sm">No alerts found</div>
                  )}
                </div>
                {/* Desktop table */}
                <Table className="w-full hidden md:table">
                  <TableHeader className="bg-white/5">
                    <TableRow className="border-white/5 hover:bg-transparent">
                      <TableHead className="text-xs font-bold text-slate-500 uppercase tracking-widest px-6 w-32">Type</TableHead>
                      <TableHead className="text-xs font-bold text-slate-500 uppercase tracking-widest">User</TableHead>
                      <TableHead className="text-xs font-bold text-slate-500 uppercase tracking-widest w-40">Time</TableHead>
                      <TableHead className="text-xs font-bold text-slate-500 uppercase tracking-widest text-right px-6 w-32">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {alerts.map((alert) => (
                      <TableRow key={alert.id} className="border-white/5 hover:bg-white/5">
                        <TableCell className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <div className={cn("h-2.5 w-2.5 rounded-full flex-shrink-0", alert.type === 'fire' ? 'bg-orange-500' : alert.type === 'crime' ? 'bg-blue-500' : 'bg-red-500')} />
                            <span className="text-sm font-bold text-white capitalize">{alert.type}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-slate-300 text-sm font-medium">{alert.userName}</TableCell>
                        <TableCell className="text-slate-400 text-sm">
                          {alert.timestamp?.seconds ? format(alert.timestamp.toDate(), 'MMM d, HH:mm') : 'Live'}
                        </TableCell>
                        <TableCell className="text-right px-6">
                          <Badge className={cn(
                            "text-xs font-bold border-none rounded-lg px-3 py-1",
                            alert.status === 'pending' ? 'bg-red-500/15 text-red-400' :
                            alert.status === 'responding' ? 'bg-blue-500/15 text-blue-400' :
                            'bg-green-500/15 text-green-400'
                          )}>
                            {alert.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                    {alerts.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-slate-500 py-12 text-sm">
                          No alerts found
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </Card>
            </div>
          )}

          {/* ── Users view ───────────────────────────────────────────────── */}
          {currentView === "users" && (
            <div className="space-y-4 w-full">
              <h1 className="text-2xl font-black text-white">Manage Users</h1>
              <Card className="bg-slate-900/60 border-white/5 rounded-2xl overflow-hidden w-full">
                {/* Mobile card list (hidden on md+) */}
                <div className="md:hidden divide-y divide-white/5">
                  {users.map((user) => (
                    <div key={user.uid} className="flex items-center gap-3 px-4 py-3">
                      <div className="h-9 w-9 rounded-xl bg-slate-700 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                        {user.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-white truncate">{user.name}</p>
                        <p className="text-xs text-slate-500 truncate">{user.email}</p>
                        <Badge className={cn(
                          "text-[10px] font-bold border-none rounded-lg capitalize mt-1",
                          user.role === 'admin' ? 'bg-purple-500/10 text-purple-400' :
                          user.role === 'fire' ? 'bg-orange-500/10 text-orange-400' :
                          user.role === 'police' ? 'bg-blue-500/10 text-blue-400' :
                          user.role === 'medical' ? 'bg-red-500/10 text-red-400' :
                          'bg-slate-500/10 text-slate-400'
                        )}>
                          {user.role}
                        </Badge>
                      </div>
                      <Button variant="ghost" size="sm" className="text-xs text-slate-400 hover:text-white h-7 flex-shrink-0"
                        onClick={() => handleViewUser(user)}>View</Button>
                    </div>
                  ))}
                  {users.length === 0 && (
                    <div className="py-12 text-center text-slate-500 text-sm">No users found</div>
                  )}
                </div>
                {/* Desktop table (hidden on mobile) */}
                <Table className="w-full hidden md:table">
                  <TableHeader className="bg-white/5">
                    <TableRow className="border-white/5 hover:bg-transparent">
                      <TableHead className="text-xs font-bold text-slate-500 uppercase tracking-widest px-6">Name</TableHead>
                      <TableHead className="text-xs font-bold text-slate-500 uppercase tracking-widest">Email</TableHead>
                      <TableHead className="text-xs font-bold text-slate-500 uppercase tracking-widest">Role</TableHead>
                      <TableHead className="text-xs font-bold text-slate-500 uppercase tracking-widest text-center">Violations</TableHead>
                      <TableHead className="text-xs font-bold text-slate-500 uppercase tracking-widest text-right px-6">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((user) => (
                      <TableRow key={user.uid} className="border-white/5 hover:bg-white/5">
                        <TableCell className="px-6 py-3">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-xl bg-slate-700 flex items-center justify-center text-white font-bold text-sm overflow-hidden relative flex-shrink-0">
                              {user.photoURL ? (
                                <Image src={user.photoURL} alt={user.name} fill className="object-cover" />
                              ) : (
                                user.name.charAt(0).toUpperCase()
                              )}
                            </div>
                            <div className="min-w-0">
                              <span className="text-sm font-bold text-white block truncate">{user.name}</span>
                              {user.isDeactivated && (
                                <span className="text-[10px] text-red-400 font-bold">DEACTIVATED</span>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-slate-400 text-sm">{user.email}</TableCell>
                        <TableCell>
                          <Badge className={cn(
                            "text-[10px] font-bold border-none rounded-lg capitalize",
                            user.role === 'admin' ? 'bg-purple-500/10 text-purple-400' :
                            user.role === 'fire' ? 'bg-orange-500/10 text-orange-400' :
                            user.role === 'police' ? 'bg-blue-500/10 text-blue-400' :
                            user.role === 'medical' ? 'bg-red-500/10 text-red-400' :
                            'bg-slate-500/10 text-slate-400'
                          )}>
                            {user.role}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className={cn(
                            "text-sm font-bold",
                            (user.falseReportCount ?? 0) >= 3 ? 'text-red-400' :
                            (user.falseReportCount ?? 0) >= 1 ? 'text-yellow-400' :
                            'text-slate-500'
                          )}>
                            {user.falseReportCount ?? 0}
                          </span>
                        </TableCell>
                        <TableCell className="text-right px-6">
                          <Button variant="ghost" size="sm" className="text-xs text-slate-400 hover:text-white h-7"
                            onClick={() => handleViewUser(user)}>View</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            </div>
          )}

          {/* ── History view ─────────────────────────────────────────────── */}
          {currentView === "history" && (
            <div className="space-y-4 w-full">
              <h1 className="text-2xl font-black text-white">Alert History</h1>
              <Card className="bg-slate-900/60 border-white/5 rounded-2xl overflow-hidden w-full">
                <Table className="w-full">
                  <TableHeader className="bg-white/5">
                    <TableRow className="border-white/5 hover:bg-transparent">
                      <TableHead className="text-xs font-bold text-slate-500 uppercase tracking-widest px-6">Type</TableHead>
                      <TableHead className="text-xs font-bold text-slate-500 uppercase tracking-widest">User</TableHead>
                      <TableHead className="text-xs font-bold text-slate-500 uppercase tracking-widest">Location</TableHead>
                      <TableHead className="text-xs font-bold text-slate-500 uppercase tracking-widest">Time</TableHead>
                      <TableHead className="text-xs font-bold text-slate-500 uppercase tracking-widest text-right px-6">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {alerts.map((alert) => (
                      <TableRow key={alert.id} className="border-white/5 hover:bg-white/5">
                        <TableCell className="px-6 py-3">
                          <div className="flex items-center gap-2">
                            <div className={cn("h-2 w-2 rounded-full", alert.type === 'fire' ? 'bg-orange-500' : alert.type === 'crime' ? 'bg-blue-500' : 'bg-red-500')} />
                            <span className="text-sm font-bold text-white capitalize">{alert.type}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-slate-300 text-sm">{alert.userName}</TableCell>
                        <TableCell className="text-slate-500 font-mono text-xs">
                          {alert.location ? `${alert.location.lat.toFixed(4)}, ${alert.location.lng.toFixed(4)}` : '—'}
                        </TableCell>
                        <TableCell className="text-slate-500 font-mono text-xs">
                          {alert.timestamp?.seconds ? format(alert.timestamp.toDate(), 'MMM d, HH:mm') : 'Live'}
                        </TableCell>
                        <TableCell className="text-right px-6">
                          <Badge className={cn(
                            "text-[10px] font-bold border-none rounded-lg",
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

          {/* ── Profile view ─────────────────────────────────────────────── */}
          {currentView === "profile" && (
            <AdminProfileView profile={profile} db={db} />
          )}

          {/* ── Settings view ────────────────────────────────────────────── */}
          {currentView === "settings" && <AdminSettings />}

          {/* ── Feedback view ────────────────────────────────────────────── */}
          {currentView === "feedback" && (
            <div className="space-y-4 w-full">
              <h1 className="text-2xl font-black text-white">Feedback & Ratings</h1>
              <Card className="bg-slate-900/60 border-white/5 rounded-2xl overflow-hidden w-full">
                <Table className="w-full">
                  <TableHeader className="bg-white/5">
                    <TableRow className="border-white/5 hover:bg-transparent">
                      <TableHead className="text-xs font-bold text-slate-500 uppercase tracking-widest px-6">User</TableHead>
                      <TableHead className="text-xs font-bold text-slate-500 uppercase tracking-widest">Ease of Use</TableHead>
                      <TableHead className="text-xs font-bold text-slate-500 uppercase tracking-widest">Reliability</TableHead>
                      <TableHead className="text-xs font-bold text-slate-500 uppercase tracking-widest">Comments</TableHead>
                      <TableHead className="text-xs font-bold text-slate-500 uppercase tracking-widest text-right px-6">Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {feedbacks.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-slate-500 py-12 text-sm">
                          No feedback submissions yet
                        </TableCell>
                      </TableRow>
                    ) : (
                      feedbacks.map((fb: any) => (
                        <TableRow key={fb.id} className="border-white/5 hover:bg-white/5">
                          <TableCell className="px-6 py-4 text-sm font-bold text-white">
                            {fb.userId?.slice(0, 8) || '—'}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {Array.from({ length: 5 }).map((_, i) => (
                                <Star
                                  key={i}
                                  className={cn("h-3.5 w-3.5", i < fb.easeOfUse ? 'text-yellow-400 fill-yellow-400' : 'text-slate-600')}
                                />
                              ))}
                              <span className="text-xs text-slate-400 ml-1">{fb.easeOfUse}/5</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {Array.from({ length: 5 }).map((_, i) => (
                                <Star
                                  key={i}
                                  className={cn("h-3.5 w-3.5", i < fb.reliability ? 'text-yellow-400 fill-yellow-400' : 'text-slate-600')}
                                />
                              ))}
                              <span className="text-xs text-slate-400 ml-1">{fb.reliability}/5</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-slate-400 text-sm max-w-xs truncate">
                            {fb.comments || '—'}
                          </TableCell>
                          <TableCell className="text-right px-6 text-slate-500 text-xs">
                            {fb.timestamp?.seconds ? format(fb.timestamp.toDate(), 'MMM d, HH:mm') : '—'}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </Card>
            </div>
          )}

        </div>
      </SidebarInset>

      {/* ── User Detail Dialog ──────────────────────────────────────────── */}
      <Dialog open={!!selectedUser} onOpenChange={(open) => { if (!open) setSelectedUser(null); }}>
        <DialogContent className="bg-slate-950 border-white/10 rounded-2xl max-w-sm w-full p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-white/5">
            <DialogTitle className="text-white font-black text-lg">User Details</DialogTitle>
          </DialogHeader>
          {selectedUser && (
            <div className="px-6 py-5 space-y-5">
              {/* Avatar + basic info */}
              <div className="flex items-center gap-4">
                <div className="relative flex-shrink-0">
                  <div className="h-14 w-14 rounded-2xl bg-slate-700 flex items-center justify-center text-white font-black text-2xl overflow-hidden relative">
                    {selectedUser.photoURL ? (
                      <Image src={selectedUser.photoURL} alt={selectedUser.name} fill className="object-cover" />
                    ) : (
                      selectedUser.name.charAt(0).toUpperCase()
                    )}
                  </div>
                </div>
                <div className="min-w-0">
                  <p className="text-base font-black text-white truncate">{selectedUser.name}</p>
                  <p className="text-xs text-slate-400 truncate">{selectedUser.email}</p>
                  <p className="text-[10px] text-slate-600 mt-0.5">
                    UID: {selectedUser.uid.slice(0, 12)}...
                  </p>
                </div>
              </div>

              <Separator className="bg-white/5" />

              {/* Role editor */}
              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Role</Label>
                <Select value={editRole} onValueChange={setEditRole}>
                  <SelectTrigger className="bg-slate-800/50 border-white/10 text-white rounded-xl h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-white/10 rounded-xl">
                    {['user', 'fire', 'police', 'medical', 'admin'].map(r => (
                      <SelectItem key={r} value={r} className="text-white capitalize hover:bg-white/5">
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Joined date */}
              {selectedUser.createdAt?.seconds && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">Joined</span>
                  <span className="text-slate-300 font-semibold">
                    {format(new Date(selectedUser.createdAt.seconds * 1000), 'MMM d, yyyy')}
                  </span>
                </div>
              )}

              {/* False Report Violations */}
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">False Report Violations</span>
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "font-black text-sm",
                    (selectedUser.falseReportCount ?? 0) >= 3 ? 'text-red-400' :
                    (selectedUser.falseReportCount ?? 0) >= 1 ? 'text-yellow-400' :
                    'text-slate-300'
                  )}>
                    {selectedUser.falseReportCount ?? 0} / 3
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-[10px] border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10 hover:text-yellow-300 rounded-lg"
                    onClick={handleAddViolation}
                    disabled={savingViolation || (selectedUser.falseReportCount ?? 0) >= 3}
                  >
                    {savingViolation ? <Loader2 className="h-3 w-3 animate-spin" /> : '+1'}
                  </Button>
                </div>
              </div>

              {/* Violation progress bar */}
              <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    (selectedUser.falseReportCount ?? 0) >= 3 ? 'bg-red-500' :
                    (selectedUser.falseReportCount ?? 0) >= 2 ? 'bg-orange-500' :
                    (selectedUser.falseReportCount ?? 0) >= 1 ? 'bg-yellow-500' :
                    'bg-slate-600'
                  )}
                  style={{ width: `${((selectedUser.falseReportCount ?? 0) / 3) * 100}%` }}
                />
              </div>

              {/* Account Status */}
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Account Status</span>
                <Badge className={cn(
                  "text-xs font-black border-none px-3 py-1 rounded-lg",
                  selectedUser.isDeactivated
                    ? 'bg-red-500/15 text-red-400'
                    : 'bg-green-500/15 text-green-400'
                )}>
                  {selectedUser.isDeactivated ? 'DEACTIVATED' : 'ACTIVE'}
                </Badge>
              </div>

              {/* Deactivate / Reactivate button — hidden for admin accounts */}
              {selectedUser.role !== 'admin' && (
                <Button
                  variant="outline"
                  className={cn(
                    "w-full h-11 rounded-xl font-bold text-sm border transition-colors",
                    selectedUser.isDeactivated
                      ? 'border-green-500/30 text-green-400 hover:bg-green-500/10'
                      : 'border-red-500/30 text-red-400 hover:bg-red-500/10'
                  )}
                  onClick={handleToggleDeactivate}
                  disabled={savingViolation}
                >
                  {savingViolation ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : selectedUser.isDeactivated ? (
                    '✓ Reactivate Account'
                  ) : (
                    '⊘ Deactivate Account'
                  )}
                </Button>
              )}

              {/* Delete Account button — hidden for admin accounts */}
              {selectedUser.role !== 'admin' && (
                <Button
                  variant="outline"
                  className="w-full h-11 rounded-xl font-bold text-sm border border-red-900/50 text-red-500 hover:bg-red-950/40 hover:border-red-500/50 gap-2 transition-colors"
                  onClick={() => setDeleteConfirmOpen(true)}
                  disabled={savingViolation || deletingUser}
                >
                  <Trash2 className="h-4 w-4" />
                  Delete Account Permanently
                </Button>
              )}
            </div>
          )}
          <DialogFooter className="px-6 pb-6 flex gap-3">
            <Button variant="outline" className="flex-1 border-white/10 text-slate-400 hover:text-white rounded-xl"
              onClick={() => setSelectedUser(null)}>
              Close
            </Button>
            <Button
              className="flex-1 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl"
              onClick={handleSaveRole}
              disabled={savingRole || editRole === selectedUser?.role}
            >
              {savingRole ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save Role'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation Dialog ──────────────────────────────────── */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="bg-slate-950 border-white/10 rounded-2xl max-w-sm w-full p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-white/5">
            <DialogTitle className="text-white font-black text-lg flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-red-400" />
              Delete Account
            </DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-4">
            <div className="p-4 rounded-xl bg-red-950/30 border border-red-500/20">
              <p className="text-sm text-red-300 font-semibold">
                This action is permanent and cannot be undone.
              </p>
              <p className="text-xs text-red-400/70 mt-1">
                All data for <span className="font-bold text-red-300">{selectedUser?.name}</span> will be permanently removed from the system.
              </p>
            </div>
            <p className="text-xs text-slate-500">
              Note: This removes the Firestore profile and role records. The Firebase Auth account may need to be removed separately from the Firebase Console.
            </p>
          </div>
          <DialogFooter className="px-6 pb-6 flex gap-3">
            <Button
              variant="outline"
              className="flex-1 border-white/10 text-slate-400 hover:text-white rounded-xl"
              onClick={() => setDeleteConfirmOpen(false)}
              disabled={deletingUser}
            >
              Cancel
            </Button>
            <Button
              className="flex-1 bg-red-700 hover:bg-red-600 text-white font-bold rounded-xl gap-2"
              onClick={handleDeleteUser}
              disabled={deletingUser}
            >
              {deletingUser ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Trash2 className="h-4 w-4" />
                  Delete Permanently
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── User Demo Mode Overlay ──────────────────────────────────────── */}
      {demoMode && (
        <div className="fixed inset-0 z-[100] bg-[#020617] flex flex-col">
          {/* Demo banner */}
          <div className="flex items-center justify-between px-4 h-10 bg-purple-600/90 backdrop-blur-sm flex-shrink-0">
            <div className="flex items-center gap-2 text-white text-xs font-bold min-w-0">
              <Users className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="truncate hidden sm:block">ADMIN PREVIEW — User Dashboard Demo Mode</span>
              <span className="truncate sm:hidden">Demo Mode</span>
            </div>
            <button
              onClick={() => setDemoMode(false)}
              className="flex items-center gap-1.5 text-white/80 hover:text-white text-xs font-bold transition-colors flex-shrink-0 ml-2"
            >
              <X className="h-4 w-4" />
              <span className="hidden sm:inline">Exit Demo</span>
            </button>
          </div>
          {/* User dashboard rendered inside */}
          <div className="flex-1 overflow-hidden">
            <UserDashboard />
          </div>
        </div>
      )}

    </SidebarProvider>
  );
}
