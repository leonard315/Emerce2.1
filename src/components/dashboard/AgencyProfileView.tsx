"use client";

import { useEffect, useState } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { useAuth } from '@/hooks/use-auth';
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Camera, Pencil, Check, X, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import Image from 'next/image';

interface AgencyProfileViewProps {
  agencyColor: string;
  badgeClass: string;
}

export function AgencyProfileView({ agencyColor, badgeClass }: AgencyProfileViewProps) {
  const { profile } = useAuth();
  const db = useFirestore();
  const { toast } = useToast();

  const [mounted, setMounted] = useState(false);
  const [editing, setEditing] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (profile?.name) setNameValue(profile.name);
  }, [profile?.name]);

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

  if (!mounted) return null;

  return (
    <div className="space-y-6 w-full max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-white tracking-tight">My Profile</h1>
        {!editing ? (
          <Button
            variant="outline"
            size="sm"
            className="h-9 px-4 border-white/10 bg-white/5 hover:bg-white/10 text-white gap-2 rounded-xl"
            onClick={() => setEditing(true)}
          >
            <Pencil className="h-3.5 w-3.5" /> Edit Profile
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-9 px-3 text-slate-400 hover:text-white rounded-xl"
              onClick={() => { setEditing(false); setNameValue(profile?.name || ''); }}
              disabled={saving}
            >
              <X className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              className="h-9 px-4 bg-green-600 hover:bg-green-500 text-white font-bold rounded-xl gap-2"
              onClick={handleSave}
              disabled={saving || !nameValue.trim()}
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Save
            </Button>
          </div>
        )}
      </div>

      {/* Profile card */}
      <Card className="bg-slate-900/40 border-white/5 rounded-2xl p-6">
        {/* Avatar + info */}
        <div className="flex items-center gap-5 mb-6">
          <div className="relative flex-shrink-0">
            <div className={cn(
              "h-20 w-20 rounded-2xl border overflow-hidden flex items-center justify-center font-black text-3xl",
              badgeClass
            )}>
              {profile?.photoURL ? (
                <Image src={profile.photoURL} alt="Avatar" fill className="object-cover" />
              ) : (
                profile?.name?.charAt(0)?.toUpperCase() || '?'
              )}
            </div>
            <label
              htmlFor="agency-avatar-upload"
              className="absolute -bottom-1.5 -right-1.5 h-7 w-7 rounded-lg bg-slate-700 hover:bg-slate-600 border border-white/10 flex items-center justify-center cursor-pointer transition-colors"
              title="Change photo"
            >
              <Camera className="h-3.5 w-3.5 text-white" />
            </label>
            <input
              id="agency-avatar-upload"
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handlePhotoUpload(f); }}
            />
          </div>
          <div>
            <h2 className="text-xl font-black text-white">{profile?.name}</h2>
            <p className="text-sm text-slate-400">{profile?.email}</p>
            <Badge className={cn("text-xs font-bold mt-2 capitalize", badgeClass)}>
              {profile?.role} Agency
            </Badge>
          </div>
        </div>

        <Separator className="bg-white/5 mb-6" />

        <div className="space-y-4">
          {/* Full Name — editable */}
          <div>
            <Label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Full Name</Label>
            <Input
              value={nameValue}
              onChange={e => setNameValue(e.target.value)}
              className={cn(
                "mt-2 border-white/10 text-white transition-colors",
                editing
                  ? "bg-slate-800 border-white/20 focus-visible:ring-blue-500/40"
                  : "bg-slate-800/50 cursor-default"
              )}
              readOnly={!editing}
              onKeyDown={e => { if (e.key === 'Enter' && editing) handleSave(); }}
            />
          </div>

          {/* Email — always read-only */}
          <div>
            <Label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Email</Label>
            <Input
              value={profile?.email || ''}
              className="mt-2 bg-slate-800/50 border-white/10 text-slate-400 cursor-default"
              readOnly
            />
            <p className="text-[10px] text-slate-600 mt-1">Email cannot be changed</p>
          </div>

          {/* Role — always read-only */}
          <div>
            <Label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Role</Label>
            <Input
              value={profile?.role?.toUpperCase() || ''}
              className="mt-2 bg-slate-800/50 border-white/10 text-slate-400 cursor-default"
              readOnly
            />
          </div>
        </div>
      </Card>
    </div>
  );
}
