import React, { useState, useEffect, useRef } from 'react';
import api from '../../utils/api';
import { Search, Send, User, MessageSquare, Plus } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface User {
  id: string;
  fullName: string;
  role: string;
  email: string;
}

interface Message {
  id: string;
  content: string;
  senderId: string;
  createdAt: string;
  sender: {
    id: string;
    fullName: string;
  };
}

interface Conversation {
  id: string;
  participants: User[];
  lastMessage: {
    content: string;
    createdAt: string;
    isRead: boolean;
    senderId: string;
  } | null;
  updatedAt: string;
}

const ChatInterface = () => {
  const { user: currentUser } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [showNewChat, setShowNewChat] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchConversations();
  }, []);

  useEffect(() => {
    if (selectedConversation && selectedConversation.id) {
      fetchMessages(selectedConversation.id);
      const interval = setInterval(() => {
        fetchMessages(selectedConversation.id);
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [selectedConversation]);

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
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    try {
      const response = await api.get(`/communication/users/search?query=${query}`);
      setSearchResults(response.data);
    } catch (error) {
      console.error('Failed to search users', error);
    }
  };

  const startNewChat = async (user: User) => {
    const existing = conversations.find(c => 
      c.participants.some(p => p.id === user.id)
    );

    if (existing) {
      setSelectedConversation(existing);
      setShowNewChat(false);
      setSearchQuery('');
      setSearchResults([]);
    } else {
      const fakeConv: Conversation = {
        id: '',
        participants: [user],
        lastMessage: null,
        updatedAt: new Date().toISOString()
      };
      setSelectedConversation(fakeConv);
      setMessages([]);
      setShowNewChat(false);
      setSearchQuery('');
      setSearchResults([]);
    }
  };

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
      
      setMessages([...messages, response.data]);
      setNewMessage('');
      await fetchConversations();
      
      if (!selectedConversation.id) {
        const updatedConvs = await api.get('/communication/conversations');
        const newConv = updatedConvs.data.find((c: Conversation) => 
            c.participants.some(p => p.id === selectedConversation.participants[0].id)
        );
        if (newConv) {
            setSelectedConversation(newConv);
        }
      }
    } catch (error) {
      console.error('Failed to send message', error);
    }
  };

  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-200px)] md:h-[600px] bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden">
      <div className="w-full md:w-1/3 border-b md:border-b-0 md:border-r border-gray-100 dark:border-slate-700 flex flex-col max-h-[40vh] md:max-h-none">
        <div className="p-4 border-b border-gray-100 dark:border-slate-700 flex justify-between items-center">
          <h2 className="font-semibold text-gray-800 dark:text-white">Messages</h2>
          <button 
            onClick={() => setShowNewChat(true)}
            className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-full text-blue-600"
          >
            <Plus size={20} />
          </button>
        </div>

        {showNewChat ? (
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
                <div 
                  key={user.id}
                  onClick={() => startNewChat(user)}
                  className="flex items-center gap-3 p-2 hover:bg-gray-50 dark:hover:bg-slate-700 rounded-lg cursor-pointer"
                >
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
            <button 
              onClick={() => setShowNewChat(false)}
              className="mt-4 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {conversations.map(conv => {
              const otherUser = conv.participants[0];
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
                    <div className="w-10 h-10 bg-gray-200 dark:bg-slate-600 rounded-full flex items-center justify-center text-gray-600 dark:text-gray-300 font-medium">
                      {otherUser?.fullName.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start">
                        <p className="font-medium text-gray-800 dark:text-white truncate">{otherUser?.fullName}</p>
                        <span className="text-xs text-gray-400 whitespace-nowrap">
                          {new Date(conv.updatedAt).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                        {conv.lastMessage?.content || 'No messages yet'}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col">
        {selectedConversation ? (
          <>
            <div className="p-4 border-b border-gray-100 dark:border-slate-700 flex items-center gap-3 bg-gray-50 dark:bg-slate-700">
              <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center text-blue-600 dark:text-blue-400 font-medium">
                {selectedConversation.participants[0]?.fullName.charAt(0)}
              </div>
              <div>
                <h3 className="font-semibold text-gray-800 dark:text-white">{selectedConversation.participants[0]?.fullName}</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">{selectedConversation.participants[0]?.role}</p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/50 dark:bg-slate-900/50">
              {messages.map(msg => {
                const isMe = msg.senderId === currentUser?.id;
                const isMeFallback = msg.senderId !== selectedConversation.participants[0].id;
                const isMyMessage = currentUser ? isMe : isMeFallback;

                return (
                  <div 
                    key={msg.id} 
                    className={`flex ${isMyMessage ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-[70%] rounded-2xl px-4 py-2 ${
                      isMyMessage 
                        ? 'bg-blue-600 text-white rounded-br-none' 
                        : 'bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 text-gray-800 dark:text-white rounded-bl-none'
                    }`}>
                      <p>{msg.content}</p>
                      <p className={`text-[10px] mt-1 ${isMyMessage ? 'text-blue-100' : 'text-gray-400'}`}>
                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            <form onSubmit={handleSendNewMessage} className="p-4 border-t border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-800">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
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