import React, { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { Mic, MicOff, Video, VideoOff, X, Settings } from 'lucide-react';

interface CallPanelProps {
  forumId: string;
  forumTitle: string;
  user: any;
  callType: 'video' | 'voice';
  onClose: () => void;
}

interface Participant {
  userId: string;
  socketId: string;
  userDetails: any;
  stream?: MediaStream;
}

export const CallPanel: React.FC<CallPanelProps> = ({ forumId, forumTitle, user, callType, onClose }) => {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(callType === 'voice');
  
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudio, setSelectedAudio] = useState<string>('');
  const [selectedVideo, setSelectedVideo] = useState<string>('');
  const [showSettings, setShowSettings] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const peersRef = useRef<{ [socketId: string]: RTCPeerConnection }>({});
  const localVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const init = async () => {
      await getDevices();
      await startLocalStream();
      connectSocket();
    };
    init();

    return () => {
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
      Object.values(peersRef.current).forEach(peer => peer.close());
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, []);

  const getDevices = async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true, video: callType === 'video' });
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audio = devices.filter(d => d.kind === 'audioinput');
      const video = devices.filter(d => d.kind === 'videoinput');
      setAudioDevices(audio);
      setVideoDevices(video);
      if (audio.length > 0) setSelectedAudio(audio[0].deviceId);
      if (video.length > 0) setSelectedVideo(video[0].deviceId);
    } catch (err) {
      console.error('Error getting devices:', err);
    }
  };

  const startLocalStream = async (audioId?: string, videoId?: string) => {
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: audioId ? { deviceId: { exact: audioId } } : true,
        video: callType === 'video' ? (videoId ? { deviceId: { exact: videoId } } : true) : false
      });
      setLocalStream(stream);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      
      // Update existing peers with new tracks
      Object.values(peersRef.current).forEach(peer => {
        const senders = peer.getSenders();
        stream.getTracks().forEach(track => {
          const sender = senders.find(s => s.track?.kind === track.kind);
          if (sender) sender.replaceTrack(track);
        });
      });
    } catch (err) {
      console.error('Error starting stream:', err);
    }
  };

  const connectSocket = () => {
    const socket = io();
    socketRef.current = socket;

    socket.emit('join-call', { forumId, userId: user.id, userDetails: user, type: callType });

    socket.on('user-joined', async ({ userId, socketId, userDetails }) => {
      const peer = createPeer(socketId, true);
      peersRef.current[socketId] = peer;
      setParticipants(prev => [...prev, { userId, socketId, userDetails }]);
    });

    socket.on('signal', async ({ from, signal, userId, userDetails }) => {
      let peer = peersRef.current[from];
      if (!peer) {
        peer = createPeer(from, false);
        peersRef.current[from] = peer;
        setParticipants(prev => {
          if (!prev.find(p => p.socketId === from)) {
            return [...prev, { userId, socketId: from, userDetails }];
          }
          return prev;
        });
      }

      try {
        if (signal.type === 'offer') {
          await peer.setRemoteDescription(new RTCSessionDescription(signal));
          const answer = await peer.createAnswer();
          await peer.setLocalDescription(answer);
          socket.emit('signal', { to: from, signal: peer.localDescription });
        } else if (signal.type === 'answer') {
          await peer.setRemoteDescription(new RTCSessionDescription(signal));
        } else if (signal.candidate) {
          await peer.addIceCandidate(new RTCIceCandidate(signal));
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
    });
  };

  const createPeer = (socketId: string, initiator: boolean) => {
    const peer = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    if (localStream) {
      localStream.getTracks().forEach(track => peer.addTrack(track, localStream));
    }

    peer.onicecandidate = (event) => {
      if (event.candidate && socketRef.current) {
        socketRef.current.emit('signal', { to: socketId, signal: event.candidate });
      }
    };

    peer.ontrack = (event) => {
      setParticipants(prev => prev.map(p => {
        if (p.socketId === socketId) {
          return { ...p, stream: event.streams[0] };
        }
        return p;
      }));
    };

    if (initiator) {
      peer.createOffer().then(offer => {
        peer.setLocalDescription(offer);
        socketRef.current?.emit('signal', { to: socketId, signal: offer });
      });
    }

    return peer;
  };

  const toggleMute = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsMuted(!localStream.getAudioTracks()[0].enabled);
    }
  };

  const toggleVideo = () => {
    if (localStream && callType === 'video') {
      localStream.getVideoTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsVideoOff(!localStream.getVideoTracks()[0].enabled);
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

  return (
    <div className="w-80 bg-slate-900 text-white flex flex-col h-full border-l border-slate-800 animate-in slide-in-from-right duration-300 shadow-2xl z-50">
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
        <button onClick={onClose} className="p-1.5 hover:bg-slate-800 rounded-lg transition-colors text-slate-400 hover:text-white">
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Local User */}
        <div className="relative bg-slate-800 rounded-xl overflow-hidden aspect-video border border-slate-700">
          {callType === 'video' && !isVideoOff ? (
            <video ref={localVideoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-slate-800">
              <img src={user.profile_picture} alt="" className="w-16 h-16 rounded-full border-2 border-slate-600" />
            </div>
          )}
          <div className="absolute bottom-2 left-2 bg-black/60 px-2 py-1 rounded text-xs font-medium flex items-center gap-1 backdrop-blur-sm">
            You {isMuted && <MicOff size={12} className="text-red-400" />}
          </div>
        </div>

        {/* Remote Users */}
        {participants.map(p => (
          <div key={p.socketId} className="relative bg-slate-800 rounded-xl overflow-hidden aspect-video border border-slate-700">
            {p.stream && p.stream.getVideoTracks().length > 0 ? (
              <VideoPlayer stream={p.stream} />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-slate-800">
                <img src={p.userDetails.profile_picture} alt="" className="w-16 h-16 rounded-full border-2 border-slate-600" />
              </div>
            )}
            <div className="absolute bottom-2 left-2 bg-black/60 px-2 py-1 rounded text-xs font-medium backdrop-blur-sm">
              {p.userDetails.username}
            </div>
          </div>
        ))}
      </div>

      <div className="p-4 bg-slate-950 border-t border-slate-800">
        <div className="flex items-center justify-center gap-4 mb-4">
          <button
            onClick={toggleMute}
            className={`p-3 rounded-full transition-colors ${isMuted ? 'bg-red-500/20 text-red-500 hover:bg-red-500/30' : 'bg-slate-800 text-white hover:bg-slate-700'}`}
          >
            {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
          </button>
          {callType === 'video' && (
            <button
              onClick={toggleVideo}
              className={`p-3 rounded-full transition-colors ${isVideoOff ? 'bg-red-500/20 text-red-500 hover:bg-red-500/30' : 'bg-slate-800 text-white hover:bg-slate-700'}`}
            >
              {isVideoOff ? <VideoOff size={20} /> : <Video size={20} />}
            </button>
          )}
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`p-3 rounded-full transition-colors ${showSettings ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-white hover:bg-slate-700'}`}
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
            {callType === 'video' && (
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
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const VideoPlayer = ({ stream }: { stream: MediaStream }) => {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return <video ref={ref} autoPlay playsInline className="w-full h-full object-cover" />;
};
