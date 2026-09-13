import React, { createContext, useState, useContext, ReactNode, useEffect, useCallback } from 'react';
import api from '../utils/api';
import { useAuth } from './AuthContext';

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
    const { isAuthenticated, isLoading: authLoading, user } = useAuth();
    const [branches, setBranches] = useState<Branch[]>([]);
    const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchBranches = useCallback(async () => {
        if (authLoading || !isAuthenticated || user?.role === 'PLATFORM_ADMIN') {
            setBranches([]);
            setLoading(false);
            return;
        }

        try {
            setLoading(true);
            const response = await api.get('/branches');
            setBranches(response.data);

        } catch (error: any) {
            const status = error.response?.status;
            if (status !== 401 && status !== 403) {
                console.error('Failed to fetch branches', error);
            }
        } finally {
            setLoading(false);
        }
    }, [authLoading, isAuthenticated, user?.role]);

    useEffect(() => {
        fetchBranches();
    }, [fetchBranches]);

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
