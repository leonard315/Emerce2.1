"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth as useFirebaseHooks, useDatabase } from '@/firebase';
import { signOut } from 'firebase/auth';
import { ref, onValue, set, onDisconnect, serverTimestamp } from 'firebase/database';
import { Button } from "@/components/ui/button";
import { TriangleAlert, LogOut, Radio } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { clearLoginTimestamp } from '@/firebase';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";

interface DashboardHeaderProps {
  sidebarTrigger?: React.ReactNode;
}

export function DashboardHeader({ sidebarTrigger }: DashboardHeaderProps = {}) {
  const auth = useFirebaseHooks();
  const rtdb = useDatabase();
  const { profile, user } = useAuth();
  const [activeResponders, setActiveResponders] = useState(0);

  useEffect(() => {
    if (!rtdb || !user || !profile) return;

    // Presence logic for Agency users
    if (['fire', 'police', 'medical'].includes(profile.role)) {
      const presenceRef = ref(rtdb, `status/${profile.role}/${user.uid}`);
      set(presenceRef, {
        name: profile.name,
        lastActive: serverTimestamp(),
        online: true,
      });
      onDisconnect(presenceRef).remove();
    }

    // Global listener for all active responders
    const statusRef = ref(rtdb, 'status');
    const unsubscribe = onValue(statusRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) { setActiveResponders(0); return; }
      let count = 0;
      Object.values(data).forEach((roleGroup: any) => {
        count += Object.keys(roleGroup).length;
      });
      setActiveResponders(count);
    });

    return () => unsubscribe();
  }, [rtdb, user, profile]);

  const handleLogout = async () => {
    clearLoginTimestamp();
    await signOut(auth);
    router.push('/');
  };

  // Role badge color
  const roleBadgeColor =
    profile?.role === 'fire' ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' :
    profile?.role === 'police' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
    profile?.role === 'medical' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
    profile?.role === 'admin' ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' :
    'bg-slate-500/10 text-slate-400 border-slate-500/20';

  return (
    <header className="h-16 border-b border-white/5 bg-[#020617]/90 backdrop-blur-xl flex items-center justify-between px-4 sm:px-6 lg:px-10 sticky top-0 z-50">
      {/* Left — optional sidebar trigger (tablet) + brand */}
      <div className="flex items-center gap-3 min-w-0">
        {sidebarTrigger && (
          <div className="xl:hidden flex-shrink-0">{sidebarTrigger}</div>
        )}
        {/* Brand */}
        <Link href="/dashboard" className="flex items-center gap-3 min-w-0">
          <div className="flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-lg overflow-hidden shadow-lg shadow-red-900/40">
              <img src="/icons/logo.png" alt="Logo" className="w-full h-full object-cover" />
            </div>
          <div className="min-w-0">
            <p className="text-sm font-bold leading-tight tracking-tight text-white truncate">
              Emergency Hotline
            </p>
            <p className="hidden sm:block text-[10px] text-slate-500 leading-tight tracking-wide truncate">
              Smart Multi-Emergency Alarm System
            </p>
          </div>
        </Link>
      </div>

      {/* Center status badges — desktop only */}
      <div className="hidden xl:flex items-center gap-4">
        <Badge
          variant="outline"
          className="flex items-center gap-2 bg-green-500/5 text-green-500 border-green-500/20 py-1.5 font-bold text-[10px] uppercase tracking-widest px-3 rounded-xl"
        >
          <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
          Grid Active
        </Badge>
        <Badge
          variant="secondary"
          className="flex items-center gap-2 py-1.5 px-3 rounded-xl bg-slate-900 text-slate-300 border border-white/5 font-bold text-[10px] uppercase tracking-widest"
        >
          <Radio className="h-3 w-3 text-primary animate-pulse" />
          <span className="text-white">{activeResponders}</span> nodes online
        </Badge>
      </div>

      {/* Right — user info + avatar dropdown */}
      <div className="flex items-center gap-3 flex-shrink-0">
        {/* Role + name — hidden on small screens */}
        <div className="hidden md:flex flex-col items-end gap-0.5">
          <Badge variant="outline" className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-lg border ${roleBadgeColor}`}>
            {profile?.role}
          </Badge>
          <span className="text-xs font-semibold text-white truncate max-w-[140px]">{profile?.name}</span>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="relative h-10 w-10 rounded-xl hover:bg-slate-900 transition-all border border-white/5 p-0 overflow-hidden"
            >
              <Avatar className="h-full w-full rounded-none">
                <AvatarImage
                  key={profile?.photoURL || profile?.uid}
                  src={profile?.photoURL || `https://picsum.photos/seed/${profile?.uid}/200`}
                  alt={profile?.name || ''}
                />
                <AvatarFallback className="bg-red-600/20 text-red-400 font-black text-sm rounded-none">
                  {profile?.name?.charAt(0) || 'U'}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-72 rounded-2xl p-3 bg-slate-950 border-white/5 shadow-2xl"
            align="end"
            forceMount
          >
            <DropdownMenuLabel className="font-normal p-4">
              <div className="flex flex-col gap-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  Signed in as
                </p>
                <p className="text-base font-black text-white leading-none">{profile?.name}</p>
                <p className="text-xs text-slate-500">{profile?.email}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-white/5 mx-1" />
            <DropdownMenuItem
              onClick={handleLogout}
              className="text-red-400 cursor-pointer font-semibold text-sm p-4 rounded-xl hover:bg-red-500/10 transition-all flex items-center gap-3"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
