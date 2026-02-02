import { BookOpen, ClipboardList, Mail, Zap, Sparkles } from 'lucide-react';

interface SlashCommand {
    id: string;
    label: string;
    description: string;
    icon: any;
    action: () => void;
}

interface SlashCommandMenuProps {
    onSelect: (command: SlashCommand) => void;
    onClose: () => void;
    position: { top: number; left: number };
}

const SlashCommandMenu = ({ onSelect, onClose, position }: SlashCommandMenuProps) => {
    const commands: SlashCommand[] = [
        {
            id: 'lesson',
            label: '/lesson',
            description: 'Generate a lesson plan',
            icon: BookOpen,
            action: () => {},
        },
        {
            id: 'quiz',
            label: '/quiz',
            description: 'Create a quiz or assessment',
            icon: ClipboardList,
            action: () => {},
        },
        {
            id: 'email',
            label: '/email',
            description: 'Draft an email',
            icon: Mail,
            action: () => {},
        },
        {
            id: 'tips',
            label: '/tips',
            description: 'Get teaching tips',
            icon: Sparkles,
            action: () => {},
        },
        {
            id: 'quick',
            label: '/quick',
            description: 'Quick classroom management advice',
            icon: Zap,
            action: () => {},
        },
    ];

    return (
        <div
            className="absolute z-50 w-80 bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-gray-200 dark:border-slate-700 overflow-hidden"
            style={{ top: position.top, left: position.left }}
        >
            <div className="p-2 bg-gray-50 dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 px-2">
                    Slash Commands
                </p>
            </div>
            <div className="max-h-64 overflow-y-auto">
                {commands.map((command) => (
                    <button
                        key={command.id}
                        onClick={() => {
                            onSelect(command);
                            onClose();
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-blue-50 dark:hover:bg-slate-700 transition-colors text-left"
                    >
                        <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                            <command.icon size={16} className="text-blue-600 dark:text-blue-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900 dark:text-white text-sm">
                                {command.label}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                {command.description}
                            </p>
                        </div>
                    </button>
                ))}
            </div>
            <div className="p-2 bg-gray-50 dark:bg-slate-900 border-t border-gray-200 dark:border-slate-700">
                <p className="text-xs text-gray-400 dark:text-gray-500 px-2">
                    Type / to see commands
                </p>
            </div>
        </div>
    );
};

export default SlashCommandMenu;
