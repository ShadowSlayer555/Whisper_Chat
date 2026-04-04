import React, { useState, useEffect } from 'react';
import { Bell, Volume2, X } from 'lucide-react';
import { fetchApi } from '../lib/api';
import toast from 'react-hot-toast';

export function NotificationPrompt({ user, onUpdateUser }: { user: any, onUpdateUser: (u: any) => void }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const hasPrompted = localStorage.getItem(`prompted_notifications_${user.id}`);
    if (!hasPrompted && (!user.notifications_enabled || !user.ringtone_enabled)) {
      setShow(true);
    }
  }, [user]);

  const handleAccept = async () => {
    let notificationsEnabled = false;
    
    const savePreferences = async (enabled: boolean) => {
      try {
        await fetchApi('/api/auth/settings', {
          method: 'PUT',
          body: JSON.stringify({ notifications_enabled: enabled, ringtone_enabled: true })
        });
        onUpdateUser({ ...user, notifications_enabled: enabled, ringtone_enabled: true });
        toast.success('Preferences saved');
      } catch (err) {
        console.error(err);
      }
      localStorage.setItem(`prompted_notifications_${user.id}`, 'true');
      setShow(false);
    };

    if ('Notification' in window) {
      if (Notification.permission === 'granted') {
        savePreferences(true);
      } else if (Notification.permission !== 'denied') {
        try {
          const promise = Notification.requestPermission((permission) => {
            if (!promise) { // If it doesn't return a promise, handle it here
              savePreferences(permission === 'granted');
            }
          });
          if (promise) {
            promise.then((permission) => {
              savePreferences(permission === 'granted');
            });
          }
        } catch (e) {
          savePreferences(false);
        }
      } else {
        savePreferences(false);
      }
    } else {
      savePreferences(false);
    }
  };

  const handleDecline = () => {
    localStorage.setItem(`prompted_notifications_${user.id}`, 'true');
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 relative">
        <button onClick={handleDecline} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
          <X size={20} />
        </button>
        
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600">
            <Bell size={32} />
          </div>
        </div>

        <h2 className="text-2xl font-bold text-slate-900 text-center mb-2">Enable Notifications</h2>
        <p className="text-slate-600 text-center mb-6">
          Get notified when you receive a call or a message. We also need permission to play a ringtone when someone calls you.
        </p>

        <div className="space-y-4 bg-slate-50 p-4 rounded-xl mb-6">
          <div className="flex items-start gap-3">
            <Bell className="text-indigo-600 mt-0.5" size={20} />
            <div>
              <p className="font-medium text-slate-900">Push Notifications</p>
              <p className="text-sm text-slate-500">Know when someone is trying to reach you.</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Volume2 className="text-indigo-600 mt-0.5" size={20} />
            <div>
              <p className="font-medium text-slate-900">Call Ringtone</p>
              <p className="text-sm text-slate-500">Hear a sound when a call comes in, even if the app is in the background.</p>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <button 
            onClick={handleDecline}
            className="flex-1 px-4 py-3 text-slate-600 hover:bg-slate-100 rounded-xl font-medium transition-colors"
          >
            Not Now
          </button>
          <button 
            onClick={handleAccept}
            className="flex-1 px-4 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200"
          >
            Enable
          </button>
        </div>
        <p className="text-xs text-center text-slate-400 mt-4">
          You can always change these settings later in your profile.
        </p>
      </div>
    </div>
  );
}
