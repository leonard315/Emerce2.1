"use client";

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { useAuth as useFirebaseHooks, useFirestore } from '@/firebase';
import { setLoginTimestamp } from '@/firebase';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, Eye, EyeOff, HomeIcon, Mail } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { UserRole } from '@/lib/types';
import Link from 'next/link';

// ─── Shared styles ────────────────────────────────────────────────────────────
const cardCls = "w-full rounded-2xl bg-[hsl(222,47%,8%)] border border-white/5 shadow-2xl p-5 sm:p-8";
const inputCls = "h-12 rounded-xl bg-[hsl(222,47%,11%)] border border-white/8 text-white placeholder:text-white/25 focus-visible:ring-red-500/40 focus-visible:border-red-500/50 text-sm caret-white";
const labelCls = "text-sm font-semibold text-white mb-1 block";
const submitCls = "w-full h-12 rounded-xl bg-red-600 hover:bg-red-500 active:scale-[0.98] text-white font-bold text-sm tracking-wide transition-all duration-150 shadow-[0_4px_16px_rgba(220,38,38,0.4)] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center";

// ─── Siren icon (module-level — stable reference) ─────────────────────────────
function SirenIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 18H17" />
      <path d="M12 2v1" />
      <path d="M4.22 10.22l.77.77" />
      <path d="M19.01 10.99l-.77-.77" />
      <path d="M12 6a6 6 0 0 1 6 6v2H6v-2a6 6 0 0 1 6-6z" />
      <path d="M10 21h4" />
    </svg>
  );
}

// ─── Page shell (module-level — stable reference, never recreated on re-render) ─
function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-[hsl(222,47%,4%)] px-4 py-10 sm:py-16">
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0" style={{
        background: 'radial-gradient(ellipse 70% 55% at 50% 40%, rgba(180,30,30,0.12) 0%, transparent 70%)',
      }} />
      <div className="relative z-10 w-full max-w-[420px] flex flex-col items-center gap-5">
        {/* Brand */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-2xl overflow-hidden shadow-[0_8px_32px_rgba(220,38,38,0.5)]">
            <img src="/icons/logo.png" alt="Emergency Hotline" className="w-full h-full object-cover" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">Emergency Hotline</h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">Smart Multi-Emergency Alarm System</p>
          </div>
        </div>

        {/* Card — full width on mobile */}
        <div className="w-full">
          {children}
        </div>

        <Link href="/" className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-white transition-colors">
          <HomeIcon className="h-3.5 w-3.5" />
          Back to Home
        </Link>
      </div>
    </div>
  );
}

// ─── Agency dots (module-level) ───────────────────────────────────────────────
function AgencyDots() {
  return (
    <div className="flex items-center gap-5 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-orange-500 inline-block" />BFP
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-blue-500 inline-block" />PNP
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-red-500 inline-block" />EMS
      </span>
    </div>
  );
}

// ─── Auth content ─────────────────────────────────────────────────────────────
function AuthContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const auth = useFirebaseHooks();
  const db = useFirestore();
  const { toast } = useToast();

  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [sex, setSex] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<'login' | 'register'>('login');
  const [forgotOpen, setForgotOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  useEffect(() => {
    setMounted(true);
    const tab = searchParams.get('tab');
    if (tab === 'register') setActiveTab('register');
    else setActiveTab('login');
  }, [searchParams]);

  const finalizeProfile = async (uid: string, userEmail: string, userName: string, userRole: UserRole, userAge?: number, userSex?: string) => {
    const batch = writeBatch(db);
    batch.set(doc(db, 'users', uid), {
      uid, name: userName || userEmail.split('@')[0],
      email: userEmail, role: userRole, createdAt: serverTimestamp(),
      ...(userAge !== undefined && { age: userAge }),
      ...(userSex && { sex: userSex }),
    });
    const roleCollection =
      userRole === 'admin' ? 'roles_admin' :
      userRole === 'fire' ? 'roles_fire_agency' :
      userRole === 'police' ? 'roles_police_agency' :
      userRole === 'medical' ? 'roles_medical_agency' : 'roles_general_users';
    batch.set(doc(db, roleCollection, uid), { active: true });
    await batch.commit();
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast({ variant: 'destructive', title: 'Password mismatch', description: 'Passwords do not match.' });
      return;
    }
    if (!age || isNaN(Number(age)) || Number(age) < 1 || Number(age) > 120) {
      toast({ variant: 'destructive', title: 'Invalid age', description: 'Please enter a valid age.' });
      return;
    }
    if (!sex) {
      toast({ variant: 'destructive', title: 'Sex required', description: 'Please select your sex.' });
      return;
    }
    setLoading(true);
    try {
      let uid = '';
      try {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        uid = cred.user.uid;
      } catch (err: any) {
        if (err.code === 'auth/email-already-in-use' && auth.currentUser?.email === email) {
          uid = auth.currentUser.uid;
        } else throw err;
      }
      await finalizeProfile(uid, email, name, 'user', Number(age), sex);
      toast({ title: 'Account created', description: 'Please sign in to continue.' });
      setEmail('');
      setPassword('');
      setConfirmPassword('');
      setName('');
      setAge('');
      setSex('');
      setActiveTab('login');
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Registration failed', description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      setLoginTimestamp(); // record login time for 7-day session
      router.push('/dashboard');
    } catch (error: any) {
      const message = error.code === 'auth/invalid-credential'
        ? 'Invalid email or password.' : error.message;
      toast({ variant: 'destructive', title: 'Sign in failed', description: message });
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!resetEmail.trim()) { toast({ variant: 'destructive', title: 'Enter your email' }); return; }
    setResetLoading(true);
    try {
      await sendPasswordResetEmail(auth, resetEmail.trim());
      toast({ title: 'Reset email sent', description: `Check your inbox at ${resetEmail}` });
      setForgotOpen(false);
      setResetEmail('');
    } catch (error: any) {
      const msg = error.code === 'auth/user-not-found' ? 'No account found with that email.' : error.message;
      toast({ variant: 'destructive', title: 'Failed to send reset email', description: msg });
    } finally {
      setResetLoading(false);
    }
  };

  if (!mounted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[hsl(222,47%,4%)]">
        <Loader2 className="h-8 w-8 animate-spin text-red-500" />
      </div>
    );
  }

  // ── Sign In ────────────────────────────────────────────────────────────────
  if (activeTab === 'login') {
    return (
      <PageShell>
        <div className={cardCls}>
          <div className="mb-5">
            <h2 className="text-xl font-black text-white">Sign In</h2>
            <p className="text-sm text-muted-foreground mt-0.5">Access the emergency response panel</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <Label className={labelCls}>Email Address</Label>
              <Input type="email" placeholder="you@example.com" className={inputCls}
                value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label className={labelCls}>Password</Label>
                <button type="button"
                  onClick={() => { setResetEmail(email); setForgotOpen(true); }}
                  className="text-xs text-red-400 hover:text-red-300 font-semibold transition-colors">
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  className={`${inputCls} pr-11`}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
                <button type="button" onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}>
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <button type="submit" className={submitCls} disabled={loading}>
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Sign In to Emergency Panel'}
            </button>
          </form>
          <p className="mt-5 text-center text-sm text-muted-foreground">
            No account yet?{' '}
            <button type="button" onClick={() => setActiveTab('register')}
              className="text-red-400 hover:text-red-300 font-semibold transition-colors">
              Create one
            </button>
          </p>
          <div className="mt-5 pt-4 border-t border-white/5 flex justify-center">
            <AgencyDots />
          </div>
        </div>

        {/* Forgot password dialog */}
        <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
          <DialogContent className="bg-[hsl(222,47%,8%)] border border-white/10 rounded-2xl max-w-sm">
            <DialogHeader>
              <div className="flex items-center gap-3 mb-1">
                <div className="h-9 w-9 rounded-xl bg-red-600/20 border border-red-500/20 flex items-center justify-center">
                  <Mail className="h-4 w-4 text-red-400" />
                </div>
                <DialogTitle className="text-white font-black">Reset Password</DialogTitle>
              </div>
              <DialogDescription className="text-slate-400 text-sm">
                Enter your email and we&apos;ll send you a reset link.
              </DialogDescription>
            </DialogHeader>
            <div className="py-2">
              <Label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Email Address</Label>
              <Input type="email" placeholder="you@example.com" value={resetEmail}
                onChange={e => setResetEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleForgotPassword()}
                className="mt-2 h-12 rounded-xl bg-[hsl(222,47%,11%)] border border-white/8 text-white placeholder:text-white/25 focus-visible:ring-red-500/40 caret-white" />
            </div>
            <DialogFooter className="gap-2">
              <button type="button" onClick={() => setForgotOpen(false)}
                className="flex-1 h-10 rounded-xl border border-white/10 text-slate-400 hover:text-white text-sm font-semibold transition-colors">
                Cancel
              </button>
              <button type="button" onClick={handleForgotPassword}
                disabled={resetLoading || !resetEmail.trim()}
                className="flex-1 h-10 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                {resetLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send Reset Link'}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageShell>
    );
  }

  // ── Register ───────────────────────────────────────────────────────────────
  return (
    <PageShell>
      <div className={cardCls}>
        <div className="mb-5">
          <h2 className="text-xl font-black text-white">Create Account</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Register to access the emergency response panel</p>
        </div>
        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <Label className={labelCls}>Full Name</Label>
            <Input type="text" placeholder="Juan dela Cruz" className={inputCls}
              value={name} onChange={e => setName(e.target.value)} required autoComplete="name" />
          </div>
          {/* Age + Sex row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className={labelCls}>Age <span className="text-red-400">*</span></Label>
              <Input
                type="number"
                placeholder="e.g. 25"
                className={inputCls}
                value={age}
                onChange={e => setAge(e.target.value)}
                min={1}
                max={120}
                required
              />
            </div>
            <div>
              <Label className={labelCls}>Sex <span className="text-red-400">*</span></Label>
              <select
                value={sex}
                onChange={e => setSex(e.target.value)}
                required
                className={`${inputCls} w-full appearance-none`}
                style={{ background: 'hsl(222,47%,11%)' }}
              >
                <option value="" disabled>Select</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>
          <div>
            <Label className={labelCls}>Email Address</Label>
            <Input type="email" placeholder="you@example.com" className={inputCls}
              value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" />
          </div>
          <div>
            <Label className={labelCls}>Password</Label>
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                placeholder="Min. 6 characters"
                className={`${inputCls} pr-11`}
                value={password}
                onChange={e => setPassword(e.target.value)}
                minLength={6}
                required
                autoComplete="new-password"
              />
              <button type="button" onClick={() => setShowPassword(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition-colors"
                aria-label={showPassword ? 'Hide password' : 'Show password'}>
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Must be at least 6 characters long.</p>
          </div>
          <div>
            <Label className={labelCls}>Confirm Password</Label>
            <div className="relative">
              <Input
                type={showConfirmPassword ? 'text' : 'password'}
                placeholder="Re-enter password"
                className={`${inputCls} pr-11`}
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
              />
              <button type="button" onClick={() => setShowConfirmPassword(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition-colors"
                aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}>
                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <button type="submit" className={submitCls} disabled={loading}>
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Create Account'}
          </button>
        </form>
        <p className="mt-5 text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <button type="button" onClick={() => setActiveTab('login')}
            className="text-red-400 hover:text-red-300 font-semibold transition-colors">
            Sign in
          </button>
        </p>
        <div className="mt-5 pt-4 border-t border-white/5 flex justify-center">
          <AgencyDots />
        </div>
      </div>
    </PageShell>
  );
}

// ─── Page export ──────────────────────────────────────────────────────────────
export default function AuthPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-[hsl(222,47%,4%)]">
        <Loader2 className="h-8 w-8 animate-spin text-red-500" />
      </div>
    }>
      <AuthContent />
    </Suspense>
  );
}
