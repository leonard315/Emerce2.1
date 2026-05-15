"use client";

import { useState, useEffect } from 'react';
import { Flame, ShieldCheck, HeartPulse, TriangleAlert, AlertOctagon, ChevronRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const ONBOARDING_KEY = 'eh_onboarded_v1';

const slides = [
  {
    icon: <img src="/icons/logo.png" alt="Logo" className="w-20 h-20 rounded-2xl object-cover shadow-2xl" />,
    title: 'Emergency Hotline',
    subtitle: 'Smart Multi-Emergency Alarm System',
    body: 'A color-coded alert device for integrated emergency response. Report fire, crime, or medical emergencies instantly — directly to the right agency.',
    accent: 'from-red-600 to-red-900',
  },
  {
    icon: (
      <div className="grid grid-cols-2 gap-3">
        <div className="h-14 w-14 rounded-2xl bg-orange-500/20 flex items-center justify-center"><Flame className="h-7 w-7 text-orange-400" /></div>
        <div className="h-14 w-14 rounded-2xl bg-blue-500/20 flex items-center justify-center"><ShieldCheck className="h-7 w-7 text-blue-400" /></div>
        <div className="h-14 w-14 rounded-2xl bg-red-500/20 flex items-center justify-center"><HeartPulse className="h-7 w-7 text-red-400" /></div>
        <div className="h-14 w-14 rounded-2xl bg-slate-500/20 flex items-center justify-center"><TriangleAlert className="h-7 w-7 text-slate-400" /></div>
      </div>
    ),
    title: 'Four Emergency Types',
    subtitle: 'Fire · Police · Rescue & Medical · All Agencies',
    body: 'Tap the matching button to alert the Bureau of Fire Protection (BFP), Philippine National Police (PNP), Emergency Medical Services (EMS), or all agencies at once.',
    accent: 'from-blue-600 to-blue-900',
  },
  {
    icon: <div className="h-20 w-20 rounded-2xl bg-green-500/20 flex items-center justify-center"><span className="text-4xl">📍</span></div>,
    title: 'Real-Time Location',
    subtitle: 'Your exact address is sent automatically',
    body: 'When you report an emergency, your GPS location and street address are shared with responders so they can reach you faster. Always allow location access.',
    accent: 'from-green-600 to-green-900',
  },
  {
    icon: <div className="h-20 w-20 rounded-2xl bg-yellow-500/20 flex items-center justify-center"><AlertOctagon className="h-10 w-10 text-yellow-400" /></div>,
    title: 'Account Suspension Notice',
    subtitle: 'False reports are strictly prohibited',
    body: (
      <span>
        Sending <span className="text-red-400 font-bold">false or fake emergency reports</span> is a violation of our terms and Philippine law.{' '}
        <span className="text-yellow-400 font-bold">3 violations</span> will result in permanent account suspension and may lead to legal action.
      </span>
    ),
    accent: 'from-yellow-600 to-yellow-900',
  },
];

export function OnboardingScreen({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const isLast = step === slides.length - 1;

  const next = () => {
    if (isLast) {
      // Mark as seen for this session so Back to Home doesn't re-show it
      sessionStorage.setItem(ONBOARDING_KEY, '1');
      onDone();
    } else {
      setStep(s => s + 1);
    }
  };

  const skip = () => {
    sessionStorage.setItem(ONBOARDING_KEY, '1');
    onDone();
  };

  const slide = slides[step];

  return (
    <div className="fixed inset-0 z-[200] bg-[#020617] flex flex-col items-center justify-between px-6 py-10 animate-in fade-in duration-300">
      {/* Skip button */}
      <div className="w-full flex justify-end">
        {!isLast && (
          <button onClick={skip} className="text-xs text-slate-500 hover:text-white font-semibold flex items-center gap-1 transition-colors">
            Skip <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Slide content */}
      <div className="flex-1 flex flex-col items-center justify-center text-center gap-6 max-w-sm w-full">
        {/* Icon */}
        <div className="flex items-center justify-center mb-2">
          {slide.icon}
        </div>

        {/* Text */}
        <div className="space-y-2">
          <h1 className="text-2xl font-black text-white tracking-tight">{slide.title}</h1>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{slide.subtitle}</p>
          <p className="text-sm text-slate-300 leading-relaxed mt-3">{slide.body}</p>
        </div>
      </div>

      {/* Bottom — dots + button */}
      <div className="w-full max-w-sm space-y-6">
        {/* Step dots */}
        <div className="flex items-center justify-center gap-2">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              className={cn(
                "rounded-full transition-all duration-300",
                i === step ? "w-6 h-2 bg-red-500" : "w-2 h-2 bg-slate-700 hover:bg-slate-500"
              )}
            />
          ))}
        </div>

        {/* CTA button */}
        <button
          onClick={next}
          className={cn(
            "w-full h-14 rounded-2xl font-black text-white text-base flex items-center justify-center gap-2 transition-all active:scale-95 shadow-2xl",
            isLast
              ? "bg-red-600 hover:bg-red-500 shadow-red-900/50"
              : "bg-slate-800 hover:bg-slate-700 border border-white/10"
          )}
        >
          {isLast ? 'Get Started' : (
            <>Next <ChevronRight className="h-5 w-5" /></>
          )}
        </button>
      </div>
    </div>
  );
}

export function useOnboarding() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Show onboarding only once per session (sessionStorage clears when browser/tab is closed)
    const seen = sessionStorage.getItem(ONBOARDING_KEY);
    if (!seen) {
      const t = setTimeout(() => setShow(true), 150);
      return () => clearTimeout(t);
    }
  }, []);

  return { show, done: () => setShow(false) };
}
