import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { fetchApi } from '../lib/api';
import { ArrowLeft, Plus, Search, UserPlus, Crown, MessageSquare } from 'lucide-react';
import { UserMenu } from './UserMenu';

export function Office({ user, onUpdateUser, onLogout }: { user: any, onUpdateUser: (u: any) => void, onLogout: () => void }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [office, setOffice] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreatingForum, setIsCreatingForum] = useState(false);
  const [newForumTitle, setNewForumTitle] = useState('');
  const [newForumDesc, setNewForumDesc] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');

  useEffect(() => {
    loadOffice();
  }, [id]);

  const loadOffice = async () => {
    try {
      const data = await fetchApi(`/api/offices/${id}`);
      setOffice(data);
    } catch (err) {
      navigate('/');
    }
  };

  const handleCreateForum = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await fetchApi(`/api/offices/${id}/forums`, {
        method: 'POST',
        body: JSON.stringify({ title: newForumTitle, description: newForumDesc }),
      });
      setIsCreatingForum(false);
      setNewForumTitle('');
      setNewForumDesc('');
      loadOffice();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await fetchApi(`/api/offices/${id}/invite`, {
        method: 'POST',
        body: JSON.stringify({ email: inviteEmail }),
      });
      setInviteEmail('');
      loadOffice();
      alert('User invited successfully');
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handlePromote = async (userId: string) => {
    if (!confirm('Are you sure you want to promote this user to admin?')) return;
    try {
      await fetchApi(`/api/offices/${id}/members/${userId}/admin`, {
        method: 'POST',
      });
      loadOffice();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleKick = async (userId: string) => {
    if (!confirm('Are you sure you want to kick this user?')) return;
    try {
      await fetchApi(`/api/offices/${id}/members/${userId}/kick`, {
        method: 'POST',
      });
      loadOffice();
    } catch (err: any) {
      alert(err.message);
    }
  };

  if (!office) return <div className="p-8 text-center">Loading...</div>;

  const canManage = office.userRole === 'creator' || office.userRole === 'admin';

  const filteredForums = office.forums.filter((f: any) => 
    f.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    (f.description && f.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex justify-between items-center mb-8">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/')} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <ArrowLeft size={20} className="text-slate-600" />
          </button>
          <div>
            <h1 className="text-3xl font-bold text-slate-900">{office.name}</h1>
            <p className="text-slate-500 mt-1">{office.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <UserMenu user={user} onUpdate={onUpdateUser} onLogout={onLogout} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold text-slate-900">Forums</h2>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  type="text"
                  placeholder="Search forums..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none w-48"
                />
              </div>
              {canManage && (
                <button
                  onClick={() => setIsCreatingForum(true)}
                  className="flex items-center gap-1 bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-indigo-700 transition-colors"
                >
                  <Plus size={16} />
                  New Forum
                </button>
              )}
            </div>
          </div>

          {isCreatingForum && (
            <form onSubmit={handleCreateForum} className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
              <h3 className="text-lg font-semibold mb-3">Create New Forum</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Title</label>
                  <input
                    type="text"
                    required
                    value={newForumTitle}
                    onChange={(e) => setNewForumTitle(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                  <textarea
                    value={newForumDesc}
                    onChange={(e) => setNewForumDesc(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                    rows={2}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsCreatingForum(false)}
                    className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-3 py-1.5 text-sm bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors"
                  >
                    Create
                  </button>
                </div>
              </div>
            </form>
          )}

          <div className="grid gap-3">
            {filteredForums.length === 0 ? (
              <div className="text-center py-8 bg-white rounded-xl border border-slate-200 border-dashed">
                <MessageSquare className="mx-auto h-8 w-8 text-slate-300 mb-2" />
                <h3 className="text-sm font-medium text-slate-900">No forums yet</h3>
              </div>
            ) : (
              filteredForums.map((forum: any) => (
                <Link
                  key={forum.id}
                  to={`/forum/${forum.id}`}
                  className="block bg-white p-4 rounded-xl shadow-sm border border-slate-200 hover:border-indigo-300 hover:shadow-md transition-all"
                >
                  <h3 className="text-lg font-semibold text-slate-900">{forum.title}</h3>
                  <p className="text-slate-500 text-sm mt-1 line-clamp-2">{forum.description}</p>
                </Link>
              ))
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-900">Members ({office.members.length})</h2>
            </div>
            
            {canManage && (
              <div className="p-4 border-b border-slate-200 bg-slate-50">
                <form onSubmit={handleInvite} className="flex items-center gap-2">
                  <input
                    type="email"
                    placeholder="Invite by email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="flex-1 px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                    required
                  />
                  <button type="submit" className="p-1.5 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 transition-colors" title="Invite User">
                    <UserPlus size={18} />
                  </button>
                </form>
              </div>
            )}

            <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto">
              {office.members.map((member: any) => (
                <div key={member.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <img src={member.profile_picture} alt="" className="w-8 h-8 rounded-full bg-slate-200" />
                    <div>
                      <div className="font-medium text-sm text-slate-900 flex items-center gap-1.5">
                        {member.username}
                        {(member.role === 'creator' || member.role === 'admin') && (
                          <div className="group relative flex items-center">
                            <Crown size={14} className="text-amber-500" />
                            <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-xs p-2 rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-10">
                              This person is an admin/creator and may add people to the group.
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="text-xs text-slate-500">{member.email}</div>
                    </div>
                  </div>
                  {canManage && member.role === 'member' && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handlePromote(member.id)}
                        className="text-xs font-medium text-indigo-600 hover:text-indigo-800 px-2 py-1 rounded hover:bg-indigo-50 transition-colors"
                      >
                        Make Admin
                      </button>
                      <button
                        onClick={() => handleKick(member.id)}
                        className="text-xs font-medium text-red-600 hover:text-red-800 px-2 py-1 rounded hover:bg-red-50 transition-colors"
                      >
                        Kick
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
