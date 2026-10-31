import { defineConfig } from 'vite';
import serviceWorker from './tools/vite-plugin-sw.js';

/**
 * Vite configuration.
 * The game is plain ES modules with no framework, so the config only sets
 * a relative base (so the build works from any sub-folder, e.g. GitHub Pages),
 * the output directory, and the service-worker plugin that turns the build
 * into an installable, offline-capable PWA.
 */
export default defineConfig({
  base: './',
  plugins: [serviceWorker()],
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'es2020',
  },
  server: {
    port: 5173,
  },
});
