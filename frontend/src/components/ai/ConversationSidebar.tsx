import { ReactNode } from 'react';
import { Plus, MessageSquare, Trash2 } from 'lucide-react';

export interface SidebarConversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  _count?: { messages: number };
}

interface ConversationSidebarProps {
  conversations: SidebarConversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
  accentColor?: 'purple' | 'emerald' | 'blue';
  newButtonLabel?: string;
  /** Extra content rendered below the conversation list (e.g. Favorites) */
  footer?: ReactNode;
  /** Extra content rendered above the list (e.g. Search input) */
  header?: ReactNode;
}

const activeBg = {
  purple: 'bg-purple-50 dark:bg-purple-900/30 border-l-2 border-purple-500',
  emerald: 'bg-emerald-50 dark:bg-emerald-900/30 border-l-2 border-emerald-500',
  blue: 'bg-blue-50 dark:bg-blue-900/30 border-l-2 border-blue-500',
} as const;

const newBtnBg = {
  purple: 'bg-purple-600 hover:bg-purple-700',
  emerald: 'bg-emerald-600 hover:bg-emerald-700',
  blue: 'bg-blue-600 hover:bg-blue-700',
} as const;

export default function ConversationSidebar({
  conversations,
  activeId,
  onSelect,
  onCreate,
  onDelete,
  accentColor = 'purple',
  newButtonLabel = 'New Conversation',
  footer,
  header,
}: ConversationSidebarProps) {
  return (
    <div className="flex flex-col h-full">
      {/* New conversation button */}
      <div className="p-3">
        <button
          onClick={onCreate}
          className={`w-full flex items-center justify-center gap-2 py-2.5 px-4 ${newBtnBg[accentColor]} text-white rounded-xl text-sm font-medium transition-colors`}
        >
          <Plus className="w-4 h-4" /> {newButtonLabel}
        </button>
      </div>

      {header}

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto px-2">
        {conversations.length === 0 ? (
          <div className="text-center py-8 text-gray-400 dark:text-slate-500">
            <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-xs">No conversations yet</p>
          </div>
        ) : (
          conversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => onSelect(conv.id)}
              className={`group w-full text-left px-3 py-2.5 rounded-lg mb-1 transition-colors ${
                activeId === conv.id
                  ? activeBg[accentColor]
                  : 'hover:bg-gray-100 dark:hover:bg-slate-800'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {conv.title}
                  </p>
                  <p className="text-[10px] text-gray-400 dark:text-slate-500">
                    {new Date(conv.updatedAt || conv.createdAt).toLocaleDateString()}
                    {conv._count?.messages != null && ` · ${conv._count.messages} msgs`}
                  </p>
                </div>
                <button
                  onClick={(e) => onDelete(conv.id, e)}
                  className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 transition-all"
                  title="Delete"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </button>
          ))
        )}
      </div>

      {footer}
    </div>
  );
}
