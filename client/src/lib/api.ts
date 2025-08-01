// API URL utility for handling different environments
const getApiUrl = () => {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  
  // Check if we're in production by looking at the current URL
  const isProduction = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
  
  if (isProduction) {
    return 'https://bux-spades-server.fly.dev';
  }
  return 'http://localhost:3000';
};

// Get authentication token from localStorage
const getAuthToken = () => {
  return localStorage.getItem('sessionToken');
};

// Create a fetch wrapper that uses the correct API URL
export const apiFetch = async (endpoint: string, options: RequestInit = {}) => {
  const baseUrl = getApiUrl();
  const url = `${baseUrl}${endpoint}`;
  const token = getAuthToken();
  
  console.log('API call:', { endpoint, fullUrl: url, isProduction: window.location.hostname !== 'localhost' });
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options.headers as Record<string, string>,
  };
  
  // Add authorization header if token exists
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  return fetch(url, {
    ...options,
    headers,
  });
};

// Helper functions for common API calls
export const api = {
  get: (endpoint: string) => apiFetch(endpoint),
  post: (endpoint: string, data?: any) => apiFetch(endpoint, {
    method: 'POST',
    body: data ? JSON.stringify(data) : undefined,
  }),
  put: (endpoint: string, data?: any) => apiFetch(endpoint, {
    method: 'PUT',
    body: data ? JSON.stringify(data) : undefined,
  }),
  delete: (endpoint: string) => apiFetch(endpoint, {
    method: 'DELETE',
  }),
}; 