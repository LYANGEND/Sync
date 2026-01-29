import { useState, useRef, useEffect } from 'react';
import { Building, ChevronDown, Check, Search } from 'lucide-react';
import { useBranch, Branch } from '../../context/BranchContext';

const BranchSwitcher = () => {
    const { branches, selectedBranch, setSelectedBranch, loading } = useBranch();
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
                setSearchTerm('');
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Don't show if only one branch
    if (branches.length <= 1) {
        return null;
    }

    const filteredBranches = branches.filter(branch =>
        branch.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        branch.code.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const getStatusDot = (status: string) => {
        switch (status) {
            case 'ACTIVE':
                return 'bg-green-500';
            case 'INACTIVE':
                return 'bg-gray-400';
            case 'MAINTENANCE':
                return 'bg-yellow-500';
            default:
                return 'bg-gray-400';
        }
    };

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                disabled={loading}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors text-sm font-medium text-gray-700 dark:text-gray-200"
            >
                <Building size={18} className="text-gray-500 dark:text-gray-400" />
                <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${getStatusDot(selectedBranch?.status || 'ACTIVE')}`} />
                    <span className="max-w-[150px] truncate">
                        {loading ? 'Loading...' : selectedBranch?.name || 'Select Branch'}
                    </span>
                </div>
                <ChevronDown size={16} className={`text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <div className="absolute top-full left-0 mt-2 w-72 bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 shadow-xl z-50 overflow-hidden">
                    {/* Search */}
                    <div className="p-3 border-b border-gray-200 dark:border-slate-700">
                        <div className="relative">
                            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Search branches..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-slate-600 rounded-lg bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                autoFocus
                            />
                        </div>
                    </div>

                    {/* Branch List */}
                    <div className="max-h-64 overflow-y-auto">
                        {filteredBranches.length === 0 ? (
                            <div className="p-4 text-center text-gray-500 text-sm">No branches found</div>
                        ) : (
                            filteredBranches.map((branch) => (
                                <button
                                    key={branch.id}
                                    onClick={() => {
                                        setSelectedBranch(branch);
                                        setIsOpen(false);
                                        setSearchTerm('');
                                    }}
                                    className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors ${selectedBranch?.id === branch.id ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                                        }`}
                                >
                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${branch.isMain
                                            ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                                            : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                                        }`}>
                                        <Building size={16} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium text-gray-900 dark:text-white truncate">
                                                {branch.name}
                                            </span>
                                            {branch.isMain && (
                                                <span className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 px-1.5 py-0.5 rounded">
                                                    Main
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2 text-xs text-gray-500">
                                            <span className={`w-1.5 h-1.5 rounded-full ${getStatusDot(branch.status)}`} />
                                            <span>{branch.code}</span>
                                            {branch._count && (
                                                <>
                                                    <span>•</span>
                                                    <span>{branch._count.students} students</span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    {selectedBranch?.id === branch.id && (
                                        <Check size={16} className="text-blue-600 dark:text-blue-400 flex-shrink-0" />
                                    )}
                                </button>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default BranchSwitcher;
