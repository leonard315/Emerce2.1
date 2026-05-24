'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { ref, set, onValue, remove, push, off, get } from 'firebase/database';
import { useDatabase } from '@/firebase';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';
import {
  Video, VideoOff, Mic, MicOff, PhoneOff, Phone,
  Maximize2, Minimize2, RotateCcw, Volume2, VolumeX,
  Signal, SignalZero, Users,
} from 'lucide-react';

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
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

type CallState = 'idle' | 'calling' | 'incoming' | 'connecting' | 'connected' | 'ended';
type ConnectionQuality = 'good' | 'fair' | 'poor' | 'unknown';

function formatDuration(s: number) {
  return `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
}

function Avatar({ name, size = 'lg' }: { name: string; size?: 'sm' | 'lg' }) {
  const initials = (name || 'A').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div className={cn(
      'rounded-full bg-gradient-to-br from-slate-600 to-slate-800 border-2 border-white/10 flex items-center justify-center font-black text-white select-none flex-shrink-0',
      size === 'lg' ? 'h-24 w-24 text-3xl' : 'h-10 w-10 text-sm',
    )}>
      {initials}
    </div>
  );
}

export function VideoCall({ onClose, targetUserId, targetUserName, alertType, incomingRoomId, incomingCallerNameProp }: VideoCallProps) {
  const rtdb = useDatabase();
  const { profile } = useAuth();

  const agencyChannel = alertType === 'fire' ? 'drrm' : alertType === 'crime' ? 'security' : alertType === 'medical' ? 'clinic' : null;
  const agencyLabel = alertType === 'fire' ? 'DRRM Office' : alertType === 'crime' ? 'Security Office' : alertType === 'medical' ? 'School Clinic' : targetUserName || 'Agency';

  const [callState, setCallState] = useState<CallState>(incomingRoomId ? 'incoming' : 'idle');
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [minimized, setMinimized] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [callerName, setCallerName] = useState(incomingCallerNameProp ?? '');
  const [error, setError] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [quality, setQuality] = useState<ConnectionQuality>('unknown');
  const [remoteVideoActive, setRemoteVideoActive] = useState(false);
  const [localVideoReady, setLocalVideoReady] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  // ── CRITICAL: video refs must always be in DOM ────────────────────────────
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream>(new MediaStream());
  const roomIdRef = useRef<string | null>(incomingRoomId ?? null);
  const durationRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const controlsRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const qualityRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const answerUnsubRef = useRef<(() => void) | null>(null);
  const candUnsubRef = useRef<(() => void) | null>(null);
  const callStateRef = useRef<CallState>(incomingRoomId ? 'incoming' : 'idle');

  // Keep ref in sync with state (for use inside callbacks)
  useEffect(() => { callStateRef.current = callState; }, [callState]);

  // ── Duration timer ────────────────────────────────────────────────────────
  useEffect(() => {
    if (callState === 'connected') {
      durationRef.current = setInterval(() => setDuration(d => d + 1), 1000);
    } else {
      if (durationRef.current) { clearInterval(durationRef.current); durationRef.current = null; }
    }
    return () => { if (durationRef.current) clearInterval(durationRef.current); };
  }, [callState]);

  // ── Auto-hide controls ────────────────────────────────────────────────────
  const resetControls = useCallback(() => {
    setControlsVisible(true);
    if (controlsRef.current) clearTimeout(controlsRef.current);
    if (callStateRef.current === 'connected') {
      controlsRef.current = setTimeout(() => setControlsVisible(false), 4000);
    }
  }, []);

  useEffect(() => { resetControls(); }, [callState, resetControls]);

  // ── Quality polling ───────────────────────────────────────────────────────
  useEffect(() => {
    if (callState !== 'connected') return;
    qualityRef.current = setInterval(async () => {
      if (!pcRef.current) return;
      try {
        const stats = await pcRef.current.getStats();
        let rtt = 0;
        stats.forEach(r => { if (r.type === 'candidate-pair' && r.state === 'succeeded') rtt = r.currentRoundTripTime ?? 0; });
        setQuality(rtt === 0 ? 'unknown' : rtt < 0.1 ? 'good' : rtt < 0.3 ? 'fair' : 'poor');
      } catch { /* ignore */ }
    }, 3000);
    return () => { if (qualityRef.current) clearInterval(qualityRef.current); };
  }, [callState]);

  // ── Speaker ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (remoteVideoRef.current) remoteVideoRef.current.muted = !speakerOn;
  }, [speakerOn]);

  // ── Fullscreen listener ───────────────────────────────────────────────────
  useEffect(() => {
    const h = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', h);
    return () => document.removeEventListener('fullscreenchange', h);
  }, []);

  // ── Cleanup ───────────────────────────────────────────────────────────────
  const cleanup = useCallback(async (reason: 'hangup' | 'error' | 'remote' = 'hangup') => {
    if (durationRef.current) clearInterval(durationRef.current);
    if (qualityRef.current) clearInterval(qualityRef.current);
    if (controlsRef.current) clearTimeout(controlsRef.current);
    answerUnsubRef.current?.();
    candUnsubRef.current?.();
    answerUnsubRef.current = null;
    candUnsubRef.current = null;

    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;

    // Clear video elements
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    remoteStreamRef.current = new MediaStream();

    if (rtdb) {
      if (roomIdRef.current) await remove(ref(rtdb, `calls/${roomIdRef.current}`)).catch(() => {});
      if (profile?.uid) await remove(ref(rtdb, `call_signals/${profile.uid}`)).catch(() => {});
      if (agencyChannel && reason === 'hangup') await remove(ref(rtdb, `agency_calls/${agencyChannel}`)).catch(() => {});
    }

    roomIdRef.current = null;
    setRemoteVideoActive(false);
    setLocalVideoReady(false);
    setCallState('ended');
  }, [rtdb, profile?.uid, agencyChannel]);

  // ── Get local media ───────────────────────────────────────────────────────
  const getLocalStream = useCallback(async (): Promise<MediaStream | null> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      localStreamRef.current = stream;
      // Attach to video element immediately — it's always in the DOM
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.muted = true;
      }
      setLocalVideoReady(true);
      return stream;
    } catch (e: any) {
      const isDenied = e?.name === 'NotAllowedError' || e?.name === 'PermissionDeniedError';
      setError(isDenied ? 'Camera/microphone access denied. Allow permissions and try again.' : 'Could not access camera/microphone.');
      return null;
    }
  }, []);

  // ── Create peer connection ────────────────────────────────────────────────
  const createPC = useCallback((roomId: string, isInitiator: boolean): RTCPeerConnection | null => {
    if (!rtdb) return null;
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;

    // Add local tracks
    localStreamRef.current?.getTracks().forEach(t => pc.addTrack(t, localStreamRef.current!));

    // Remote tracks → persistent remoteStream → video element (always in DOM)
    pc.ontrack = (event) => {
      event.streams[0].getTracks().forEach(t => {
        // Avoid duplicate tracks
        const existing = remoteStreamRef.current.getTracks().find(x => x.id === t.id);
        if (!existing) remoteStreamRef.current.addTrack(t);
      });
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStreamRef.current;
        remoteVideoRef.current.muted = !speakerOn;
        // Force play
        remoteVideoRef.current.play().catch(() => {});
      }
      setRemoteVideoActive(true);
      setCallState('connected');
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && rtdb) {
        push(ref(rtdb, `calls/${roomId}/${isInitiator ? 'callerCandidates' : 'calleeCandidates'}`), event.candidate.toJSON());
      }
    };

    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      if (s === 'connecting') setCallState('connecting');
      if (s === 'connected') setCallState('connected');
      if (s === 'disconnected' || s === 'failed') cleanup('remote');
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed') pc.restartIce();
    };

    return pc;
  }, [rtdb, cleanup, speakerOn]);

  // ── Ringtone (Web Audio — no file needed) ─────────────────────────────────
  const ringCtxRef = useRef<AudioContext | null>(null);
  const ringStopRef = useRef<(() => void) | null>(null);

  const startRingtone = useCallback(() => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      ringCtxRef.current = ctx;
      let stopped = false;

      const playRing = (startTime: number) => {
        if (stopped) return;
        // Two-tone phone ring: 440Hz + 480Hz for 2s, silent 4s
        [440, 480].forEach(freq => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.value = freq;
          gain.gain.setValueAtTime(0, startTime);
          gain.gain.linearRampToValueAtTime(0.3, startTime + 0.05);
          gain.gain.setValueAtTime(0.3, startTime + 1.9);
          gain.gain.linearRampToValueAtTime(0, startTime + 2.0);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(startTime);
          osc.stop(startTime + 2.0);
        });
        // Schedule next ring after 4s gap (2s ring + 2s silence = 4s cycle)
        const nextId = setTimeout(() => playRing(ctx.currentTime), 4000);
        ringStopRef.current = () => { stopped = true; clearTimeout(nextId); ctx.close().catch(() => {}); };
      };

      playRing(ctx.currentTime);
    } catch { /* audio not supported */ }
  }, []);

  const stopRingtone = useCallback(() => {
    ringStopRef.current?.();
    ringStopRef.current = null;
    ringCtxRef.current = null;
  }, []);

  // Play ringtone when incoming, stop when answered/declined
  useEffect(() => {
    if (callState === 'incoming') {
      startRingtone();
    } else {
      stopRingtone();
    }
    return () => stopRingtone();
  }, [callState, startRingtone, stopRingtone]);

  // ── Broadcast call ────────────────────────────────────────────────────────
  const startBroadcastCall = useCallback(async (channel: string) => {
    if (!rtdb || !profile) return;
    setError(null);
    setCallState('calling');
    const stream = await getLocalStream();
    if (!stream) { setCallState('idle'); return; }

    const roomId = `broadcast_${channel}_${profile.uid}_${Date.now()}`;
    roomIdRef.current = roomId;
    const pc = createPC(roomId, true);
    if (!pc) return;

    const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
    await pc.setLocalDescription(offer);

    await set(ref(rtdb, `calls/${roomId}`), {
      roomId, offer: { type: offer.type, sdp: offer.sdp },
      callerId: profile.uid, callerName: profile.name,
      callerRole: profile.role, createdAt: Date.now(),
    });
    await set(ref(rtdb, `agency_calls/${channel}`), {
      roomId, callerId: profile.uid, callerName: profile.name, createdAt: Date.now(),
    });

    const ansRef = ref(rtdb, `calls/${roomId}/answer`);
    onValue(ansRef, async snap => {
      if (snap.exists() && pc.currentRemoteDescription === null)
        await pc.setRemoteDescription(new RTCSessionDescription(snap.val())).catch(() => {});
    });
    answerUnsubRef.current = () => off(ansRef);

    const ccRef = ref(rtdb, `calls/${roomId}/calleeCandidates`);
    onValue(ccRef, snap => { snap.forEach(c => { void pc.addIceCandidate(new RTCIceCandidate(c.val())).catch(() => {}); }); });
    candUnsubRef.current = () => off(ccRef);
  }, [rtdb, profile, getLocalStream, createPC]);

  // ── Direct call ───────────────────────────────────────────────────────────
  const startDirectCall = useCallback(async (targetId: string, targetName: string) => {
    if (!rtdb || !profile) return;
    setError(null);
    setCallState('calling');
    const stream = await getLocalStream();
    if (!stream) { setCallState('idle'); return; }

    const roomId = `${profile.uid}_${targetId}_${Date.now()}`;
    roomIdRef.current = roomId;
    const pc = createPC(roomId, true);
    if (!pc) return;

    const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
    await pc.setLocalDescription(offer);

    await set(ref(rtdb, `calls/${roomId}`), {
      offer: { type: offer.type, sdp: offer.sdp },
      callerId: profile.uid, callerName: profile.name,
      calleeId: targetId, calleeName: targetName, createdAt: Date.now(),
    });
    await set(ref(rtdb, `call_signals/${targetId}`), {
      roomId, callerId: profile.uid, callerName: profile.name,
    });

    const ansRef = ref(rtdb, `calls/${roomId}/answer`);
    onValue(ansRef, async snap => {
      if (snap.exists() && pc.currentRemoteDescription === null)
        await pc.setRemoteDescription(new RTCSessionDescription(snap.val())).catch(() => {});
    });
    answerUnsubRef.current = () => off(ansRef);

    const ccRef = ref(rtdb, `calls/${roomId}/calleeCandidates`);
    onValue(ccRef, snap => { snap.forEach(c => { void pc.addIceCandidate(new RTCIceCandidate(c.val())).catch(() => {}); }); });
    candUnsubRef.current = () => off(ccRef);
  }, [rtdb, profile, getLocalStream, createPC]);

  // ── Answer call ───────────────────────────────────────────────────────────
  const answerCall = useCallback(async () => {
    if (!rtdb || !profile) return;
    stopRingtone();
    setError(null);
    setCallState('connecting');

    let roomId = incomingRoomId ?? roomIdRef.current;
    if (!roomId) {
      const snap = await get(ref(rtdb, `call_signals/${profile.uid}`));
      if (!snap.exists()) return;
      roomId = snap.val().roomId;
    }
    roomIdRef.current = roomId!;

    const stream = await getLocalStream();
    if (!stream) { setCallState('incoming'); return; }

    const pc = createPC(roomId!, false);
    if (!pc) return;

    const callSnap = await get(ref(rtdb, `calls/${roomId}`));
    if (!callSnap.exists()) { setError('Call no longer available.'); setCallState('ended'); return; }

    await pc.setRemoteDescription(new RTCSessionDescription(callSnap.val().offer)).catch(() => {});
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await set(ref(rtdb, `calls/${roomId}/answer`), { type: answer.type, sdp: answer.sdp });

    await remove(ref(rtdb, `call_signals/${profile.uid}`)).catch(() => {});
    if (roomId!.startsWith('broadcast_')) {
      const ch = roomId!.split('_')[1];
      if (ch) await remove(ref(rtdb, `agency_calls/${ch}`)).catch(() => {});
    }

    const crRef = ref(rtdb, `calls/${roomId}/callerCandidates`);
    onValue(crRef, snap => { snap.forEach(c => { void pc.addIceCandidate(new RTCIceCandidate(c.val())).catch(() => {}); }); });
    candUnsubRef.current = () => off(crRef);
  }, [rtdb, profile, incomingRoomId, getLocalStream, createPC, stopRingtone]);

  // ── Decline ───────────────────────────────────────────────────────────────
  const declineCall = useCallback(async () => {
    stopRingtone();
    if (rtdb && profile?.uid) await remove(ref(rtdb, `call_signals/${profile.uid}`)).catch(() => {});
    setCallState('ended');
  }, [rtdb, profile?.uid, stopRingtone]);

  // ── Listen for incoming (direct call signals) ─────────────────────────────
  useEffect(() => {
    if (!rtdb || !profile?.uid) return;
    const sigRef = ref(rtdb, `call_signals/${profile.uid}`);
    const unsub = onValue(sigRef, snap => {
      if (snap.exists() && (callStateRef.current === 'idle' || callStateRef.current === 'ended')) {
        const { callerName: cn } = snap.val();
        setCallerName(cn || '');
        setCallState('incoming');
      }
    });
    return () => off(sigRef);
  }, [rtdb, profile?.uid]);

  // ── Auto-initiate on mount ────────────────────────────────────────────────
  useEffect(() => {
    if (!profile || !rtdb) return;
    if (incomingRoomId) return; // already set to 'incoming'
    if (targetUserId && targetUserName) startDirectCall(targetUserId, targetUserName);
    else if (agencyChannel) startBroadcastCall(agencyChannel);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Unmount cleanup ───────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      stopRingtone();
      localStreamRef.current?.getTracks().forEach(t => t.stop());
      pcRef.current?.close();
      if (durationRef.current) clearInterval(durationRef.current);
      if (qualityRef.current) clearInterval(qualityRef.current);
      if (controlsRef.current) clearTimeout(controlsRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleMic = () => { localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !t.enabled; }); setMicOn(v => !v); };
  const toggleCam = () => { localStreamRef.current?.getVideoTracks().forEach(t => { t.enabled = !t.enabled; }); setCamOn(v => !v); };

  const flipCamera = async () => {
    if (!localStreamRef.current || !pcRef.current) return;
    const cur = localStreamRef.current.getVideoTracks()[0];
    const facing = cur?.getSettings().facingMode === 'user' ? 'environment' : 'user';
    try {
      const ns = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing }, audio: false });
      const nt = ns.getVideoTracks()[0];
      const sender = pcRef.current.getSenders().find(s => s.track?.kind === 'video');
      if (sender) await sender.replaceTrack(nt);
      cur?.stop();
      localStreamRef.current.removeTrack(cur);
      localStreamRef.current.addTrack(nt);
      if (localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current;
    } catch { /* unsupported */ }
  };

  const hangUp = async () => { await cleanup('hangup'); onClose(); };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) containerRef.current.requestFullscreen().then(() => setFullscreen(true)).catch(() => {});
    else document.exitFullscreen().then(() => setFullscreen(false)).catch(() => {});
  };

  const displayName = callerName || agencyLabel;
  const QualityIcon = quality === 'poor' ? SignalZero : Signal;
  const qualityColor = quality === 'good' ? 'text-green-400' : quality === 'fair' ? 'text-yellow-400' : quality === 'poor' ? 'text-red-400' : 'text-slate-500';

  // ── SINGLE RENDER — video elements always in DOM ──────────────────────────
  return (
    <>
      {/* ── Hidden video elements — always mounted so refs are stable ──── */}
      <div className="hidden" aria-hidden="true">
        <video ref={localVideoRef} autoPlay playsInline muted />
        <video ref={remoteVideoRef} autoPlay playsInline />
      </div>

      {/* ── Minimized PiP ──────────────────────────────────────────────── */}
      {minimized && callState === 'connected' && (
        <div className="fixed bottom-24 right-4 z-[200] flex flex-col items-end gap-2">
          <div className="relative w-36 h-24 rounded-2xl overflow-hidden bg-slate-900 border-2 border-white/20 shadow-2xl cursor-pointer" onClick={() => setMinimized(false)}>
            {/* Clone remote video into PiP via canvas would be complex — show avatar instead */}
            <div className="w-full h-full flex items-center justify-center bg-[#0d1526]">
              <Avatar name={displayName} size="sm" />
            </div>
            <div className="absolute bottom-1.5 left-0 right-0 flex items-center justify-center gap-1">
              <div className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
              <span className="text-[10px] text-white font-bold">{formatDuration(duration)}</span>
            </div>
          </div>
          <button onClick={() => setMinimized(false)} className="h-8 px-3 rounded-xl bg-slate-800 border border-white/10 text-xs text-white font-bold hover:bg-slate-700 transition-colors">Expand</button>
        </div>
      )}

      {/* ── Incoming call ──────────────────────────────────────────────── */}
      {!minimized && callState === 'incoming' && (
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-md p-4">
          <div className="w-full max-w-sm bg-[#0d1526] rounded-3xl border border-white/10 shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
            <div className="bg-gradient-to-b from-green-900/60 to-transparent px-6 pt-10 pb-6 flex flex-col items-center gap-5">
              <div className="relative">
                <div className="absolute -inset-4 rounded-full bg-green-500/10 animate-ping" />
                <div className="absolute -inset-2 rounded-full bg-green-500/15 animate-ping" style={{ animationDelay: '0.5s' }} />
                <Avatar name={displayName} size="lg" />
              </div>
              <div className="text-center">
                <p className="text-2xl font-black text-white">{displayName}</p>
                <p className="text-sm text-slate-400 mt-1">Incoming video call...</p>
              </div>
            </div>
            <div className="flex items-center justify-around px-10 py-8 bg-black/20">
              <div className="flex flex-col items-center gap-2">
                <button onClick={declineCall} className="h-16 w-16 rounded-full bg-red-600 hover:bg-red-500 active:scale-95 flex items-center justify-center shadow-lg shadow-red-900/50 transition-all">
                  <PhoneOff className="h-7 w-7 text-white" />
                </button>
                <span className="text-xs text-slate-400 font-semibold">Decline</span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <button onClick={answerCall} className="h-16 w-16 rounded-full bg-green-500 hover:bg-green-400 active:scale-95 flex items-center justify-center shadow-lg shadow-green-900/50 transition-all animate-pulse">
                  <Video className="h-7 w-7 text-white" />
                </button>
                <span className="text-xs text-slate-400 font-semibold">Answer</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Calling / Connecting ────────────────────────────────────────── */}
      {!minimized && (callState === 'calling' || callState === 'connecting') && (
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="w-full max-w-sm bg-[#0d1526] rounded-3xl border border-white/10 shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
            <div className="px-6 pt-10 pb-6 flex flex-col items-center gap-5">
              <div className="relative flex items-center justify-center">
                <div className="absolute h-36 w-36 rounded-full border-2 border-green-500/20 animate-ping" />
                <div className="absolute h-28 w-28 rounded-full border-2 border-green-500/30 animate-ping" style={{ animationDelay: '0.4s' }} />
                <Avatar name={displayName} size="lg" />
              </div>
              <div className="text-center">
                <p className="text-xl font-black text-white">{displayName}</p>
                <p className="text-sm text-slate-400 mt-1">{callState === 'calling' ? 'Calling...' : 'Connecting...'}</p>
                <div className="flex items-center justify-center gap-1.5 mt-3">
                  {[0,1,2].map(i => <div key={i} className="h-2 w-2 rounded-full bg-green-500 animate-bounce" style={{ animationDelay: `${i*0.2}s` }} />)}
                </div>
              </div>
            </div>
            {/* Local preview */}
            <div className="mx-6 mb-4 rounded-2xl overflow-hidden h-32 bg-slate-900 border border-white/10 relative">
              <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
              {!localVideoReady && <div className="absolute inset-0 flex items-center justify-center"><span className="text-xs text-slate-500">Camera starting...</span></div>}
              <div className="absolute bottom-2 left-2 text-[10px] text-white/60 font-bold bg-black/40 px-2 py-0.5 rounded-full">You</div>
            </div>
            {error && <div className="mx-6 mb-4 px-4 py-3 rounded-xl bg-red-900/30 border border-red-500/30"><p className="text-xs text-red-300 text-center">{error}</p></div>}
            <div className="flex justify-center pb-8">
              <div className="flex flex-col items-center gap-2">
                <button onClick={hangUp} className="h-16 w-16 rounded-full bg-red-600 hover:bg-red-500 active:scale-95 flex items-center justify-center shadow-lg shadow-red-900/50 transition-all">
                  <PhoneOff className="h-7 w-7 text-white" />
                </button>
                <span className="text-xs text-slate-400 font-semibold">Cancel</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Call ended ──────────────────────────────────────────────────── */}
      {!minimized && callState === 'ended' && (
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-md p-4">
          <div className="w-full max-w-sm bg-[#0d1526] rounded-3xl border border-white/10 shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
            <div className="px-6 py-10 flex flex-col items-center gap-4">
              <div className="h-16 w-16 rounded-full bg-slate-800 border border-white/10 flex items-center justify-center">
                <PhoneOff className="h-7 w-7 text-slate-400" />
              </div>
              <div className="text-center">
                <p className="text-lg font-black text-white">Call Ended</p>
                {duration > 0 && <p className="text-sm text-slate-400 mt-1">Duration: {formatDuration(duration)}</p>}
                {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
              </div>
              <button onClick={onClose} className="mt-2 h-12 px-8 rounded-2xl bg-slate-700 hover:bg-slate-600 text-white font-bold text-sm transition-colors">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Connected — full screen ─────────────────────────────────────── */}
      {!minimized && callState === 'connected' && (
        <div className="fixed inset-0 z-[200] bg-black">
          <div ref={containerRef} className="relative w-full h-full bg-[#0a0d14] overflow-hidden" onMouseMove={resetControls} onTouchStart={resetControls}>

            {/* Remote video — full screen */}
            <video ref={remoteVideoRef} autoPlay playsInline className="absolute inset-0 w-full h-full object-cover" />

            {/* Placeholder when no remote video */}
            {!remoteVideoActive && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-[#0d1526] to-[#060a14] gap-4">
                <Avatar name={displayName} size="lg" />
                <p className="text-white font-bold text-lg">{displayName}</p>
                <p className="text-slate-400 text-sm">Waiting for video...</p>
              </div>
            )}

            {/* Gradient overlays */}
            <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/70 to-transparent pointer-events-none" />
            <div className={cn('absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-black/80 to-transparent pointer-events-none transition-opacity duration-300', controlsVisible ? 'opacity-100' : 'opacity-0')} />

            {/* Top bar */}
            <div className={cn('absolute top-0 inset-x-0 flex items-center justify-between px-4 pt-4 pb-3 transition-all duration-300', controlsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none')}>
              <div className="flex items-center gap-3 min-w-0">
                <Avatar name={displayName} size="sm" />
                <div className="min-w-0">
                  <p className="text-white font-black text-sm truncate">{displayName}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <div className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
                    <span className="text-[11px] text-green-400 font-bold">{formatDuration(duration)}</span>
                    {quality !== 'unknown' && <QualityIcon className={cn('h-3 w-3 ml-1', qualityColor)} />}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setMinimized(true)} className="h-9 w-9 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur-sm flex items-center justify-center text-white/80 hover:text-white transition-colors" aria-label="Minimize">
                  <Minimize2 className="h-4 w-4" />
                </button>
                <button onClick={toggleFullscreen} className="h-9 w-9 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur-sm flex items-center justify-center text-white/80 hover:text-white transition-colors" aria-label="Fullscreen">
                  <Maximize2 className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Local PiP */}
            <div className={cn('absolute top-20 right-4 rounded-2xl overflow-hidden border-2 border-white/20 shadow-2xl bg-slate-900 w-28 h-20 sm:w-36 sm:h-24 transition-opacity duration-300', controlsVisible ? 'opacity-100' : 'opacity-70')}>
              <video ref={localVideoRef} autoPlay playsInline muted className={cn('w-full h-full object-cover', !camOn && 'hidden')} />
              {!camOn && <div className="w-full h-full flex items-center justify-center bg-slate-800"><VideoOff className="h-6 w-6 text-slate-500" /></div>}
              <div className="absolute bottom-1 left-0 right-0 flex justify-center">
                <span className="text-[9px] text-white/60 font-bold bg-black/40 px-1.5 py-0.5 rounded-full">You</span>
              </div>
            </div>

            {/* Bottom controls */}
            <div className={cn('absolute bottom-0 inset-x-0 pb-8 pt-4 px-6 transition-all duration-300', controlsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none')}>
              {error && <div className="mb-4 px-4 py-2.5 rounded-xl bg-red-900/60 border border-red-500/40 backdrop-blur-sm"><p className="text-xs text-red-300 text-center">{error}</p></div>}
              <div className="flex items-center justify-center gap-4">
                <div className="flex flex-col items-center gap-1.5">
                  <button onClick={toggleMic} className={cn('h-14 w-14 rounded-full flex items-center justify-center transition-all active:scale-95 shadow-lg', micOn ? 'bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white' : 'bg-red-600 hover:bg-red-500 text-white')} aria-label="Toggle mic">
                    {micOn ? <Mic className="h-6 w-6" /> : <MicOff className="h-6 w-6" />}
                  </button>
                  <span className="text-[10px] text-white/60 font-semibold">{micOn ? 'Mute' : 'Unmuted'}</span>
                </div>
                <div className="flex flex-col items-center gap-1.5">
                  <button onClick={toggleCam} className={cn('h-14 w-14 rounded-full flex items-center justify-center transition-all active:scale-95 shadow-lg', camOn ? 'bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white' : 'bg-red-600 hover:bg-red-500 text-white')} aria-label="Toggle camera">
                    {camOn ? <Video className="h-6 w-6" /> : <VideoOff className="h-6 w-6" />}
                  </button>
                  <span className="text-[10px] text-white/60 font-semibold">{camOn ? 'Camera' : 'No cam'}</span>
                </div>
                <div className="flex flex-col items-center gap-1.5">
                  <button onClick={hangUp} className="h-16 w-16 rounded-full bg-red-600 hover:bg-red-500 active:scale-95 flex items-center justify-center shadow-xl shadow-red-900/60 transition-all" aria-label="End call">
                    <PhoneOff className="h-7 w-7 text-white" />
                  </button>
                  <span className="text-[10px] text-white/60 font-semibold">End</span>
                </div>
                <div className="flex flex-col items-center gap-1.5">
                  <button onClick={() => setSpeakerOn(v => !v)} className={cn('h-14 w-14 rounded-full flex items-center justify-center transition-all active:scale-95 shadow-lg', speakerOn ? 'bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white' : 'bg-slate-700 hover:bg-slate-600 text-slate-400')} aria-label="Toggle speaker">
                    {speakerOn ? <Volume2 className="h-6 w-6" /> : <VolumeX className="h-6 w-6" />}
                  </button>
                  <span className="text-[10px] text-white/60 font-semibold">{speakerOn ? 'Speaker' : 'Muted'}</span>
                </div>
                <div className="flex flex-col items-center gap-1.5">
                  <button onClick={flipCamera} className="h-14 w-14 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-sm flex items-center justify-center text-white transition-all active:scale-95 shadow-lg" aria-label="Flip camera">
                    <RotateCcw className="h-6 w-6" />
                  </button>
                  <span className="text-[10px] text-white/60 font-semibold">Flip</span>
                </div>
              </div>
            </div>

          </div>
        </div>
      )}
    </>
  );
}
