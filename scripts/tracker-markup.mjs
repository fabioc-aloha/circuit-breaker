export function renderTrackerMarkup(enabled) {
  if (!enabled) return '';
  return [
    '<meta name="correax-tracker" content="enabled" />',
    '<script src="/client/constellation-tracker.js" defer></script>',
    '<script src="/client/tracker-bootstrap.js" defer></script>',
  ].join('\n    ');
}
