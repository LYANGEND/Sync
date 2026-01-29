import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import api from '../utils/api';

interface Branch {
    id: string;
    name: string;
    code: string;
    address?: string;
    phone?: string;
    email?: string;
    isMain: boolean;
    status: 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE';
    capacity?: number;
    logoUrl?: string;
    _count?: {
        users: number;
        students: number;
        classes: number;
        payments: number;
    };
}

interface BranchContextType {
    branches: Branch[];
    selectedBranch: Branch | null;
    setSelectedBranch: (branch: Branch | null) => void;
    loading: boolean;
    error: string | null;
    refreshBranches: () => Promise<void>;
}

const BranchContext = createContext<BranchContextType | undefined>(undefined);

export const useBranch = () => {
    const context = useContext(BranchContext);
    if (!context) {
        throw new Error('useBranch must be used within a BranchProvider');
    }
    return context;
};

interface BranchProviderProps {
    children: ReactNode;
}

export const BranchProvider = ({ children }: BranchProviderProps) => {
    const [branches, setBranches] = useState<Branch[]>([]);
    const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchBranches = async () => {
        try {
            setLoading(true);
            setError(null);
            const response = await api.get('/branches?includeStats=true');
            setBranches(response.data);

            // Auto-select main branch if no branch selected
            if (!selectedBranch && response.data.length > 0) {
                const mainBranch = response.data.find((b: Branch) => b.isMain);
                if (mainBranch) {
                    setSelectedBranch(mainBranch);
                }
            }
        } catch (err) {
            console.error('Failed to fetch branches:', err);
            setError('Failed to load branches');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchBranches();
    }, []);

    const value = {
        branches,
        selectedBranch,
        setSelectedBranch,
        loading,
        error,
        refreshBranches: fetchBranches
    };

    return (
        <BranchContext.Provider value={value}>
            {children}
        </BranchContext.Provider>
    );
};

export type { Branch };
export default BranchContext;
