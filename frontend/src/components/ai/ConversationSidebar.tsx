import { useState, useRef, useEffect } from 'react';
import { Plus, MessageSquare, MoreHorizontal, Pencil, Trash2, Check, X, Search } from 'lucide-react';
import type { MasterAIConversation } from '../../services/masterAIService';

function groupConversationsByDate(conversations: MasterAIConversation[]) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const last7 = new Date(today.getTime() - 7 * 86400000);
  const last30 = new Date(today.getTime() - 30 * 86400000);

  const groups: { label: string; items: MasterAIConversation[] }[] = [
    { label: 'Today', items: [] },
    { label: 'Yesterday', items: [] },
    { label: 'Previous 7 Days', items: [] },
    { label: 'Previous 30 Days', items: [] },
    { label: 'Older', items: [] },
  ];

  for (const c of conversations) {
    const d = new Date(c.updatedAt);
    if (d >= today) groups[0].items.push(c);
    else if (d >= yesterday) groups[1].items.push(c);
    else if (d >= last7) groups[2].items.push(c);
    else if (d >= last30) groups[3].items.push(c);
    else groups[4].items.push(c);
  }

  return groups.filter(g => g.items.length > 0);
}

export const ConversationSidebar = ({
  open,
  conversations,
  activeId,
  onNewChat,
  onSelect,
  onDelete,
  onRename,
  onClose,
}: {
  open: boolean;
  conversations: MasterAIConversation[];
  activeId: string | null;
  onNewChat: () => void;
  onSelect: (id: string) => void;
  onDelete: (conversation: MasterAIConversation) => void;
  onRename: (conversation: MasterAIConversation, title: string) => void;
  onClose: () => void;
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const filtered = searchQuery
    ? conversations.filter(c => c.title.toLowerCase().includes(searchQuery.toLowerCase()))
    : conversations;
  const groups = groupConversationsByDate(filtered);

  return (
    <>
      <div
        className={`${
          open ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        } ${
          open ? 'w-72' : 'w-0 md:w-0'
        } transition-all duration-300 flex-shrink-0 border-r border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex flex-col fixed md:relative inset-y-0 left-0 z-30 md:z-auto shadow-xl md:shadow-none h-full`}
      >
        {/* Sidebar Header */}
        <div className="p-3 flex-shrink-0">
          <button
            onClick={onNewChat}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-600 hover:bg-surface-hover transition-colors text-sm font-medium text-gray-700 dark:text-gray-200 shadow-sm"
          >
            <Plus size={18} />
            New Chat
          </button>
        </div>

        {/* Search */}
        <div className="px-3 pb-2 flex-shrink-0">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search conversations..."
              aria-label="Search conversations"
              className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-700 dark:text-gray-200 placeholder-gray-400 outline-none transition-colors"
              style={{ boxShadow: 'none' }}
            />
          </div>
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {conversations.length === 0 ? (
            <div className="text-center py-8 px-4">
              <MessageSquare size={24} className="mx-auto text-gray-300 dark:text-gray-600 mb-2" />
              <p className="text-xs text-gray-400 dark:text-gray-500">No conversations yet</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Start a new chat to begin</p>
            </div>
          ) : (
            groups.map(group => (
              <div key={group.label} className="mb-3">
                <p className="px-3 py-1.5 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                  {group.label}
                </p>
                {group.items.map(convo => (
                  <ConversationItem
                    key={convo.id}
                    conversation={convo}
                    isActive={convo.id === activeId}
                    onClick={() => onSelect(convo.id)}
                    onDelete={() => onDelete(convo)}
                    onRename={title => onRename(convo, title)}
                  />
                ))}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Mobile Overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-20 md:hidden"
          onClick={onClose}
        />
      )}
    </>
  );
};

const ConversationItem = ({
  conversation,
  isActive,
  onClick,
  onDelete,
  onRename,
}: {
  conversation: MasterAIConversation;
  isActive: boolean;
  onClick: () => void;
  onDelete: () => void;
  onRename: (title: string) => void;
}) => {
  const [showMenu, setShowMenu] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(conversation.title);
  const renameRef = useRef<HTMLInputElement>(null);
  const itemRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isRenaming) renameRef.current?.focus();
  }, [isRenaming]);

  // Close the menu on outside click or Escape
  useEffect(() => {
    if (!showMenu) return;
    const onPointer = (e: MouseEvent) => {
      if (!itemRef.current?.contains(e.target as Node)) setShowMenu(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowMenu(false); };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [showMenu]);

  const handleRenameSubmit = () => {
    if (renameValue.trim() && renameValue !== conversation.title) {
      onRename(renameValue.trim());
    }
    setIsRenaming(false);
    setShowMenu(false);
  };

  return (
    <div
      ref={itemRef}
      onClick={isRenaming ? undefined : onClick}
      className={`group relative flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
        isActive
          ? 'text-primary font-medium'
          : 'text-gray-700 dark:text-gray-300 hover:bg-surface-hover'
      }`}
      style={isActive ? { backgroundColor: 'color-mix(in srgb, var(--primary-color) 10%, transparent)' } : undefined}
    >
      <MessageSquare size={14} className="flex-shrink-0 opacity-50" />

      {isRenaming ? (
        <div className="flex-1 flex items-center gap-1 min-w-0">
          <input
            ref={renameRef}
            value={renameValue}
            onChange={e => setRenameValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleRenameSubmit(); if (e.key === 'Escape') { setIsRenaming(false); setShowMenu(false); } }}
            className="flex-1 text-xs bg-white dark:bg-slate-600 border border-gray-300 dark:border-slate-500 focus:border-primary rounded px-2 py-1 outline-none text-gray-900 dark:text-white min-w-0"
            aria-label="Conversation name"
            onClick={e => e.stopPropagation()}
          />
          <button onClick={(e) => { e.stopPropagation(); handleRenameSubmit(); }} className="p-0.5 text-green-600 hover:text-green-700" aria-label="Save name"><Check size={14} /></button>
          <button onClick={(e) => { e.stopPropagation(); setIsRenaming(false); setShowMenu(false); }} className="p-0.5 text-gray-400 hover:text-gray-600" aria-label="Cancel rename"><X size={14} /></button>
        </div>
      ) : (
        <>
          <span className="flex-1 text-xs truncate">{conversation.title}</span>
          <div className={`flex items-center gap-0.5 ${isActive || showMenu ? 'opacity-100' : 'opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100'} transition-opacity`}>
            <button
              onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
              className="p-1 rounded hover:bg-surface-hover transition-colors"
              aria-label={`Options for ${conversation.title}`}
              aria-haspopup="menu"
              aria-expanded={showMenu}
            >
              <MoreHorizontal size={14} />
            </button>
          </div>
        </>
      )}

      {/* Dropdown menu */}
      {showMenu && !isRenaming && (
        <div role="menu" className="absolute right-0 top-full mt-1 z-50 bg-white dark:bg-slate-700 rounded-lg shadow-lg border border-gray-200 dark:border-slate-600 py-1 min-w-[120px]">
          <button
            role="menuitem"
            onClick={(e) => { e.stopPropagation(); setIsRenaming(true); setRenameValue(conversation.title); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 dark:text-gray-200 hover:bg-surface-hover"
          >
            <Pencil size={12} /> Rename
          </button>
          <button
            role="menuitem"
            onClick={(e) => { e.stopPropagation(); setShowMenu(false); onDelete(); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-600 dark:text-red-400 hover:bg-surface-hover-danger"
          >
            <Trash2 size={12} /> Delete
          </button>
        </div>
      )}
    </div>
  );
};
