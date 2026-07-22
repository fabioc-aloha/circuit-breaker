import { app } from '@azure/functions';
import { getDelayedQuotes, QUOTE_RESPONSE_CACHE_CONTROL } from '../quotes.js';

app.http('quotes', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'quotes',
  handler: async () => {
    try {
      return {
        status: 200,
        jsonBody: await getDelayedQuotes(),
        headers: { 'Cache-Control': QUOTE_RESPONSE_CACHE_CONTROL },
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
