import { defineConfig } from 'vite';
import { copyFileSync } from 'fs';

export default defineConfig({
  build: {
    target: 'esnext',
    rollupOptions: {
      external: ['/neutralino.js'],
      output: {
        // Copy service worker after build
        plugins: [
          {
            name: 'copy-sw',
            writeBundle() {
              copyFileSync('sw.js', 'dist/sw.js');
            },
          },
        ],
      },
    },
  },
});
