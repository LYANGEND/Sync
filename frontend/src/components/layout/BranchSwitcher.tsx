import React from 'react';
import { GitBranch, ChevronDown, Building, Check } from 'lucide-react';
import { useBranch } from '../../context/BranchContext';
import { useAuth } from '../../context/AuthContext';

interface BranchSwitcherProps {
    className?: string;
}

const BranchSwitcher: React.FC<BranchSwitcherProps> = ({ className = '' }) => {
    const { user } = useAuth();
    const { branches, selectedBranchId, setSelectedBranchId, selectedBranch, loading } = useBranch();
    const [isOpen, setIsOpen] = React.useState(false);

    // Only show for roles that can view multiple branches
    const canSwitchBranches = ['SUPER_ADMIN', 'BRANCH_MANAGER'].includes(user?.role || '');

    if (!canSwitchBranches) return null;

    // For BRANCH_MANAGER, show their branch but don't allow switching
    if (user?.role === 'BRANCH_MANAGER') {
        const userBranch = branches.find(b => b.id === user.branchId);
        return (
            <div className={`flex items-center gap-2 px-3 py-2 bg-slate-800 rounded-lg text-sm ${className}`}>
                <Building size={16} className="text-blue-400" />
                <span className="text-white font-medium">{userBranch?.name || 'My Branch'}</span>
            </div>
        );
    }

    return (
        <div className={`relative ${className}`}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm transition-colors"
            >
                <GitBranch size={16} className="text-blue-400" />
                <span className="text-white font-medium max-w-[150px] truncate">
                    {loading ? 'Loading...' : selectedBranch?.name || 'All Branches'}
                </span>
                <ChevronDown size={16} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <>
                    {/* Backdrop */}
                    <div
                        className="fixed inset-0 z-40"
                        onClick={() => setIsOpen(false)}
                    />

                    {/* Dropdown */}
                    <div className="absolute top-full left-0 mt-1 w-64 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50 overflow-hidden">
                        <div className="p-2 border-b border-slate-700">
                            <p className="text-xs text-slate-400 uppercase tracking-wider px-2">Select Branch</p>
                        </div>

                        <div className="max-h-64 overflow-y-auto">
                            {/* All Branches option */}
                            <button
                                onClick={() => {
                                    setSelectedBranchId(null);
                                    setIsOpen(false);
                                }}
                                className={`w-full flex items-center justify-between px-3 py-2 hover:bg-slate-700 transition-colors ${selectedBranchId === null ? 'bg-blue-600/20' : ''
                                    }`}
                            >
                                <div className="flex items-center gap-2">
                                    <Building size={16} className="text-slate-400" />
                                    <span className="text-white">All Branches</span>
                                </div>
                                {selectedBranchId === null && <Check size={16} className="text-blue-400" />}
                            </button>

                            {/* Branch list */}
                            {branches.map((branch) => (
                                <button
                                    key={branch.id}
                                    onClick={() => {
                                        setSelectedBranchId(branch.id);
                                        setIsOpen(false);
                                    }}
                                    className={`w-full flex items-center justify-between px-3 py-2 hover:bg-slate-700 transition-colors ${selectedBranchId === branch.id ? 'bg-blue-600/20' : ''
                                        }`}
                                >
                                    <div className="flex items-center gap-2">
                                        <Building size={16} className={branch.isMain ? 'text-blue-400' : 'text-slate-400'} />
                                        <div className="text-left">
                                            <span className="text-white block">{branch.name}</span>
                                            <span className="text-xs text-slate-400">{branch.code}</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {branch.isMain && (
                                            <span className="text-xs bg-blue-600/30 text-blue-400 px-1.5 py-0.5 rounded">Main</span>
                                        )}
                                        {selectedBranchId === branch.id && <Check size={16} className="text-blue-400" />}
                                    </div>
                                </button>
                            ))}
                        </div>

                        {branches.length === 0 && !loading && (
                            <div className="p-4 text-center text-slate-400 text-sm">
                                No branches found
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};

export default BranchSwitcher;
