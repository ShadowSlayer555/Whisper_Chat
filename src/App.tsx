import { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Auth } from './components/Auth';
import { ForumList } from './components/ForumList';
import { Forum } from './components/Forum';
import { fetchApi } from './lib/api';

function LandingPage({ onSignInClick }: { onSignInClick: () => void }) {
  return (
    <div className="min-h-screen bg-slate-900 text-slate-50 flex flex-col items-center justify-center p-6 text-center">
      <div className="max-w-3xl space-y-8">
        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-white mb-6">
          Whisper Chat
        </h1>
        <p className="text-xl md:text-2xl text-slate-300 leading-relaxed">
          A secure platform to create forums about private issues.
        </p>
        <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700 text-left space-y-4 text-lg text-slate-300 max-w-2xl mx-auto">
          <ul className="list-disc list-inside space-y-3">
            <li><strong>Permanent Record:</strong> All chats are saved forever.</li>
            <li><strong>Immutable:</strong> No one can undo or delete anything they say.</li>
            <li><strong>Private Access:</strong> Only people explicitly given access to the forums can see or speak in them.</li>
          </ul>
        </div>
        <div className="pt-8">
          <button 
            onClick={onSignInClick}
            className="px-10 py-4 bg-indigo-600 hover:bg-indigo-500 text-white text-xl font-bold rounded-full transition-all transform hover:scale-105 shadow-lg shadow-indigo-500/30"
          >
            Sign In
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showAuth, setShowAuth] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const data = await fetchApi('/api/auth/me');
      setUser(data);
    } catch (err) {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetchApi('/api/auth/logout', { method: 'POST' });
      setUser(null);
      setShowAuth(false);
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50">Loading...</div>;
  }

  return (
    <HashRouter>
      <Routes>
        <Route 
          path="/" 
          element={
            user ? (
              <ForumList user={user} onUpdateUser={setUser} onLogout={handleLogout} />
            ) : showAuth ? (
              <Auth onLogin={setUser} />
            ) : (
              <LandingPage onSignInClick={() => setShowAuth(true)} />
            )
          } 
        />
        <Route 
          path="/forum/:id" 
          element={user ? <Forum user={user} onUpdateUser={setUser} onLogout={handleLogout} /> : <Navigate to="/" />} 
        />
      </Routes>
    </HashRouter>
  );
}
