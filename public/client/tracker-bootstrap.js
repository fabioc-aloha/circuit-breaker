(function bootstrapTracker(window, document) {
  'use strict';

  const configuration = document.querySelector('meta[name="correax-tracker"]');
  const enabled = configuration?.content === 'enabled';
  let timeZone;
  try {
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    timeZone = undefined;
  }
  const consentRequired = window.CorreaXConstellationTracker.requiresExplicitConsent(timeZone);
  let persistentStorage;
  try {
    persistentStorage = window.localStorage;
    persistentStorage?.getItem(window.CorreaXConstellationTracker.CONSENT_KEY);
  } catch {
    persistentStorage = null;
  }
  const trackerStorage = !persistentStorage
    ? null
    : consentRequired
      ? persistentStorage
      : {
          getItem(key) {
            return key === window.CorreaXConstellationTracker.CONSENT_KEY
              ? 'granted'
              : persistentStorage.getItem(key);
          },
          setItem(key, value) {
            persistentStorage.setItem(key, value);
          },
        };
  const tracker = window.CorreaXConstellationTracker.createTracker({
    enabled,
    fetchImpl: window.fetch.bind(window),
    getReferrer: () => document.referrer,
    getScreenWidth: () => window.innerWidth,
    killSwitch: false,
    location: window.location,
    navigator: window.navigator,
    siteKey: 'circuit-breaker',
    storage: trackerStorage,
  });

  if (enabled) tracker.trackPageView();
}(window, document));
