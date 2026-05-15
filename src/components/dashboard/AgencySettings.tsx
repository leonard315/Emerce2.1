"use client";

import { useState } from 'react';
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { useAuth as useFirebaseAuth } from '@/firebase';
import { useFirestore } from '@/firebase';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Bell, Lock, Palette, Eye, EyeOff, Loader2 } from 'lucide-react';

function SettingsSection({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
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

function ToggleRow({ label, desc, checked, onChange, disabled }: {
  label: string; desc: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean;
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

export function AgencySettings() {
  const auth = useFirebaseAuth();
  const db = useFirestore();
  const { profile } = useAuth();
  const { toast } = useToast();

  // ── Notification preferences ───────────────────────────────────────────────
  const [notif, setNotif] = useState({ sound: true, push: true, email: false });

  // ── Appearance ─────────────────────────────────────────────────────────────
  const [appearance, setAppearance] = useState({ animations: true, compact: false });

  // ── Change password ────────────────────────────────────────────────────────
  const [pwDialog, setPwDialog] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);

  const saveSettings = async (section: string, data: Record<string, boolean>) => {
    if (!profile || !db) return;
    try {
      await setDoc(doc(db, 'agency_settings', profile.uid), { [section]: data }, { merge: true });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Save failed', description: e.message });
    }
  };

  const handleChangePassword = async () => {
    if (newPw !== confirmPw) { toast({ variant: 'destructive', title: 'Passwords do not match' }); return; }
    if (newPw.length < 6) { toast({ variant: 'destructive', title: 'Password too short', description: 'Minimum 6 characters.' }); return; }
    setPwLoading(true);
    try {
      const user = auth.currentUser;
      if (!user || !user.email) throw new Error('Not authenticated');
      const credential = EmailAuthProvider.credential(user.email, currentPw);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPw);
      if (db && profile) {
        const { serverTimestamp: ts } = await import('firebase/firestore');
        await setDoc(doc(db, 'security_logs', `${profile.uid}_${Date.now()}`), {
          uid: profile.uid, email: user.email, event: 'password_changed', timestamp: ts(),
        });
      }
      toast({ title: '✅ Password updated', description: `Security notification sent to ${user.email}` });
      setPwDialog(false); setCurrentPw(''); setNewPw(''); setConfirmPw('');
    } catch (e: any) {
      const msg = e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential'
        ? 'Current password is incorrect.' : e.message;
      toast({ variant: 'destructive', title: 'Failed to change password', description: msg });
    } finally { setPwLoading(false); }
  };

  return (
    <div className="space-y-4 w-full max-w-2xl">
      <h1 className="text-2xl font-black text-white">Settings</h1>

      {/* Notifications */}
      <SettingsSection icon={Bell} title="Notifications">
        <ToggleRow
          label="Alert Sound"
          desc="Play siren when a new incident arrives"
          checked={notif.sound}
          onChange={v => { const u = { ...notif, sound: v }; setNotif(u); saveSettings('notifications', u); }}
        />
        <ToggleRow
          label="Push Notifications"
          desc="Browser push alerts for new incidents"
          checked={notif.push}
          onChange={v => { const u = { ...notif, push: v }; setNotif(u); saveSettings('notifications', u); }}
        />
        <ToggleRow
          label="Email Notifications"
          desc="Receive incident alerts via email"
          checked={notif.email}
          onChange={v => { const u = { ...notif, email: v }; setNotif(u); saveSettings('notifications', u); }}
        />
      </SettingsSection>

      {/* Security */}
      <SettingsSection icon={Lock} title="Security">
        <div className="px-6 py-4 space-y-3">
          <p className="text-xs text-slate-400">Change your account password. You will need your current password to proceed.</p>
          <Button
            variant="outline"
            className="w-full h-12 rounded-xl border-white/10 bg-slate-800/50 text-white hover:bg-slate-700/50 font-semibold"
            onClick={() => setPwDialog(true)}
          >
            Change Password
          </Button>
        </div>
      </SettingsSection>

      {/* Appearance */}
      <SettingsSection icon={Palette} title="Appearance">
        <ToggleRow label="Dark Mode" desc="Always enabled for visibility" checked={true} onChange={() => {}} disabled />
        <ToggleRow
          label="Compact View"
          desc="Reduce spacing in alert list"
          checked={appearance.compact}
          onChange={v => { const u = { ...appearance, compact: v }; setAppearance(u); saveSettings('appearance', u); }}
        />
        <ToggleRow
          label="Animations"
          desc="Enable UI transitions and effects"
          checked={appearance.animations}
          onChange={v => { const u = { ...appearance, animations: v }; setAppearance(u); saveSettings('appearance', u); }}
        />
      </SettingsSection>

      {/* Change Password Dialog */}
      <Dialog open={pwDialog} onOpenChange={open => { setPwDialog(open); if (!open) { setShowCurrent(false); setShowNew(false); setShowConfirm(false); } }}>
        <DialogContent className="bg-slate-950 border-white/10 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-white font-black">Change Password</DialogTitle>
            <DialogDescription className="text-slate-400">Enter your current password and choose a new one.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {[
              { label: 'Current Password', value: currentPw, set: setCurrentPw, show: showCurrent, setShow: setShowCurrent, auto: 'current-password' },
              { label: 'New Password', value: newPw, set: setNewPw, show: showNew, setShow: setShowNew, auto: 'new-password' },
              { label: 'Confirm New Password', value: confirmPw, set: setConfirmPw, show: showConfirm, setShow: setShowConfirm, auto: 'new-password' },
            ].map(f => (
              <div key={f.label}>
                <Label className="text-xs font-bold text-slate-400 uppercase tracking-widest">{f.label}</Label>
                <div className="relative mt-2">
                  <Input
                    type={f.show ? 'text' : 'password'}
                    value={f.value}
                    onChange={e => f.set(e.target.value)}
                    className="bg-slate-800/50 border-white/10 text-white pr-10"
                    placeholder="••••••••"
                    autoComplete={f.auto}
                  />
                  <button type="button" onClick={() => f.setShow((v: boolean) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white">
                    {f.show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPwDialog(false)} className="text-slate-400">Cancel</Button>
            <Button onClick={handleChangePassword} disabled={pwLoading || !currentPw || !newPw || !confirmPw} className="bg-blue-600 hover:bg-blue-500 text-white">
              {pwLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Update Password'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
