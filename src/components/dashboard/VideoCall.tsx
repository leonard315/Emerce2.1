'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { ref, set, onValue, remove, push, off, get, serverTimestamp } from 'firebase/database';
import { useDatabase } from '@/firebase';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';
import {
  Video, VideoOff, Mic, MicOff, PhoneOff, Phone,
  Maximize2, Minimize2, RotateCcw, Volume2, VolumeX,
  Signal, SignalZero, Users,
} from 'lucide-react';

// ── ICE servers — STUN + free TURN fallback ───────────────────────────────────
const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
};

export interface VideoCallProps {
  onClose: () => void;
  targetUserId?: string;
  targetUserName?: string;
  alertType?: 'fire' | 'crime' | 'medical' | 'all';
  /** Pre-supplied roomId when answering an incoming agency broadcast */
  incomingRoomId?: string;
}

type CallState = 'idle' | 'calling' | 'incoming' | 'connecting' | 'connected' | 'ended';
type ConnectionQuality = 'good' | 'fair' | 'poor' | 'unknown';

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function Avatar({ name, size = 'lg' }: { name: string; size?: 'sm' | 'lg' }) {
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div className={cn(
      'rounded-full bg-gradient-to-br from-slate-600 to-slate-800 border-2 border-white/10 flex items-center justify-center font-black text-white select-none',
      size === 'lg' ? 'h-24 w-24 text-3xl' : 'h-10 w-10 text-sm',
    )}>
      {initials || <Users className="h-6 w-6" />}
    </div>
  );
}

export function VideoCall({
  onClose,
  targetUserId,
  targetUserName,
  alertType,
  incomingRoomId,
}: VideoCallProps) {
  const rtdb = useDatabase();
  const { profile } = useAuth();

  const agencyChannel =
    alertType === 'fire' ? 'drrm' :
    alertType === 'crime' ? 'security' :
    alertType === 'medical' ? 'clinic' : null;

  const agencyLabel =
    alertType === 'fire' ? 'DRRM Office' :
    alertType === 'crime' ? 'Security Office' :
    alertType === 'medical' ? 'School Clinic' :
    targetUserName || 'Agency';

  // ── State ─────────────────────────────────────────────────────────────────
  const [callState, setCallState] = useState<CallState>(
    incomingRoomId ? 'incoming' : 'idle'
  );
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [incomingCallerId, setIncomingCallerId] = useState<string | null>(null);
  const [incomingCallerName, setIncomingCallerName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [quality, setQuality] = useState<ConnectionQuality>('unknown');
  const [remoteVideoActive, setRemoteVideoActive] = useState(false);
  const [localVideoReady, setLocalVideoReady] = useState(false);

  // ── Refs ──────────────────────────────────────────────────────────────────
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const roomIdRef = useRef<string | null>(incomingRoomId ?? null);
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const qualityTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const answerListenerRef = useRef<(() => void) | null>(null);
  const candidateListenerRef = useRef<(() => void) | null>(null);

  // ── Duration timer ────────────────────────────────────────────────────────
  useEffect(() => {
    if (callState === 'connected') {
      durationTimerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
    } else {
      if (durationTimerRef.current) clearInterval(durationTimerRef.current);
    }
    return () => { if (durationTimerRef.current) clearInterval(durationTimerRef.current); };
  }, [callState]);

  // ── Auto-hide controls after 4s of inactivity ─────────────────────────────
  const resetControlsTimer = useCallback(() => {
    setControlsVisible(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    if (callState === 'connected') {
      controlsTimerRef.current = setTimeout(() => setControlsVisible(false), 4000);
    }
  }, [callState]);

  useEffect(() => {
    resetControlsTimer();
    return () => { if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current); };
  }, [callState, resetControlsTimer]);

  // ── Connection quality polling ─────────────────────────────────────────────
  useEffect(() => {
    if (callState !== 'connected') return;
    qualityTimerRef.current = setInterval(async () => {
      const pc = pcRef.current;
      if (!pc) return;
      try {
        const stats = await pc.getStats();
        let rtt = 0;
        stats.forEach(report => {
          if (report.type === 'candidate-pair' && report.state === 'succeeded') {
            rtt = report.currentRoundTripTime ?? 0;
          }
        });
        setQuality(rtt === 0 ? 'unknown' : rtt < 0.1 ? 'good' : rtt < 0.3 ? 'fair' : 'poor');
      } catch { /* ignore */ }
    }, 3000);
    return () => { if (qualityTimerRef.current) clearInterval(qualityTimerRef.current); };
  }, [callState]);

  // ── Speaker toggle (remote audio) ─────────────────────────────────────────
  useEffect(() => {
    if (remoteVideoRef.current) {
      remoteVideoRef.current.muted = !speakerOn;
    }
  }, [speakerOn]);

  // ── Cleanup ───────────────────────────────────────────────────────────────
  const cleanup = useCallback(async (reason: 'hangup' | 'error' | 'remote' = 'hangup') => {
    if (durationTimerRef.current) clearInterval(durationTimerRef.current);
    if (qualityTimerRef.current) clearInterval(qualityTimerRef.current);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    answerListenerRef.current?.();
    candidateListenerRef.current?.();

    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;

    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;

    if (rtdb) {
      if (roomIdRef.current) {
        await remove(ref(rtdb, `calls/${roomIdRef.current}`)).catch(() => {});
      }
      if (profile?.uid) {
        await remove(ref(rtdb, `call_signals/${profile.uid}`)).catch(() => {});
      }
      if (agencyChannel) {
        await remove(ref(rtdb, `agency_calls/${agencyChannel}`)).catch(() => {});
      }
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
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.muted = true;
      }
      setLocalVideoReady(true);
      return stream;
    } catch (e: any) {
      const isDenied = e?.name === 'NotAllowedError' || e?.name === 'PermissionDeniedError';
      const isNotFound = e?.name === 'NotFoundError';
      setError(
        isDenied ? 'Camera/microphone access denied. Please allow permissions in your browser settings.' :
        isNotFound ? 'No camera or microphone found on this device.' :
        'Could not access camera/microphone. Please try again.'
      );
      return null;
    }
  }, []);

  // ── Create peer connection ────────────────────────────────────────────────
  const createPeerConnection = useCallback((roomId: string, isInitiator: boolean) => {
    if (!rtdb) return null;
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;

    localStreamRef.current?.getTracks().forEach(track => {
      pc.addTrack(track, localStreamRef.current!);
    });

    const remoteStream = new MediaStream();
    pc.ontrack = (event) => {
      event.streams[0].getTracks().forEach(track => remoteStream.addTrack(track));
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream;
        remoteVideoRef.current.muted = !speakerOn;
      }
      setRemoteVideoActive(true);
      setCallState('connected');
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && rtdb) {
        const path = `calls/${roomId}/${isInitiator ? 'callerCandidates' : 'calleeCandidates'}`;
        push(ref(rtdb, path), event.candidate.toJSON());
      }
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === 'connecting') setCallState('connecting');
      if (state === 'connected') setCallState('connected');
      if (state === 'disconnected' || state === 'failed') {
        cleanup('remote');
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed') {
        pc.restartIce();
      }
    };

    return pc;
  }, [rtdb, cleanup, speakerOn]);

  // ── Start call (initiator) ────────────────────────────────────────────────
  const startCall = useCallback(async (targetId: string, targetName: string) => {
    if (!rtdb || !profile) return;
    setError(null);
    setCallState('calling');

    const stream = await getLocalStream();
    if (!stream) { setCallState('idle'); return; }

    const roomId = `${profile.uid}_${targetId}_${Date.now()}`;
    roomIdRef.current = roomId;

    const pc = createPeerConnection(roomId, true);
    if (!pc) return;

    const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
    await pc.setLocalDescription(offer);

    await set(ref(rtdb, `calls/${roomId}`), {
      offer: { type: offer.type, sdp: offer.sdp },
      callerId: profile.uid,
      callerName: profile.name,
      calleeId: targetId,
      calleeName: targetName,
      createdAt: Date.now(),
    });

    await set(ref(rtdb, `call_signals/${targetId}`), {
      roomId,
      callerId: profile.uid,
      callerName: profile.name,
    });

    // Listen for answer
    const answerRef = ref(rtdb, `calls/${roomId}/answer`);
    const unsubAnswer = onValue(answerRef, async (snap) => {
      if (snap.exists() && pc.currentRemoteDescription === null) {
        await pc.setRemoteDescription(new RTCSessionDescription(snap.val())).catch(() => {});
      }
    });
    answerListenerRef.current = () => off(answerRef);

    // Listen for callee ICE candidates
    const calleeCandRef = ref(rtdb, `calls/${roomId}/calleeCandidates`);
    const unsubCand = onValue(calleeCandRef, (snap) => {
      snap.forEach(child => {
        pc.addIceCandidate(new RTCIceCandidate(child.val())).catch(() => {});
      });
    });
    candidateListenerRef.current = () => off(calleeCandRef);
  }, [rtdb, profile, getLocalStream, createPeerConnection]);

  // ── Broadcast call to agency channel ─────────────────────────────────────
  const startBroadcastCall = useCallback(async (channel: string) => {
    if (!rtdb || !profile) return;
    setError(null);
    setCallState('calling');

    const stream = await getLocalStream();
    if (!stream) { setCallState('idle'); return; }

    const roomId = `broadcast_${channel}_${profile.uid}_${Date.now()}`;
    roomIdRef.current = roomId;

    const pc = createPeerConnection(roomId, true);
    if (!pc) return;

    const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
    await pc.setLocalDescription(offer);

    await set(ref(rtdb, `calls/${roomId}`), {
      roomId,
      offer: { type: offer.type, sdp: offer.sdp },
      callerId: profile.uid,
      callerName: profile.name,
      callerRole: profile.role,
      createdAt: Date.now(),
    });

    await set(ref(rtdb, `agency_calls/${channel}`), {
      roomId,
      callerId: profile.uid,
      callerName: profile.name,
      createdAt: Date.now(),
    });

    const answerRef = ref(rtdb, `calls/${roomId}/answer`);
    onValue(answerRef, async (snap) => {
      if (snap.exists() && pc.currentRemoteDescription === null) {
        await pc.setRemoteDescription(new RTCSessionDescription(snap.val())).catch(() => {});
      }
    });
    answerListenerRef.current = () => off(answerRef);

    const calleeCandRef = ref(rtdb, `calls/${roomId}/calleeCandidates`);
    onValue(calleeCandRef, (snap) => {
      snap.forEach(child => {
        pc.addIceCandidate(new RTCIceCandidate(child.val())).catch(() => {});
      });
    });
    candidateListenerRef.current = () => off(calleeCandRef);
  }, [rtdb, profile, getLocalStream, createPeerConnection]);

  // ── Answer call ───────────────────────────────────────────────────────────
  const answerCall = useCallback(async () => {
    if (!rtdb || !profile) return;
    setError(null);
    setCallState('connecting');

    // Get roomId — either from prop (agency answer) or from signal
    let roomId = incomingRoomId ?? roomIdRef.current;
    if (!roomId) {
      const signalSnap = await get(ref(rtdb, `call_signals/${profile.uid}`));
      if (!signalSnap.exists()) return;
      roomId = signalSnap.val().roomId;
    }
    roomIdRef.current = roomId!;

    const stream = await getLocalStream();
    if (!stream) { setCallState('incoming'); return; }

    const pc = createPeerConnection(roomId!, false);
    if (!pc) return;

    const callSnap = await get(ref(rtdb, `calls/${roomId}`));
    if (!callSnap.exists()) { setError('Call no longer available.'); setCallState('ended'); return; }

    const callData = callSnap.val();
    await pc.setRemoteDescription(new RTCSessionDescription(callData.offer)).catch(() => {});

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await set(ref(rtdb, `calls/${roomId}/answer`), { type: answer.type, sdp: answer.sdp });

    // Clear signal
    await remove(ref(rtdb, `call_signals/${profile.uid}`)).catch(() => {});

    const callerCandRef = ref(rtdb, `calls/${roomId}/callerCandidates`);
    onValue(callerCandRef, (snap) => {
      snap.forEach(child => {
        pc.addIceCandidate(new RTCIceCandidate(child.val())).catch(() => {});
      });
    });
    candidateListenerRef.current = () => off(callerCandRef);
  }, [rtdb, profile, incomingRoomId, getLocalStream, createPeerConnection]);

  // ── Decline call ──────────────────────────────────────────────────────────
  const declineCall = useCallback(async () => {
    if (rtdb && profile?.uid) {
      await remove(ref(rtdb, `call_signals/${profile.uid}`)).catch(() => {});
    }
    setCallState('ended');
    setIncomingCallerId(null);
  }, [rtdb, profile?.uid]);

  // ── Listen for incoming calls ─────────────────────────────────────────────
  useEffect(() => {
    if (!rtdb || !profile?.uid) return;
    const signalRef = ref(rtdb, `call_signals/${profile.uid}`);
    const unsub = onValue(signalRef, (snap) => {
      if (snap.exists() && (callState === 'idle' || callState === 'ended')) {
        const { callerId, callerName } = snap.val();
        setIncomingCallerId(callerId);
        setIncomingCallerName(callerName);
        setCallState('incoming');
      }
    });
    return () => off(signalRef);
  }, [rtdb, profile?.uid, callState]);

  // ── Auto-initiate call on mount ───────────────────────────────────────────
  useEffect(() => {
    if (callState !== 'idle' || !profile || !rtdb) return;
    if (incomingRoomId) {
      // Pre-supplied room — show incoming UI, wait for user to tap Answer
      setCallState('incoming');
      return;
    }
    if (targetUserId && targetUserName) {
      startCall(targetUserId, targetUserName);
    } else if (agencyChannel) {
      startBroadcastCall(agencyChannel);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      localStreamRef.current?.getTracks().forEach(t => t.stop());
      pcRef.current?.close();
      if (durationTimerRef.current) clearInterval(durationTimerRef.current);
      if (qualityTimerRef.current) clearInterval(qualityTimerRef.current);
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    };
  }, []);

  // ── Toggle mic ────────────────────────────────────────────────────────────
  const toggleMic = () => {
    localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !t.enabled; });
    setMicOn(v => !v);
  };

  // ── Toggle camera ─────────────────────────────────────────────────────────
  const toggleCam = () => {
    localStreamRef.current?.getVideoTracks().forEach(t => { t.enabled = !t.enabled; });
    setCamOn(v => !v);
  };

  // ── Flip camera (mobile) ──────────────────────────────────────────────────
  const flipCamera = async () => {
    if (!localStreamRef.current || !pcRef.current) return;
    const currentTrack = localStreamRef.current.getVideoTracks()[0];
    const currentFacing = currentTrack?.getSettings().facingMode ?? 'user';
    const newFacing = currentFacing === 'user' ? 'environment' : 'user';
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: newFacing },
        audio: false,
      });
      const newTrack = newStream.getVideoTracks()[0];
      const sender = pcRef.current.getSenders().find(s => s.track?.kind === 'video');
      if (sender) await sender.replaceTrack(newTrack);
      currentTrack?.stop();
      localStreamRef.current.removeTrack(currentTrack);
      localStreamRef.current.addTrack(newTrack);
      if (localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current;
    } catch { /* device may not support flip */ }
  };

  // ── Hang up ───────────────────────────────────────────────────────────────
  const hangUp = async () => {
    await cleanup('hangup');
    onClose();
  };

  // ── Fullscreen ────────────────────────────────────────────────────────────
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setFullscreen(false)).catch(() => {});
    }
  };

  useEffect(() => {
    const handler = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // ── Quality indicator ─────────────────────────────────────────────────────
  const QualityIcon = quality === 'good' ? Signal :
    quality === 'fair' ? Signal : SignalZero;
  const qualityColor = quality === 'good' ? 'text-green-400' :
    quality === 'fair' ? 'text-yellow-400' :
    quality === 'poor' ? 'text-red-400' : 'text-slate-500';

  // ── Minimized floating pip ────────────────────────────────────────────────
  if (minimized) {
    return (
      <div className="fixed bottom-24 right-4 z-[200] flex flex-col items-end gap-2">
        <div
          className="relative w-36 h-24 rounded-2xl overflow-hidden bg-slate-900 border-2 border-white/20 shadow-2xl cursor-pointer"
          onClick={() => setMinimized(false)}
        >
          <video
            ref={remoteVideoRef}
            autoPlay playsInline
            className="w-full h-full object-cover"
          />
          {!remoteVideoActive && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-900">
              <Avatar name={incomingCallerName || agencyLabel} size="sm" />
            </div>
          )}
          <div className="absolute inset-0 bg-black/20" />
          <div className="absolute bottom-1.5 left-0 right-0 flex items-center justify-center gap-1">
            <div className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
            <span className="text-[10px] text-white font-bold">{formatDuration(duration)}</span>
          </div>
        </div>
        <button
          onClick={() => setMinimized(false)}
          className="h-8 px-3 rounded-xl bg-slate-800 border border-white/10 text-xs text-white font-bold hover:bg-slate-700 transition-colors"
        >
          Expand
        </button>
      </div>
    );
  }

  // ── Incoming call screen ──────────────────────────────────────────────────
  if (callState === 'incoming') {
    return (
      <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-md p-4">
        <div className="w-full max-w-sm bg-[#0d1526] rounded-3xl border border-white/10 shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
          {/* Gradient header */}
          <div className="bg-gradient-to-b from-green-900/60 to-transparent px-6 pt-8 pb-4 flex flex-col items-center gap-4">
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-green-500/20 animate-ping scale-125" />
              <Avatar name={incomingCallerName || agencyLabel} size="lg" />
            </div>
            <div className="text-center">
              <p className="text-xl font-black text-white">{incomingCallerName || agencyLabel}</p>
              <p className="text-sm text-slate-400 mt-1">Incoming video call</p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-around px-8 py-8">
            {/* Decline */}
            <div className="flex flex-col items-center gap-2">
              <button
                onClick={declineCall}
                className="h-16 w-16 rounded-full bg-red-600 hover:bg-red-500 active:scale-95 flex items-center justify-center shadow-lg shadow-red-900/50 transition-all"
              >
                <PhoneOff className="h-7 w-7 text-white" />
              </button>
              <span className="text-xs text-slate-400 font-semibold">Decline</span>
            </div>

            {/* Answer */}
            <div className="flex flex-col items-center gap-2">
              <button
                onClick={answerCall}
                className="h-16 w-16 rounded-full bg-green-500 hover:bg-green-400 active:scale-95 flex items-center justify-center shadow-lg shadow-green-900/50 transition-all animate-pulse"
              >
                <Video className="h-7 w-7 text-white" />
              </button>
              <span className="text-xs text-slate-400 font-semibold">Answer</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Calling / connecting screen ───────────────────────────────────────────
  if (callState === 'calling' || callState === 'connecting') {
    return (
      <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-md p-4">
        <div className="w-full max-w-sm bg-[#0d1526] rounded-3xl border border-white/10 shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
          <div className="px-6 pt-10 pb-4 flex flex-col items-center gap-5">
            {/* Pulsing avatar */}
            <div className="relative flex items-center justify-center">
              <div className="absolute h-32 w-32 rounded-full border-2 border-green-500/30 animate-ping" />
              <div className="absolute h-24 w-24 rounded-full border-2 border-green-500/20 animate-ping" style={{ animationDelay: '0.3s' }} />
              <Avatar name={agencyLabel} size="lg" />
            </div>
            <div className="text-center">
              <p className="text-xl font-black text-white">{agencyLabel}</p>
              <p className="text-sm text-slate-400 mt-1">
                {callState === 'calling' ? 'Calling...' : 'Connecting...'}
              </p>
              <div className="flex items-center justify-center gap-1.5 mt-3">
                {[0, 1, 2].map(i => (
                  <div
                    key={i}
                    className="h-2 w-2 rounded-full bg-green-500 animate-bounce"
                    style={{ animationDelay: `${i * 0.2}s` }}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Local preview while calling */}
          {localVideoReady && (
            <div className="mx-6 mb-4 rounded-2xl overflow-hidden h-32 bg-slate-900 border border-white/10 relative">
              <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
              <div className="absolute bottom-2 left-2 text-[10px] text-white/60 font-bold bg-black/40 px-2 py-0.5 rounded-full">You</div>
            </div>
          )}

          {error && (
            <div className="mx-6 mb-4 px-4 py-3 rounded-xl bg-red-900/30 border border-red-500/30">
              <p className="text-xs text-red-300 text-center">{error}</p>
            </div>
          )}

          <div className="flex items-center justify-center pb-8">
            <div className="flex flex-col items-center gap-2">
              <button
                onClick={hangUp}
                className="h-16 w-16 rounded-full bg-red-600 hover:bg-red-500 active:scale-95 flex items-center justify-center shadow-lg shadow-red-900/50 transition-all"
              >
                <PhoneOff className="h-7 w-7 text-white" />
              </button>
              <span className="text-xs text-slate-400 font-semibold">Cancel</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Call ended screen ─────────────────────────────────────────────────────
  if (callState === 'ended') {
    return (
      <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-md p-4">
        <div className="w-full max-w-sm bg-[#0d1526] rounded-3xl border border-white/10 shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
          <div className="px-6 py-10 flex flex-col items-center gap-4">
            <div className="h-16 w-16 rounded-full bg-slate-800 border border-white/10 flex items-center justify-center">
              <PhoneOff className="h-7 w-7 text-slate-400" />
            </div>
            <div className="text-center">
              <p className="text-lg font-black text-white">Call Ended</p>
              {duration > 0 && (
                <p className="text-sm text-slate-400 mt-1">Duration: {formatDuration(duration)}</p>
              )}
              {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
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
    );
  }

  // ── Connected call — full Messenger-style UI ──────────────────────────────
  return (
    <div className="fixed inset-0 z-[200] bg-black">
      <div
        ref={containerRef}
        className="relative w-full h-full flex flex-col bg-[#0a0d14] overflow-hidden"
        onMouseMove={resetControlsTimer}
        onTouchStart={resetControlsTimer}
      >
        {/* ── Remote video (full screen) ─────────────────────────────────── */}
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
        />

        {/* Remote video placeholder (when no video yet) */}
        {!remoteVideoActive && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-[#0d1526] to-[#060a14] gap-4">
            <Avatar name={incomingCallerName || agencyLabel} size="lg" />
            <p className="text-white font-bold text-lg">{incomingCallerName || agencyLabel}</p>
            <p className="text-slate-400 text-sm">Waiting for video...</p>
          </div>
        )}

        {/* Dark gradient overlays for readability */}
        <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/70 to-transparent pointer-events-none" />
        <div className={cn(
          'absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/80 to-transparent pointer-events-none transition-opacity duration-300',
          controlsVisible ? 'opacity-100' : 'opacity-0'
        )} />

        {/* ── Top bar ────────────────────────────────────────────────────── */}
        <div className={cn(
          'absolute top-0 inset-x-0 flex items-center justify-between px-4 pt-safe-top pt-4 pb-3 transition-all duration-300',
          controlsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none'
        )}>
          {/* Left — caller info + quality */}
          <div className="flex items-center gap-3 min-w-0">
            <Avatar name={incomingCallerName || agencyLabel} size="sm" />
            <div className="min-w-0">
              <p className="text-white font-black text-sm truncate leading-tight">
                {incomingCallerName || agencyLabel}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <div className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
                <span className="text-[11px] text-green-400 font-bold">{formatDuration(duration)}</span>
                {quality !== 'unknown' && (
                  <QualityIcon className={cn('h-3 w-3 ml-1', qualityColor)} />
                )}
              </div>
            </div>
          </div>

          {/* Right — minimize + fullscreen */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setMinimized(true)}
              className="h-9 w-9 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur-sm flex items-center justify-center text-white/80 hover:text-white transition-colors"
              aria-label="Minimize"
            >
              <Minimize2 className="h-4 w-4" />
            </button>
            <button
              onClick={toggleFullscreen}
              className="h-9 w-9 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur-sm flex items-center justify-center text-white/80 hover:text-white transition-colors"
              aria-label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            >
              <Maximize2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* ── Local video PiP ────────────────────────────────────────────── */}
        <div
          className={cn(
            'absolute top-20 right-4 rounded-2xl overflow-hidden border-2 border-white/20 shadow-2xl bg-slate-900 transition-all duration-300',
            'w-28 h-20 sm:w-36 sm:h-24',
            controlsVisible ? 'opacity-100' : 'opacity-70'
          )}
        >
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className={cn('w-full h-full object-cover', !camOn && 'hidden')}
          />
          {!camOn && (
            <div className="w-full h-full flex items-center justify-center bg-slate-800">
              <VideoOff className="h-6 w-6 text-slate-500" />
            </div>
          )}
          {/* Cam-off overlay label */}
          <div className="absolute bottom-1 left-0 right-0 flex justify-center">
            <span className="text-[9px] text-white/60 font-bold bg-black/40 px-1.5 py-0.5 rounded-full">You</span>
          </div>
        </div>

        {/* ── Bottom controls ─────────────────────────────────────────────── */}
        <div className={cn(
          'absolute bottom-0 inset-x-0 pb-safe-bottom pb-6 pt-4 px-6 transition-all duration-300',
          controlsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
        )}>
          {/* Error banner */}
          {error && (
            <div className="mb-4 px-4 py-2.5 rounded-xl bg-red-900/60 border border-red-500/40 backdrop-blur-sm">
              <p className="text-xs text-red-300 text-center">{error}</p>
            </div>
          )}

          {/* Control buttons row */}
          <div className="flex items-center justify-center gap-4">

            {/* Mic */}
            <div className="flex flex-col items-center gap-1.5">
              <button
                onClick={toggleMic}
                className={cn(
                  'h-14 w-14 rounded-full flex items-center justify-center transition-all active:scale-95 shadow-lg',
                  micOn
                    ? 'bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white'
                    : 'bg-red-600 hover:bg-red-500 text-white'
                )}
                aria-label={micOn ? 'Mute microphone' : 'Unmute microphone'}
              >
                {micOn ? <Mic className="h-6 w-6" /> : <MicOff className="h-6 w-6" />}
              </button>
              <span className="text-[10px] text-white/60 font-semibold">{micOn ? 'Mute' : 'Unmuted'}</span>
            </div>

            {/* Camera */}
            <div className="flex flex-col items-center gap-1.5">
              <button
                onClick={toggleCam}
                className={cn(
                  'h-14 w-14 rounded-full flex items-center justify-center transition-all active:scale-95 shadow-lg',
                  camOn
                    ? 'bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white'
                    : 'bg-red-600 hover:bg-red-500 text-white'
                )}
                aria-label={camOn ? 'Turn off camera' : 'Turn on camera'}
              >
                {camOn ? <Video className="h-6 w-6" /> : <VideoOff className="h-6 w-6" />}
              </button>
              <span className="text-[10px] text-white/60 font-semibold">{camOn ? 'Camera' : 'No cam'}</span>
            </div>

            {/* End call */}
            <div className="flex flex-col items-center gap-1.5">
              <button
                onClick={hangUp}
                className="h-16 w-16 rounded-full bg-red-600 hover:bg-red-500 active:scale-95 flex items-center justify-center shadow-xl shadow-red-900/60 transition-all"
                aria-label="End call"
              >
                <PhoneOff className="h-7 w-7 text-white" />
              </button>
              <span className="text-[10px] text-white/60 font-semibold">End</span>
            </div>

            {/* Speaker */}
            <div className="flex flex-col items-center gap-1.5">
              <button
                onClick={() => setSpeakerOn(v => !v)}
                className={cn(
                  'h-14 w-14 rounded-full flex items-center justify-center transition-all active:scale-95 shadow-lg',
                  speakerOn
                    ? 'bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white'
                    : 'bg-slate-700 hover:bg-slate-600 text-slate-400'
                )}
                aria-label={speakerOn ? 'Mute speaker' : 'Unmute speaker'}
              >
                {speakerOn ? <Volume2 className="h-6 w-6" /> : <VolumeX className="h-6 w-6" />}
              </button>
              <span className="text-[10px] text-white/60 font-semibold">{speakerOn ? 'Speaker' : 'Muted'}</span>
            </div>

            {/* Flip camera */}
            <div className="flex flex-col items-center gap-1.5">
              <button
                onClick={flipCamera}
                className="h-14 w-14 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-sm flex items-center justify-center text-white transition-all active:scale-95 shadow-lg"
                aria-label="Flip camera"
              >
                <RotateCcw className="h-6 w-6" />
              </button>
              <span className="text-[10px] text-white/60 font-semibold">Flip</span>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
