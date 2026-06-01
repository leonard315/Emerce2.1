'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { ref, set, onValue, remove, push, off, get } from 'firebase/database';
import { useDatabase } from '@/firebase';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';
import {
  Video, VideoOff, Mic, MicOff, PhoneOff,
  Maximize2, Minimize2, RotateCcw, Volume2, VolumeX,
  Signal, SignalZero,
} from 'lucide-react';

// ── ICE servers ───────────────────────────────────────────────────────────────
const ICE: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
  ],
};

export interface VideoCallProps {
  onClose: () => void;
  targetUserId?: string;
  targetUserName?: string;
  alertType?: 'fire' | 'crime' | 'medical' | 'all';
  incomingRoomId?: string;
  incomingCallerNameProp?: string;
}

type CS = 'idle' | 'calling' | 'incoming' | 'connecting' | 'connected' | 'ended';

const fmt = (s: number) =>
  `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

function Av({ name, lg }: { name: string; lg?: boolean }) {
  const i = (name || 'A').split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div className={cn(
      'rounded-full bg-gradient-to-br from-slate-600 to-slate-800 border-2 border-white/10 flex items-center justify-center font-black text-white select-none flex-shrink-0',
      lg ? 'h-24 w-24 text-3xl' : 'h-10 w-10 text-sm',
    )}>{i}</div>
  );
}

export function VideoCall({
  onClose, targetUserId, targetUserName, alertType,
  incomingRoomId, incomingCallerNameProp,
}: VideoCallProps) {
  const rtdb = useDatabase();
  const { profile } = useAuth();

  const agCh = alertType === 'fire' ? 'drrm' : alertType === 'crime' ? 'security' : alertType === 'medical' ? 'clinic' : null;
  const agLabel = alertType === 'fire' ? 'DRRM Office' : alertType === 'crime' ? 'Security Office' : alertType === 'medical' ? 'School Clinic' : targetUserName || 'Agency';

  // ── State ─────────────────────────────────────────────────────────────────
  const [cs, setCs] = useState<CS>(incomingRoomId ? 'incoming' : 'idle');
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [spkOn, setSpkOn] = useState(true);
  const [mini, setMini] = useState(false);
  const [showCtrl, setShowCtrl] = useState(true);
  const [callerName, setCallerName] = useState(incomingCallerNameProp ?? '');
  const [err, setErr] = useState<string | null>(null);
  const [dur, setDur] = useState(0);
  const [qual, setQual] = useState<'good' | 'fair' | 'poor' | 'unknown'>('unknown');
  const [remVid, setRemVid] = useState(false);
  const [locVid, setLocVid] = useState(false);
  const [fullscr, setFullscr] = useState(false);

  // ── Refs ──────────────────────────────────────────────────────────────────
  const locRef = useRef<HTMLVideoElement>(null);
  const remRef = useRef<HTMLVideoElement>(null);
  const conRef = useRef<HTMLDivElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const locStream = useRef<MediaStream | null>(null);
  const remStream = useRef<MediaStream>(new MediaStream());
  const roomRef = useRef<string | null>(incomingRoomId ?? null);
  const csRef = useRef<CS>(incomingRoomId ? 'incoming' : 'idle');
  const durT = useRef<ReturnType<typeof setInterval> | null>(null);
  const ctrlT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const qualT = useRef<ReturnType<typeof setInterval> | null>(null);
  const ansUnsub = useRef<(() => void) | null>(null);
  const candUnsub = useRef<(() => void) | null>(null);
  const ringCtx = useRef<AudioContext | null>(null);
  const ringStop = useRef(false);
  const initiated = useRef(false);

  useEffect(() => { csRef.current = cs; }, [cs]);

  // ── Duration ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (cs === 'connected') {
      durT.current = setInterval(() => setDur(d => d + 1), 1000);
    } else {
      if (durT.current) { clearInterval(durT.current); durT.current = null; }
    }
    return () => { if (durT.current) clearInterval(durT.current); };
  }, [cs]);

  // ── Controls auto-hide (4s) ───────────────────────────────────────────────
  const showControls = useCallback(() => {
    setShowCtrl(true);
    if (ctrlT.current) clearTimeout(ctrlT.current);
    if (csRef.current === 'connected') {
      ctrlT.current = setTimeout(() => setShowCtrl(false), 4000);
    }
  }, []);
  useEffect(() => { showControls(); }, [cs, showControls]);

  // ── Quality ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (cs !== 'connected') return;
    qualT.current = setInterval(async () => {
      if (!pcRef.current) return;
      try {
        const stats = await pcRef.current.getStats();
        let rtt = 0;
        stats.forEach((r: any) => {
          if (r.type === 'candidate-pair' && r.state === 'succeeded') rtt = r.currentRoundTripTime ?? 0;
        });
        setQual(rtt === 0 ? 'unknown' : rtt < 0.1 ? 'good' : rtt < 0.3 ? 'fair' : 'poor');
      } catch { /* ignore */ }
    }, 3000);
    return () => { if (qualT.current) clearInterval(qualT.current); };
  }, [cs]);

  // ── Speaker ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (remRef.current) remRef.current.muted = !spkOn;
  }, [spkOn]);

  // ── Fullscreen ────────────────────────────────────────────────────────────
  useEffect(() => {
    const h = () => setFullscr(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', h);
    return () => document.removeEventListener('fullscreenchange', h);
  }, []);

  // ── Ringtone ──────────────────────────────────────────────────────────────
  const stopRingtone = useCallback(() => {
    ringStop.current = true;
    try { ringCtx.current?.close(); } catch { /* ignore */ }
    ringCtx.current = null;
  }, []);

  const startRingtone = useCallback(() => {
    stopRingtone();
    ringStop.current = false;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      ringCtx.current = ctx;
      const ring = (t: number) => {
        if (ringStop.current || !ringCtx.current) return;
        [440, 480].forEach(freq => {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = 'sine';
          o.frequency.value = freq;
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(0.25, t + 0.05);
          g.gain.setValueAtTime(0.25, t + 1.9);
          g.gain.linearRampToValueAtTime(0, t + 2.0);
          o.connect(g);
          g.connect(ctx.destination);
          o.start(t);
          o.stop(t + 2.1);
        });
        setTimeout(() => { if (!ringStop.current) ring(ctx.currentTime); }, 4000);
      };
      ring(ctx.currentTime);
    } catch { /* audio not supported */ }
  }, [stopRingtone]);

  useEffect(() => {
    if (cs === 'incoming') startRingtone();
    else stopRingtone();
    return () => stopRingtone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cs]);

  // ── Cleanup ───────────────────────────────────────────────────────────────
  const cleanup = useCallback(async (reason: 'hangup' | 'remote' = 'hangup') => {
    stopRingtone();
    if (durT.current) clearInterval(durT.current);
    if (qualT.current) clearInterval(qualT.current);
    if (ctrlT.current) clearTimeout(ctrlT.current);
    ansUnsub.current?.(); ansUnsub.current = null;
    candUnsub.current?.(); candUnsub.current = null;
    locStream.current?.getTracks().forEach(t => t.stop());
    locStream.current = null;
    pcRef.current?.close(); pcRef.current = null;
    if (locRef.current) locRef.current.srcObject = null;
    if (remRef.current) remRef.current.srcObject = null;
    remStream.current = new MediaStream();
    if (rtdb) {
      if (roomRef.current) await remove(ref(rtdb, `calls/${roomRef.current}`)).catch(() => {});
      if (profile?.uid) await remove(ref(rtdb, `call_signals/${profile.uid}`)).catch(() => {});
      if (agCh && reason === 'hangup') await remove(ref(rtdb, `agency_calls/${agCh}`)).catch(() => {});
    }
    roomRef.current = null;
    setRemVid(false); setLocVid(false); setCs('ended');
  }, [rtdb, profile?.uid, agCh, stopRingtone]);

  // ── Get media ─────────────────────────────────────────────────────────────
  const getMedia = useCallback(async (): Promise<MediaStream | null> => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      locStream.current = s;
      if (locRef.current) { locRef.current.srcObject = s; locRef.current.muted = true; }
      setLocVid(true);
      return s;
    } catch (e: any) {
      const denied = e?.name === 'NotAllowedError' || e?.name === 'PermissionDeniedError';
      setErr(denied ? 'Camera/mic denied. Allow permissions and retry.' : 'Could not access camera/mic.');
      return null;
    }
  }, []);

  // ── Create peer connection ────────────────────────────────────────────────
  const makePC = useCallback((roomId: string, init: boolean): RTCPeerConnection | null => {
    if (!rtdb) return null;
    const pc = new RTCPeerConnection(ICE);
    pcRef.current = pc;

    // Add local tracks
    locStream.current?.getTracks().forEach(t => pc.addTrack(t, locStream.current!));

    // Remote tracks
    pc.ontrack = (ev) => {
      ev.streams[0].getTracks().forEach(t => {
        if (!remStream.current.getTracks().find(x => x.id === t.id))
          remStream.current.addTrack(t);
      });
      if (remRef.current) {
        remRef.current.srcObject = remStream.current;
        remRef.current.muted = !spkOn;
        remRef.current.play().catch(() => {});
      }
      setRemVid(true);
      setCs('connected');
    };

    // ICE candidates
    pc.onicecandidate = (ev) => {
      if (ev.candidate && rtdb)
        push(ref(rtdb, `calls/${roomId}/${init ? 'callerCandidates' : 'calleeCandidates'}`), ev.candidate.toJSON());
    };

    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      if (s === 'connecting') setCs('connecting');
      if (s === 'connected') setCs('connected');
      if (s === 'disconnected' || s === 'failed') cleanup('remote');
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed') pc.restartIce();
    };

    return pc;
  }, [rtdb, cleanup, spkOn]);

  // ── Broadcast call (user -> agency) ──────────────────────────────────────
  const broadcastCall = useCallback(async (channel: string) => {
    if (!rtdb || !profile) { setErr('Database not available.'); return; }
    setErr(null); setCs('calling');
    const s = await getMedia();
    if (!s) { setCs('idle'); return; }
    const roomId = `broadcast_${channel}_${profile.uid}_${Date.now()}`;
    roomRef.current = roomId;
    const pc = makePC(roomId, true);
    if (!pc) return;
    const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
    await pc.setLocalDescription(offer);
    try {
      await set(ref(rtdb, `calls/${roomId}`), {
        roomId, offer: { type: offer.type, sdp: offer.sdp },
        callerId: profile.uid, callerName: profile.name,
        callerRole: profile.role, createdAt: Date.now(),
      });
      await set(ref(rtdb, `agency_calls/${channel}`), {
        roomId, callerId: profile.uid, callerName: profile.name, createdAt: Date.now(),
      });
    } catch (e: any) {
      setErr(`Write failed: ${e.message}`); return;
    }
    const aRef = ref(rtdb, `calls/${roomId}/answer`);
    onValue(aRef, async snap => {
      if (snap.exists() && pc.currentRemoteDescription === null)
        await pc.setRemoteDescription(new RTCSessionDescription(snap.val())).catch(() => {});
    });
    ansUnsub.current = () => off(aRef);
    const cRef = ref(rtdb, `calls/${roomId}/calleeCandidates`);
    onValue(cRef, snap => { snap.forEach(c => { void pc.addIceCandidate(new RTCIceCandidate(c.val())).catch(() => {}); }); });
    candUnsub.current = () => off(cRef);
  }, [rtdb, profile, getMedia, makePC]);

  // ── Answer call (agency) ──────────────────────────────────────────────────
  const answerCall = useCallback(async () => {
    if (!rtdb || !profile) return;
    stopRingtone();
    setErr(null); setCs('connecting');
    let roomId = incomingRoomId ?? roomRef.current;
    if (!roomId) {
      const snap = await get(ref(rtdb, `call_signals/${profile.uid}`));
      if (!snap.exists()) return;
      roomId = snap.val().roomId;
    }
    roomRef.current = roomId!;
    const s = await getMedia();
    if (!s) { setCs('incoming'); return; }
    const pc = makePC(roomId!, false);
    if (!pc) return;
    const callSnap = await get(ref(rtdb, `calls/${roomId}`));
    if (!callSnap.exists()) { setErr('Call no longer available.'); setCs('ended'); return; }
    await pc.setRemoteDescription(new RTCSessionDescription(callSnap.val().offer)).catch(() => {});
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await set(ref(rtdb, `calls/${roomId}/answer`), { type: answer.type, sdp: answer.sdp });
    await remove(ref(rtdb, `call_signals/${profile.uid}`)).catch(() => {});
    if (roomId!.startsWith('broadcast_')) {
      const ch = roomId!.split('_')[1];
      if (ch) await remove(ref(rtdb, `agency_calls/${ch}`)).catch(() => {});
    }
    const cRef = ref(rtdb, `calls/${roomId}/callerCandidates`);
    onValue(cRef, snap => { snap.forEach(c => { void pc.addIceCandidate(new RTCIceCandidate(c.val())).catch(() => {}); }); });
    candUnsub.current = () => off(cRef);
  }, [rtdb, profile, incomingRoomId, getMedia, makePC, stopRingtone]);

  // ── Decline ───────────────────────────────────────────────────────────────
  const declineCall = useCallback(async () => {
    stopRingtone();
    if (rtdb && profile?.uid) await remove(ref(rtdb, `call_signals/${profile.uid}`)).catch(() => {});
    setCs('ended');
  }, [rtdb, profile?.uid, stopRingtone]);

  // ── Listen for direct incoming signals ────────────────────────────────────
  useEffect(() => {
    if (!rtdb || !profile?.uid) return;
    const sigRef = ref(rtdb, `call_signals/${profile.uid}`);
    const unsub = onValue(sigRef, snap => {
      if (snap.exists() && (csRef.current === 'idle' || csRef.current === 'ended')) {
        setCallerName(snap.val().callerName || '');
        setCs('incoming');
      }
    });
    return () => off(sigRef);
  }, [rtdb, profile?.uid]);

  // ── Auto-initiate on mount ────────────────────────────────────────────────
  useEffect(() => {
    if (!profile || !rtdb || initiated.current) return;
    if (incomingRoomId) return; // agency side — wait for Answer tap
    initiated.current = true;
    if (targetUserId && targetUserName) {
      (async () => {
        setErr(null); setCs('calling');
        const s = await getMedia();
        if (!s) { setCs('idle'); return; }
        const roomId = `${profile.uid}_${targetUserId}_${Date.now()}`;
        roomRef.current = roomId;
        const pc = makePC(roomId, true);
        if (!pc) return;
        const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
        await pc.setLocalDescription(offer);
        await set(ref(rtdb, `calls/${roomId}`), {
          offer: { type: offer.type, sdp: offer.sdp },
          callerId: profile.uid, callerName: profile.name,
          calleeId: targetUserId, calleeName: targetUserName, createdAt: Date.now(),
        });
        await set(ref(rtdb, `call_signals/${targetUserId}`), {
          roomId, callerId: profile.uid, callerName: profile.name,
        });
        const aRef = ref(rtdb, `calls/${roomId}/answer`);
        onValue(aRef, async snap => {
          if (snap.exists() && pc.currentRemoteDescription === null)
            await pc.setRemoteDescription(new RTCSessionDescription(snap.val())).catch(() => {});
        });
        ansUnsub.current = () => off(aRef);
        const cRef = ref(rtdb, `calls/${roomId}/calleeCandidates`);
        onValue(cRef, snap => { snap.forEach(c => { void pc.addIceCandidate(new RTCIceCandidate(c.val())).catch(() => {}); }); });
        candUnsub.current = () => off(cRef);
      })();
    } else if (agCh) {
      broadcastCall(agCh);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.uid, rtdb]);

  // ── Unmount ───────────────────────────────────────────────────────────────
  useEffect(() => () => {
    stopRingtone();
    locStream.current?.getTracks().forEach(t => t.stop());
    pcRef.current?.close();
    if (durT.current) clearInterval(durT.current);
    if (qualT.current) clearInterval(qualT.current);
    if (ctrlT.current) clearTimeout(ctrlT.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Controls ──────────────────────────────────────────────────────────────
  const toggleMic = () => {
    const tracks = locStream.current?.getAudioTracks() ?? [];
    const next = !micOn;
    tracks.forEach(t => { t.enabled = next; });
    setMicOn(next);
  };

  const toggleCam = () => {
    const tracks = locStream.current?.getVideoTracks() ?? [];
    const next = !camOn;
    tracks.forEach(t => { t.enabled = next; });
    setCamOn(next);
  };

  const flipCam = async () => {
    if (!locStream.current || !pcRef.current) return;
    const cur = locStream.current.getVideoTracks()[0];
    const facing = cur?.getSettings().facingMode === 'user' ? 'environment' : 'user';
    try {
      const ns = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing }, audio: false });
      const nt = ns.getVideoTracks()[0];
      const sender = pcRef.current.getSenders().find(s => s.track?.kind === 'video');
      if (sender) await sender.replaceTrack(nt);
      cur?.stop();
      locStream.current.removeTrack(cur);
      locStream.current.addTrack(nt);
      if (locRef.current) locRef.current.srcObject = locStream.current;
    } catch { /* unsupported */ }
  };

  const hangUp = async () => { await cleanup('hangup'); onClose(); };

  const toggleFs = () => {
    if (!conRef.current) return;
    if (!document.fullscreenElement) conRef.current.requestFullscreen().catch(() => {});
    else document.exitFullscreen().catch(() => {});
  };

  const dn = callerName || agLabel;
  const QI = qual === 'poor' ? SignalZero : Signal;
  const qc = qual === 'good' ? 'text-green-400' : qual === 'fair' ? 'text-yellow-400' : qual === 'poor' ? 'text-red-400' : 'text-slate-500';

  // ── RENDER ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Minimized PiP */}
      {mini && cs === 'connected' && (
        <div className="fixed bottom-24 right-4 z-[200] flex flex-col items-end gap-2">
          <div
            className="relative w-36 h-24 rounded-2xl overflow-hidden bg-[#0d1526] border-2 border-white/20 shadow-2xl cursor-pointer flex items-center justify-center"
            onClick={() => setMini(false)}
          >
            <Av name={dn} />
            <div className="absolute bottom-1.5 left-0 right-0 flex items-center justify-center gap-1">
              <div className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
              <span className="text-[10px] text-white font-bold">{fmt(dur)}</span>
            </div>
          </div>
          <button onClick={() => setMini(false)} className="h-8 px-3 rounded-xl bg-slate-800 border border-white/10 text-xs text-white font-bold hover:bg-slate-700 transition-colors">
            Expand
          </button>
        </div>
      )}

      {/* Incoming */}
      {!mini && cs === 'incoming' && (
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-md p-4">
          <div className="w-full max-w-sm bg-[#0d1526] rounded-3xl border border-white/10 shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
            <div className="bg-gradient-to-b from-green-900/60 to-transparent px-6 pt-10 pb-6 flex flex-col items-center gap-5">
              <div className="relative">
                <div className="absolute -inset-4 rounded-full bg-green-500/10 animate-ping" />
                <div className="absolute -inset-2 rounded-full bg-green-500/15 animate-ping" style={{ animationDelay: '0.5s' }} />
                <Av name={dn} lg />
              </div>
              <div className="text-center">
                <p className="text-2xl font-black text-white">{dn}</p>
                <p className="text-sm text-slate-400 mt-1">Incoming video call...</p>
              </div>
            </div>
            <div className="flex items-center justify-around px-10 py-8 bg-black/20">
              <div className="flex flex-col items-center gap-2">
                <button
                  onClick={declineCall}
                  className="h-16 w-16 rounded-full bg-red-600 hover:bg-red-500 active:scale-95 flex items-center justify-center shadow-lg transition-all"
                >
                  <PhoneOff className="h-7 w-7 text-white" />
                </button>
                <span className="text-xs text-slate-400 font-semibold">Decline</span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <button
                  onClick={answerCall}
                  className="h-16 w-16 rounded-full bg-green-500 hover:bg-green-400 active:scale-95 flex items-center justify-center shadow-lg transition-all animate-pulse"
                >
                  <Video className="h-7 w-7 text-white" />
                </button>
                <span className="text-xs text-slate-400 font-semibold">Answer</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Calling / Connecting */}
      {!mini && (cs === 'calling' || cs === 'connecting') && (
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="w-full max-w-sm bg-[#0d1526] rounded-3xl border border-white/10 shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
            <div className="px-6 pt-10 pb-4 flex flex-col items-center gap-5">
              <div className="relative flex items-center justify-center">
                <div className="absolute h-36 w-36 rounded-full border-2 border-green-500/20 animate-ping" />
                <div className="absolute h-28 w-28 rounded-full border-2 border-green-500/30 animate-ping" style={{ animationDelay: '0.4s' }} />
                <Av name={dn} lg />
              </div>
              <div className="text-center">
                <p className="text-xl font-black text-white">{dn}</p>
                <p className="text-sm text-slate-400 mt-1">{cs === 'calling' ? 'Calling...' : 'Connecting...'}</p>
                <div className="flex items-center justify-center gap-1.5 mt-3">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="h-2 w-2 rounded-full bg-green-500 animate-bounce" style={{ animationDelay: `${i * 0.2}s` }} />
                  ))}
                </div>
              </div>
            </div>
            {/* Local preview */}
            <div className="mx-6 mb-4 rounded-2xl overflow-hidden h-32 bg-slate-900 border border-white/10 relative">
              <video ref={locRef} autoPlay playsInline muted className="w-full h-full object-cover" />
              {!locVid && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-xs text-slate-500">Camera starting...</span>
                </div>
              )}
              <div className="absolute bottom-2 left-2 text-[10px] text-white/60 font-bold bg-black/40 px-2 py-0.5 rounded-full">You</div>
            </div>
            {/* Hidden remote video — must be in DOM for ontrack to work */}
            <video ref={remRef} autoPlay playsInline className="hidden" />
            {err && (
              <div className="mx-6 mb-4 px-4 py-3 rounded-xl bg-red-900/30 border border-red-500/30">
                <p className="text-xs text-red-300 text-center">{err}</p>
              </div>
            )}
            <div className="flex justify-center pb-8">
              <div className="flex flex-col items-center gap-2">
                <button
                  onClick={hangUp}
                  className="h-16 w-16 rounded-full bg-red-600 hover:bg-red-500 active:scale-95 flex items-center justify-center shadow-lg transition-all"
                >
                  <PhoneOff className="h-7 w-7 text-white" />
                </button>
                <span className="text-xs text-slate-400 font-semibold">Cancel</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Ended */}
      {!mini && cs === 'ended' && (
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-md p-4">
          <div className="w-full max-w-sm bg-[#0d1526] rounded-3xl border border-white/10 shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
            <div className="px-6 py-10 flex flex-col items-center gap-4">
              <div className="h-16 w-16 rounded-full bg-slate-800 border border-white/10 flex items-center justify-center">
                <PhoneOff className="h-7 w-7 text-slate-400" />
              </div>
              <div className="text-center">
                <p className="text-lg font-black text-white">Call Ended</p>
                {dur > 0 && <p className="text-sm text-slate-400 mt-1">Duration: {fmt(dur)}</p>}
                {err && <p className="text-xs text-red-400 mt-2">{err}</p>}
              </div>
              <button
                onClick={onClose}
                className="mt-2 h-12 px-8 rounded-2xl bg-slate-700 hover:bg-slate-600 text-white font-bold text-sm transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Connected - full screen */}
      {!mini && cs === 'connected' && (
        <div className="fixed inset-0 z-[200] bg-black">
          <div
            ref={conRef}
            className="relative w-full h-full bg-[#0a0d14] overflow-hidden"
            onMouseMove={showControls}
            onTouchStart={showControls}
            onClick={showControls}
          >
            {/* Remote video */}
            <video ref={remRef} autoPlay playsInline className="absolute inset-0 w-full h-full object-cover" />

            {/* Placeholder when no remote video yet */}
            {!remVid && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-[#0d1526] to-[#060a14] gap-4">
                <Av name={dn} lg />
                <p className="text-white font-bold text-lg">{dn}</p>
                <p className="text-slate-400 text-sm">Waiting for video...</p>
              </div>
            )}

            {/* Gradient overlays */}
            <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/70 to-transparent pointer-events-none" />
            <div className={cn(
              'absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-black/80 to-transparent pointer-events-none transition-opacity duration-300',
              showCtrl ? 'opacity-100' : 'opacity-0'
            )} />

            {/* Top bar */}
            <div className={cn(
              'absolute top-0 inset-x-0 flex items-center justify-between px-4 pt-4 pb-3 transition-all duration-300',
              showCtrl ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'
            )}>
              <div className="flex items-center gap-3 min-w-0">
                <Av name={dn} />
                <div className="min-w-0">
                  <p className="text-white font-black text-sm truncate">{dn}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <div className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
                    <span className="text-[11px] text-green-400 font-bold">{fmt(dur)}</span>
                    {qual !== 'unknown' && <QI className={cn('h-3 w-3 ml-1', qc)} />}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setMini(true)}
                  className="h-9 w-9 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur-sm flex items-center justify-center text-white/80 hover:text-white transition-colors"
                >
                  <Minimize2 className="h-4 w-4" />
                </button>
                <button
                  onClick={toggleFs}
                  className="h-9 w-9 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur-sm flex items-center justify-center text-white/80 hover:text-white transition-colors"
                >
                  <Maximize2 className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Local PiP */}
            <div className={cn(
              'absolute top-20 right-4 rounded-2xl overflow-hidden border-2 border-white/20 shadow-2xl bg-slate-900 w-28 h-20 sm:w-36 sm:h-24 transition-opacity duration-300',
              showCtrl ? 'opacity-100' : 'opacity-60'
            )}>
              <video ref={locRef} autoPlay playsInline muted className={cn('w-full h-full object-cover', !camOn && 'hidden')} />
              {!camOn && (
                <div className="w-full h-full flex items-center justify-center bg-slate-800">
                  <VideoOff className="h-6 w-6 text-slate-500" />
                </div>
              )}
              <div className="absolute bottom-1 left-0 right-0 flex justify-center">
                <span className="text-[9px] text-white/60 font-bold bg-black/40 px-1.5 py-0.5 rounded-full">You</span>
              </div>
            </div>

            {/* Controls — always clickable */}
            <div className={cn(
              'absolute bottom-0 inset-x-0 pb-8 pt-4 px-4 transition-all duration-300',
              showCtrl ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
            )}>
              {err && (
                <div className="mb-4 px-4 py-2.5 rounded-xl bg-red-900/60 border border-red-500/40 backdrop-blur-sm">
                  <p className="text-xs text-red-300 text-center">{err}</p>
                </div>
              )}
              <div className="flex items-center justify-center gap-3 sm:gap-4">
                {/* Mic */}
                <div className="flex flex-col items-center gap-1.5">
                  <button
                    onClick={toggleMic}
                    className={cn(
                      'h-14 w-14 rounded-full flex items-center justify-center transition-all active:scale-95 shadow-lg',
                      micOn ? 'bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white' : 'bg-red-600 hover:bg-red-500 text-white'
                    )}
                  >
                    {micOn ? <Mic className="h-6 w-6" /> : <MicOff className="h-6 w-6" />}
                  </button>
                  <span className="text-[10px] text-white/70 font-semibold">{micOn ? 'Mute' : 'Unmute'}</span>
                </div>
                {/* Camera */}
                <div className="flex flex-col items-center gap-1.5">
                  <button
                    onClick={toggleCam}
                    className={cn(
                      'h-14 w-14 rounded-full flex items-center justify-center transition-all active:scale-95 shadow-lg',
                      camOn ? 'bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white' : 'bg-red-600 hover:bg-red-500 text-white'
                    )}
                  >
                    {camOn ? <Video className="h-6 w-6" /> : <VideoOff className="h-6 w-6" />}
                  </button>
                  <span className="text-[10px] text-white/70 font-semibold">{camOn ? 'Camera' : 'No cam'}</span>
                </div>
                {/* End */}
                <div className="flex flex-col items-center gap-1.5">
                  <button
                    onClick={hangUp}
                    className="h-16 w-16 rounded-full bg-red-600 hover:bg-red-500 active:scale-95 flex items-center justify-center shadow-xl shadow-red-900/60 transition-all"
                  >
                    <PhoneOff className="h-7 w-7 text-white" />
                  </button>
                  <span className="text-[10px] text-white/70 font-semibold">End</span>
                </div>
                {/* Speaker */}
                <div className="flex flex-col items-center gap-1.5">
                  <button
                    onClick={() => setSpkOn(v => !v)}
                    className={cn(
                      'h-14 w-14 rounded-full flex items-center justify-center transition-all active:scale-95 shadow-lg',
                      spkOn ? 'bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white' : 'bg-slate-700 hover:bg-slate-600 text-slate-400'
                    )}
                  >
                    {spkOn ? <Volume2 className="h-6 w-6" /> : <VolumeX className="h-6 w-6" />}
                  </button>
                  <span className="text-[10px] text-white/70 font-semibold">{spkOn ? 'Speaker' : 'Muted'}</span>
                </div>
                {/* Flip */}
                <div className="flex flex-col items-center gap-1.5">
                  <button
                    onClick={flipCam}
                    className="h-14 w-14 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-sm flex items-center justify-center text-white transition-all active:scale-95 shadow-lg"
                  >
                    <RotateCcw className="h-6 w-6" />
                  </button>
                  <span className="text-[10px] text-white/70 font-semibold">Flip</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
