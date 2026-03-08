import React, { useState } from 'react';
import { fetchApi } from '../lib/api';
import { LogOut, X, Upload } from 'lucide-react';

export function UserMenu({ user, onUpdate, onLogout }: { user: any, onUpdate: (u: any) => void, onLogout: () => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [username, setUsername] = useState(user.username);
  const [profilePic, setProfilePic] = useState(user.profile_picture);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
      onUpdate(updatedUser);
      setIsOpen(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
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
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 relative">
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
