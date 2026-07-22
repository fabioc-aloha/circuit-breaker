import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REQUIRED_FILES = [
  'index.html',
  'robots.txt',
  'sitemap.xml',
  'llms.txt',
  'staticwebapp.config.json',
  'client/constellation-tracker.js',
  'client/tracker-bootstrap.js',
];
const EXTERNAL_REFERENCE = /^(?:https?:|mailto:|tel:|data:|#)/i;

function tagAttribute(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'i'));
  return match?.[2] ?? null;
}

function metaContent(html, attributeName, attributeValue) {
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    if (tagAttribute(tag, attributeName)?.toLowerCase() === attributeValue.toLowerCase()) {
      return tagAttribute(tag, 'content');
    }
  }
  return null;
}

function hasCanonical(html) {
  return [...html.matchAll(/<link\b[^>]*>/gi)].some(([tag]) =>
    tagAttribute(tag, 'rel')?.toLowerCase() === 'canonical' &&
    tagAttribute(tag, 'href') === 'https://cb.correax.com/'
  );
}

function resolveLocalReference(root, reference) {
  const clean = reference.split(/[?#]/)[0];
  if (!clean || EXTERNAL_REFERENCE.test(clean)) return null;
  return clean.startsWith('/')
    ? path.join(root, clean.slice(1))
    : path.join(root, clean);
}

function countScript(html, source) {
  return [...html.matchAll(/<script\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1[^>]*><\/script>/gi)]
    .filter((match) => match[2] === source)
    .length;
}

export function validateSite(root, { trackingEnabled = false } = {}) {
  const failures = [];
  const absoluteRoot = path.resolve(root);
  let staticWebAppConfig;

  for (const required of REQUIRED_FILES) {
    if (!fs.existsSync(path.join(absoluteRoot, required))) {
      failures.push(`missing required file: ${required}`);
    }
  }

  const robotsPath = path.join(absoluteRoot, 'robots.txt');
  if (fs.existsSync(robotsPath)) {
    const robots = fs.readFileSync(robotsPath, 'utf8');
    if (!/^User-agent:\s*\*/mi.test(robots)) failures.push('robots.txt: missing User-agent directive');
    if (!/^Sitemap:\s*https:\/\/cb\.correax\.com\/sitemap\.xml\s*$/mi.test(robots)) {
      failures.push('robots.txt: missing canonical sitemap directive');
    }
  }

  const sitemapPath = path.join(absoluteRoot, 'sitemap.xml');
  if (fs.existsSync(sitemapPath)) {
    const sitemap = fs.readFileSync(sitemapPath, 'utf8');
    if (!/<urlset\b[^>]*xmlns=["']http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9["']/i.test(sitemap)) {
      failures.push('sitemap.xml: missing sitemap XML namespace');
    }
    const locations = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/gi)].map((match) => match[1]);
    if (locations.length !== 1 || locations[0] !== 'https://cb.correax.com/') {
      failures.push('sitemap.xml: expected only the canonical homepage URL');
    }
  }

  const configPath = path.join(absoluteRoot, 'staticwebapp.config.json');
  if (fs.existsSync(configPath)) {
    try {
      staticWebAppConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch {
      failures.push('staticwebapp.config.json: invalid JSON');
    }
  }

  const indexPath = path.join(absoluteRoot, 'index.html');
  if (!fs.existsSync(indexPath)) return { failures };
  const html = fs.readFileSync(indexPath, 'utf8');
  const title = html.match(/<title>\s*([^<]+?)\s*<\/title>/i)?.[1].trim();
  const description = metaContent(html, 'name', 'description');

  if (!title) failures.push('index.html: missing title');
  if (!description) failures.push('index.html: missing description');
  if (!hasCanonical(html)) failures.push('index.html: missing canonical URL');
  if (!/<h1\b[^>]*>[\s\S]*?\S[\s\S]*?<\/h1>/i.test(html)) failures.push('index.html: missing h1');

  const socialMetadata = [
    ['property', 'og:type', 'website'],
    ['property', 'og:title', title],
    ['property', 'og:description', description],
    ['property', 'og:url', 'https://cb.correax.com/'],
    ['property', 'og:image', 'https://cb.correax.com/circuit-breaker-social.png'],
    ['name', 'twitter:card', 'summary_large_image'],
    ['name', 'twitter:title', title],
    ['name', 'twitter:description', description],
    ['name', 'twitter:image', 'https://cb.correax.com/circuit-breaker-social.png'],
  ];
  for (const [attribute, name, expected] of socialMetadata) {
    if (!expected || metaContent(html, attribute, name) !== expected) {
      failures.push(`index.html: invalid ${name} metadata`);
    }
  }

  const jsonLd = html.match(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i)?.[1];
  if (!jsonLd) {
    failures.push('index.html: missing JSON-LD');
  } else {
    try {
      const value = JSON.parse(jsonLd);
      if (
        value['@context'] !== 'https://schema.org' ||
        value['@type'] !== 'WebSite' ||
        value.name !== 'Circuit Breaker' ||
        value.url !== 'https://cb.correax.com/' ||
        value.description !== description ||
        value.inLanguage !== 'en'
      ) {
        failures.push('index.html: invalid JSON-LD');
      }
    } catch {
      failures.push('index.html: invalid JSON-LD');
    }

    const csp = staticWebAppConfig?.globalHeaders?.['Content-Security-Policy'];
    if (typeof csp !== 'string' || !csp.trim()) {
      failures.push('staticwebapp.config.json: missing Content-Security-Policy');
    } else {
      const hash = crypto.createHash('sha256').update(jsonLd).digest('base64');
      if (!csp.includes(`'sha256-${hash}'`)) {
        failures.push('staticwebapp.config.json: CSP does not allow the current JSON-LD hash');
      }
    }
  }

  const trackerMeta = metaContent(html, 'name', 'correax-tracker') === 'enabled';
  const trackerCoreCount = countScript(html, '/client/constellation-tracker.js');
  const trackerBootstrapCount = countScript(html, '/client/tracker-bootstrap.js');
  const trackerActive = trackerMeta || trackerCoreCount > 0 || trackerBootstrapCount > 0;
  const trackerComplete = trackerMeta && trackerCoreCount === 1 && trackerBootstrapCount === 1;
  if (trackingEnabled && !trackerComplete) failures.push('index.html: tracker activation missing from production build');
  if (!trackingEnabled && trackerActive) failures.push('index.html: tracker activation present in preview build');

  for (const match of html.matchAll(/\b(?:href|src)\s*=\s*(["'])(.*?)\1/gi)) {
    const reference = match[2];
    const target = resolveLocalReference(absoluteRoot, reference);
    if (target && !fs.existsSync(target)) failures.push(`index.html: broken reference: ${reference}`);
  }

  return { failures };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const trackingEnabled = process.argv.includes('--tracking-enabled');
  const root = path.join(process.cwd(), 'dist');
  const result = validateSite(root, { trackingEnabled });
  if (result.failures.length) {
    for (const failure of result.failures) console.error(failure);
    process.exitCode = 1;
  } else {
    console.log(`Circuit Breaker validation: PASS (${trackingEnabled ? 'production' : 'preview'})`);
  }
}
