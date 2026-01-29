import { useState } from 'react';
import { BarChart3, GitCompare, Layers, Building } from 'lucide-react';
import Branches from './Branches';
import BranchDashboard from './BranchDashboard';
import BranchAnalytics from './BranchAnalytics';
import BranchComparison from './BranchComparison';
import BranchBulkOperations from './BranchBulkOperations';

type TabType = 'branches' | 'dashboard' | 'analytics' | 'comparison' | 'bulk';

const BranchManagement = () => {
    const [activeTab, setActiveTab] = useState<TabType>('branches');

    return (
        <div className="p-6">
            {/* Header */}
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Branch Management</h1>
                    <p className="text-gray-500 dark:text-gray-400">Manage school campuses and locations</p>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex space-x-1 bg-gray-100 dark:bg-slate-800 p-1 rounded-lg w-fit mb-6">
                <button
                    onClick={() => setActiveTab('branches')}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                        activeTab === 'branches'
                            ? 'bg-white dark:bg-slate-700 text-gray-800 dark:text-white shadow-sm'
                            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                >
                    All Branches
                </button>
                <button
                    onClick={() => setActiveTab('dashboard')}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                        activeTab === 'dashboard'
                            ? 'bg-white dark:bg-slate-700 text-gray-800 dark:text-white shadow-sm'
                            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                >
                    Dashboard
                </button>
                <button
                    onClick={() => setActiveTab('analytics')}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${
                        activeTab === 'analytics'
                            ? 'bg-white dark:bg-slate-700 text-gray-800 dark:text-white shadow-sm'
                            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                >
                    <BarChart3 size={16} />
                    Analytics
                </button>
                <button
                    onClick={() => setActiveTab('comparison')}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${
                        activeTab === 'comparison'
                            ? 'bg-white dark:bg-slate-700 text-gray-800 dark:text-white shadow-sm'
                            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                >
                    <GitCompare size={16} />
                    Compare
                </button>
                <button
                    onClick={() => setActiveTab('bulk')}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${
                        activeTab === 'bulk'
                            ? 'bg-white dark:bg-slate-700 text-gray-800 dark:text-white shadow-sm'
                            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                >
                    <Layers size={16} />
                    Bulk Ops
                </button>
            </div>

            {/* Tab Content */}
            <div className="transition-opacity duration-200">
                {activeTab === 'branches' && <Branches embedded />}
                {activeTab === 'dashboard' && <BranchDashboard embedded />}
                {activeTab === 'analytics' && <BranchAnalytics embedded />}
                {activeTab === 'comparison' && <BranchComparison embedded />}
                {activeTab === 'bulk' && <BranchBulkOperations embedded />}
            </div>
        </div>
    );
};

export default BranchManagement;
