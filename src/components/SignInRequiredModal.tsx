"use client";

import { useRouter } from 'next/navigation';
import { TriangleAlert, Flame, ShieldCheck, Heart } from 'lucide-react';

type EmergencyType = 'fire' | 'crime' | 'medical' | 'all';

interface SignInRequiredModalProps {
  open: boolean;
  emergencyType: EmergencyType | null;
  onClose: () => void;
}

const typeConfig: Record<EmergencyType, {
  label: string;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
}> = {
  fire: {
    label: 'Fire',
    icon: Flame,
    iconBg: 'bg-orange-500/20 border border-orange-500/30',
    iconColor: 'text-orange-400',
  },
  crime: {
    label: 'Police',
    icon: ShieldCheck,
    iconBg: 'bg-blue-500/20 border border-blue-500/30',
    iconColor: 'text-blue-400',
  },
  medical: {
    label: 'Medical',
    icon: Heart,
    iconBg: 'bg-red-500/20 border border-red-500/30',
    iconColor: 'text-red-400',
  },
  all: {
    label: 'All Agencies',
    icon: TriangleAlert,
    iconBg: 'bg-orange-500/20 border border-orange-500/30',
    iconColor: 'text-orange-400',
  },
};

export function SignInRequiredModal({ open, emergencyType, onClose }: SignInRequiredModalProps) {
  const router = useRouter();

  if (!open || !emergencyType) return null;

  const config = typeConfig[emergencyType];
  const Icon = config.icon;

  const handleSignIn = () => {
    router.push('/auth');
  };

  const handleRegister = () => {
    router.push('/auth?tab=register');
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
        <div className="w-full max-w-sm rounded-3xl bg-[hsl(222,47%,8%)] border border-white/10 shadow-2xl p-8 flex flex-col items-center text-center animate-in zoom-in-95 duration-200">

          {/* Icon */}
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-5 ${config.iconBg}`}>
            <Icon className={`h-8 w-8 ${config.iconColor}`} strokeWidth={1.75} />
          </div>

          {/* Title */}
          <h2 className="text-2xl font-black text-white mb-3">
            Sign In Required
          </h2>

          {/* Description */}
          <p className="text-sm text-slate-300 mb-1 leading-relaxed">
            You need an account to report a{' '}
            <span className="font-bold text-white">{config.label}</span> emergency.
          </p>
          <p className="text-xs text-slate-500 mb-8">
            Your location will be captured automatically after sign in.
          </p>

          {/* Buttons */}
          <div className="flex gap-3 w-full mb-4">
            <button
              onClick={onClose}
              className="flex-1 h-13 py-3.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-sm transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSignIn}
              className="flex-1 h-13 py-3.5 rounded-2xl bg-red-600 hover:bg-red-500 text-white font-bold text-sm transition-colors shadow-[0_4px_16px_rgba(220,38,38,0.4)]"
            >
              Sign In
            </button>
          </div>

          {/* Register link */}
          <p className="text-xs text-slate-400">
            No account?{' '}
            <button
              onClick={handleRegister}
              className="text-red-400 hover:text-red-300 font-semibold transition-colors"
            >
              Register free
            </button>
          </p>
        </div>
      </div>
    </>
  );
}
