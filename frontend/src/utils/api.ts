import axios from 'axios';

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

    // Tenant Logic
    const hostname = window.location.hostname;
    let slug = 'default-school'; // Default fallback

    // Check for subdomain
    const parts = hostname.split('.');
    if (parts.length > 1 && 
        !hostname.includes('localhost') && 
        !hostname.includes('app.github.dev') && 
        !hostname.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/)) {
        // e.g. school1.app.com -> school1
        slug = parts[0];
    } else {
        // For dev (localhost) or IP access, check localStorage
        const storedSlug = localStorage.getItem('tenantSlug');
        if (storedSlug) {
            slug = storedSlug;
        }
    }

    config.headers['X-Tenant-Slug'] = slug;

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

export default api;
