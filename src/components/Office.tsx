import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { fetchApi } from '../lib/api';
import { ArrowLeft, Plus, Search, UserPlus, Crown, MessageSquare, HelpCircle, Loader2, Trash2, LogOut, CheckCircle2, Video, Mic } from 'lucide-react';
import { UserMenu } from './UserMenu';
import toast from 'react-hot-toast';
import { confirmAction } from '../lib/confirm';

export function Office({ user, onUpdateUser, onLogout }: { user: any, onUpdateUser: (u: any) => void, onLogout: () => void }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [office, setOffice] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreatingForum, setIsCreatingForum] = useState(false);
  const [newForumTitle, setNewForumTitle] = useState('');
  const [newForumDesc, setNewForumDesc] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [showKickRequest, setShowKickRequest] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletionStatus, setDeletionStatus] = useState<any>(null);

  useEffect(() => {
    loadOffice();
  }, [id]);

  useEffect(() => {
    if (office?.kickRequestedBy) {
      setShowKickRequest(true);
    }
  }, [office]);

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
      toast.error(err.message);
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
      toast.success('User invited successfully');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handlePromote = (userId: string) => {
    confirmAction('Are you sure you want to promote this user to admin?', async () => {
      try {
        await fetchApi(`/api/offices/${id}/members/${userId}/admin`, {
          method: 'POST',
        });
        loadOffice();
      } catch (err: any) {
        toast.error(err.message);
      }
    });
  };

  const handleDemote = (userId: string) => {
    confirmAction('Are you sure you want to demote this user to a regular member?', async () => {
      try {
        await fetchApi(`/api/offices/${id}/members/${userId}/demote`, {
          method: 'POST',
        });
        loadOffice();
      } catch (err: any) {
        toast.error(err.message);
      }
    });
  };

  const handleKick = (userId: string) => {
    confirmAction('Are you sure you want to kick this user?', async () => {
      try {
        const res = await fetchApi(`/api/offices/${id}/members/${userId}/kick`, {
          method: 'POST',
        });
        if (res.requested) {
          toast.success('A kick request has been sent to the admin.');
        }
        loadOffice();
      } catch (err: any) {
        toast.error(err.message);
      }
    });
  };

  const handleKickResponse = async (action: 'resign' | 'reject') => {
    try {
      await fetchApi(`/api/offices/${id}/kick-response`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      });
      setShowKickRequest(false);
      if (action === 'resign') {
        navigate('/');
      } else {
        loadOffice();
      }
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleResign = () => {
    confirmAction('Are you sure you want to resign from this office? You will lose access.', async () => {
      try {
        await fetchApi(`/api/offices/${id}/resign`, {
          method: 'POST',
        });
        navigate('/');
      } catch (err: any) {
        toast.error(err.message);
      }
    });
  };

  const loadDeletionStatus = async () => {
    try {
      const data = await fetchApi(`/api/offices/${id}/deletion-status`);
      setDeletionStatus(data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteClick = () => {
    loadDeletionStatus();
    setShowDeleteModal(true);
  };

  const handleApproveDelete = async () => {
    try {
      const res = await fetchApi(`/api/offices/${id}/delete-approve`, {
        method: 'POST',
      });
      if (res.archived) {
        toast.success('Office has been archived/deleted.');
        navigate('/');
      } else {
        loadDeletionStatus();
      }
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  if (!office) return <div className="p-8 text-center">Loading...</div>;

  const canManage = (office.userRole === 'creator' || office.userRole === 'admin') && office.status !== 'archived';
  const isArchived = office.status === 'archived';

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
          {canManage && (
            <>
              <button
                onClick={handleDeleteClick}
                className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                <Trash2 size={16} />
                Delete Office
              </button>
              <button
                onClick={handleResign}
                className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <LogOut size={16} />
                Resign
              </button>
            </>
          )}
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
              {canManage && !isArchived && (
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
                  className="block bg-white p-4 rounded-xl shadow-sm border border-slate-200 hover:border-indigo-300 hover:shadow-md transition-all flex justify-between items-center"
                >
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                      {forum.title}
                      {forum.active_call_type && (
                        <span className="flex items-center gap-1.5 bg-red-50 text-red-600 text-xs font-bold px-2 py-0.5 rounded-full border border-red-100">
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                          </span>
                          {forum.active_call_type === 'video' ? <Video size={12} /> : <Mic size={12} />}
                          Live
                        </span>
                      )}
                      {forum.unread_count > 0 && (
                        <span className="bg-indigo-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                          {forum.unread_count} new
                        </span>
                      )}
                    </h3>
                    <p className="text-slate-500 text-sm mt-1 line-clamp-2">{forum.description}</p>
                  </div>
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
            
            {canManage && !isArchived && (
              <div className="p-4 border-b border-slate-200 bg-slate-50">
                <form onSubmit={handleInvite} className="flex items-center gap-2">
                  <div className="relative flex-1 flex items-center">
                    <input
                      type="text"
                      placeholder="Invite by email(s)"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      className="w-full px-3 py-1.5 pr-8 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                      required
                    />
                    <div className="absolute right-2 group/tooltip cursor-help">
                      <HelpCircle size={14} className="text-slate-400 hover:text-slate-600" />
                      <div className="absolute bottom-full right-0 mb-2 w-48 bg-slate-900 text-white text-xs p-2 rounded-lg opacity-0 group-hover/tooltip:opacity-100 pointer-events-none transition-opacity z-10">
                        You can enter a single email, or a list of emails separated by spaces.
                      </div>
                    </div>
                  </div>
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
                            <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 bg-slate-900 text-white text-xs p-2 rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">
                              This person is an admin/creator and may add people to the group.
                            </div>
                          </div>
                        )}
                        {member.kick_requested_by && (
                          <span className="text-xs text-red-500 flex items-center gap-1 ml-2">
                            <Loader2 size={12} className="animate-spin" />
                            Awaiting approval
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500">{member.email}</div>
                    </div>
                  </div>
                  {canManage && member.id !== user.id && !isArchived && (
                    <div className="flex gap-2">
                      {member.role === 'member' && (
                        <button
                          onClick={() => handlePromote(member.id)}
                          className="text-xs font-medium text-indigo-600 hover:text-indigo-800 px-2 py-1 rounded hover:bg-indigo-50 transition-colors"
                        >
                          Make Admin
                        </button>
                      )}
                      {member.role === 'admin' && (
                        <button
                          onClick={() => handleDemote(member.id)}
                          className="text-xs font-medium text-amber-600 hover:text-amber-800 px-2 py-1 rounded hover:bg-amber-50 transition-colors"
                        >
                          Demote
                        </button>
                      )}
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

      {/* Kick Request Modal */}
      {showKickRequest && office.kickRequestedBy && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl">
            <h2 className="text-xl font-bold text-slate-900 mb-2">Kick Request</h2>
            <p className="text-slate-600 mb-6">
              <span className="font-semibold">{office.members.find((m: any) => m.id === office.kickRequestedBy)?.username || 'Another admin'}</span> is attempting to kick you from this office. If you resign, you will no longer be part of the office.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => handleKickResponse('reject')}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                Reject
              </button>
              <button
                onClick={() => handleKickResponse('resign')}
                className="px-4 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors"
              >
                Resign
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Office Modal */}
      {showDeleteModal && deletionStatus && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl">
            <h2 className="text-xl font-bold text-slate-900 mb-2">Delete Office</h2>
            <p className="text-slate-600 mb-4 text-sm">
              Deleting an office requires approval from all admins. Once all admins agree, the group is permanently deleted for everyone except the creator (who will see it in Archives).
            </p>
            
            <div className="bg-slate-50 rounded-xl p-4 mb-6">
              <h3 className="text-sm font-semibold text-slate-900 mb-3">Admin Approvals</h3>
              <div className="space-y-2">
                {deletionStatus.admins.map((admin: any) => {
                  const hasApproved = deletionStatus.approvedUserIds.includes(admin.id);
                  return (
                    <div key={admin.id} className="flex items-center justify-between text-sm">
                      <span className="text-slate-700">{admin.username}</span>
                      {hasApproved ? (
                        <span className="flex items-center gap-1 text-emerald-600 text-xs font-medium">
                          <CheckCircle2 size={14} /> Approved
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs">Pending</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                Cancel
              </button>
              {!deletionStatus.approvedUserIds.includes(user.id) && (
                <button
                  onClick={handleApproveDelete}
                  className="px-4 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors"
                >
                  Approve Deletion
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
