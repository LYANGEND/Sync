import React, { useState, useEffect, useRef, useCallback } from 'react';
import api from '../../utils/api';
import { Search, Send, MessageSquare, Plus, Users, Check, CheckCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { io, Socket } from 'socket.io-client';

interface UserInfo {
  id: string;
  fullName: string;
  role: string;
  email: string;
}

interface Message {
  id: string;
  content: string;
  senderId: string;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
  sender: { id: string; fullName: string };
}

interface Conversation {
  id: string;
  isGroup: boolean;
  name: string | null;
  participants: UserInfo[];
  lastMessage: {
    content: string;
    createdAt: string;
    isRead: boolean;
    senderId: string;
  } | null;
  unreadCount: number;
  updatedAt: string;
}

const API_BASE = import.meta.env.VITE_API_URL?.replace('/api', '') || '';

const ChatInterface = () => {
  const { user: currentUser } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserInfo[]>([]);
  const [showNewChat, setShowNewChat] = useState(false);
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupMembers, setGroupMembers] = useState<UserInfo[]>([]);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const typingTimeout = useRef<NodeJS.Timeout | null>(null);

  // Initialize Socket.io
  useEffect(() => {
    const socket = io(API_BASE, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Socket connected');
      if (currentUser?.id) {
        socket.emit('join_user', currentUser.id);
      }
    });

    // Listen for new messages
    socket.on('new_message', (message: Message) => {
      setMessages(prev => {
        // Avoid duplicates
        if (prev.find(m => m.id === message.id)) return prev;
        return [...prev, message];
      });
    });

    // Listen for conversation updates (for unread badges)
    socket.on('conversation_updated', () => {
      fetchConversations();
    });

    // Typing indicators
    socket.on('user_typing', (data: { userId: string; fullName: string }) => {
      if (data.userId !== currentUser?.id) {
        setTypingUsers(prev => [...new Set([...prev, data.fullName])]);
      }
    });

    socket.on('user_stop_typing', (data: { userId: string }) => {
      setTypingUsers(prev => prev.filter(n => n !== data.userId));
    });

    // Message read receipt
    socket.on('message_read', (data: { messageId: string; readAt: string }) => {
      setMessages(prev => prev.map(m =>
        m.id === data.messageId ? { ...m, isRead: true, readAt: data.readAt } : m
      ));
    });

    return () => {
      socket.disconnect();
    };
  }, [currentUser?.id]);

  // Join/leave conversation rooms
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !selectedConversation?.id) return;

    socket.emit('join_conversation', selectedConversation.id);
    return () => {
      socket.emit('leave_conversation', selectedConversation.id);
    };
  }, [selectedConversation?.id]);

  useEffect(() => {
    fetchConversations();
  }, []);

  useEffect(() => {
    if (selectedConversation?.id) {
      fetchMessages(selectedConversation.id);
      // Also poll as fallback
      const interval = setInterval(() => fetchMessages(selectedConversation.id), 10000);
      return () => clearInterval(interval);
    }
  }, [selectedConversation?.id]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchConversations = async () => {
    try {
      const response = await api.get('/communication/conversations');
      setConversations(response.data);
    } catch (error) {
      console.error('Failed to fetch conversations', error);
    }
  };

  const fetchMessages = async (conversationId: string) => {
    try {
      const response = await api.get(`/communication/conversations/${conversationId}/messages`);
      setMessages(response.data);
    } catch (error) {
      console.error('Failed to fetch messages', error);
    }
  };

  const handleSearchUsers = async (query: string) => {
    setSearchQuery(query);
    if (query.length < 2) { setSearchResults([]); return; }
    try {
      const response = await api.get(`/communication/users/search?query=${query}`);
      setSearchResults(response.data);
    } catch (error) {
      console.error('Failed to search users', error);
    }
  };

  const startNewChat = async (user: UserInfo) => {
    const existing = conversations.find(c =>
      !c.isGroup && c.participants.some(p => p.id === user.id)
    );

    if (existing) {
      setSelectedConversation(existing);
    } else {
      setSelectedConversation({
        id: '',
        isGroup: false,
        name: null,
        participants: [user],
        lastMessage: null,
        unreadCount: 0,
        updatedAt: new Date().toISOString()
      });
      setMessages([]);
    }
    setShowNewChat(false);
    setShowGroupForm(false);
    setSearchQuery('');
    setSearchResults([]);
  };

  const handleCreateGroupChat = async () => {
    if (!groupName || groupMembers.length === 0) return;
    try {
      const res = await api.post('/communication/group-chat', {
        name: groupName,
        participantIds: groupMembers.map(m => m.id),
      });
      await fetchConversations();
      const newConv = {
        id: res.data.id,
        isGroup: true,
        name: groupName,
        participants: groupMembers,
        lastMessage: null,
        unreadCount: 0,
        updatedAt: new Date().toISOString(),
      };
      setSelectedConversation(newConv);
      setShowGroupForm(false);
      setGroupName('');
      setGroupMembers([]);
    } catch (error) {
      console.error('Failed to create group', error);
    }
  };

  const handleTyping = useCallback(() => {
    if (!selectedConversation?.id || !socketRef.current) return;
    socketRef.current.emit('typing', {
      conversationId: selectedConversation.id,
      userId: currentUser?.id,
      fullName: currentUser?.fullName,
    });

    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => {
      socketRef.current?.emit('stop_typing', {
        conversationId: selectedConversation.id,
        userId: currentUser?.id,
      });
    }, 2000);
  }, [selectedConversation?.id, currentUser]);

  const handleSendNewMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedConversation) return;

    try {
      const payload: any = { content: newMessage };
      if (selectedConversation.id) {
        payload.conversationId = selectedConversation.id;
      } else {
        payload.recipientId = selectedConversation.participants[0].id;
      }

      const response = await api.post('/communication/messages', payload);

      setMessages(prev => [...prev, response.data]);
      setNewMessage('');
      await fetchConversations();

      if (!selectedConversation.id) {
        const updatedConvs = await api.get('/communication/conversations');
        const newConv = updatedConvs.data.find((c: Conversation) =>
          c.participants.some(p => p.id === selectedConversation.participants[0].id)
        );
        if (newConv) setSelectedConversation(newConv);
      }
    } catch (error) {
      console.error('Failed to send message', error);
    }
  };

  const getConversationName = (conv: Conversation) => {
    if (conv.isGroup && conv.name) return conv.name;
    return conv.participants[0]?.fullName || 'Unknown';
  };

  const getConversationInitial = (conv: Conversation) => {
    if (conv.isGroup) return conv.name?.charAt(0) || 'G';
    return conv.participants[0]?.fullName.charAt(0) || '?';
  };

  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-200px)] md:h-[600px] bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden">
      {/* Conversation List */}
      <div className="w-full md:w-1/3 border-b md:border-b-0 md:border-r border-gray-100 dark:border-slate-700 flex flex-col max-h-[40vh] md:max-h-none">
        <div className="p-4 border-b border-gray-100 dark:border-slate-700 flex justify-between items-center">
          <h2 className="font-semibold text-gray-800 dark:text-white">Messages</h2>
          <div className="flex gap-1">
            <button
              onClick={() => { setShowGroupForm(true); setShowNewChat(false); }}
              className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-full text-green-600"
              title="New group chat"
            >
              <Users size={18} />
            </button>
            <button
              onClick={() => { setShowNewChat(true); setShowGroupForm(false); }}
              className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-full text-blue-600"
              title="New chat"
            >
              <Plus size={20} />
            </button>
          </div>
        </div>

        {showGroupForm ? (
          <div className="p-4 space-y-3">
            <input
              type="text"
              placeholder="Group name..."
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 dark:text-white text-sm"
            />
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input
                type="text"
                placeholder="Add members..."
                value={searchQuery}
                onChange={(e) => handleSearchUsers(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 dark:text-white text-sm"
              />
            </div>
            {searchResults.map(u => (
              <div key={u.id} onClick={() => {
                if (!groupMembers.find(m => m.id === u.id)) setGroupMembers([...groupMembers, u]);
                setSearchQuery(''); setSearchResults([]);
              }} className="text-sm p-2 hover:bg-gray-50 dark:hover:bg-slate-700 rounded cursor-pointer flex items-center gap-2 dark:text-white">
                <div className="w-6 h-6 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center text-xs text-blue-600 dark:text-blue-400">{u.fullName.charAt(0)}</div>
                {u.fullName} <span className="text-xs text-gray-400">({u.role})</span>
              </div>
            ))}
            {groupMembers.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {groupMembers.map(m => (
                  <span key={m.id} className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-xs">
                    {m.fullName}
                    <button onClick={() => setGroupMembers(groupMembers.filter(g => g.id !== m.id))} className="text-blue-400 hover:text-blue-600">×</button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={handleCreateGroupChat} disabled={!groupName || groupMembers.length === 0} className="flex-1 px-3 py-2 bg-green-600 text-white rounded-lg text-sm disabled:opacity-50">Create Group</button>
              <button onClick={() => setShowGroupForm(false)} className="px-3 py-2 text-gray-500 text-sm">Cancel</button>
            </div>
          </div>
        ) : showNewChat ? (
          <div className="p-4">
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                placeholder="Search users..."
                value={searchQuery}
                onChange={(e) => handleSearchUsers(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-200 dark:border-slate-600 rounded-lg focus:outline-none focus:border-blue-500 bg-white dark:bg-slate-700 dark:text-white"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              {searchResults.map(user => (
                <div key={user.id} onClick={() => startNewChat(user)} className="flex items-center gap-3 p-2 hover:bg-gray-50 dark:hover:bg-slate-700 rounded-lg cursor-pointer">
                  <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center text-blue-600 dark:text-blue-400 font-medium">
                    {user.fullName.charAt(0)}
                  </div>
                  <div>
                    <p className="font-medium text-gray-800 dark:text-white">{user.fullName}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{user.role}</p>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={() => setShowNewChat(false)} className="mt-4 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">Cancel</button>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {conversations.map(conv => {
              const isActive = selectedConversation?.id === conv.id;
              return (
                <div
                  key={conv.id}
                  onClick={() => setSelectedConversation(conv)}
                  className={`p-4 border-b border-gray-50 dark:border-slate-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors ${
                    isActive ? 'bg-blue-50 dark:bg-blue-900/20 border-l-4 border-l-blue-600' : ''
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-medium ${
                      conv.isGroup
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                        : 'bg-gray-200 dark:bg-slate-600 text-gray-600 dark:text-gray-300'
                    }`}>
                      {conv.isGroup ? <Users size={18} /> : getConversationInitial(conv)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start">
                        <p className={`font-medium truncate ${conv.unreadCount > 0 ? 'text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}>
                          {getConversationName(conv)}
                        </p>
                        <div className="flex items-center gap-2">
                          {conv.unreadCount > 0 && (
                            <span className="bg-blue-600 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[20px] text-center">
                              {conv.unreadCount}
                            </span>
                          )}
                          <span className="text-xs text-gray-400 whitespace-nowrap">
                            {new Date(conv.updatedAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                      <p className={`text-sm truncate ${conv.unreadCount > 0 ? 'text-gray-700 dark:text-gray-200 font-medium' : 'text-gray-500 dark:text-gray-400'}`}>
                        {conv.lastMessage?.content || 'No messages yet'}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
            {conversations.length === 0 && (
              <div className="p-6 text-center text-gray-400 text-sm">
                No conversations yet. Start a new chat!
              </div>
            )}
          </div>
        )}
      </div>

      {/* Message Pane */}
      <div className="flex-1 flex flex-col">
        {selectedConversation ? (
          <>
            <div className="p-4 border-b border-gray-100 dark:border-slate-700 flex items-center gap-3 bg-gray-50 dark:bg-slate-700">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-medium ${
                selectedConversation.isGroup
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                  : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
              }`}>
                {selectedConversation.isGroup ? <Users size={18} /> : getConversationInitial(selectedConversation)}
              </div>
              <div>
                <h3 className="font-semibold text-gray-800 dark:text-white">{getConversationName(selectedConversation)}</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {selectedConversation.isGroup
                    ? `${selectedConversation.participants.length} members`
                    : selectedConversation.participants[0]?.role}
                </p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/50 dark:bg-slate-900/50">
              {messages.map(msg => {
                const isMyMessage = msg.senderId === currentUser?.id;
                return (
                  <div key={msg.id} className={`flex ${isMyMessage ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[70%] rounded-2xl px-4 py-2 ${
                      isMyMessage
                        ? 'bg-blue-600 text-white rounded-br-none'
                        : 'bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 text-gray-800 dark:text-white rounded-bl-none'
                    }`}>
                      {/* Show sender name in group chats */}
                      {selectedConversation.isGroup && !isMyMessage && (
                        <p className="text-xs font-medium mb-1 opacity-70">{msg.sender.fullName}</p>
                      )}
                      <p>{msg.content}</p>
                      <div className={`flex items-center gap-1 mt-1 ${isMyMessage ? 'justify-end' : ''}`}>
                        <span className={`text-[10px] ${isMyMessage ? 'text-blue-100' : 'text-gray-400'}`}>
                          {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {/* Read receipt indicators */}
                        {isMyMessage && (
                          msg.isRead
                            ? <CheckCheck size={12} className="text-blue-200" />
                            : <Check size={12} className="text-blue-300/50" />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Typing indicator */}
              {typingUsers.length > 0 && (
                <div className="flex items-center gap-2 text-sm text-gray-400 dark:text-gray-500 italic">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  {typingUsers.join(', ')} typing...
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            <form onSubmit={handleSendNewMessage} className="p-4 border-t border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-800">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => {
                    setNewMessage(e.target.value);
                    handleTyping();
                  }}
                  placeholder="Type a message..."
                  className="flex-1 px-4 py-2 border border-gray-200 dark:border-slate-600 rounded-lg focus:outline-none focus:border-blue-500 bg-white dark:bg-slate-700 dark:text-white"
                />
                <button
                  type="submit"
                  disabled={!newMessage.trim()}
                  className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-slate-600 transition-colors"
                >
                  <Send size={20} />
                </button>
              </div>
            </form>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400 dark:text-gray-500">
            <MessageSquare size={48} className="mb-4 opacity-20" />
            <p>Select a conversation to start messaging</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatInterface;
