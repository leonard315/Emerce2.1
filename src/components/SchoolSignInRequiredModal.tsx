"use client";

import { useRouter } from 'next/navigation';
import { TriangleAlert, ShieldCheck, Stethoscope } from 'lucide-react';

type IncidentType = 'security' | 'drrm' | 'clinic' | 'all';

interface SchoolSignInRequiredModalProps {
  open: boolean;
  incidentType: IncidentType | null;
  onClose: () => void;
}

const typeConfig: Record<IncidentType, {
  label: string;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  btnColor: string;
  btnShadow: string;
}> = {
  security: {
    label: 'Security',
    icon: ShieldCheck,
    iconBg: 'bg-blue-500/20 border border-blue-500/30',
    iconColor: 'text-blue-400',
    btnColor: 'bg-blue-600 hover:bg-blue-500',
    btnShadow: 'shadow-[0_4px_16px_rgba(59,130,246,0.4)]',
  },
  drrm: {
    label: 'DRRM',
    icon: TriangleAlert,
    iconBg: 'bg-orange-500/20 border border-orange-500/30',
    iconColor: 'text-orange-400',
    btnColor: 'bg-orange-600 hover:bg-orange-500',
    btnShadow: 'shadow-[0_4px_16px_rgba(249,115,22,0.4)]',
  },
  clinic: {
    label: 'Clinic',
    icon: Stethoscope,
    iconBg: 'bg-red-500/20 border border-red-500/30',
    iconColor: 'text-red-400',
    btnColor: 'bg-red-600 hover:bg-red-500',
    btnShadow: 'shadow-[0_4px_16px_rgba(220,38,38,0.4)]',
  },
  all: {
    label: 'All Offices',
    icon: TriangleAlert,
    iconBg: 'bg-blue-500/20 border border-blue-500/30',
    iconColor: 'text-blue-400',
    btnColor: 'bg-blue-600 hover:bg-blue-500',
    btnShadow: 'shadow-[0_4px_16px_rgba(59,130,246,0.4)]',
  },
};

export function SchoolSignInRequiredModal({ open, incidentType, onClose }: SchoolSignInRequiredModalProps) {
  const router = useRouter();

  if (!open || !incidentType) return null;

  const config = typeConfig[incidentType];
  const Icon = config.icon;

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
            <span className="font-bold text-white">{config.label}</span> incident.
          </p>
          <p className="text-xs text-slate-500 mb-8">
            Your location will be captured automatically after sign in.
          </p>

          {/* Buttons */}
          <div className="flex gap-3 w-full mb-4">
            <button
              onClick={onClose}
              className="flex-1 py-3.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-sm transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => router.push('/auth')}
              className={`flex-1 py-3.5 rounded-2xl text-white font-bold text-sm transition-colors ${config.btnColor} ${config.btnShadow}`}
            >
              Sign In
            </button>
          </div>

          {/* Register link */}
          <p className="text-xs text-slate-400">
            No account?{' '}
            <button
              onClick={() => router.push('/auth?tab=register')}
              className="text-blue-400 hover:text-blue-300 font-semibold transition-colors"
            >
              Register free
            </button>
          </p>
        </div>
      </div>
    </>
  );
}
