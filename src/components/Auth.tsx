import React, { useState } from 'react';
import { fetchApi } from '../lib/api';
import { Upload } from 'lucide-react';

export function Auth({ onLogin }: { onLogin: (user: any) => void }) {
  const [isLogin, setIsLogin] = useState(true);
  const [requireVerification, setRequireVerification] = useState(false);
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [profilePic, setProfilePic] = useState('');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setProfilePic(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    try {
      if (requireVerification) {
        const user = await fetchApi('/api/auth/verify-email', {
          method: 'POST',
          body: JSON.stringify({ email, code }),
        });
        onLogin(user);
      } else if (isLogin) {
        const user = await fetchApi('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        });
        onLogin(user);
      } else {
        const res = await fetchApi('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify({ email, username, password, profile_picture: profilePic }),
        });
        if (res.requireVerification) {
          setRequireVerification(true);
          setSuccessMsg('A 6-digit verification code has been sent to your email.');
        }
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleResend = async () => {
    setError('');
    setSuccessMsg('');
    try {
      await fetchApi('/api/auth/resend-verification', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setSuccessMsg('A new code has been sent to your email.');
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (requireVerification) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-md p-8 text-center">
          <h2 className="text-2xl font-bold text-slate-900 mb-4">Verify Your Email</h2>
          <p className="text-slate-600 mb-6">Enter the 6-digit code sent to <strong>{email}</strong>.</p>
          
          {error && (
            <div className="p-3 rounded-lg mb-4 text-sm bg-red-50 text-red-700">
              {error}
            </div>
          )}
          {successMsg && (
            <div className="p-3 rounded-lg mb-4 text-sm bg-emerald-50 text-emerald-700">
              {successMsg}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <input
                type="text"
                required
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all font-mono tracking-widest text-center text-2xl"
                placeholder="123456"
              />
            </div>
            <button
              type="submit"
              className="w-full bg-indigo-600 text-white py-2.5 rounded-xl font-medium hover:bg-indigo-700 transition-colors"
            >
              Verify Account
            </button>
          </form>
          
          <div className="mt-6 flex flex-col space-y-3">
            <button
              onClick={handleResend}
              className="text-sm text-indigo-600 hover:text-indigo-700 font-medium transition-colors"
            >
              Resend Code
            </button>
            <button
              onClick={() => {
                setRequireVerification(false);
                setCode('');
                setError('');
                setSuccessMsg('');
              }}
              className="text-sm text-slate-500 hover:text-slate-700 transition-colors"
            >
              Cancel and return to login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-md p-8">
        <h2 className="text-2xl font-bold text-center text-slate-900 mb-6">
          {isLogin ? 'Sign In to Whisper Chat' : 'Create an Account'}
        </h2>
        
        {error && (
          <div className="p-3 rounded-lg mb-4 text-sm bg-red-50 text-red-700">
            {error}
          </div>
        )}
        {successMsg && (
          <div className="p-3 rounded-lg mb-4 text-sm bg-emerald-50 text-emerald-700">
            {successMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <div className="flex flex-col items-center mb-4">
              <div className="relative group cursor-pointer">
                <img src={profilePic || `https://api.dicebear.com/7.x/avataaars/svg?seed=${username || 'default'}`} alt="Profile" className="w-20 h-20 rounded-full object-cover bg-slate-200 border-2 border-slate-200" />
                <label className="absolute inset-0 flex items-center justify-center bg-black/50 text-white rounded-full opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity">
                  <Upload size={16} />
                  <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                </label>
              </div>
              <span className="text-xs text-slate-500 mt-2">Profile Picture</span>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
              placeholder="you@example.com"
            />
          </div>
          
          {!isLogin && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Username</label>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                placeholder="johndoe"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            className="w-full bg-slate-900 text-white py-2.5 rounded-xl font-medium hover:bg-slate-800 transition-colors"
          >
            {isLogin ? 'Sign In' : 'Register'}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-slate-600">
          {isLogin ? "Don't have an account? " : "Already have an account? "}
          <button
            onClick={() => {
              setIsLogin(!isLogin);
              setError('');
              setSuccessMsg('');
            }}
            className="text-indigo-600 hover:text-indigo-700 font-medium"
          >
            {isLogin ? 'Register' : 'Sign In'}
          </button>
        </div>
      </div>
    </div>
  );
}
