import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// During development the browser talks to Vite (port 5173); API calls are forwarded to the Express server.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': 'http://localhost:5000' } },
});
