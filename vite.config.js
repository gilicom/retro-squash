import { defineConfig } from 'vite';

/**
 * Vite configuration.
 * The game is plain ES modules with no framework, so the config only sets
 * a relative base (so the build works from any sub-folder, e.g. GitHub Pages)
 * and the output directory.
 */
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'es2020',
  },
  server: {
    port: 5173,
  },
});
