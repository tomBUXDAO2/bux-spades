import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const API_URL = process.env.NODE_ENV === 'production'
  ? process.env.VITE_PROD_API_URL
  : process.env.VITE_API_URL;
const WS_URL = process.env.NODE_ENV === 'production'
  ? process.env.VITE_PROD_WS_URL
  : process.env.VITE_WS_URL;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: API_URL,
        changeOrigin: true,
        secure: false,
        ws: true,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('proxy error', err);
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log('Sending Request to the Target:', req.method, req.url);
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            console.log('Received Response from the Target:', proxyRes.statusCode, req.url);
          });
        },
      },
      '/ws': {
        target: WS_URL,
        ws: true,
      },
      '/socket.io': {
        target: WS_URL,
        ws: true,
        changeOrigin: true,
        secure: false,
      },
    },
  },
}) 