import { defineConfig } from 'vite';
import { getDelayedQuotes } from './api/src/quotes.js';
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
    {
      name: 'circuit-breaker-local-quotes-api',
      configureServer(server) {
        server.middlewares.use('/api/quotes', async (request, response) => {
          if (request.method !== 'GET') {
            response.statusCode = 405;
            response.end();
            return;
          }

          try {
            response.setHeader('Cache-Control', 'private, max-age=60');
            response.setHeader('Content-Type', 'application/json; charset=utf-8');
            response.end(JSON.stringify(await getDelayedQuotes()));
          } catch {
            response.statusCode = 503;
            response.setHeader('Cache-Control', 'no-store');
            response.setHeader('Content-Type', 'application/json; charset=utf-8');
            response.end(JSON.stringify({ quotes: [], delayed: true }));
          }
        });
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
