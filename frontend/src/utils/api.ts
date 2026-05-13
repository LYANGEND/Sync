import axios from 'axios';

const AUTH_ERROR_MESSAGES = new Set(['Access token required', 'Invalid or expired token']);

const api = axios.create({
  baseURL: '/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
});

const getTenantSlug = () => {
  const storedSlug = localStorage.getItem('tenantSlug');
  if (storedSlug) return storedSlug;

  const host = window.location.hostname;
  const subdomain = host.includes('.') ? host.split('.')[0] : '';
  return subdomain && !['www', 'localhost', '127'].includes(subdomain) ? subdomain : '';
};

// Add a request interceptor to add the auth token to every request
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    const isPlatformRoute = typeof config.url === 'string' && config.url.startsWith('/platform');
    const tenantSlug = isPlatformRoute ? '' : getTenantSlug();
    if (tenantSlug) {
      config.headers['X-Tenant-Slug'] = tenantSlug;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const message = error.response?.data?.error || error.response?.data?.message;

    if (status === 401 || (status === 403 && AUTH_ERROR_MESSAGES.has(message))) {
      window.dispatchEvent(new CustomEvent('app:auth-invalid', {
        detail: { status, message },
      }));
    }

    return Promise.reject(error);
  }
);

export default api;
