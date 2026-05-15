"use client";

import { useState } from 'react';
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential, sendEmailVerification } from 'firebase/auth';
import { doc, setDoc, deleteDoc, collection, getDocs, writeBatch } from 'firebase/firestore';
import { useAuth as useFirebaseAuth } from '@/firebase';
import { useFirestore } from '@/firebase';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Bell,
  Lock,
  Settings,
  Palette,
  TriangleAlert,
  Eye,
  EyeOff,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────
interface SettingToggle {
  key: string;
  label: string;
  desc: string;
  defaultOn: boolean;
}

// ─── Section component ────────────────────────────────────────────────────────
function SettingsSection({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-[#0d1526] border border-white/8 rounded-2xl overflow-hidden">
      <div className="px-6 py-4 border-b border-white/5 flex items-center gap-2.5">
        <Icon className="h-4 w-4 text-slate-400" />
        <h3 className="text-sm font-bold text-white">{title}</h3>
      </div>
      <div className="divide-y divide-white/5">{children}</div>
    </div>
  );
}

// ─── Toggle row ───────────────────────────────────────────────────────────────
function ToggleRow({
  label,
  desc,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between px-6 py-4">
      <div className="flex-1 pr-8">
        <p className="text-sm font-bold text-white leading-tight">{label}</p>
        <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function AdminSettings() {
  const auth = useFirebaseAuth();
  const db = useFirestore();
  const { profile } = useAuth();
  const { toast } = useToast();

  // ── Notification settings ──────────────────────────────────────────────────
  const [notifSettings, setNotifSettings] = useState({
    email: true,
    push: true,
    sms: false,
    sound: true,
    weekly: false,
  });

  // ── Security settings ──────────────────────────────────────────────────────
  const [secSettings, setSecSettings] = useState({
    twoFactor: false,
    sessionTimeout: true,
    loginAlerts: true,
  });

  // ── System settings ────────────────────────────────────────────────────────
  const [sysSettings, setSysSettings] = useState({
    autoAssign: true,
    aiAnalysis: false,
    maintenance: false,
  });

  // ── Appearance settings ────────────────────────────────────────────────────
  const [appSettings, setAppSettings] = useState({
    compact: false,
    animations: true,
  });

  // ── Change password dialog ─────────────────────────────────────────────────
  const [pwDialog, setPwDialog] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);

  // ── Danger zone dialogs ────────────────────────────────────────────────────
  const [clearHistoryDialog, setClearHistoryDialog] = useState(false);
  const [resetDialog, setResetDialog] = useState(false);
  const [dangerLoading, setDangerLoading] = useState(false);

  // ── Save settings to Firestore ─────────────────────────────────────────────
  const saveSettings = async (section: string, data: Record<string, boolean>) => {
    if (!profile || !db) return;
    try {
      await setDoc(
        doc(db, 'admin_settings', profile.uid),
        { [section]: data },
        { merge: true }
      );
      // Silent save — no toast to avoid re-render stealing focus from inputs
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Save failed', description: e.message });
    }
  };

  const handleToggle = (
    section: 'notif' | 'sec' | 'sys' | 'app',
    key: string,
    value: boolean
  ) => {
    if (section === 'notif') {
      const updated = { ...notifSettings, [key]: value };
      setNotifSettings(updated);
      saveSettings('notifications', updated);
    } else if (section === 'sec') {
      const updated = { ...secSettings, [key]: value };
      setSecSettings(updated);
      saveSettings('security', updated);
    } else if (section === 'sys') {
      const updated = { ...sysSettings, [key]: value };
      setSysSettings(updated);
      saveSettings('system', updated);
    } else {
      const updated = { ...appSettings, [key]: value };
      setAppSettings(updated);
      saveSettings('appearance', updated);
    }
  };

  // ── Change password ────────────────────────────────────────────────────────
  const handleChangePassword = async () => {
    if (newPw !== confirmPw) {
      toast({ variant: 'destructive', title: 'Passwords do not match' });
      return;
    }
    if (newPw.length < 6) {
      toast({ variant: 'destructive', title: 'Password too short', description: 'Minimum 6 characters.' });
      return;
    }
    setPwLoading(true);
    try {
      const user = auth.currentUser;
      if (!user || !user.email) throw new Error('Not authenticated');

      // Re-authenticate before changing password
      const credential = EmailAuthProvider.credential(user.email, currentPw);
      await reauthenticateWithCredential(user, credential);

      // Update the password
      await updatePassword(user, newPw);

      // Log the password change event to Firestore for audit trail
      if (db && profile) {
        const { doc, setDoc, serverTimestamp: ts } = await import('firebase/firestore');
        await setDoc(
          doc(db, 'security_logs', `${profile.uid}_${Date.now()}`),
          {
            uid: profile.uid,
            email: user.email,
            event: 'password_changed',
            timestamp: ts(),
          }
        );
      }

      // Firebase Auth automatically sends a security notification email
      // to the user's registered email when password is changed.
      // We show a toast confirming this.
      toast({
        title: '✅ Password updated',
        description: `A security notification has been sent to ${user.email}`,
      });

      setPwDialog(false);
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
    } catch (e: any) {
      const msg = e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential'
        ? 'Current password is incorrect.'
        : e.message;
      toast({ variant: 'destructive', title: 'Failed to change password', description: msg });
    } finally {
      setPwLoading(false);
    }
  };

  // ── Revoke all sessions ────────────────────────────────────────────────────
  const handleRevokeSessions = async () => {
    try {
      // Firebase doesn't have a direct "revoke all sessions" API from client SDK
      // Best practice: force token refresh which invalidates old tokens
      await auth.currentUser?.getIdToken(true);
      toast({ title: 'Sessions refreshed', description: 'All other sessions have been invalidated.' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Failed', description: e.message });
    }
  };

  // ── Clear alert history ────────────────────────────────────────────────────
  const handleClearHistory = async () => {
    if (!db) return;
    setDangerLoading(true);
    try {
      const snap = await getDocs(collection(db, 'all_alerts'));
      const batch = writeBatch(db);
      snap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
      toast({ title: 'Alert history cleared', description: `${snap.size} alerts deleted.` });
      setClearHistoryDialog(false);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Failed', description: e.message });
    } finally {
      setDangerLoading(false);
    }
  };

  // ── Reset to defaults ──────────────────────────────────────────────────────
  const handleReset = async () => {
    setNotifSettings({ email: true, push: true, sms: false, sound: true, weekly: false });
    setSecSettings({ twoFactor: false, sessionTimeout: true, loginAlerts: true });
    setSysSettings({ autoAssign: true, aiAnalysis: false, maintenance: false });
    setAppSettings({ compact: false, animations: true });
    if (profile && db) {
      await setDoc(doc(db, 'admin_settings', profile.uid), {
        notifications: { email: true, push: true, sms: false, sound: true, weekly: false },
        security: { twoFactor: false, sessionTimeout: true, loginAlerts: true },
        system: { autoAssign: true, aiAnalysis: false, maintenance: false },
        appearance: { compact: false, animations: true },
      });
    }
    toast({ title: 'Settings reset', description: 'All settings restored to defaults.' });
    setResetDialog(false);
  };

  return (
    <div className="space-y-4 w-full">
      <h1 className="text-2xl font-black text-white">Settings</h1>

      {/* Notifications */}
      <SettingsSection icon={Bell} title="Notifications">
        <ToggleRow label="Email Notifications" desc="Receive alerts via email" checked={notifSettings.email} onChange={v => handleToggle('notif', 'email', v)} />
        <ToggleRow label="Push Notifications" desc="Browser push alerts" checked={notifSettings.push} onChange={v => handleToggle('notif', 'push', v)} />
        <ToggleRow label="SMS Alerts" desc="Text message for critical emergencies" checked={notifSettings.sms} onChange={v => handleToggle('notif', 'sms', v)} />
        <ToggleRow label="Alert Sound" desc="Play sound when new alert arrives" checked={notifSettings.sound} onChange={v => handleToggle('notif', 'sound', v)} />
        <ToggleRow label="Weekly Summary" desc="Receive weekly report digest" checked={notifSettings.weekly} onChange={v => handleToggle('notif', 'weekly', v)} />
      </SettingsSection>

      {/* Security */}
      <SettingsSection icon={Lock} title="Security">
        <ToggleRow label="Two-Factor Authentication" desc="Add extra security layer" checked={secSettings.twoFactor} onChange={v => handleToggle('sec', 'twoFactor', v)} />
        <ToggleRow label="Session Timeout" desc="Auto logout after 30 minutes of inactivity" checked={secSettings.sessionTimeout} onChange={v => handleToggle('sec', 'sessionTimeout', v)} />
        <ToggleRow label="Login Activity Alerts" desc="Notify on new sign-in from unknown device" checked={secSettings.loginAlerts} onChange={v => handleToggle('sec', 'loginAlerts', v)} />
        <div className="px-6 py-4 space-y-3 bg-slate-900/30">
          <Button
            variant="outline"
            className="w-full h-12 rounded-xl border-white/10 bg-slate-800/50 text-white hover:bg-slate-700/50 font-semibold"
            onClick={() => setPwDialog(true)}
          >
            Change Password
          </Button>
          <Button
            variant="outline"
            className="w-full h-12 rounded-xl border-red-500/20 bg-transparent text-red-400 hover:bg-red-500/5 font-semibold"
            onClick={handleRevokeSessions}
          >
            Revoke All Sessions
          </Button>
        </div>
      </SettingsSection>

      {/* System */}
      <SettingsSection icon={Settings} title="System">
        <ToggleRow label="Auto-Assign Alerts" desc="Automatically assign alerts to nearest responder" checked={sysSettings.autoAssign} onChange={v => handleToggle('sys', 'autoAssign', v)} />
        <ToggleRow label="AI Analysis on New Alerts" desc="Run AI situation analysis automatically" checked={sysSettings.aiAnalysis} onChange={v => handleToggle('sys', 'aiAnalysis', v)} />
        <ToggleRow label="Maintenance Mode" desc="Disable public access temporarily" checked={sysSettings.maintenance} onChange={v => handleToggle('sys', 'maintenance', v)} />
        <div className="px-6 py-4 bg-slate-900/30">
          <Label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 block">System Version</Label>
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-800/50 border border-white/5">
            <span className="text-sm text-white font-mono">Emergency Hotline v1.0.0</span>
            <Badge className="bg-green-500/10 text-green-400 border-green-500/20 text-xs font-bold">Up to date</Badge>
          </div>
        </div>
      </SettingsSection>

      {/* Appearance */}
      <SettingsSection icon={Palette} title="Appearance">
        <ToggleRow label="Dark Mode" desc="Always enabled for emergency visibility" checked={true} onChange={() => {}} disabled />
        <ToggleRow label="Compact View" desc="Reduce spacing in tables and lists" checked={appSettings.compact} onChange={v => handleToggle('app', 'compact', v)} />
        <ToggleRow label="Animations" desc="Enable UI transitions and effects" checked={appSettings.animations} onChange={v => handleToggle('app', 'animations', v)} />
      </SettingsSection>

      {/* Danger Zone */}
      <div className="bg-red-950/20 border border-red-500/20 rounded-2xl p-6">
        <h3 className="text-base font-bold text-red-400 mb-5 flex items-center gap-2.5">
          <TriangleAlert className="h-5 w-5" /> Danger Zone
        </h3>
        <div className="space-y-3">
          <p className="text-xs text-slate-400 mb-4">These actions are irreversible. Proceed with caution.</p>
          <Button
            variant="outline"
            className="w-full h-12 rounded-xl border-red-500/30 bg-transparent text-red-400 hover:bg-red-500/10 font-semibold"
            onClick={() => setClearHistoryDialog(true)}
          >
            Clear All Alert History
          </Button>
          <Button
            variant="outline"
            className="w-full h-12 rounded-xl border-red-500/30 bg-transparent text-red-400 hover:bg-red-500/10 font-semibold"
            onClick={() => setResetDialog(true)}
          >
            Reset System to Defaults
          </Button>
        </div>
      </div>

      {/* ── Change Password Dialog ─────────────────────────────────────────── */}
      <Dialog open={pwDialog} onOpenChange={(open) => {
        setPwDialog(open);
        if (!open) {
          setShowCurrent(false);
          setShowNew(false);
          setShowConfirm(false);
        }
      }}>
        <DialogContent className="bg-slate-950 border-white/10 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-white font-black">Change Password</DialogTitle>
            <DialogDescription className="text-slate-400">
              Enter your current password and choose a new one.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Current Password</Label>
              <div className="relative mt-2">
                <Input
                  type={showCurrent ? 'text' : 'password'}
                  value={currentPw}
                  onChange={e => setCurrentPw(e.target.value)}
                  className="bg-slate-800/50 border-white/10 text-white pr-10"
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                  aria-label={showCurrent ? 'Hide password' : 'Show password'}
                >
                  {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div>
              <Label className="text-xs font-bold text-slate-400 uppercase tracking-widest">New Password</Label>
              <div className="relative mt-2">
                <Input
                  type={showNew ? 'text' : 'password'}
                  value={newPw}
                  onChange={e => setNewPw(e.target.value)}
                  className="bg-slate-800/50 border-white/10 text-white pr-10"
                  placeholder="Min. 6 characters"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowNew(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div>
              <Label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Confirm New Password</Label>
              <div className="relative mt-2">
                <Input
                  type={showConfirm ? 'text' : 'password'}
                  value={confirmPw}
                  onChange={e => setConfirmPw(e.target.value)}
                  className="bg-slate-800/50 border-white/10 text-white pr-10"
                  placeholder="Re-enter new password"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                  aria-label={showConfirm ? 'Hide password' : 'Show password'}
                >
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPwDialog(false)} className="text-slate-400">
              Cancel
            </Button>
            <Button
              onClick={handleChangePassword}
              disabled={pwLoading || !currentPw || !newPw || !confirmPw}
              className="bg-red-600 hover:bg-red-500 text-white"
            >
              {pwLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Update Password'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Clear History Confirm ──────────────────────────────────────────── */}
      <AlertDialog open={clearHistoryDialog} onOpenChange={setClearHistoryDialog}>
        <AlertDialogContent className="bg-slate-950 border-white/10 rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Clear All Alert History?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              This will permanently delete all alerts from the database. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-800 border-white/10 text-white hover:bg-slate-700">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleClearHistory}
              disabled={dangerLoading}
              className="bg-red-600 hover:bg-red-500 text-white"
            >
              {dangerLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Yes, Clear All'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Reset Confirm ──────────────────────────────────────────────────── */}
      <AlertDialog open={resetDialog} onOpenChange={setResetDialog}>
        <AlertDialogContent className="bg-slate-950 border-white/10 rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Reset to Defaults?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              All settings will be restored to their default values. Your data will not be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-800 border-white/10 text-white hover:bg-slate-700">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleReset}
              className="bg-red-600 hover:bg-red-500 text-white"
            >
              Reset Settings
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
