"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AuthProvider, useAuth } from '@/hooks/use-auth';
import { LiveMapView } from '@/components/map/LiveMapView';
import { Loader2 } from 'lucide-react';

function MapPageContent() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/auth');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#020617]">
        <Loader2 className="h-8 w-8 animate-spin text-red-500" />
      </div>
    );
  }

  if (!user) return null;

  return <LiveMapView />;
}

export default function MapPage() {
  return (
    <AuthProvider>
      <MapPageContent />
    </AuthProvider>
  );
}
