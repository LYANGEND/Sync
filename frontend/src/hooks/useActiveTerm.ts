import { useEffect, useState } from 'react';
import api from '../utils/api';

export interface ActiveTerm {
  id: string;
  name: string;
  status: 'ACTIVE' | 'CLOSING';
}

interface TermRow {
  id: string;
  name: string;
  status?: string;
  isActive?: boolean;
}

/** Picks the school's current term from an /academic-terms list (ACTIVE, else CLOSING). */
export const pickActiveTerm = <T extends TermRow>(terms: T[]): T | undefined =>
  terms.find(term => term.status === 'ACTIVE' || (!term.status && term.isActive))
  ?? terms.find(term => term.status === 'CLOSING');

/**
 * The school's current term (ACTIVE, or CLOSING while it is being wrapped up).
 * The active term is chosen only in Settings > Academic; pages read it from here.
 */
export const useActiveTerm = () => {
  const [activeTerm, setActiveTerm] = useState<ActiveTerm | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.get('/academic-terms')
      .then(response => {
        if (cancelled) return;
        const terms: TermRow[] = Array.isArray(response.data) ? response.data : response.data?.data ?? [];
        const current = pickActiveTerm(terms);
        setActiveTerm(current
          ? { id: current.id, name: current.name, status: current.status === 'CLOSING' ? 'CLOSING' : 'ACTIVE' }
          : null);
      })
      .catch(() => { if (!cancelled) setFailed(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return { activeTerm, loading, failed };
};
