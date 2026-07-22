import { defineConfig } from 'vite';
import { renderTrackerMarkup } from './scripts/tracker-markup.mjs';

export default defineConfig({
  base: './',
  plugins: [
    {
      name: 'circuit-breaker-tracker-activation',
      transformIndexHtml(html) {
        return html.replace(
          '<!-- correax-tracker -->',
          renderTrackerMarkup(process.env.CB_TRACKER_ENABLED === 'true'),
        );
      },
    },
  ],
  server: {
    port: 5173,
    open: true,
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    sourcemap: true,
  },
});
