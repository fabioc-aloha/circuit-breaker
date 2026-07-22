import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');

function loadTrackerApi() {
  const source = fs.readFileSync(path.join(root, 'public', 'client', 'constellation-tracker.js'), 'utf8');
  const context = {};
  context.globalThis = context;
  vm.runInNewContext(source, context);
  return context.CorreaXConstellationTracker;
}

function trackerFixture(api, overrides = {}) {
  const requests = [];
  const values = new Map();
  const tracker = api.createTracker({
    enabled: true,
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return { ok: true };
    },
    getReferrer: () => 'https://www.google.com/search?q=blocks',
    getScreenWidth: () => 1440,
    killSwitch: false,
    location: {
      pathname: '/',
      search: '?utm_source=arcade&utm_medium=referral&utm_campaign=launch&score=999999',
      hash: '#boss',
    },
    navigator: { doNotTrack: '0' },
    siteKey: 'circuit-breaker',
    storage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    },
    ...overrides,
  });
  return { requests, tracker, values };
}

function runBootstrap(timeZone) {
  const source = fs.readFileSync(path.join(root, 'public', 'client', 'tracker-bootstrap.js'), 'utf8');
  const values = new Map();
  let pageViews = 0;
  let trackerOptions;
  const trackerApi = {
    CONSENT_KEY: 'correax.constellation-tracker.consent.v1',
    requiresExplicitConsent: (value) => value === 'Europe/Berlin',
    createTracker(options) {
      trackerOptions = options;
      return {
        trackPageView() {
          if (options.storage.getItem(trackerApi.CONSENT_KEY) === 'granted') pageViews += 1;
        },
      };
    },
  };
  const window = {
    CorreaXConstellationTracker: trackerApi,
    fetch() {},
    innerWidth: 1440,
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    },
    location: { pathname: '/', search: '', hash: '' },
    navigator: { doNotTrack: '0' },
  };
  const document = {
    referrer: '',
    querySelector: (selector) => selector === 'meta[name="correax-tracker"]'
      ? { content: 'enabled' }
      : null,
  };
  vm.runInNewContext(source, {
    document,
    Intl: { DateTimeFormat: () => ({ resolvedOptions: () => ({ timeZone }) }) },
    window,
  });
  return { pageViews, trackerOptions, values };
}

test('emits only the approved Circuit Breaker page-view contract', async () => {
  const api = loadTrackerApi();
  const value = trackerFixture(api);
  value.tracker.grantConsent();

  assert.equal(await value.tracker.trackPageView(), true);
  assert.equal(value.requests.length, 1);
  assert.equal(value.requests[0].url, 'https://tracker.correax.com/api/collect');
  assert.deepEqual(JSON.parse(value.requests[0].options.body), {
    schemaVersion: 1,
    siteKey: 'circuit-breaker',
    eventName: 'page_view',
    path: '/',
    utmSource: 'arcade',
    utmMedium: 'referral',
    utmCampaign: 'launch',
    referrer: 'https://www.google.com/search?q=blocks',
    screenWidth: 1440,
  });
  assert.equal(value.requests[0].options.credentials, 'omit');
  assert.equal(value.requests[0].options.referrerPolicy, 'no-referrer');
  assert.equal(value.requests[0].options.cache, 'no-store');
});

test('fails closed for DNT, kill switch, unavailable storage, and network errors', async () => {
  const api = loadTrackerApi();
  for (const overrides of [
    { navigator: { doNotTrack: '1' } },
    { killSwitch: true },
    { storage: null },
  ]) {
    const value = trackerFixture(api, overrides);
    value.tracker.grantConsent();
    assert.equal(await value.tracker.trackPageView(), false);
    assert.equal(value.requests.length, 0);
  }

  const network = trackerFixture(api, { fetchImpl: async () => { throw new Error('offline'); } });
  network.tracker.grantConsent();
  assert.equal(await network.tracker.trackPageView(), false);
});

test('requires explicit consent only for EEA, UK, and Swiss time zones', () => {
  const api = loadTrackerApi();
  assert.equal(api.requiresExplicitConsent('Europe/Berlin'), true);
  assert.equal(api.requiresExplicitConsent('Europe/London'), true);
  assert.equal(api.requiresExplicitConsent('Europe/Zurich'), true);
  assert.equal(api.requiresExplicitConsent('America/New_York'), false);
  assert.equal(api.requiresExplicitConsent(undefined), false);
});

test('bootstrap sends once in the US and remains closed in the EEA', () => {
  const us = runBootstrap('America/New_York');
  assert.equal(us.pageViews, 1);
  assert.equal(us.trackerOptions.siteKey, 'circuit-breaker');
  assert.equal(us.trackerOptions.getReferrer(), '');
  assert.equal(us.trackerOptions.getScreenWidth(), 1440);

  const eea = runBootstrap('Europe/Berlin');
  assert.equal(eea.pageViews, 0);
  assert.equal(eea.values.has('correax.constellation-tracker.consent.v1'), false);
});
