import axios from 'axios';

// Get API base URL - matches api.ts logic for Capacitor and web
const getBaseURL = () => {
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;
  if (import.meta.env.VITE_PROD_API_URL && import.meta.env.PROD) return import.meta.env.VITE_PROD_API_URL;
  if (typeof (window as any).Capacitor !== 'undefined' && (window as any).Capacitor.isNativePlatform?.()) {
    return 'https://bux-spades-server.fly.dev';
  }
  const isProduction = typeof window !== 'undefined' && window.location?.hostname !== 'localhost' && window.location?.hostname !== '127.0.0.1';
  return isProduction ? 'https://bux-spades-server.fly.dev' : 'http://localhost:3000';
};
axios.defaults.baseURL = getBaseURL();
axios.defaults.withCredentials = true;

// Add request/response interceptors for debugging
axios.interceptors.request.use(
  (config) => {
    console.log('Making request:', {
      url: config.url,
      method: config.method,
      headers: config.headers,
      data: config.data
    });
    return config;
  },
  (error) => {
    console.error('Request error:', error);
    return Promise.reject(error);
  }
);

axios.interceptors.response.use(
  (response) => {
    console.log('Received response:', {
      status: response.status,
      data: response.data,
      headers: response.headers
    });
    return response;
  },
  (error) => {
    console.error('Response error:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status
    });
    return Promise.reject(error);
  }
);

export default axios;
