'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  ShieldCheck,
  TriangleAlert,
  Stethoscope,
  Home as HomeIcon,
  Map,
  ClipboardList,
  User,
  Download,
} from 'lucide-react';
import { SchoolSignInRequiredModal } from '@/components/SchoolSignInRequiredModal';
import { OnboardingScreen, useOnboarding } from '@/components/OnboardingScreen';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// ─── School incident button data ──────────────────────────────────────────────

const incidentTypes = [
  {
    id: 'security' as const,
    label: 'SECURITY',
    subtitle: 'School Security Office',
    icon: ShieldCheck,
    bg: 'bg-gradient-to-br from-blue-500 to-blue-700',
    shadow: 'shadow-[0_8px_40px_rgba(59,130,246,0.5)]',
    hover: 'hover:brightness-110 hover:scale-[1.03]',
  },
  {
    id: 'drrm' as const,
    label: 'DRRM',
    subtitle: 'Disaster Risk Reduction',
    icon: TriangleAlert,
    bg: 'bg-gradient-to-br from-orange-500 to-orange-700',
    shadow: 'shadow-[0_8px_40px_rgba(249,115,22,0.5)]',
    hover: 'hover:brightness-110 hover:scale-[1.03]',
  },
  {
    id: 'clinic' as const,
    label: 'CLINIC',
    subtitle: 'School Medical Office',
    icon: Stethoscope,
    bg: 'bg-gradient-to-br from-rose-500 to-red-700',
    shadow: 'shadow-[0_8px_40px_rgba(244,63,94,0.5)]',
    hover: 'hover:brightness-110 hover:scale-[1.03]',
  },
  {
    id: 'all' as const,
    label: 'ALL OFFICES',
    subtitle: 'Security + DRRM + Clinic',
    icon: TriangleAlert,
    bg: 'bg-gradient-to-br from-slate-600 to-slate-800',
    shadow: 'shadow-[0_8px_40px_rgba(100,116,139,0.35)]',
    hover: 'hover:brightness-125 hover:scale-[1.03]',
  },
] as const;

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SchoolPage() {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<'security' | 'drrm' | 'clinic' | 'all' | null>(null);
  const { show: showOnboarding, done: onboardingDone } = useOnboarding();
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
    }
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') setIsInstalled(true);
    setInstallPrompt(null);
  };

  const handleIncidentTap = (type: 'security' | 'drrm' | 'clinic' | 'all') => {
    setSelectedType(type);
    setModalOpen(true);
  };

  const handleSosPress = () => {
    setSelectedType('all');
    setModalOpen(true);
  };

  return (
    <div className="relative flex flex-col min-h-screen bg-[#020617] text-foreground overflow-hidden">
      {/* Onboarding */}
      {showOnboarding && <OnboardingScreen onDone={onboardingDone} />}

      {/* Background glow — blue tint for school theme */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background:
            'radial-gradient(ellipse 70% 50% at 50% 30%, rgba(59,130,246,0.15) 0%, rgba(10,30,80,0.07) 55%, transparent 80%)',
        }}
      />

      {/* ── Navbar ─────────────────────────────────────────────────────────── */}
      <header className="relative z-20 sticky top-0 flex items-center justify-between px-4 sm:px-6 lg:px-10 h-16 border-b border-white/5 bg-[#020617]/80 backdrop-blur-xl">
        {/* Brand */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-lg overflow-hidden shadow-lg shadow-blue-900/40">
            <img src="/icons/logo.png" alt="Logo" className="w-full h-full object-cover" />
          </div>
          <div className="min-w-0">
            <p className="text-base font-bold leading-tight tracking-tight truncate">
              School Emergency
            </p>
            <p className="hidden xl:block text-[10px] text-muted-foreground leading-tight tracking-wide truncate">
              School Incident Reporting System
            </p>
          </div>
        </div>

        {/* Auth actions */}
        <nav className="flex items-center gap-2 flex-shrink-0">
          {installPrompt && !isInstalled && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleInstall}
              className="h-9 px-3 text-xs font-semibold border-white/20 hover:border-white/40 hover:bg-white/5 gap-1.5"
            >
              <Download className="h-3.5 w-3.5" /> Install
            </Button>
          )}
          <Link href="/auth">
            <Button
              variant="outline"
              size="sm"
              className="h-9 px-5 text-sm font-semibold border-white/30 hover:border-white/50 hover:bg-white/5"
            >
              Sign In
            </Button>
          </Link>
          <Link href="/auth?tab=register">
            <Button
              size="sm"
              className="h-9 px-5 text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white border-0 shadow-lg shadow-blue-900/30"
            >
              Register
            </Button>
          </Link>
        </nav>
      </header>

      {/* ── Main content ───────────────────────────────────────────────────── */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-5 pt-8 pb-28 xl:pb-12">
        {/* Pill badge */}
        <div className="flex items-center gap-2 mb-8 px-5 py-2 rounded-full border border-blue-800/60 bg-blue-950/40">
          <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-500 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500" />
          </span>
          <span className="text-sm text-white/80 font-medium whitespace-nowrap">
            Tap any button to report an incident
          </span>
        </div>

        {/* Heading */}
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight text-center mb-3 leading-tight">
          Report Incident
        </h1>

        {/* Subtitle */}
        <p className="text-sm sm:text-base text-muted-foreground text-center max-w-xs sm:max-w-sm mb-10 leading-relaxed">
          Select the type of incident — you&apos;ll be asked to sign in first.
        </p>

        {/* Incident grid */}
        <div className="grid grid-cols-2 gap-3 w-full max-w-[420px] sm:max-w-md lg:max-w-xl">
          {incidentTypes.map(({ id, label, subtitle, icon: Icon, bg, shadow, hover }) => (
            <button
              key={id}
              onClick={() => handleIncidentTap(id)}
              aria-label={`Report ${label} incident`}
              className={`
                group relative flex flex-col items-center justify-center gap-3
                rounded-2xl cursor-pointer select-none aspect-square
                transition-all duration-200 ease-out active:scale-95
                ${bg} ${shadow} ${hover}
              `}
            >
              <Icon className="h-10 w-10 sm:h-12 sm:w-12 text-white drop-shadow-md" strokeWidth={1.5} />
              <div className="flex flex-col items-center gap-1">
                <span className="text-base sm:text-xl font-black text-white tracking-widest uppercase leading-none">
                  {label}
                </span>
                <span className="text-xs sm:text-sm text-white/60 font-medium tracking-wide">{subtitle}</span>
              </div>
            </button>
          ))}
        </div>

        {/* Inline auth links */}
        <p className="mt-8 text-xs text-muted-foreground text-center">
          Already have an account?{' '}
          <Link href="/auth" className="text-blue-400 hover:text-blue-300 font-semibold">
            Sign in
          </Link>
          {' · '}
          New here?{' '}
          <Link href="/auth?tab=register" className="text-blue-400 hover:text-blue-300 font-semibold">
            Register
          </Link>
        </p>
      </main>

      {/* ── Desktop footer ──────────────────────────────────────────────────── */}
      <footer className="relative z-10 hidden xl:flex items-center justify-between px-6 lg:px-10 py-4 border-t border-white/5 bg-[#020617]/60 backdrop-blur-sm text-[11px] text-muted-foreground">
        <span>School Emergency — School Incident Reporting System</span>
        <span>© 2026 · Mindoro State University</span>
      </footer>

      {/* ── Mobile/Tablet bottom navigation ────────────────────────────────── */}
      <nav
        aria-label="Mobile navigation"
        className="xl:hidden fixed bottom-0 inset-x-0 z-30 bg-[hsl(222,47%,6%)] border-t border-white/10"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0px)' }}
      >
        <div className="relative flex items-end justify-around h-[60px] px-4">

          {/* Home */}
          <Link
            href="/school"
            className="flex flex-col items-center justify-center gap-1 flex-1 h-full text-white/60 hover:text-white transition-colors"
            aria-current="page"
          >
            <HomeIcon className="h-[22px] w-[22px]" strokeWidth={1.5} />
            <span className="text-[10px] font-medium tracking-wide">Home</span>
          </Link>

          {/* Map */}
          <Link
            href="/auth"
            className="flex flex-col items-center justify-center gap-1 flex-1 h-full text-white/40 hover:text-white/60 transition-colors"
          >
            <Map className="h-[22px] w-[22px]" strokeWidth={1.5} />
            <span className="text-[10px] font-medium tracking-wide">Map</span>
          </Link>

          {/* SOS — elevated center button */}
          <div className="flex flex-col items-center justify-end flex-1 pb-2 relative">
            <div className="absolute bottom-[calc(100%-12px)] flex flex-col items-center">
              <button
                onClick={handleSosPress}
                aria-label="SOS — report incident"
                className="flex items-center justify-center w-[58px] h-[58px] rounded-full bg-blue-600 shadow-[0_0_24px_6px_rgba(59,130,246,0.5)] hover:bg-blue-500 active:scale-95 transition-all duration-150"
              >
                <TriangleAlert className="h-7 w-7 text-white" strokeWidth={2} />
              </button>
            </div>
            <span className="text-[10px] font-medium text-white/40 tracking-wide">SOS</span>
          </div>

          {/* History */}
          <Link
            href="/auth"
            className="flex flex-col items-center justify-center gap-1 flex-1 h-full text-white/40 hover:text-white/60 transition-colors"
          >
            <ClipboardList className="h-[22px] w-[22px]" strokeWidth={1.5} />
            <span className="text-[10px] font-medium tracking-wide">History</span>
          </Link>

          {/* Profile */}
          <Link
            href="/auth"
            className="flex flex-col items-center justify-center gap-1 flex-1 h-full text-white/40 hover:text-white/60 transition-colors"
          >
            <User className="h-[22px] w-[22px]" strokeWidth={1.5} />
            <span className="text-[10px] font-medium tracking-wide">Profile</span>
          </Link>

        </div>
      </nav>

      {/* Sign In Required Modal */}
      <SchoolSignInRequiredModal
        open={modalOpen}
        incidentType={selectedType}
        onClose={() => setModalOpen(false)}
      />
    </div>
  );
}
