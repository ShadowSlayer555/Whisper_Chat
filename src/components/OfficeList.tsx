import React, { useState, useEffect } from 'react';
import { fetchApi } from '../lib/api';
import { Link, useNavigate } from 'react-router-dom';
import { Building2, Plus, Search, MoreVertical, ArchiveRestore } from 'lucide-react';
import { UserMenu } from './UserMenu';
import toast from 'react-hot-toast';

export function OfficeList({ user, onUpdateUser, onLogout }: { user: any, onUpdateUser: (u: any) => void, onLogout: () => void }) {
  const [offices, setOffices] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [activeTab, setActiveTab] = useState<'active' | 'archived'>('active');
  const [reactivateOfficeId, setReactivateOfficeId] = useState<number | null>(null);
  const [reactivateEmail, setReactivateEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    loadOffices();
  }, []);

  const loadOffices = async () => {
    try {
      const data = await fetchApi('/api/offices');
      setOffices(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await fetchApi('/api/offices', {
        method: 'POST',
        body: JSON.stringify({ name: newName, description: newDesc }),
      });
      setIsCreating(false);
      setNewName('');
      setNewDesc('');
      loadOffices();
    } catch (err) {
      console.error(err);
    }
  };

  const handleReactivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reactivateOfficeId) return;
    try {
      await fetchApi(`/api/offices/${reactivateOfficeId}/reactivate`, {
        method: 'POST',
        body: JSON.stringify({ email: reactivateEmail }),
      });
      setReactivateOfficeId(null);
      setReactivateEmail('');
      loadOffices();
      setActiveTab('active');
      toast.success('Office reactivated successfully');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const filteredOffices = offices.filter(o => 
    o.status === activeTab &&
    (o.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    (o.description && o.description.toLowerCase().includes(searchQuery.toLowerCase())))
  );

  const hasArchived = offices.some(o => o.status === 'archived');

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Your Offices</h1>
          <p className="text-sm sm:text-base text-slate-500 mt-1">Welcome back, {user.username}</p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full sm:w-auto">
          {hasArchived && (
            <div className="flex bg-slate-100 p-1 rounded-xl shrink-0">
              <button
                onClick={() => setActiveTab('active')}
                className={`flex-1 sm:flex-none px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${activeTab === 'active' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Active
              </button>
              <button
                onClick={() => setActiveTab('archived')}
                className={`flex-1 sm:flex-none px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${activeTab === 'archived' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Archives
              </button>
            </div>
          )}
          <div className="relative w-full sm:w-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Search offices..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full sm:w-64 pl-10 pr-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => setIsCreating(true)}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl hover:bg-indigo-700 transition-colors"
            >
              <Plus size={20} />
              <span className="hidden sm:inline">New Office</span>
              <span className="sm:hidden">New</span>
            </button>
            <UserMenu user={user} onUpdate={onUpdateUser} onLogout={onLogout} />
          </div>
        </div>
      </div>

      {isCreating && (
        <form onSubmit={handleCreate} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mb-8">
          <h2 className="text-xl font-semibold mb-4">Create New Office</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
              <input
                type="text"
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
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
        {loading ? (
          <div className="text-center py-12 bg-white rounded-2xl border border-slate-200 border-dashed">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mb-4"></div>
            <p className="text-slate-500">Loading offices...</p>
          </div>
        ) : filteredOffices.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-2xl border border-slate-200 border-dashed">
            <Building2 className="mx-auto h-12 w-12 text-slate-300 mb-3" />
            <h3 className="text-lg font-medium text-slate-900">
              {searchQuery ? 'No offices found' : activeTab === 'archived' ? 'No archived offices' : 'No offices yet'}
            </h3>
            <p className="text-slate-500">
              {searchQuery ? 'Try adjusting your search.' : activeTab === 'archived' ? '' : 'Create one or wait for an invite.'}
            </p>
          </div>
        ) : (
          filteredOffices.map((office) => (
            <div key={office.id} className="relative group">
              <Link
                to={`/office/${office.id}`}
                className={`block bg-white p-6 rounded-2xl shadow-sm border border-slate-200 transition-all ${activeTab === 'archived' ? 'opacity-60 hover:opacity-100' : 'hover:border-indigo-300 hover:shadow-md'}`}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-xl font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors">
                      {office.name}
                    </h3>
                    <p className="text-slate-500 mt-1 line-clamp-2">{office.description}</p>
                    <div className="mt-4 flex items-center gap-4 text-sm text-slate-500">
                      <span className="flex items-center gap-1">
                        Role: <span className="font-medium capitalize">{office.role}</span>
                      </span>
                      <span>•</span>
                      <span>{new Date(office.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
              </Link>
              {activeTab === 'archived' && office.creator_id === user.id && (
                <div className="absolute top-4 right-4 z-10">
                  <div className="relative group/menu">
                    <button className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors">
                      <MoreVertical size={20} />
                    </button>
                    <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-xl shadow-lg border border-slate-200 opacity-0 invisible group-hover/menu:opacity-100 group-hover/menu:visible transition-all">
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          setReactivateOfficeId(office.id);
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-indigo-600 hover:bg-indigo-50 flex items-center gap-2 first:rounded-t-xl last:rounded-b-xl"
                      >
                        <ArchiveRestore size={16} />
                        Reactivate
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {reactivateOfficeId && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl">
            <h2 className="text-xl font-bold text-slate-900 mb-2">Reactivate Office</h2>
            <p className="text-slate-500 mb-4 text-sm">
              To reactivate this office, you must invite at least one member.
            </p>
            <form onSubmit={handleReactivate}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 mb-1">Email Address(es)</label>
                <input
                  type="text"
                  required
                  placeholder="user@example.com"
                  value={reactivateEmail}
                  onChange={(e) => setReactivateEmail(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                />
                <p className="text-xs text-slate-500 mt-1">Separate multiple emails with spaces.</p>
              </div>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setReactivateOfficeId(null);
                    setReactivateEmail('');
                  }}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors"
                >
                  Reactivate
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
