// Cấu hình Vite: 3 trang (chơi, live, quản trị) build ra thư mục dist/
import { defineConfig } from 'vite';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, 'client');

export default defineConfig({
  root,
  publicDir: resolve(root, 'public'),
  build: {
    outDir: resolve(import.meta.dirname, 'dist'),
    emptyOutDir: true,
    target: 'es2020',
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      input: {
        index: resolve(root, 'index.html'),
        live: resolve(root, 'live.html'),
        admin: resolve(root, 'admin.html'),
      },
      output: { manualChunks: { three: ['three'] } },
    },
  },
  server: { fs: { allow: [import.meta.dirname] } },
});
