import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Auth } from './components/Auth';
import { ForumList } from './components/ForumList';
import { Forum } from './components/Forum';
import { fetchApi } from './lib/api';

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

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
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50">Loading...</div>;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route 
          path="/" 
          element={user ? <ForumList user={user} onLogout={handleLogout} /> : <Auth onLogin={setUser} />} 
        />
        <Route 
          path="/forum/:id" 
          element={user ? <Forum user={user} /> : <Navigate to="/" />} 
        />
      </Routes>
    </BrowserRouter>
  );
}
