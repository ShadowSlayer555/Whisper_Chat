import React, { useState } from 'react';
import { fetchApi } from '../lib/api';
import { LogOut, X, Upload, Bell, Volume2 } from 'lucide-react';
import toast from 'react-hot-toast';

export function UserMenu({ user, onUpdate, onLogout }: { user: any, onUpdate: (u: any) => void, onLogout: () => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [username, setUsername] = useState(user.username);
  const [profilePic, setProfilePic] = useState(user.profile_picture);
  const [notificationsEnabled, setNotificationsEnabled] = useState(!!user.notifications_enabled);
  const [ringtoneEnabled, setRingtoneEnabled] = useState(!!user.ringtone_enabled);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  React.useEffect(() => {
    setUsername(user.username);
    setProfilePic(user.profile_picture);
    setNotificationsEnabled(!!user.notifications_enabled);
    setRingtoneEnabled(!!user.ringtone_enabled);
  }, [user]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setProfilePic(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const updatedUser = await fetchApi('/api/users/me', {
        method: 'PUT',
        body: JSON.stringify({ username, profile_picture: profilePic })
      });
      
      await fetchApi('/api/auth/settings', {
        method: 'PUT',
        body: JSON.stringify({ notifications_enabled: notificationsEnabled, ringtone_enabled: ringtoneEnabled })
      });
      
      onUpdate({ ...updatedUser, notifications_enabled: notificationsEnabled, ringtone_enabled: ringtoneEnabled });
      setIsOpen(false);
      toast.success('Profile updated');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const requestNotificationPermission = () => {
    if (!('Notification' in window)) {
      toast.error('This browser does not support desktop notification');
      return;
    }
    if (Notification.permission === 'granted') {
      setNotificationsEnabled(true);
      setRingtoneEnabled(true);
    } else if (Notification.permission !== 'denied') {
      try {
        const promise = Notification.requestPermission((permission) => {
          if (!promise) {
            if (permission === 'granted') {
              setNotificationsEnabled(true);
              setRingtoneEnabled(true);
            } else {
              toast.error('Notification permission denied');
            }
          }
        });
        if (promise) {
          promise.then((permission) => {
            if (permission === 'granted') {
              setNotificationsEnabled(true);
              setRingtoneEnabled(true);
            } else {
              toast.error('Notification permission denied');
            }
          });
        }
      } catch (e) {
        toast.error('Failed to request notification permission');
      }
    } else {
      toast.error('Please enable notifications in your browser settings');
    }
  };

  return (
    <>
      <div className="relative">
        <button onClick={() => setIsOpen(true)} className="focus:outline-none rounded-full ring-2 ring-transparent hover:ring-indigo-500 transition-all">
          <img src={user.profile_picture} alt={user.username} className="w-10 h-10 rounded-full object-cover bg-slate-200" />
        </button>
      </div>

      {isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 relative max-h-[90vh] overflow-y-auto">
            <button onClick={() => setIsOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
              <X size={20} />
            </button>
            
            <h2 className="text-xl font-bold text-slate-900 mb-6">Edit Profile</h2>
            
            {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}
            
            <form onSubmit={handleSave} className="space-y-4">
              <div className="flex flex-col items-center mb-6">
                <div className="relative group cursor-pointer">
                  <img src={profilePic} alt="Profile" className="w-24 h-24 rounded-full object-cover bg-slate-200 border-2 border-slate-200" />
                  <label className="absolute inset-0 flex items-center justify-center bg-black/50 text-white rounded-full opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity">
                    <Upload size={20} />
                    <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                  </label>
                </div>
                <span className="text-xs text-slate-500 mt-2">Click to change</span>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                <input type="email" value={user.email} disabled className="w-full px-4 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-500 cursor-not-allowed" />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Username</label>
                <input type="text" required value={username} onChange={(e) => setUsername(e.target.value)} className="w-full px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>

              <div className="border-t border-slate-200 pt-4 mt-4 space-y-4">
                <h3 className="text-sm font-semibold text-slate-900">Preferences</h3>
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Bell size={18} className="text-slate-500" />
                    <div>
                      <p className="text-sm font-medium text-slate-700">Push Notifications</p>
                      <p className="text-xs text-slate-500">Get notified of calls and mentions</p>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="sr-only peer" 
                      checked={notificationsEnabled}
                      onChange={(e) => {
                        if (e.target.checked) {
                          requestNotificationPermission();
                        } else {
                          setNotificationsEnabled(false);
                        }
                      }}
                    />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                  </label>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Volume2 size={18} className="text-slate-500" />
                    <div>
                      <p className="text-sm font-medium text-slate-700">Call Ringtone</p>
                      <p className="text-xs text-slate-500">Play sound for incoming calls</p>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="sr-only peer" 
                      checked={ringtoneEnabled}
                      onChange={(e) => setRingtoneEnabled(e.target.checked)}
                    />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                  </label>
                </div>
              </div>

              <div className="pt-4 flex items-center justify-between">
                <button type="button" onClick={onLogout} className="flex items-center gap-2 text-red-600 hover:text-red-700 font-medium px-3 py-2 rounded-lg hover:bg-red-50 transition-colors">
                  <LogOut size={18} /> Logout
                </button>
                <div className="flex gap-3">
                  <button type="button" onClick={() => setIsOpen(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">Cancel</button>
                  <button type="submit" disabled={loading} className="px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors">Save</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
