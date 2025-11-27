import axios, { AxiosError, AxiosRequestConfig } from 'axios';
import { offlineStorage } from './offlineStorage';

const api = axios.create({
  baseURL: '/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add a request interceptor to add the auth token to every request
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for offline caching
api.interceptors.response.use(
  (response) => {
    // Cache successful GET responses
    if (response.config.method === 'get' && response.status === 200) {
      const cacheKey = `api:${response.config.url}`;
      offlineStorage.set(cacheKey, response.data, 60); // Cache for 60 minutes
    }
    return response;
  },
  async (error: AxiosError) => {
    const config = error.config as AxiosRequestConfig;
    
    // If offline and it's a GET request, try to return cached data
    if (!navigator.onLine && config?.method === 'get') {
      const cacheKey = `api:${config.url}`;
      const cachedData = await offlineStorage.get(cacheKey);
      if (cachedData) {
        return { data: cachedData, status: 200, statusText: 'OK (Cached)', config, headers: {} };
      }
    }
    
    // If offline and it's a mutation, queue it for later
    if (!navigator.onLine && config && ['post', 'put', 'delete'].includes(config.method || '')) {
      await offlineStorage.queueAction({
        type: config.method?.toUpperCase() as 'POST' | 'PUT' | 'DELETE',
        url: config.url || '',
        data: config.data,
      });
      
      // Return a mock success response for optimistic UI
      return {
        data: { queued: true, message: 'Action queued for sync' },
        status: 202,
        statusText: 'Queued',
        config,
        headers: {},
      };
    }
    
    return Promise.reject(error);
  }
);

// Sync pending actions when back online
export async function syncPendingActions(): Promise<{ success: number; failed: number }> {
  const pending = await offlineStorage.getPendingActions();
  let success = 0;
  let failed = 0;

  for (const action of pending) {
    try {
      switch (action.type) {
        case 'POST':
          await api.post(action.url, action.data);
          break;
        case 'PUT':
          await api.put(action.url, action.data);
          break;
        case 'DELETE':
          await api.delete(action.url);
          break;
      }
      await offlineStorage.removePendingAction(action.id);
      success++;
    } catch {
      failed++;
    }
  }

  return { success, failed };
}

export default api;
