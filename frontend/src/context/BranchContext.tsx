import React, { createContext, useState, useContext, ReactNode, useEffect, useCallback } from 'react';
import api from '../utils/api';

interface Branch {
    id: string;
    name: string;
    code: string;
    status: 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE';
    isMain: boolean;
    _count?: {
        students: number;
        users: number;
        classes: number;
    };
}

interface BranchContextType {
    branches: Branch[];
    selectedBranchId: string | null;
    selectedBranch: Branch | null;
    setSelectedBranchId: (id: string | null) => void;
    loading: boolean;
    refreshBranches: () => Promise<void>;
    isAllBranchesSelected: boolean;
}

const BranchContext = createContext<BranchContextType | undefined>(undefined);

export const BranchProvider = ({ children }: { children: ReactNode }) => {
    const [branches, setBranches] = useState<Branch[]>([]);
    const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchBranches = useCallback(async () => {
        try {
            setLoading(true);
            const response = await api.get('/branches');
            setBranches(response.data);

            // If no branch selected and there's a main branch, select it
            if (!selectedBranchId && response.data.length > 0) {
                const mainBranch = response.data.find((b: Branch) => b.isMain);
                // Don't auto-select, keep as "All Branches" for admins
            }
        } catch (error) {
            console.error('Failed to fetch branches', error);
        } finally {
            setLoading(false);
        }
    }, [selectedBranchId]);

    useEffect(() => {
        fetchBranches();
    }, []);

    const selectedBranch = branches.find(b => b.id === selectedBranchId) || null;
    const isAllBranchesSelected = selectedBranchId === null;

    return (
        <BranchContext.Provider
            value={{
                branches,
                selectedBranchId,
                selectedBranch,
                setSelectedBranchId,
                loading,
                refreshBranches: fetchBranches,
                isAllBranchesSelected,
            }}
        >
            {children}
        </BranchContext.Provider>
    );
};

export const useBranch = () => {
    const context = useContext(BranchContext);
    if (context === undefined) {
        throw new Error('useBranch must be used within a BranchProvider');
    }
    return context;
};
