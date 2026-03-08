import React, { useState, useEffect } from 'react';
import { fetchApi } from '../lib/api';
import { Link } from 'react-router-dom';
import { MessageSquare, Plus, LogOut } from 'lucide-react';

export function ForumList({ user, onLogout }: { user: any, onLogout: () => void }) {
  const [forums, setForums] = useState<any[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');

  useEffect(() => {
    loadForums();
  }, []);

  const loadForums = async () => {
    try {
      const data = await fetchApi('/api/forums');
      setForums(data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await fetchApi('/api/forums', {
        method: 'POST',
        body: JSON.stringify({ title: newTitle, description: newDesc }),
      });
      setIsCreating(false);
      setNewTitle('');
      setNewDesc('');
      loadForums();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Your Forums</h1>
          <p className="text-slate-500 mt-1">Welcome back, {user.username}</p>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setIsCreating(true)}
            className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl hover:bg-indigo-700 transition-colors"
          >
            <Plus size={20} />
            New Forum
          </button>
          <button
            onClick={onLogout}
            className="p-2 text-slate-500 hover:text-slate-900 transition-colors"
            title="Logout"
          >
            <LogOut size={20} />
          </button>
        </div>
      </div>

      {isCreating && (
        <form onSubmit={handleCreate} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mb-8">
          <h2 className="text-xl font-semibold mb-4">Create New Forum</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Title</label>
              <input
                type="text"
                required
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
              <textarea
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-colors"
              >
                Create
              </button>
            </div>
          </div>
        </form>
      )}

      <div className="grid gap-4">
        {forums.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-2xl border border-slate-200 border-dashed">
            <MessageSquare className="mx-auto h-12 w-12 text-slate-300 mb-3" />
            <h3 className="text-lg font-medium text-slate-900">No forums yet</h3>
            <p className="text-slate-500">Create one or wait for an invite.</p>
          </div>
        ) : (
          forums.map((forum) => (
            <Link
              key={forum.id}
              to={`/forum/${forum.id}`}
              className="block bg-white p-6 rounded-2xl shadow-sm border border-slate-200 hover:border-indigo-300 hover:shadow-md transition-all relative group"
            >
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-xl font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors">
                    {forum.title}
                  </h3>
                  <p className="text-slate-500 mt-1 line-clamp-2">{forum.description}</p>
                  <div className="mt-4 flex items-center gap-4 text-sm text-slate-500">
                    <span className="flex items-center gap-1">
                      Created by {forum.creator_username}
                    </span>
                    <span>•</span>
                    <span>{new Date(forum.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
                {forum.unread_mentions > 0 && (
                  <div className="bg-emerald-500 text-white text-xs font-bold px-2.5 py-1 rounded-full flex items-center justify-center min-w-[24px]">
                    {forum.unread_mentions}
                  </div>
                )}
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
