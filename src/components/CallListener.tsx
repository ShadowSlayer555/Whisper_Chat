import { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useNavigate } from 'react-router-dom';
import { Video, Phone, X } from 'lucide-react';

export function CallListener({ user }: { user: any }) {
  const [incomingCall, setIncomingCall] = useState<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio('/universfield-ringtone.mp3');
      audioRef.current.loop = true;
    }
  }, []);

  useEffect(() => {
    if (!user) return;

    const socket = io();
    socket.emit('authenticate', user.id);

    socket.on('incoming-call', (data) => {
      if (user.ringtone_enabled && audioRef.current) {
        audioRef.current.currentTime = 0;
        const playPromise = audioRef.current.play();
        if (playPromise !== undefined) {
          playPromise.catch(e => {
            console.error("Audio play failed, likely due to autoplay policy:", e);
            // We can't force play without user interaction
          });
        }
      }
      setIncomingCall(data);
      
      if (user.notifications_enabled && document.hidden && 'Notification' in window && Notification.permission === 'granted') {
        const notification = new Notification(`Incoming call from ${data.callerName}`, {
          body: `Incoming ${data.callType === 'video' ? 'Video' : 'Voice'} Call from ${data.forumTitle}`,
          icon: data.callerPic || '/vite.svg',
          requireInteraction: true
        });
        
        notification.onclick = () => {
          window.focus();
          notification.close();
        };
      }
      
      // Auto-decline after 25 seconds
      setTimeout(() => {
        setIncomingCall((current: any) => {
          if (current && current.forumId === data.forumId) {
            if (audioRef.current) {
              audioRef.current.pause();
              audioRef.current.currentTime = 0;
            }
            return null;
          }
          return current;
        });
      }, 25000);
    });

    socket.on('call-ended', () => {
      setIncomingCall(null);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    });

    return () => {
      socket.disconnect();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    };
  }, [user]);

  if (!incomingCall) return null;

  const handleAccept = (type: 'video' | 'voice') => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    const forumId = incomingCall.forumId;
    setIncomingCall(null);
    navigate(`/forum/${forumId}?joinCall=${type}`);
  };

  const handleDecline = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    const forumId = incomingCall.forumId;
    setIncomingCall(null);
    navigate(`/forum/${forumId}`);
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-900/90 backdrop-blur-xl flex flex-col items-center justify-center">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-indigo-500/20 rounded-full blur-3xl"></div>
      </div>
      
      <div className="z-10 flex flex-col items-center">
        <div className="relative mb-8">
          {incomingCall.callerPic ? (
            <img src={incomingCall.callerPic} alt={incomingCall.callerName} className="w-48 h-48 rounded-full border-4 border-slate-700 object-cover shadow-2xl relative z-10" />
          ) : (
            <div className="w-48 h-48 rounded-full bg-slate-800 border-4 border-slate-700 flex items-center justify-center text-6xl font-bold text-white shadow-2xl relative z-10">
              {incomingCall.callerName?.[0]?.toUpperCase()}
            </div>
          )}
          <div className="absolute inset-0 border-4 border-indigo-500/50 rounded-full animate-ping"></div>
        </div>
        
        <h2 className="text-4xl font-bold text-white mb-2">{incomingCall.callerName}</h2>
        <p className="text-xl text-slate-400 mb-12">Incoming {incomingCall.callType === 'video' ? 'Video' : 'Voice'} Call from {incomingCall.forumTitle}</p>
        
        <div className="flex items-center gap-8">
          <button 
            onClick={handleDecline}
            className="w-20 h-20 bg-red-500 hover:bg-red-400 rounded-full flex items-center justify-center text-white shadow-lg shadow-red-500/30 transition-transform hover:scale-110"
            title="Decline"
          >
            <X className="w-10 h-10" />
          </button>
          
          <button 
            onClick={() => handleAccept('voice')}
            className="w-20 h-20 bg-green-500 hover:bg-green-400 rounded-full flex items-center justify-center text-white shadow-lg shadow-green-500/30 transition-transform hover:scale-110"
            title="Accept with Voice"
          >
            <Phone className="w-10 h-10" />
          </button>
          
          <button 
            onClick={() => handleAccept('video')}
            className="w-20 h-20 bg-indigo-500 hover:bg-indigo-400 rounded-full flex items-center justify-center text-white shadow-lg shadow-indigo-500/30 transition-transform hover:scale-110"
            title="Accept with Video"
          >
            <Video className="w-10 h-10" />
          </button>
        </div>
      </div>
    </div>
  );
}
