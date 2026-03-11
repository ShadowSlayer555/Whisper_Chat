import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchApi } from '../lib/api';
import { ArrowLeft, Download, Send, UserPlus, Reply, ChevronDown, ChevronRight, Search, Info, X, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { UserMenu } from './UserMenu';
import Markdown from 'react-markdown';

const MessageNode: React.FC<{ msg: any, user: any, onReply: (msg: any) => void, depth?: number }> = ({ msg, user, onReply, depth = 0 }) => {
  const [collapsed, setCollapsed] = useState(false);
  const isMe = msg.user_id === user.id;

  if (msg.type === 'system_kick') {
    return (
      <div className="my-6 p-4 bg-red-50 border border-red-200 text-red-800 rounded-xl text-center shadow-sm">
        <p className="font-medium">{msg.content}</p>
      </div>
    );
  }

  return (
    <div className={`flex flex-col ${depth > 0 ? 'ml-4 sm:ml-8 mt-4 border-l-2 border-slate-200 pl-4' : 'mt-6'}`}>
      <div className="flex items-start gap-3">
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
          
          {!collapsed && (
            <>
              <div className="text-slate-800 text-sm whitespace-pre-wrap break-words leading-relaxed bg-white p-3 rounded-2xl rounded-tl-sm border border-slate-200 shadow-sm inline-block">
                {msg.content.split(/(@[a-zA-Z0-9_]+)/).map((part: string, i: number) => 
                  part.startsWith('@') ? (
                    <span key={i} className="font-medium text-indigo-600">{part}</span>
                  ) : (
                    <span key={i}>{part}</span>
                  )
                )}
              </div>
              <div className="mt-2 flex items-center gap-4">
                <button
                  onClick={() => onReply(msg)}
                  className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-indigo-600 transition-colors"
                >
                  <Reply size={14} />
                  Reply
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {!collapsed && msg.children && msg.children.length > 0 && (
        <div className="flex flex-col">
          {msg.children.map((child: any) => (
            <MessageNode key={child.id} msg={child} user={user} onReply={onReply} depth={depth + 1} />
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
  const [aiWarning, setAiWarning] = useState<string | null>(null);
  const [isArchived, setIsArchived] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    loadForum();
    loadMessages();
    markMentionsRead();
    const interval = setInterval(loadMessages, 5000); // Poll for new messages
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

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await fetchApi(`/api/forums/${id}/invite`, {
        method: 'POST',
        body: JSON.stringify({ email: inviteEmail }),
      });
      setInviteEmail('');
      alert('User invited successfully');
    } catch (err: any) {
      alert(err.message);
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

  return (
    <div className="max-w-5xl mx-auto h-screen flex flex-col bg-slate-50 relative">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 p-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(forum.office_id ? `/office/${forum.office_id}` : '/')} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <ArrowLeft size={20} className="text-slate-600" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-900">{forum.title}</h1>
            <p className="text-sm text-slate-500">{forum.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
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

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto pb-6">
          {threadedMessages.length === 0 ? (
            <div className="text-center py-12 text-slate-500">No messages yet. Start the conversation!</div>
          ) : (
            threadedMessages.map((msg) => (
              <MessageNode key={msg.id} msg={msg} user={user} onReply={setReplyingTo} />
            ))
          )}
        </div>
      </div>

      {/* Input Area */}
      {!isArchived && (
        <div className="bg-white border-t border-slate-200 p-4 shrink-0">
          <div className="max-w-4xl mx-auto relative">
            {aiWarning && (
              <div className="absolute bottom-full mb-3 left-0 right-0 bg-amber-50 border border-amber-200 text-amber-800 p-3 rounded-xl shadow-lg text-sm flex items-start gap-2 animate-in fade-in slide-in-from-bottom-2 z-20">
                <AlertTriangle size={18} className="shrink-0 mt-0.5 text-amber-600" />
                <p className="font-medium">{aiWarning}</p>
              </div>
            )}
            {replyingTo && (
              <div className="mb-2 flex items-center justify-between bg-slate-50 border border-slate-200 p-2 rounded-lg text-sm">
                <div className="flex items-center gap-2 text-slate-600">
                  <Reply size={16} />
                  <span>Replying to <span className="font-medium">{replyingTo.username}</span></span>
                </div>
                <button onClick={() => setReplyingTo(null)} className="text-slate-400 hover:text-slate-600">×</button>
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
                    handleSendMessage(e);
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
