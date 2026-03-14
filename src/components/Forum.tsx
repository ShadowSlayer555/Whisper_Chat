import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchApi } from '../lib/api';
import { ArrowLeft, Download, Send, UserPlus, Reply, ChevronDown, ChevronRight, Search, Info, X, AlertTriangle, CheckCircle2, ArrowDown, Video, Mic } from 'lucide-react';
import { format } from 'date-fns';
import { UserMenu } from './UserMenu';
import Markdown from 'react-markdown';
import { CallPanel } from './CallPanel';
import toast from 'react-hot-toast';

const MessageNode: React.FC<{ msg: any, user: any, onReply: (msg: any) => void, depth?: number, replyingToId?: number | null, forum: any, canManage: boolean, onMarkSolution: (id: number) => void }> = ({ msg, user, onReply, depth = 0, replyingToId, forum, canManage, onMarkSolution }) => {
  const [collapsed, setCollapsed] = useState(false);
  const isMe = msg.user_id === user.id;
  const isReplyingToThis = msg.id === replyingToId;
  const isSolution = msg.id === forum?.solution_message_id;

  if (msg.type === 'system_kick') {
    return (
      <div className="my-6 p-4 bg-red-50 border border-red-200 text-red-800 rounded-xl text-center shadow-sm">
        <p className="font-medium">{msg.content}</p>
      </div>
    );
  }

  const processedContent = msg.content.replace(/(@[a-zA-Z0-9_]+)/g, '**$1**');

  return (
    <div id={`message-${msg.id}`} className={`flex flex-col ${depth > 0 ? 'ml-4 sm:ml-8 mt-4 border-l-2 border-slate-200 pl-4' : 'mt-6'}`}>
      <div className={`flex items-start gap-3 p-2 rounded-xl transition-colors ${isReplyingToThis ? 'bg-indigo-50 ring-2 ring-indigo-200' : ''} ${isSolution ? 'bg-emerald-50 ring-2 ring-emerald-200' : ''}`}>
        <div className="shrink-0 group relative mt-1">
          <img src={msg.profile_picture} alt={msg.username} className="w-8 h-8 rounded-full bg-slate-200 border border-slate-300" />
          <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-xs p-2 rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-10">
            <div className="font-bold">{msg.username}</div>
            <div className="text-slate-300">{msg.email}</div>
          </div>
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-sm font-semibold text-slate-900">{msg.username}</span>
            <span className="text-xs text-slate-500">{format(new Date(msg.created_at), 'MMM d, h:mm a')}</span>
            {msg.children && msg.children.length > 0 && (
              <button 
                onClick={() => setCollapsed(!collapsed)}
                className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 ml-2 font-medium bg-slate-100 px-2 py-0.5 rounded-full transition-colors"
              >
                {collapsed ? (
                  <><ChevronRight size={12} /> {msg.children.length} {msg.children.length === 1 ? 'reply' : 'replies'}</>
                ) : (
                  <><ChevronDown size={12} /> Collapse</>
                )}
              </button>
            )}
          </div>
          
          <div className={`text-slate-800 text-sm whitespace-pre-wrap break-words leading-relaxed p-3 rounded-2xl rounded-tl-sm border shadow-sm inline-block ${isSolution ? 'bg-white border-emerald-300' : isReplyingToThis ? 'bg-white border-indigo-200' : 'bg-white border-slate-200'}`}>
            <div className="[&>p]:mb-2 last:[&>p]:mb-0 [&>a]:text-indigo-600 [&>a]:underline [&>strong]:font-bold [&>em]:italic [&>ul]:list-disc [&>ul]:ml-4 [&>ol]:list-decimal [&>ol]:ml-4 [&>code]:bg-slate-100 [&>code]:px-1 [&>code]:rounded [&>pre]:bg-slate-800 [&>pre]:text-white [&>pre]:p-2 [&>pre]:rounded-lg">
              <Markdown>{processedContent}</Markdown>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-4">
            <button
              onClick={() => onReply(msg)}
              className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-indigo-600 transition-colors"
            >
              <Reply size={14} />
              Reply
            </button>
            {canManage && !isSolution && (
              <button
                onClick={() => onMarkSolution(msg.id)}
                className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-emerald-600 transition-colors"
              >
                <CheckCircle2 size={14} />
                Mark Solution
              </button>
            )}
            {isSolution && (
              <span className="flex items-center gap-1 text-xs font-bold text-emerald-600">
                <CheckCircle2 size={14} />
                Solution
              </span>
            )}
          </div>
        </div>
      </div>

      {!collapsed && msg.children && msg.children.length > 0 && (
        <div className="flex flex-col">
          {msg.children.map((child: any) => (
            <MessageNode key={child.id} msg={child} user={user} onReply={onReply} depth={depth + 1} replyingToId={replyingToId} forum={forum} canManage={canManage} onMarkSolution={onMarkSolution} />
          ))}
        </div>
      )}
    </div>
  );
};

export function Forum({ user, onUpdateUser, onLogout }: { user: any, onUpdateUser: (u: any) => void, onLogout: () => void }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [forum, setForum] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [replyingTo, setReplyingTo] = useState<any>(null);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionResults, setMentionResults] = useState<any[]>([]);
  const [showMentions, setShowMentions] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [summaryText, setSummaryText] = useState('');
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [activeCall, setActiveCall] = useState<'video' | 'voice' | null>(null);
  const [aiWarning, setAiWarning] = useState<string | null>(null);
  const [isArchived, setIsArchived] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadForum();
    loadMessages();
    markMentionsRead();
    markForumRead();
    const interval = setInterval(() => {
      loadMessages();
      markForumRead();
    }, 5000); // Poll for new messages
    return () => clearInterval(interval);
  }, [id]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (newMessage.trim().length > 5) {
        fetchApi('/api/analyze-message', {
          method: 'POST',
          body: JSON.stringify({ content: newMessage, forumId: id })
        }).then(res => setAiWarning(res.warning)).catch(() => setAiWarning(null));
      } else {
        setAiWarning(null);
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [newMessage, id]);

  const loadForum = async () => {
    try {
      const data = await fetchApi(`/api/forums/${id}`);
      setForum(data);
      if (data.office_id) {
        const officeData = await fetchApi(`/api/offices/${data.office_id}`);
        setIsArchived(officeData.status === 'archived');
      }
    } catch (err) {
      navigate('/');
    }
  };

  const loadMessages = async () => {
    try {
      const data = await fetchApi(`/api/forums/${id}/messages`);
      setMessages(data);
    } catch (err) {
      console.error(err);
    }
  };

  const markMentionsRead = async () => {
    try {
      await fetchApi(`/api/forums/${id}/mentions/read`, { method: 'POST' });
    } catch (err) {}
  };

  const markForumRead = async () => {
    try {
      await fetchApi(`/api/forums/${id}/read`, { method: 'POST' });
    } catch (err) {}
  };

  const handleMarkSolution = async (messageId: number) => {
    try {
      await fetchApi(`/api/forums/${id}/solution`, {
        method: 'POST',
        body: JSON.stringify({ messageId })
      });
      loadForum();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const scrollToSolution = () => {
    if (forum?.solution_message_id) {
      const el = document.getElementById(`message-${forum.solution_message_id}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await fetchApi(`/api/forums/${id}/invite`, {
        method: 'POST',
        body: JSON.stringify({ email: inviteEmail }),
      });
      setInviteEmail('');
      toast.success('User invited successfully');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;
    try {
      await fetchApi(`/api/forums/${id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content: newMessage, parent_id: replyingTo?.id }),
      });
      setNewMessage('');
      setReplyingTo(null);
      loadMessages();
    } catch (err) {
      console.error(err);
    }
  };

  const handleTextareaChange = async (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setNewMessage(val);

    // Simple mention detection
    const lastWord = val.split(' ').pop();
    if (lastWord?.startsWith('@')) {
      const query = lastWord.slice(1);
      setMentionQuery(query);
      if (query.length > 0) {
        try {
          const users = await fetchApi(`/api/users/search?q=${query}`);
          setMentionResults(users);
          setShowMentions(true);
        } catch (err) {
          setShowMentions(false);
        }
      } else {
        setShowMentions(false);
      }
    } else {
      setShowMentions(false);
    }
  };

  const insertMention = (username: string) => {
    const words = newMessage.split(' ');
    words.pop(); // remove the @query
    const newText = [...words, `@${username} `].join(' ');
    setNewMessage(newText);
    setShowMentions(false);
    textareaRef.current?.focus();
  };

  const handleCopyChat = () => {
    if (!forum) return;
    let txt = `Forum: ${forum.title}\nDescription: ${forum.description || 'N/A'}\nCreated: ${new Date(forum.created_at).toLocaleString()}\n\n---\n\n`;
    
    messages.forEach(m => {
      const date = new Date(m.created_at).toLocaleString();
      txt += `[${date}] ${m.username} (${m.email}):\n${m.content}\n\n`;
    });

    const blob = new Blob([txt], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `forum-${forum.id}-export.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleSummarize = async () => {
    setShowSummary(true);
    if (!summaryText) {
      setIsSummarizing(true);
      try {
        const data = await fetchApi(`/api/forums/${id}/summary`);
        setSummaryText(data.summary);
      } catch (err: any) {
        setSummaryText('Failed to generate summary: ' + err.message);
      } finally {
        setIsSummarizing(false);
      }
    }
  };

  const toggleCall = async (type: 'video' | 'voice') => {
    if (activeCall === type) {
      setActiveCall(null);
      await fetchApi(`/api/forums/${id}/call`, { method: 'POST', body: JSON.stringify({ type: null }) });
    } else {
      setActiveCall(type);
      await fetchApi(`/api/forums/${id}/call`, { method: 'POST', body: JSON.stringify({ type }) });
    }
  };

  const buildThreadTree = (flatMessages: any[]) => {
    const map = new Map();
    const roots: any[] = [];

    flatMessages.forEach(msg => {
      map.set(msg.id, { ...msg, children: [] });
    });

    flatMessages.forEach(msg => {
      if (msg.parent_id && map.has(msg.parent_id)) {
        map.get(msg.parent_id).children.push(map.get(msg.id));
      } else {
        roots.push(map.get(msg.id));
      }
    });

    return roots;
  };

  const filteredMessages = messages.filter(m => 
    m.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const threadedMessages = buildThreadTree(filteredMessages);

  if (!forum) return <div className="p-8 text-center">Loading...</div>;

  const isCreator = forum.creator_id === user.id;

  const canManage = forum?.userRole === 'admin' || forum?.userRole === 'creator';

  return (
    <div className="max-w-5xl mx-auto h-screen flex flex-col bg-slate-50 relative">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 p-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(forum.office_id ? `/office/${forum.office_id}` : '/')} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <ArrowLeft size={20} className="text-slate-600" />
          </button>
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-xl font-bold text-slate-900">{forum.title}</h1>
              <p className="text-sm text-slate-500">{forum.description}</p>
            </div>
            {forum?.solution_message_id && (
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-emerald-100 text-emerald-600" title="This forum has a solution">
                <CheckCircle2 size={20} />
              </div>
            )}
            {forum?.active_call_type && !activeCall && (
              <button onClick={() => setActiveCall(forum.active_call_type)} className="flex items-center gap-1.5 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold px-3 py-1.5 rounded-full border border-red-100 transition-colors">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                </span>
                {forum.active_call_type === 'video' ? <Video size={14} /> : <Mic size={14} />}
                Join Live Call
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 mr-2 border-r border-slate-200 pr-4">
            <button
              onClick={() => toggleCall('voice')}
              className={`p-2 rounded-lg transition-colors ${activeCall === 'voice' ? 'bg-indigo-100 text-indigo-600' : 'text-slate-500 hover:bg-slate-100'}`}
              title="Start Voice Call"
            >
              <Mic size={20} />
            </button>
            <button
              onClick={() => toggleCall('video')}
              className={`p-2 rounded-lg transition-colors ${activeCall === 'video' ? 'bg-indigo-100 text-indigo-600' : 'text-slate-500 hover:bg-slate-100'}`}
              title="Start Video Call"
            >
              <Video size={20} />
            </button>
          </div>
          <div className="relative mr-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="Search messages or users..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none w-56"
            />
          </div>
          <button onClick={handleCopyChat} className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 transition-colors">
            <Download size={16} />
            Export
          </button>
          <div className="ml-2">
            <UserMenu user={user} onUpdate={onUpdateUser} onLogout={onLogout} />
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Chat Area */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 overflow-y-auto p-6 scroll-smooth" ref={messagesEndRef}>
            <div className="max-w-4xl mx-auto pb-6">
              {threadedMessages.length === 0 ? (
                <div className="text-center py-12 text-slate-500">No messages yet. Start the conversation!</div>
              ) : (
                threadedMessages.map((msg) => (
                  <MessageNode key={msg.id} msg={msg} user={user} onReply={setReplyingTo} replyingToId={replyingTo?.id} forum={forum} canManage={canManage} onMarkSolution={handleMarkSolution} />
                ))
              )}
            </div>
          </div>

          {/* Input Area */}
          {!isArchived && (
            <div className="bg-white border-t border-slate-200 p-4 shrink-0 relative">
              {forum?.solution_message_id && (
                <button
                  onClick={scrollToSolution}
                  className="absolute bottom-full mb-4 left-6 flex items-center gap-2 px-4 py-2 bg-emerald-100 text-emerald-700 font-medium rounded-full shadow-md hover:bg-emerald-200 transition-colors z-10"
                >
                  <ArrowDown size={16} />
                  Scroll down to solution
                </button>
              )}
              <div className="max-w-4xl mx-auto relative">
                {aiWarning && (
                  <div className="absolute bottom-full mb-3 left-0 right-0 bg-amber-50 border border-amber-200 text-amber-800 p-3 rounded-xl shadow-lg text-sm flex items-start gap-2 animate-in fade-in slide-in-from-bottom-2 z-20">
                    <AlertTriangle size={18} className="shrink-0 mt-0.5 text-amber-600" />
                    <p className="font-medium">{aiWarning}</p>
                  </div>
                )}
                {replyingTo && (
                  <div className="mb-2 flex items-center justify-between bg-slate-50 border border-slate-200 p-2 rounded-lg text-sm">
                    <div className="flex items-center gap-2 text-slate-600 overflow-hidden">
                      <Reply size={16} className="shrink-0" />
                      <span className="truncate">Replying to <span className="font-medium">{replyingTo.username}</span>: <span className="italic">"{replyingTo.content}"</span></span>
                    </div>
                    <button onClick={() => setReplyingTo(null)} className="text-slate-400 hover:text-slate-600 shrink-0 ml-2">×</button>
                  </div>
                )}

                {showMentions && mentionResults.length > 0 && (
                  <div className="absolute bottom-full mb-2 left-0 w-64 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden z-20">
                    {mentionResults.map(u => (
                      <button
                        key={u.id}
                        className="w-full text-left px-4 py-2 hover:bg-slate-50 flex items-center gap-3 transition-colors"
                        onClick={() => insertMention(u.username)}
                      >
                        <img src={u.profile_picture} alt="" className="w-6 h-6 rounded-full" />
                        <div>
                          <div className="font-medium text-sm text-slate-900">{u.username}</div>
                          <div className="text-xs text-slate-500">{u.email}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                <form onSubmit={handleSendMessage} className="flex items-end gap-3">
                  <textarea
                    ref={textareaRef}
                    value={newMessage}
                    onChange={handleTextareaChange}
                    placeholder="Type a message... Use @ to mention"
                    className="flex-1 max-h-32 min-h-[44px] p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                    rows={1}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage(e as any);
                      }
                    }}
                  />
                  <button
                    type="submit"
                    disabled={!newMessage.trim()}
                    className="p-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <Send size={20} />
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>

        {/* Call Panel */}
        {activeCall && (
          <CallPanel
            forumId={id!}
            forumTitle={forum.title}
            user={user}
            callType={activeCall}
            onClose={() => toggleCall(activeCall)}
          />
        )}
      </div>

      {/* Floating Action Button for AI Summary */}
      <button
        onClick={handleSummarize}
        className="absolute bottom-24 right-6 w-14 h-14 bg-indigo-600 text-white rounded-full shadow-lg hover:bg-indigo-500 hover:scale-105 transition-all flex items-center justify-center z-10"
        title="AI Forum Summary"
      >
        <Info size={28} />
      </button>

      {/* Summary Modal */}
      {showSummary && (
        <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl max-h-[80vh] rounded-2xl shadow-xl flex flex-col">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Info size={20} className="text-indigo-600" />
                AI Forum Summary
              </h3>
              <button onClick={() => setShowSummary(false)} className="p-1 hover:bg-slate-100 rounded-lg text-slate-500">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              {isSummarizing ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-500 space-y-4">
                  <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                  <p>Analyzing conversation and generating summary...</p>
                </div>
              ) : (
                <div className="prose prose-slate max-w-none">
                  <div className="markdown-body">
                    <Markdown>{summaryText}</Markdown>
                  </div>
                </div>
              )}
            </div>
            <div className="p-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl flex justify-end">
              <button
                onClick={() => {
                  setSummaryText('');
                  handleSummarize();
                }}
                className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
              >
                Regenerate Summary
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
