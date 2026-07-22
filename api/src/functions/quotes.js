import { app } from '@azure/functions';
import { getDelayedQuotes } from '../quotes.js';

app.http('quotes', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'quotes',
  handler: async () => {
    try {
      return {
        status: 200,
        jsonBody: await getDelayedQuotes(),
        headers: { 'Cache-Control': 'private, max-age=60' },
      };
    } catch {
      return {
        status: 503,
        jsonBody: { quotes: [], delayed: true },
        headers: { 'Cache-Control': 'no-store' },
      };
    }
  },
});
