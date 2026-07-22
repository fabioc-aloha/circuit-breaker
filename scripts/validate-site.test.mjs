import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { validateSite } from './validate-site.mjs';

const JSON_LD = '{"@context":"https://schema.org","@type":"WebSite","name":"Circuit Breaker","url":"https://cb.correax.com/","description":"Play a high-voltage block-stacker with Boss Rush mode.","inLanguage":"en"}';
const JSON_LD_HASH = crypto.createHash('sha256').update(JSON_LD).digest('base64');

function fixture({ trackingEnabled = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'circuit-breaker-site-'));
  fs.mkdirSync(path.join(root, 'assets'));
  fs.mkdirSync(path.join(root, 'client'));
  fs.writeFileSync(path.join(root, 'assets', 'app.js'), 'console.log("game");');
  fs.writeFileSync(path.join(root, 'circuit-breaker-social.png'), 'png');
  fs.writeFileSync(path.join(root, 'client', 'constellation-tracker.js'), 'tracker');
  fs.writeFileSync(path.join(root, 'client', 'tracker-bootstrap.js'), 'bootstrap');
  fs.writeFileSync(path.join(root, 'robots.txt'), [
    'User-agent: *',
    'Allow: /',
    'Sitemap: https://cb.correax.com/sitemap.xml',
    '',
  ].join('\n'));
  fs.writeFileSync(path.join(root, 'sitemap.xml'), [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    '  <url><loc>https://cb.correax.com/</loc></url>',
    '</urlset>',
    '',
  ].join('\n'));
  fs.writeFileSync(path.join(root, 'llms.txt'), '# Circuit Breaker\n\n- https://cb.correax.com/: Play Circuit Breaker.\n');
  fs.writeFileSync(path.join(root, 'staticwebapp.config.json'), JSON.stringify({
    globalHeaders: {
      'Content-Security-Policy': `script-src 'self' 'sha256-${JSON_LD_HASH}'`,
    },
  }));
  const tracking = trackingEnabled
    ? [
        '<meta name="correax-tracker" content="enabled" />',
        '<script src="/client/constellation-tracker.js" defer></script>',
        '<script src="/client/tracker-bootstrap.js" defer></script>',
      ].join('\n')
    : '';
  fs.writeFileSync(path.join(root, 'index.html'), `<!doctype html>
<html lang="en">
  <head>
    <title>Circuit Breaker</title>
    <meta name="description" content="Play a high-voltage block-stacker with Boss Rush mode." />
    <link rel="canonical" href="https://cb.correax.com/" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="Circuit Breaker" />
    <meta property="og:description" content="Play a high-voltage block-stacker with Boss Rush mode." />
    <meta property="og:url" content="https://cb.correax.com/" />
    <meta property="og:image" content="https://cb.correax.com/circuit-breaker-social.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="Circuit Breaker" />
    <meta name="twitter:description" content="Play a high-voltage block-stacker with Boss Rush mode." />
    <meta name="twitter:image" content="https://cb.correax.com/circuit-breaker-social.png" />
    <script type="application/ld+json">${JSON_LD}</script>
    ${tracking}
  </head>
  <body>
    <h1>Circuit Breaker</h1>
    <script type="module" src="/assets/app.js"></script>
  </body>
</html>
`);
  return root;
}

test('accepts a complete preview build without tracker activation', (t) => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.deepEqual(validateSite(root), { failures: [] });
});

test('accepts a complete production build with tracker activation', (t) => {
  const root = fixture({ trackingEnabled: true });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.deepEqual(validateSite(root, { trackingEnabled: true }), { failures: [] });
});

test('reports missing crawl and deployment assets', (t) => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.rmSync(path.join(root, 'robots.txt'));
  fs.rmSync(path.join(root, 'sitemap.xml'));
  fs.rmSync(path.join(root, 'llms.txt'));
  fs.rmSync(path.join(root, 'staticwebapp.config.json'));

  const result = validateSite(root);
  assert.ok(result.failures.includes('missing required file: robots.txt'));
  assert.ok(result.failures.includes('missing required file: sitemap.xml'));
  assert.ok(result.failures.includes('missing required file: llms.txt'));
  assert.ok(result.failures.includes('missing required file: staticwebapp.config.json'));
});

test('requires tracker activation only in production mode', (t) => {
  const preview = fixture({ trackingEnabled: true });
  const production = fixture();
  t.after(() => fs.rmSync(preview, { recursive: true, force: true }));
  t.after(() => fs.rmSync(production, { recursive: true, force: true }));

  assert.ok(validateSite(preview).failures.includes('index.html: tracker activation present in preview build'));
  assert.ok(validateSite(production, { trackingEnabled: true }).failures.includes('index.html: tracker activation missing from production build'));
});

test('reports malformed metadata, structured data, and broken local references', (t) => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  html = html
    .replace('<link rel="canonical" href="https://cb.correax.com/" />', '')
    .replace('{"@context":"https://schema.org"', '{')
    .replace('/assets/app.js', '/assets/missing.js');
  fs.writeFileSync(path.join(root, 'index.html'), html);

  const failures = validateSite(root).failures;
  assert.ok(failures.includes('index.html: missing canonical URL'));
  assert.ok(failures.includes('index.html: invalid JSON-LD'));
  assert.ok(failures.includes('index.html: broken reference: /assets/missing.js'));
});

test('reports a stale JSON-LD Content Security Policy hash', (t) => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'staticwebapp.config.json'), JSON.stringify({
    globalHeaders: {
      'Content-Security-Policy': "script-src 'self' 'sha256-stale'",
    },
  }));

  assert.ok(validateSite(root).failures.includes('staticwebapp.config.json: CSP does not allow the current JSON-LD hash'));
});

test('reports a missing Content Security Policy', (t) => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'staticwebapp.config.json'), '{}');

  assert.ok(validateSite(root).failures.includes('staticwebapp.config.json: missing Content-Security-Policy'));
});
