import { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import { offlineStorage } from '../utils/offlineStorage';

interface UseOfflineDataOptions {
  cacheKey?: string;
  cacheTTL?: number; // minutes
  enabled?: boolean;
}

interface UseOfflineDataResult<T> {
  data: T | null;
  isLoading: boolean;
  error: Error | null;
  isFromCache: boolean;
  refetch: () => Promise<void>;
}

export function useOfflineData<T>(
  url: string,
  options: UseOfflineDataOptions = {}
): UseOfflineDataResult<T> {
  const { cacheKey = `api:${url}`, cacheTTL = 60, enabled = true } = options;
  
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [isFromCache, setIsFromCache] = useState(false);

  const fetchData = useCallback(async () => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Try to get cached data first for instant display
      const cached = await offlineStorage.get<T>(cacheKey);
      if (cached) {
        setData(cached);
        setIsFromCache(true);
      }

      // If online, fetch fresh data
      if (navigator.onLine) {
        const response = await api.get<T>(url);
        setData(response.data);
        setIsFromCache(false);
        await offlineStorage.set(cacheKey, response.data, cacheTTL);
      } else if (!cached) {
        // Offline with no cache
        throw new Error('No cached data available offline');
      }
    } catch (err) {
      // If we have cached data, don't show error
      if (!data) {
        setError(err instanceof Error ? err : new Error('Failed to fetch data'));
      }
    } finally {
      setIsLoading(false);
    }
  }, [url, cacheKey, cacheTTL, enabled, data]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Refetch when coming back online
  useEffect(() => {
    const handleOnline = () => {
      if (isFromCache) {
        fetchData();
      }
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [isFromCache, fetchData]);

  return {
    data,
    isLoading: isLoading && !data, // Don't show loading if we have cached data
    error,
    isFromCache,
    refetch: fetchData,
  };
}
