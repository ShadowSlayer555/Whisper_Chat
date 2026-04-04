import React, { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { Mic, MicOff, Video, VideoOff, X, Settings, Maximize2, MonitorUp, Pin, Shield, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';

interface CallPanelProps {
  forumId: string;
  forumTitle: string;
  user: any;
  callType: 'video' | 'voice';
  onClose: () => void;
  canManage: boolean;
}

interface Participant {
  userId: string;
  socketId: string;
  userDetails: any;
  stream?: MediaStream;
  isMuted?: boolean;
  isVideoOff?: boolean;
}

export const CallPanel: React.FC<CallPanelProps> = ({ forumId, forumTitle, user, callType, onClose, canManage }) => {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(callType === 'voice');
  const isMutedRef = useRef(isMuted);
  const isVideoOffRef = useRef(isVideoOff);

  useEffect(() => {
    isMutedRef.current = isMuted;
    isVideoOffRef.current = isVideoOff;
  }, [isMuted, isVideoOff]);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [permissionError, setPermissionError] = useState(false);
  
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudio, setSelectedAudio] = useState<string>('');
  const [selectedVideo, setSelectedVideo] = useState<string>('');
  const [showSettings, setShowSettings] = useState(false);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeSpeakerId, setActiveSpeakerId] = useState<string | null>(null);
  const [pinnedParticipantId, setPinnedParticipantId] = useState<string | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const peersRef = useRef<{ [socketId: string]: RTCPeerConnection }>({});
  const localStreamRef = useRef<MediaStream | null>(null);
  const originalVideoTrackRef = useRef<MediaStreamTrack | null>(null);
  
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyzersRef = useRef<{ [id: string]: AnalyserNode }>({});

  useEffect(() => {
    const init = async () => {
      await getDevices();
      await startLocalStream();
      connectSocket();
    };
    init();

    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }
      Object.values(peersRef.current).forEach(peer => peer.close());
      if (socketRef.current) socketRef.current.disconnect();
      if (audioCtxRef.current) audioCtxRef.current.close();
    };
  }, []);

  // Active Speaker Detection
  useEffect(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    const ctx = audioCtxRef.current;
    
    // Resume context if it's suspended (browsers require user interaction)
    const resumeAudioContext = () => {
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      document.removeEventListener('click', resumeAudioContext);
      document.removeEventListener('touchstart', resumeAudioContext);
    };
    
    document.addEventListener('click', resumeAudioContext);
    document.addEventListener('touchstart', resumeAudioContext);

    const interval = setInterval(() => {
      let maxVol = 0;
      let loudest: string | null = null;

      const checkStream = (id: string, stream: MediaStream) => {
        if (stream.getAudioTracks().length === 0) return;
        if (!analyzersRef.current[id]) {
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 256;
          try {
            const source = ctx.createMediaStreamSource(stream);
            source.connect(analyser);
            analyzersRef.current[id] = analyser;
          } catch (e) {
            return;
          }
        }
        const analyser = analyzersRef.current[id];
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(dataArray);
        const volume = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        if (volume > maxVol && volume > 10) {
          maxVol = volume;
          loudest = id;
        }
      };

      if (localStreamRef.current && !isMuted) {
        checkStream('local', localStreamRef.current);
      }
      participants.forEach(p => {
        if (p.stream) checkStream(p.socketId, p.stream);
      });

      if (loudest) {
        setActiveSpeakerId(loudest);
      }
    }, 500);

    return () => clearInterval(interval);
  }, [participants, isMuted]);

  const getDevices = async () => {
    try {
      let devices = await navigator.mediaDevices.enumerateDevices();
      // If labels are empty, we need to request permission first
      if (devices.length > 0 && devices[0].label === '') {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: callType === 'video' });
        devices = await navigator.mediaDevices.enumerateDevices();
        stream.getTracks().forEach(track => track.stop());
      }
      
      const audio = devices.filter(d => d.kind === 'audioinput');
      const video = devices.filter(d => d.kind === 'videoinput');
      setAudioDevices(audio);
      setVideoDevices(video);
      if (audio.length > 0) setSelectedAudio(audio[0].deviceId);
      if (video.length > 0) setSelectedVideo(video[0].deviceId);
      setPermissionError(false);
    } catch (err: any) {
      console.error('Error getting devices:', err);
      if (err.name === 'NotAllowedError' || err.name === 'NotFoundError' || err.message?.toLowerCase().includes('permission')) {
        setPermissionError(true);
      }
    }
  };

  const startLocalStream = async (audioId?: string, videoId?: string, requestVideo: boolean = !isVideoOff) => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
    }
    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: audioId ? { deviceId: { exact: audioId } } : true,
          video: requestVideo ? (videoId ? { deviceId: { exact: videoId } } : true) : false
        });
      } catch (err: any) {
        if (requestVideo && err.name === 'NotFoundError') {
          console.warn('Video device not found, falling back to audio only');
          setIsVideoOff(true);
          stream = await navigator.mediaDevices.getUserMedia({
            audio: audioId ? { deviceId: { exact: audioId } } : true,
            video: false
          });
        } else {
          throw err;
        }
      }
      
      setPermissionError(false);
      // Apply current mute state to new audio tracks
      stream.getAudioTracks().forEach(track => {
        track.enabled = !isMuted;
      });
      
      setLocalStream(stream);
      localStreamRef.current = stream;
      
      // Update existing peers with new tracks
      Object.values(peersRef.current).forEach(peer => {
        const transceivers = peer.getTransceivers();
        
        const audioTransceiver = transceivers.find(t => t.receiver.track.kind === 'audio');
        const videoTransceiver = transceivers.find(t => t.receiver.track.kind === 'video');

        const newAudioTrack = stream.getAudioTracks()[0] || null;
        const newVideoTrack = stream.getVideoTracks()[0] || null;

        if (audioTransceiver && audioTransceiver.sender) {
          audioTransceiver.sender.replaceTrack(newAudioTrack);
          if (newAudioTrack && (audioTransceiver.direction === 'recvonly' || audioTransceiver.direction === 'inactive')) {
            audioTransceiver.direction = 'sendrecv';
          }
        } else if (newAudioTrack) {
          peer.addTrack(newAudioTrack, stream);
        }

        if (videoTransceiver && videoTransceiver.sender) {
          videoTransceiver.sender.replaceTrack(newVideoTrack);
          if (newVideoTrack && (videoTransceiver.direction === 'recvonly' || videoTransceiver.direction === 'inactive')) {
            videoTransceiver.direction = 'sendrecv';
          }
        } else if (newVideoTrack) {
          peer.addTrack(newVideoTrack, stream);
        }
      });
    } catch (err: any) {
      console.error('Error starting stream:', err);
      if (err.name === 'NotAllowedError' || err.name === 'NotFoundError' || err.message?.toLowerCase().includes('permission')) {
        setPermissionError(true);
      }
    }
  };

  const connectSocket = () => {
    const socket = io();
    socketRef.current = socket;

    socket.emit('join-call', { forumId, userId: user.id, userDetails: user, type: callType });

    socket.on('user-joined', async ({ userId, socketId, userDetails }) => {
      const peer = createPeer(socketId, true);
      peersRef.current[socketId] = peer;
      setParticipants(prev => [...prev, { userId, socketId, userDetails, isMuted: false, isVideoOff: false }]);
      // Send our current state to the new user
      socket.emit('call-state-change', { forumId, isMuted, isVideoOff });
    });

    socket.on('signal', async ({ from, signal, userId, userDetails }) => {
      let peer = peersRef.current[from];
      if (!peer) {
        peer = createPeer(from, false);
        peersRef.current[from] = peer;
        setParticipants(prev => {
          if (!prev.find(p => p.socketId === from)) {
            return [...prev, { userId, socketId: from, userDetails, isMuted: false, isVideoOff: false }];
          }
          return prev;
        });
      }

      const pAny = peer as any;

      try {
        if (signal.type === 'offer') {
          const offerCollision = pAny.makingOffer || peer.signalingState !== 'stable';
          pAny.ignoreOffer = !pAny.isPolite && offerCollision;
          if (pAny.ignoreOffer) {
            return;
          }
          await peer.setRemoteDescription(signal);
          await peer.setLocalDescription();
          socket.emit('signal', { to: from, signal: peer.localDescription });
        } else if (signal.type === 'answer') {
          await peer.setRemoteDescription(signal);
        } else if (signal.candidate) {
          try {
            await peer.addIceCandidate(signal);
          } catch (e) {
            if (!pAny.ignoreOffer) console.error(e);
          }
        }
      } catch (err) {
        console.error('Error handling signal:', err);
      }
    });

    socket.on('user-left', ({ socketId }) => {
      if (peersRef.current[socketId]) {
        peersRef.current[socketId].close();
        delete peersRef.current[socketId];
      }
      setParticipants(prev => prev.filter(p => p.socketId !== socketId));
      if (pinnedParticipantId === socketId) setPinnedParticipantId(null);
    });

    socket.on('call-state-change', ({ socketId, isMuted, isVideoOff }) => {
      setParticipants(prev => prev.map(p => {
        if (p.socketId === socketId) {
          return { ...p, isMuted, isVideoOff };
        }
        return p;
      }));
    });

    socket.on('admin-action', ({ action, targetSocketId }) => {
      if (targetSocketId === socketRef.current?.id) {
        if (action === 'mute') {
          if (localStreamRef.current) {
            localStreamRef.current.getAudioTracks().forEach(track => track.enabled = false);
            setIsMuted(true);
            socketRef.current?.emit('call-state-change', { forumId, isMuted: true, isVideoOff: isVideoOffRef.current });
          }
        } else if (action === 'unmute') {
          if (localStreamRef.current) {
            localStreamRef.current.getAudioTracks().forEach(track => track.enabled = true);
            setIsMuted(false);
            socketRef.current?.emit('call-state-change', { forumId, isMuted: false, isVideoOff: isVideoOffRef.current });
          }
        } else if (action === 'video-off') {
           setIsVideoOff(true);
           startLocalStream(selectedAudio, selectedVideo, false);
           socketRef.current?.emit('call-state-change', { forumId, isMuted: isMutedRef.current, isVideoOff: true });
        } else if (action === 'video-on') {
           setIsVideoOff(false);
           startLocalStream(selectedAudio, selectedVideo, true);
           socketRef.current?.emit('call-state-change', { forumId, isMuted: isMutedRef.current, isVideoOff: false });
        }
      }
    });
  };

  const createPeer = (socketId: string, initiator: boolean) => {
    const peer = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
        { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
      ]
    });

    const pAny = peer as any;
    pAny.isPolite = !initiator;
    pAny.makingOffer = false;
    pAny.ignoreOffer = false;

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => peer.addTrack(track, localStreamRef.current!));
    }

    peer.onicecandidate = (event) => {
      if (event.candidate && socketRef.current) {
        socketRef.current.emit('signal', { to: socketId, signal: event.candidate });
      }
    };

    peer.onnegotiationneeded = async () => {
      try {
        pAny.makingOffer = true;
        await peer.setLocalDescription();
        socketRef.current?.emit('signal', { to: socketId, signal: peer.localDescription });
      } catch (err) {
        console.error('Error during negotiation:', err);
      } finally {
        pAny.makingOffer = false;
      }
    };

    peer.ontrack = (event) => {
      setParticipants(prev => prev.map(p => {
        if (p.socketId === socketId) {
          // Use the existing stream from the event to avoid reassigning srcObject on iOS
          const stream = event.streams && event.streams[0] ? event.streams[0] : new MediaStream([event.track]);
          return { ...p, stream };
        }
        return p;
      }));
    };

    return peer;
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      const newMutedState = !isMuted;
      localStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = !newMutedState;
      });
      setIsMuted(newMutedState);
      if (socketRef.current) {
        socketRef.current.emit('call-state-change', { forumId, isMuted: newMutedState, isVideoOff });
      }
    }
  };

  const toggleVideo = async () => {
    const newVideoState = !isVideoOff;
    setIsVideoOff(newVideoState);
    if (isScreenSharing) {
      await stopScreenShare(newVideoState);
    } else {
      await startLocalStream(selectedAudio, selectedVideo, !newVideoState);
    }
    if (socketRef.current) {
      socketRef.current.emit('call-state-change', { forumId, isMuted, isVideoOff: newVideoState });
    }
  };

  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      await stopScreenShare();
    } else {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
          toast.error('Screen sharing is not supported on this device or browser.');
          return;
        }
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = screenStream.getVideoTracks()[0];
        
        screenTrack.onended = () => {
          stopScreenShare();
        };

        if (localStreamRef.current) {
          originalVideoTrackRef.current = localStreamRef.current.getVideoTracks()[0];
          
          // Replace track in local stream
          if (originalVideoTrackRef.current) {
             localStreamRef.current.removeTrack(originalVideoTrackRef.current);
          }
          localStreamRef.current.addTrack(screenTrack);
          
          // Replace track for all peers
          Object.values(peersRef.current).forEach(peer => {
            const videoTransceiver = peer.getTransceivers().find(t => t.receiver.track.kind === 'video');
            if (videoTransceiver && videoTransceiver.sender) {
              videoTransceiver.sender.replaceTrack(screenTrack);
              if (videoTransceiver.direction === 'recvonly' || videoTransceiver.direction === 'inactive') {
                videoTransceiver.direction = 'sendrecv';
              }
            } else {
              peer.addTrack(screenTrack, localStreamRef.current!);
            }
          });
          
          setIsScreenSharing(true);
          setIsVideoOff(false);
          if (socketRef.current) {
            socketRef.current.emit('call-state-change', { forumId, isMuted, isVideoOff: false });
          }
        }
      } catch (err: any) {
        console.error("Error sharing screen", err);
        toast.error(err.name === 'NotAllowedError' ? 'Screen sharing permission denied.' : 'Screen sharing is not supported on this device or browser.');
      }
    }
  };

  const stopScreenShare = async (forceVideoOff?: boolean) => {
    const targetVideoOff = forceVideoOff !== undefined ? forceVideoOff : isVideoOff;
    if (localStreamRef.current) {
      const screenTrack = localStreamRef.current.getVideoTracks()[0];
      if (screenTrack) screenTrack.stop();
      
      if (originalVideoTrackRef.current && !targetVideoOff) {
        localStreamRef.current.removeTrack(screenTrack);
        localStreamRef.current.addTrack(originalVideoTrackRef.current);
        
        Object.values(peersRef.current).forEach(peer => {
          const videoTransceiver = peer.getTransceivers().find(t => t.receiver.track.kind === 'video');
          if (videoTransceiver && videoTransceiver.sender) {
            videoTransceiver.sender.replaceTrack(originalVideoTrackRef.current);
            if (originalVideoTrackRef.current && (videoTransceiver.direction === 'recvonly' || videoTransceiver.direction === 'inactive')) {
              videoTransceiver.direction = 'sendrecv';
            }
          }
        });
      } else {
        await startLocalStream(selectedAudio, selectedVideo, !targetVideoOff);
      }
    }
    setIsScreenSharing(false);
  };

  const handleAdminAction = (action: 'mute' | 'unmute' | 'video-off' | 'video-on', targetSocketId: string) => {
    if (socketRef.current && canManage) {
      socketRef.current.emit('admin-action', { forumId, action, targetSocketId });
    }
  };

  const handleDeviceChange = (kind: 'audio' | 'video', deviceId: string) => {
    if (kind === 'audio') {
      setSelectedAudio(deviceId);
      startLocalStream(deviceId, selectedVideo);
    } else {
      setSelectedVideo(deviceId);
      startLocalStream(selectedAudio, deviceId);
    }
  };

  const activeParticipant = pinnedParticipantId === 'local'
    ? { socketId: 'local', userDetails: user, stream: localStreamRef.current, isMuted, isVideoOff }
    : pinnedParticipantId
      ? participants.find(p => p.socketId === pinnedParticipantId) || participants[0]
      : activeSpeakerId === 'local' 
        ? { socketId: 'local', userDetails: user, stream: localStreamRef.current, isMuted, isVideoOff }
        : participants.find(p => p.socketId === activeSpeakerId) || participants[0] || { socketId: 'local', userDetails: user, stream: localStreamRef.current, isMuted, isVideoOff };

  return (
    <>
      {permissionError && (
        <div className="absolute inset-0 z-[200] bg-slate-900 flex flex-col items-center justify-center p-6 text-center">
          <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mb-6">
            <AlertTriangle className="w-10 h-10 text-red-500" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Permissions Required</h2>
          <p className="text-slate-400 mb-8 max-w-md">
            We need access to your camera and microphone to join the call. Please grant permissions when prompted.
          </p>
          <div className="flex gap-4">
            <button
              onClick={onClose}
              className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                startLocalStream().then(() => getDevices());
              }}
              className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium transition-colors"
            >
              Grant Permissions
            </button>
          </div>
        </div>
      )}

      {isFullscreen && (
        <div className="fixed inset-0 z-[100] bg-black flex flex-col">
          <button onClick={() => setIsFullscreen(false)} className="absolute top-6 right-6 z-50 p-3 bg-slate-800/80 hover:bg-slate-700 rounded-full text-white transition-colors">
            <X size={24} />
          </button>
          
          <div className="flex-1 relative flex items-center justify-center p-8">
            {activeParticipant?.stream && activeParticipant.stream.getVideoTracks().length > 0 && !activeParticipant.isVideoOff ? (
              <VideoPlayer 
                stream={activeParticipant.stream} 
                muted={true} 
                className="w-full h-full object-contain rounded-2xl" 
              />
            ) : (
              <div className="flex flex-col items-center justify-center">
                <img src={activeParticipant?.userDetails?.profile_picture} alt="" className="w-48 h-48 rounded-full border-4 border-slate-700 shadow-2xl mb-6" />
                <h2 className="text-3xl font-bold text-white">{activeParticipant?.userDetails?.username}</h2>
                <p className="text-slate-400 mt-2">{activeParticipant?.isMuted ? 'Muted' : 'Speaking...'}</p>
              </div>
            )}
            {activeParticipant?.stream && (activeParticipant.stream.getVideoTracks().length === 0 || activeParticipant.isVideoOff) && (
              <AudioPlayer stream={activeParticipant.stream} muted={true} />
            )}
            
            <div className="absolute bottom-10 left-10 bg-black/60 px-4 py-2 rounded-lg text-white font-medium backdrop-blur-md border border-white/10 flex items-center gap-2">
              {!activeParticipant?.isMuted && (
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                </span>
              )}
              {activeParticipant?.isMuted && <MicOff size={14} className="text-red-400" />}
              {activeParticipant?.socketId === 'local' ? 'You' : activeParticipant?.userDetails?.username}
            </div>
          </div>
          
          <div className="h-32 bg-slate-900/90 border-t border-white/10 p-4 flex gap-4 overflow-x-auto items-center justify-center">
             <div 
               className={`relative h-full aspect-video bg-slate-800 rounded-lg overflow-hidden border-2 transition-colors ${activeSpeakerId === 'local' ? 'border-indigo-500' : 'border-transparent hover:border-slate-600'}`}
             >
               {localStreamRef.current && !isVideoOff && localStreamRef.current.getVideoTracks().length > 0 ? (
                 <VideoPlayer stream={localStreamRef.current} muted className="w-full h-full object-cover" />
               ) : (
                 <div className="w-full h-full flex items-center justify-center">
                   <img src={user.profile_picture} alt="" className="w-10 h-10 rounded-full" />
                 </div>
               )}
               <div className="absolute bottom-1 left-1 bg-black/60 px-1.5 py-0.5 rounded text-[10px] text-white flex items-center gap-1">
                 You {isMuted && <MicOff size={10} className="text-red-400" />}
               </div>
               <button 
                 onClick={(e) => { e.stopPropagation(); setPinnedParticipantId(pinnedParticipantId === 'local' ? null : 'local'); }}
                 className={`absolute top-1 right-1 p-1 rounded bg-black/60 text-white hover:bg-black/80 ${pinnedParticipantId === 'local' ? 'text-indigo-400' : ''}`}
               >
                 <Pin size={12} />
               </button>
             </div>
             
             {participants.map(p => (
               <div 
                 key={p.socketId}
                 className={`relative h-full aspect-video bg-slate-800 rounded-lg overflow-hidden border-2 transition-colors ${activeSpeakerId === p.socketId ? 'border-indigo-500' : 'border-transparent hover:border-slate-600'}`}
               >
                 {p.stream && p.stream.getVideoTracks().length > 0 && !p.isVideoOff ? (
                   <VideoPlayer stream={p.stream} className="w-full h-full object-cover" />
                 ) : (
                   <div className="w-full h-full flex items-center justify-center">
                     <img src={p.userDetails.profile_picture} alt="" className="w-10 h-10 rounded-full" />
                   </div>
                 )}
                 {p.stream && (p.stream.getVideoTracks().length === 0 || p.isVideoOff) && (
                   <AudioPlayer stream={p.stream} />
                 )}
                 <div className="absolute bottom-1 left-1 bg-black/60 px-1.5 py-0.5 rounded text-[10px] text-white flex items-center gap-1">
                   {p.userDetails.username} {p.isMuted && <MicOff size={10} className="text-red-400" />}
                 </div>
                 <button 
                   onClick={(e) => { e.stopPropagation(); setPinnedParticipantId(pinnedParticipantId === p.socketId ? null : p.socketId); }}
                   className={`absolute top-1 right-1 p-1 rounded bg-black/60 text-white hover:bg-black/80 ${pinnedParticipantId === p.socketId ? 'text-indigo-400' : ''}`}
                 >
                   <Pin size={12} />
                 </button>
               </div>
             ))}
          </div>
        </div>
      )}

      <div id="call-panel" className={`absolute inset-0 sm:relative sm:inset-auto w-full sm:w-80 bg-slate-900 text-white flex flex-col h-full border-l border-slate-800 animate-in slide-in-from-right duration-300 shadow-2xl z-50 ${isFullscreen ? 'hidden' : ''}`}>
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950">
          <div>
            <h3 className="font-bold text-sm flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
              </span>
              {forumTitle}
            </h3>
            <p className="text-xs text-slate-400">{callType === 'video' ? 'Video Call' : 'Voice Call'}</p>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setIsFullscreen(true)} className="p-1.5 hover:bg-slate-800 rounded-lg transition-colors text-slate-400 hover:text-white" title="Fullscreen">
              <Maximize2 size={18} />
            </button>
            <button onClick={onClose} className="p-1.5 hover:bg-slate-800 rounded-lg transition-colors text-slate-400 hover:text-white" title="Close Call">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Local User */}
          <div 
            className={`relative bg-slate-800 rounded-xl overflow-hidden aspect-video border-2 transition-colors ${activeSpeakerId === 'local' ? 'border-indigo-500' : 'border-slate-700 hover:border-slate-600'}`}
          >
            <div className="absolute inset-0 cursor-pointer" onClick={() => setIsFullscreen(true)}>
              {!isVideoOff && localStreamRef.current && localStreamRef.current.getVideoTracks().length > 0 ? (
                <VideoPlayer stream={localStreamRef.current} muted className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-slate-800">
                  <img src={user.profile_picture} alt="" className="w-16 h-16 rounded-full border-2 border-slate-600" />
                </div>
              )}
            </div>
            <div className="absolute bottom-2 left-2 bg-black/60 px-2 py-1 rounded text-xs font-medium flex items-center gap-1 backdrop-blur-sm pointer-events-none">
              You {isMuted && <MicOff size={12} className="text-red-400" />}
            </div>
            <button 
              onClick={(e) => { e.stopPropagation(); setPinnedParticipantId(pinnedParticipantId === 'local' ? null : 'local'); }}
              className={`absolute top-2 right-2 p-1.5 rounded z-10 transition-colors ${pinnedParticipantId === 'local' ? 'bg-indigo-500 text-white' : 'bg-black/60 text-white hover:bg-black/80'}`}
              title={pinnedParticipantId === 'local' ? "Unpin video" : "Pin video"}
            >
              <Pin size={14} />
            </button>
          </div>

          {/* Remote Users */}
          {participants.map(p => (
            <div 
              key={p.socketId} 
              className={`relative bg-slate-800 rounded-xl overflow-hidden aspect-video border-2 transition-colors ${activeSpeakerId === p.socketId ? 'border-indigo-500' : 'border-slate-700 hover:border-slate-600'}`}
            >
              <div className="absolute inset-0 cursor-pointer" onClick={() => setIsFullscreen(true)}>
                {p.stream && p.stream.getVideoTracks().length > 0 && !p.isVideoOff ? (
                  <VideoPlayer stream={p.stream} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-slate-800">
                    <img src={p.userDetails.profile_picture} alt="" className="w-16 h-16 rounded-full border-2 border-slate-600" />
                  </div>
                )}
                {/* Hidden audio player for remote users without video */}
                {p.stream && (p.stream.getVideoTracks().length === 0 || p.isVideoOff) && (
                  <AudioPlayer stream={p.stream} />
                )}
              </div>
              <div className="absolute bottom-2 left-2 bg-black/60 px-2 py-1 rounded text-xs font-medium flex items-center gap-1 backdrop-blur-sm pointer-events-none">
                {p.userDetails.username} {p.isMuted && <MicOff size={12} className="text-red-400" />}
              </div>
              <button 
                onClick={(e) => { e.stopPropagation(); setPinnedParticipantId(pinnedParticipantId === p.socketId ? null : p.socketId); }}
                className={`absolute top-2 right-2 p-1.5 rounded z-10 transition-colors ${pinnedParticipantId === p.socketId ? 'bg-indigo-500 text-white' : 'bg-black/60 text-white hover:bg-black/80'}`}
                title={pinnedParticipantId === p.socketId ? "Unpin video" : "Pin video"}
              >
                <Pin size={14} />
              </button>
              
              {canManage && (
                <div className="absolute top-2 left-2 flex gap-1 z-10">
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleAdminAction(p.isMuted ? 'unmute' : 'mute', p.socketId); }}
                    className={`p-1.5 rounded transition-colors ${p.isMuted ? 'bg-indigo-500 text-white hover:bg-indigo-600' : 'bg-black/60 text-white hover:bg-black/80'}`}
                    title={p.isMuted ? "Force Unmute" : "Force Mute"}
                  >
                    {p.isMuted ? <MicOff size={14} /> : <Mic size={14} />}
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleAdminAction(p.isVideoOff ? 'video-on' : 'video-off', p.socketId); }}
                    className={`p-1.5 rounded transition-colors ${p.isVideoOff ? 'bg-indigo-500 text-white hover:bg-indigo-600' : 'bg-black/60 text-white hover:bg-black/80'}`}
                    title={p.isVideoOff ? "Force Video On" : "Force Video Off"}
                  >
                    {p.isVideoOff ? <VideoOff size={14} /> : <Video size={14} />}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="p-4 bg-slate-950 border-t border-slate-800">
          <div className="flex items-center justify-center gap-4 mb-4">
            <button
              onClick={toggleMute}
              className={`p-3 rounded-full transition-colors ${isMuted ? 'bg-red-500/20 text-red-500 hover:bg-red-500/30' : 'bg-slate-800 text-white hover:bg-slate-700'}`}
              title={isMuted ? "Unmute" : "Mute"}
            >
              {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
            </button>
            <button
              onClick={toggleVideo}
              className={`p-3 rounded-full transition-colors ${isVideoOff ? 'bg-red-500/20 text-red-500 hover:bg-red-500/30' : 'bg-slate-800 text-white hover:bg-slate-700'}`}
              title={isVideoOff ? "Turn Video On" : "Turn Video Off"}
            >
              {isVideoOff ? <VideoOff size={20} /> : <Video size={20} />}
            </button>
            <button
              onClick={toggleScreenShare}
              className={`p-3 rounded-full transition-colors ${isScreenSharing ? 'bg-indigo-500 text-white hover:bg-indigo-600' : 'bg-slate-800 text-white hover:bg-slate-700'}`}
              title={isScreenSharing ? "Stop Screen Share" : "Share Screen"}
            >
              <MonitorUp size={20} />
            </button>
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`p-3 rounded-full transition-colors ${showSettings ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-white hover:bg-slate-700'}`}
              title="Settings"
            >
              <Settings size={20} />
            </button>
          </div>

          {showSettings && (
            <div className="space-y-3 text-sm animate-in slide-in-from-bottom-2">
              <div>
                <label className="block text-slate-400 text-xs mb-1">Microphone</label>
                <select
                  value={selectedAudio}
                  onChange={(e) => handleDeviceChange('audio', e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-white outline-none focus:border-indigo-500"
                >
                  {audioDevices.map(d => (
                    <option key={d.deviceId} value={d.deviceId}>{d.label || 'Microphone'}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-slate-400 text-xs mb-1">Camera</label>
                <select
                  value={selectedVideo}
                  onChange={(e) => handleDeviceChange('video', e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-white outline-none focus:border-indigo-500"
                >
                  {videoDevices.map(d => (
                    <option key={d.deviceId} value={d.deviceId}>{d.label || 'Camera'}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

const VideoPlayer = ({ stream, muted = false, className = "w-full h-full object-cover" }: { stream: MediaStream, muted?: boolean, className?: string }) => {
  const ref = useRef<HTMLVideoElement>(null);
  const trackCount = stream.getTracks().length;
  useEffect(() => {
    if (ref.current) {
      if (ref.current.srcObject !== stream) {
        ref.current.srcObject = stream;
      }
      ref.current.play().catch(e => console.warn("Video play failed:", e));
    }
  }, [stream, trackCount]);
  return <video ref={ref} autoPlay playsInline muted={muted} className={className} />;
};

const AudioPlayer = ({ stream, muted = false }: { stream: MediaStream, muted?: boolean }) => {
  const ref = useRef<HTMLAudioElement>(null);
  const trackCount = stream.getTracks().length;
  useEffect(() => {
    if (ref.current) {
      if (ref.current.srcObject !== stream) {
        ref.current.srcObject = stream;
      }
      ref.current.play().catch(e => console.warn("Audio play failed:", e));
    }
  }, [stream, trackCount]);
  return <audio ref={ref} autoPlay playsInline muted={muted} className="hidden" />;
};
