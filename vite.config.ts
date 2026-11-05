import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    minify: true,
    cssCodeSplit: false,
    assetsInlineLimit: 8192,
    reportCompressedSize: false,
    chunkSizeWarningLimit: 2000,
  },
  server: { host: true, port: 5173 },
});
