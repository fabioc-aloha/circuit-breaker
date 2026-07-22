(function expose(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.CorreaXConstellationTracker = api;
  }
}(typeof globalThis === 'object' ? globalThis : this, function createApi() {
  'use strict';

  const CONSENT_KEY = 'correax.constellation-tracker.consent.v1';
  const ENDPOINT = 'https://tracker.correax.com/api/collect';
  const SITE_KEYS = new Set([
    'books',
    'loop-engineering',
    'defensible-decision',
    'headstart-counseling',
    'the-hype-check',
    'bio',
    'learnai',
    'www',
    'airs',
    'circuit-breaker',
  ]);
  const EXPLICIT_CONSENT_TIME_ZONES = new Set([
    'Arctic/Longyearbyen',
    'Asia/Nicosia',
    'Atlantic/Azores',
    'Atlantic/Canary',
    'Atlantic/Madeira',
    'Atlantic/Reykjavik',
    'Europe/Amsterdam',
    'Europe/Athens',
    'Europe/Berlin',
    'Europe/Bratislava',
    'Europe/Brussels',
    'Europe/Bucharest',
    'Europe/Budapest',
    'Europe/Busingen',
    'Europe/Copenhagen',
    'Europe/Dublin',
    'Europe/Gibraltar',
    'Europe/Guernsey',
    'Europe/Helsinki',
    'Europe/Isle_of_Man',
    'Europe/Jersey',
    'Europe/Lisbon',
    'Europe/Ljubljana',
    'Europe/London',
    'Europe/Luxembourg',
    'Europe/Madrid',
    'Europe/Malta',
    'Europe/Mariehamn',
    'Europe/Oslo',
    'Europe/Paris',
    'Europe/Prague',
    'Europe/Riga',
    'Europe/Rome',
    'Europe/San_Marino',
    'Europe/Sofia',
    'Europe/Stockholm',
    'Europe/Tallinn',
    'Europe/Vaduz',
    'Europe/Vatican',
    'Europe/Vienna',
    'Europe/Vilnius',
    'Europe/Warsaw',
    'Europe/Zagreb',
    'Europe/Zurich',
  ]);
  const UTM_PARAM_MAP = {
    utm_source: 'utmSource',
    utm_medium: 'utmMedium',
    utm_campaign: 'utmCampaign',
  };
  const UTM_MAX_LENGTH = 200;
  const SCREEN_WIDTH_MAX = 10000;

  function requiresExplicitConsent(timeZone) {
    return EXPLICIT_CONSENT_TIME_ZONES.has(timeZone);
  }

  function normalizedPath(location) {
    const value = typeof location?.pathname === 'string' ? location.pathname : '/';
    return value.startsWith('/') && !value.includes('?') && !value.includes('#')
      ? value || '/'
      : '/';
  }

  function readUtmParams(location) {
    const search = typeof location?.search === 'string' ? location.search : '';
    if (search.length <= 1) return {};
    const result = {};
    const query = search.startsWith('?') ? search.slice(1) : search;
    for (const pair of query.split('&')) {
      if (!pair) continue;
      const separator = pair.indexOf('=');
      const rawKey = separator >= 0 ? pair.slice(0, separator) : pair;
      const rawValue = separator >= 0 ? pair.slice(separator + 1) : '';
      try {
        const key = decodeURIComponent(rawKey.replace(/\+/g, ' '));
        const value = decodeURIComponent(rawValue.replace(/\+/g, ' ')).trim();
        const mapped = UTM_PARAM_MAP[key];
        if (mapped && value && value.length <= UTM_MAX_LENGTH) result[mapped] = value;
      } catch {
        // Malformed query values are ignored and never reach the payload.
      }
    }
    return result;
  }

  function readReferrer(getReferrer) {
    if (typeof getReferrer !== 'function') return '';
    try {
      const value = getReferrer();
      if (typeof value !== 'string' || !value.trim()) return '';
      const url = new URL(value);
      return url.protocol === 'http:' || url.protocol === 'https:'
        ? url.hostname.toLowerCase()
        : '';
    } catch {
      return '';
    }
  }

  function readScreenWidth(getScreenWidth) {
    if (typeof getScreenWidth !== 'function') return 0;
    try {
      const value = getScreenWidth();
      if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0;
      return Math.min(SCREEN_WIDTH_MAX, Math.round(value));
    } catch {
      return 0;
    }
  }

  function storageRead(storage) {
    try {
      const value = storage?.getItem(CONSENT_KEY);
      return value === 'granted' || value === 'denied' ? value : 'unknown';
    } catch {
      return 'unknown';
    }
  }

  function storageWrite(storage, value) {
    try {
      if (!storage || typeof storage.setItem !== 'function') return false;
      storage.setItem(CONSENT_KEY, value);
      return true;
    } catch {
      return false;
    }
  }

  function createTracker({
    enabled = false,
    fetchImpl,
    getReferrer,
    getScreenWidth,
    killSwitch = true,
    location,
    navigator,
    siteKey,
    storage,
  }) {
    if (!SITE_KEYS.has(siteKey)) throw new TypeError('siteKey must identify an approved CorreaX site');
    if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function');

    function getConsent() {
      return storageRead(storage);
    }

    function trackingAllowed() {
      const dnt = String(navigator?.doNotTrack || '').toLowerCase();
      const disabled = typeof killSwitch === 'function' ? killSwitch() : killSwitch;
      return enabled && !disabled && dnt !== '1' && dnt !== 'yes' && getConsent() === 'granted';
    }

    async function trackPageView() {
      if (!trackingAllowed()) return false;
      const event = {
        schemaVersion: 1,
        siteKey,
        eventName: 'page_view',
        path: normalizedPath(location),
        ...readUtmParams(location),
      };
      const referrer = readReferrer(getReferrer);
      if (referrer) event.referrer = referrer;
      const screenWidth = readScreenWidth(getScreenWidth);
      if (screenWidth > 0) event.screenWidth = screenWidth;
      try {
        const response = await fetchImpl(ENDPOINT, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(event),
          cache: 'no-store',
          credentials: 'omit',
          keepalive: true,
          referrerPolicy: 'no-referrer',
        });
        return response?.ok === true;
      } catch {
        return false;
      }
    }

    return Object.freeze({
      denyConsent: () => storageWrite(storage, 'denied'),
      getConsent,
      grantConsent: () => storageWrite(storage, 'granted'),
      trackPageView,
      withdrawConsent: () => storageWrite(storage, 'denied'),
    });
  }

  return Object.freeze({
    CONSENT_KEY,
    createTracker,
    readReferrer,
    readScreenWidth,
    readUtmParams,
    requiresExplicitConsent,
  });
}));
