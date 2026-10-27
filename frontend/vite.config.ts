import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Em dev o front fala com o backend local pelo mesmo origin (cookie SameSite=Strict funciona).
    proxy: { '/api': 'http://localhost:3000' },
  },
  build: { sourcemap: false, chunkSizeWarningLimit: 800 },
});
