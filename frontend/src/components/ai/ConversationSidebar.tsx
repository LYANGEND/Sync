import { useState, useRef, useEffect } from 'react';
import {
  MessageSquare, MoreHorizontal, Pencil, Trash2, Check, X, Search, SquarePen, PanelLeft, PanelLeftClose,
} from 'lucide-react';
import type { MasterAIConversation } from '../../services/masterAIService';

const COLLAPSED_KEY = 'sync.masterai.sidebar.collapsed';

const readCollapsed = () => {
  try { return localStorage.getItem(COLLAPSED_KEY) === 'true'; } catch { return false; }
};

const ROW_CLASS = 'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-gray-700 dark:text-gray-200 hover:bg-surface-hover transition-colors';
const ICON_BUTTON_CLASS = 'p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-surface-hover transition-colors';

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

/**
 * Chat history column. On desktop it is part of the page and collapses to an icon rail;
 * on mobile it opens as a drawer over the chat.
 */
export const ConversationSidebar = ({
  mobileOpen,
  onMobileClose,
  conversations,
  activeId,
  onNewChat,
  onSelect,
  onDelete,
  onRename,
}: {
  mobileOpen: boolean;
  onMobileClose: () => void;
  conversations: MasterAIConversation[];
  activeId: string | null;
  onNewChat: () => void;
  onSelect: (id: string) => void;
  onDelete: (conversation: MasterAIConversation) => void;
  onRename: (conversation: MasterAIConversation, title: string) => void;
}) => {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [searchQuery, setSearchQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const filtered = searchQuery
    ? conversations.filter(c => c.title.toLowerCase().includes(searchQuery.toLowerCase()))
    : conversations;
  const groups = groupConversationsByDate(filtered);

  const setCollapsedSaved = (next: boolean) => {
    setCollapsed(next);
    try { localStorage.setItem(COLLAPSED_KEY, String(next)); } catch { /* the preference is optional */ }
  };

  const openSearch = () => {
    setCollapsedSaved(false);
    requestAnimationFrame(() => searchRef.current?.focus());
  };

  const panel = (closeButton: React.ReactNode, afterNewChat?: () => void, inputRef?: React.Ref<HTMLInputElement>) => (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between pl-4 pr-2 pt-2.5 pb-1 flex-shrink-0">
        <span className="text-sm font-semibold text-gray-900 dark:text-white">Chats</span>
        {closeButton}
      </div>

      <div className="px-2 pt-1 flex-shrink-0">
        <button onClick={() => { onNewChat(); afterNewChat?.(); }} className={`${ROW_CLASS} font-medium`}>
          <SquarePen size={16} className="flex-shrink-0" />
          New chat
        </button>
      </div>

      <div className="px-2 pt-1 pb-2 flex-shrink-0">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search chats"
            aria-label="Search chats"
            className="w-full pl-8 pr-3 py-2 text-sm rounded-lg bg-transparent hover:bg-surface-hover focus:bg-white dark:focus:bg-slate-700 border border-transparent focus:border-gray-200 dark:focus:border-slate-600 text-gray-700 dark:text-gray-200 placeholder-gray-500 dark:placeholder-gray-400 outline-none transition-colors"
            style={{ boxShadow: 'none' }}
          />
        </div>
      </div>

      <nav aria-label="Chat history" className="flex-1 overflow-y-auto px-2 pb-3">
        {conversations.length === 0 ? (
          <div className="text-center py-8 px-4">
            <MessageSquare size={24} className="mx-auto text-gray-300 dark:text-gray-600 mb-2" />
            <p className="text-xs text-gray-400 dark:text-gray-500">No conversations yet</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Start a new chat to begin</p>
          </div>
        ) : (
          groups.map(group => (
            <div key={group.label} className="mb-4">
              <p className="px-2.5 pb-1 text-xs font-medium text-gray-500 dark:text-gray-400">
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
      </nav>
    </div>
  );

  return (
    <>
      {/* Desktop: fixed column or icon rail */}
      <aside
        className={`hidden md:flex flex-col flex-shrink-0 h-full border-r border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/60 ${collapsed ? 'w-14' : 'w-64'}`}
      >
        {collapsed ? (
          <div className="flex flex-col items-center gap-1 py-2.5">
            <button onClick={() => setCollapsedSaved(false)} className={ICON_BUTTON_CLASS} title="Open sidebar" aria-label="Open sidebar">
              <PanelLeft size={18} />
            </button>
            <button onClick={onNewChat} className={ICON_BUTTON_CLASS} title="New chat" aria-label="New chat">
              <SquarePen size={18} />
            </button>
            <button onClick={openSearch} className={ICON_BUTTON_CLASS} title="Search chats" aria-label="Search chats">
              <Search size={18} />
            </button>
          </div>
        ) : panel(
          <button onClick={() => setCollapsedSaved(true)} className={ICON_BUTTON_CLASS} title="Close sidebar" aria-label="Close sidebar">
            <PanelLeftClose size={18} />
          </button>,
          undefined,
          searchRef,
        )}
      </aside>

      {/* Mobile: drawer over the chat */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-[60]">
          <div className="absolute inset-0 bg-black/50" onClick={onMobileClose} />
          <aside className="relative h-full w-72 max-w-[85%] bg-gray-50 dark:bg-slate-800 shadow-xl" aria-label="Chat history">
            {panel(
              <button onClick={onMobileClose} className={ICON_BUTTON_CLASS} aria-label="Close chat history">
                <X size={18} />
              </button>,
              onMobileClose,
            )}
          </aside>
        </div>
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
          <span className="flex-1 text-sm truncate">{conversation.title}</span>
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
