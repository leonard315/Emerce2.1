
"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { UserDashboard } from '@/components/dashboard/UserDashboard';
import { AdminDashboard } from '@/components/dashboard/AdminDashboard';
import { FireDashboard } from '@/components/dashboard/FireDashboard';
import { PoliceDashboard } from '@/components/dashboard/PoliceDashboard';
import { MedicalDashboard } from '@/components/dashboard/MedicalDashboard';
import { Loader2 } from 'lucide-react';
import { useAuth as useFirebase } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { signOut } from 'firebase/auth';
import { clearLoginTimestamp } from '@/firebase';

export default function DashboardPage() {
  const { user, profile, loading } = useAuth();
  const auth = useFirebase();
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/auth');
    }
  }, [user, loading, router]);

  const handleLogout = async () => {
    try {
      clearLoginTimestamp();
      await signOut(auth);
      router.push('/auth');
    } catch (e: any) {
      toast({ variant: "destructive", title: "Logout Failed", description: e.message });
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Node Not Initialized block removed to allow direct dashboard access

  if (!user || !profile) return null;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* DashboardHeader only for admin — agency/user dashboards render it inside their SidebarInset */}
      {profile.role !== 'admin' && profile.role !== 'user' && profile.role !== 'fire' && profile.role !== 'police' && profile.role !== 'medical' && <DashboardHeader />}
      <main className={profile.role !== 'admin' ? "flex-1" : "flex-1"}>
        {profile.role === 'user' && <UserDashboard />}
        {profile.role === 'fire' && <FireDashboard />}
        {profile.role === 'police' && <PoliceDashboard />}
        {profile.role === 'medical' && <MedicalDashboard />}
        {profile.role === 'admin' && <AdminDashboard />}
      </main>
    </div>
  );
}
