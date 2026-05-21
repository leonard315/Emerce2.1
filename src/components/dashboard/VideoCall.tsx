'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { ref, set, onValue, remove, push, off, get } from 'firebase/database';
import { useDatabase } from '@/firebase';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Video, VideoOff, Mic, MicOff, PhoneOff, Phone, X, Maximize2, Minimize2,
} from 'lucide-react';

// ── ICE servers (STUN) ────────────────────────────────────────────────────────
const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

interface VideoCallProps {
  onClose: () => void;
  targetUserId?: string;   // direct call to specific user
  targetUserName?: string;
  alertType?: 'fire' | 'crime' | 'medical' | 'all'; // broadcast to agency type
}

type CallState = 'idle' | 'calling' | 'incoming' | 'connected' | 'ended';

export function VideoCall({ onClose, targetUserId, targetUserName, alertType }: VideoCallProps) {
  const rtdb = useDatabase();
  const { profile } = useAuth();

  // Determine agency channel from alertType for broadcast calls
  const agencyChannel = alertType === 'fire' ? 'drrm' : alertType === 'crime' ? 'security' : alertType === 'medical' ? 'clinic' : null;
  const agencyLabel = alertType === 'fire' ? 'DRRM Office' : alertType === 'crime' ? 'Security Office' : alertType === 'medical' ? 'School Clinic' : targetUserName || 'Agency';

  const [callState, setCallState] = useState<CallState>('idle');
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [minimized, setMinimized] = useState(false);
  const [incomingCallerId, setIncomingCallerId] = useState<string | null>(null);
  const [incomingCallerName, setIncomingCallerName] = useState<string>('');
  const [callRoomId, setCallRoomId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const roomIdRef = useRef<string | null>(null);

  // ── Cleanup ───────────────────────────────────────────────────────────────
  const cleanup = useCallback(async () => {
    // Stop local media
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;

    // Close peer connection
    pcRef.current?.close();
    pcRef.current = null;

    // Clear video elements
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;

    // Remove Firebase signaling data
    if (rtdb && roomIdRef.current) {
      await remove(ref(rtdb, `calls/${roomIdRef.current}`)).catch(() => {});
    }
    if (rtdb && profile?.uid) {
      await remove(ref(rtdb, `call_signals/${profile.uid}`)).catch(() => {});
    }

    roomIdRef.current = null;
    setCallRoomId(null);
    setCallState('ended');
  }, [rtdb, profile?.uid]);

  // ── Get local media ───────────────────────────────────────────────────────
  const getLocalStream = useCallback(async (): Promise<MediaStream | null> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.muted = true; // prevent echo
      }
      return stream;
    } catch (e: any) {
      setError('Camera/microphone access denied. Please allow permissions and try again.');
      return null;
    }
  }, []);

  // ── Create peer connection ────────────────────────────────────────────────
  const createPeerConnection = useCallback((roomId: string, isInitiator: boolean) => {
    if (!rtdb) return null;
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;

    // Add local tracks
    localStreamRef.current?.getTracks().forEach(track => {
      pc.addTrack(track, localStreamRef.current!);
    });

    // Remote stream → video element
    pc.ontrack = (event) => {
      if (remoteVideoRef.current && event.streams[0]) {
        remoteVideoRef.current.srcObject = event.streams[0];
        setCallState('connected');
      }
    };

    // ICE candidates → Firebase
    pc.onicecandidate = (event) => {
      if (event.candidate && rtdb) {
        const candidateRef = push(ref(rtdb, `calls/${roomId}/${isInitiator ? 'callerCandidates' : 'calleeCandidates'}`));
        set(candidateRef, event.candidate.toJSON());
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        cleanup();
      }
    };

    return pc;
  }, [rtdb, cleanup]);

  // ── Start call (initiator) ────────────────────────────────────────────────
  const startCall = useCallback(async (targetId: string, targetName: string) => {
    if (!rtdb || !profile) return;
    setError(null);

    const stream = await getLocalStream();
    if (!stream) return;

    const roomId = `${profile.uid}_${targetId}_${Date.now()}`;
    roomIdRef.current = roomId;
    setCallRoomId(roomId);
    setCallState('calling');

    const pc = createPeerConnection(roomId, true);
    if (!pc) return;

    // Create offer
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    // Write offer to Firebase
    await set(ref(rtdb, `calls/${roomId}`), {
      offer: { type: offer.type, sdp: offer.sdp },
      callerId: profile.uid,
      callerName: profile.name,
      calleeId: targetId,
      calleeName: targetName,
      createdAt: Date.now(),
    });

    // Signal the target user
    await set(ref(rtdb, `call_signals/${targetId}`), {
      roomId,
      callerId: profile.uid,
      callerName: profile.name,
    });

    // Listen for answer
    const answerRef = ref(rtdb, `calls/${roomId}/answer`);
    onValue(answerRef, async (snap) => {
      if (snap.exists() && pc.currentRemoteDescription === null) {
        const answer = snap.val();
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
      }
    });

    // Listen for callee ICE candidates
    const calleeCandidatesRef = ref(rtdb, `calls/${roomId}/calleeCandidates`);
    onValue(calleeCandidatesRef, (snap) => {
      snap.forEach(child => {
        pc.addIceCandidate(new RTCIceCandidate(child.val())).catch(() => {});
      });
    });
  }, [rtdb, profile, getLocalStream, createPeerConnection]);

  // ── Answer call ───────────────────────────────────────────────────────────
  const answerCall = useCallback(async () => {
    if (!rtdb || !profile || !incomingCallerId) return;
    setError(null);

    // Get the room ID from signal
    const signalSnap = await get(ref(rtdb, `call_signals/${profile.uid}`));
    if (!signalSnap.exists()) return;
    const { roomId } = signalSnap.val();
    roomIdRef.current = roomId;
    setCallRoomId(roomId);

    const stream = await getLocalStream();
    if (!stream) return;

    const pc = createPeerConnection(roomId, false);
    if (!pc) return;

    // Get offer
    const callSnap = await get(ref(rtdb, `calls/${roomId}`));
    if (!callSnap.exists()) return;
    const callData = callSnap.val();

    await pc.setRemoteDescription(new RTCSessionDescription(callData.offer));

    // Create answer
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    // Write answer
    await set(ref(rtdb, `calls/${roomId}/answer`), { type: answer.type, sdp: answer.sdp });

    // Clear incoming signal
    await remove(ref(rtdb, `call_signals/${profile.uid}`));

    // Listen for caller ICE candidates
    const callerCandidatesRef = ref(rtdb, `calls/${roomId}/callerCandidates`);
    onValue(callerCandidatesRef, (snap) => {
      snap.forEach(child => {
        pc.addIceCandidate(new RTCIceCandidate(child.val())).catch(() => {});
      });
    });

    setCallState('connected');
  }, [rtdb, profile, incomingCallerId, getLocalStream, createPeerConnection]);

  // ── Listen for incoming calls ─────────────────────────────────────────────
  useEffect(() => {
    if (!rtdb || !profile?.uid) return;
    const signalRef = ref(rtdb, `call_signals/${profile.uid}`);
    const unsubscribe = onValue(signalRef, (snap) => {
      if (snap.exists() && callState === 'idle') {
        const { callerId, callerName } = snap.val();
        setIncomingCallerId(callerId);
        setIncomingCallerName(callerName);
        setCallState('incoming');
      }
    });
    return () => off(signalRef);
  }, [rtdb, profile?.uid, callState]);

  // ── Auto-call: direct user OR broadcast to agency channel ───────────────
  useEffect(() => {
    if (callState !== 'idle' || !profile || !rtdb) return;

    if (targetUserId && targetUserName) {
      // Direct call to specific user
      startCall(targetUserId, targetUserName);
    } else if (agencyChannel) {
      // Broadcast call to agency channel — write to shared channel room
      const broadcastCall = async () => {
        setError(null);
        const stream = await getLocalStream();
        if (!stream) return;

        const roomId = `broadcast_${agencyChannel}_${profile.uid}_${Date.now()}`;
        roomIdRef.current = roomId;
        setCallRoomId(roomId);
        setCallState('calling');

        const pc = createPeerConnection(roomId, true);
        if (!pc) return;

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        // Write to agency channel — any agency user listening will see this
        await set(ref(rtdb, `agency_calls/${agencyChannel}`), {
          roomId,
          offer: { type: offer.type, sdp: offer.sdp },
          callerId: profile.uid,
          callerName: profile.name,
          callerRole: profile.role,
          createdAt: Date.now(),
        });

        // Listen for answer
        onValue(ref(rtdb, `calls/${roomId}/answer`), async (snap) => {
          if (snap.exists() && pc.currentRemoteDescription === null) {
            await pc.setRemoteDescription(new RTCSessionDescription(snap.val()));
          }
        });

        // Listen for callee ICE candidates
        onValue(ref(rtdb, `calls/${roomId}/calleeCandidates`), (snap) => {
          snap.forEach(child => {
            pc.addIceCandidate(new RTCIceCandidate(child.val())).catch(() => {});
          });
        });
      };
      broadcastCall();
    }
  }, [agencyChannel, targetUserId, targetUserName, callState]); // eslint-disable-line

  // ── Toggle mic/cam ────────────────────────────────────────────────────────
  const toggleMic = () => {
    localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !t.enabled; });
    setMicOn(v => !v);
  };

  const toggleCam = () => {
    localStreamRef.current?.getVideoTracks().forEach(t => { t.enabled = !t.enabled; });
    setCamOn(v => !v);
  };

  const hangUp = async () => {
    await cleanup();
    onClose();
  };

  const declineCall = async () => {
    if (rtdb && profile?.uid) {
      await remove(ref(rtdb, `call_signals/${profile.uid}`)).catch(() => {});
    }
    setCallState('idle');
    setIncomingCallerId(null);
  };

  // ── Minimized floating button ─────────────────────────────────────────────
  if (minimized) {
    return (
      <div className="fixed bottom-6 right-6 z-50">
        <button
          onClick={() => setMinimized(false)}
          className="h-14 w-14 rounded-full bg-green-600 hover:bg-green-500 shadow-2xl flex items-center justify-center transition-all"
        >
          <Video className="h-6 w-6 text-white" />
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-2xl bg-[#0a0f1e] rounded-3xl border border-white/10 overflow-hidden shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-sm font-bold text-white">
              {callState === 'idle' && 'Video Call'}
              {callState === 'calling' && `Calling ${agencyLabel}...`}
              {callState === 'incoming' && `Incoming call from ${incomingCallerName}`}
              {callState === 'connected' && 'Connected'}
              {callState === 'ended' && 'Call ended'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setMinimized(true)} className="h-8 w-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-colors">
              <Minimize2 className="h-4 w-4" />
            </button>
            <button onClick={hangUp} className="h-8 w-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Video area */}
        <div className="relative bg-slate-950 aspect-video">
          {/* Remote video (full size) */}
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className={cn("w-full h-full object-cover", callState !== 'connected' && 'hidden')}
          />

          {/* Placeholder when not connected */}
          {callState !== 'connected' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
              <div className="h-20 w-20 rounded-full bg-slate-800 border border-white/10 flex items-center justify-center">
                <Video className="h-10 w-10 text-slate-500" />
              </div>
              {callState === 'calling' && (
                <div className="text-center">
                  <p className="text-white font-bold">Calling {agencyLabel}...</p>
                  <p className="text-slate-400 text-sm mt-1">Waiting for an agent to answer</p>
                  <div className="flex items-center justify-center gap-1 mt-3">
                    {[0, 1, 2].map(i => (
                      <div key={i} className="h-2 w-2 rounded-full bg-green-500 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                    ))}
                  </div>
                </div>
              )}
              {callState === 'incoming' && (
                <div className="text-center">
                  <p className="text-white font-bold text-lg">{incomingCallerName}</p>
                  <p className="text-slate-400 text-sm mt-1">Incoming video call</p>
                </div>
              )}
              {callState === 'idle' && (
                <p className="text-slate-400 text-sm">Ready to call</p>
              )}
              {callState === 'ended' && (
                <p className="text-slate-400 text-sm">Call ended</p>
              )}
              {error && (
                <p className="text-red-400 text-sm text-center px-4">{error}</p>
              )}
            </div>
          )}

          {/* Local video (picture-in-picture) */}
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="absolute bottom-3 right-3 w-32 h-24 rounded-xl object-cover border border-white/20 shadow-lg bg-slate-900"
          />
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-4 px-5 py-5 border-t border-white/5">
          {/* Incoming call — accept/decline */}
          {callState === 'incoming' && (
            <>
              <Button
                onClick={declineCall}
                className="h-14 w-14 rounded-full bg-red-600 hover:bg-red-500 p-0 shadow-lg"
              >
                <PhoneOff className="h-6 w-6" />
              </Button>
              <Button
                onClick={answerCall}
                className="h-14 w-14 rounded-full bg-green-600 hover:bg-green-500 p-0 shadow-lg"
              >
                <Phone className="h-6 w-6" />
              </Button>
            </>
          )}

          {/* Active call controls */}
          {(callState === 'calling' || callState === 'connected') && (
            <>
              <Button
                onClick={toggleMic}
                variant="outline"
                className={cn(
                  "h-12 w-12 rounded-full p-0 border-white/10",
                  !micOn && 'bg-red-500/20 border-red-500/40 text-red-400'
                )}
              >
                {micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
              </Button>
              <Button
                onClick={hangUp}
                className="h-14 w-14 rounded-full bg-red-600 hover:bg-red-500 p-0 shadow-lg"
              >
                <PhoneOff className="h-6 w-6" />
              </Button>
              <Button
                onClick={toggleCam}
                variant="outline"
                className={cn(
                  "h-12 w-12 rounded-full p-0 border-white/10",
                  !camOn && 'bg-red-500/20 border-red-500/40 text-red-400'
                )}
              >
                {camOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
              </Button>
            </>
          )}

          {/* Idle — start call button if no target */}
          {callState === 'idle' && !targetUserId && !agencyChannel && (
            <p className="text-slate-400 text-sm">Select a user to call from the dashboard</p>
          )}

          {callState === 'ended' && (
            <Button onClick={onClose} variant="outline" className="border-white/10 text-white">
              Close
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
