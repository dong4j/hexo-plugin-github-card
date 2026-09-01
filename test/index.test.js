'use strict';

/**
 * Focused contract tests for repository URL detection, safe rendering and
 * offline fallback behavior. They intentionally avoid running a full Hexo
 * generation so failures stay fast and local to the plugin.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  MetadataCache,
  fetchRepositoryMetadata,
  normalizeDescription,
  parseGitHubRepositoryUrl,
  registerPlugin,
  renderRepositoryCard,
  transformHtml
} = require('../index');

const STARCAT_URL = 'https://github.com/starcat-app/Starcat';
const STARCAT_REPOSITORY = parseGitHubRepositoryUrl(STARCAT_URL);

test('accepts and canonicalizes GitHub repository root URLs', () => {
  assert.deepEqual(parseGitHubRepositoryUrl(`${STARCAT_URL}.git/?tab=readme-ov-file#readme`), {
    owner: 'starcat-app',
    repository: 'Starcat',
    canonicalUrl: STARCAT_URL,
    cacheKey: STARCAT_URL.toLowerCase()
  });
});

test('rejects non-repository and nested GitHub routes', () => {
  assert.equal(parseGitHubRepositoryUrl('https://github.com/starcat-app/Starcat/issues/1'), null);
  assert.equal(parseGitHubRepositoryUrl('https://github.com/topics/hexo'), null);
  assert.equal(parseGitHubRepositoryUrl('https://example.com/starcat-app/Starcat'), null);
});

test('transforms only a standalone bare repository link', async () => {
  const inline = `<p>查看 <a href="${STARCAT_URL}">Starcat</a> 的说明。</p>`;
  const html = `<p><a href="${STARCAT_URL}">${STARCAT_URL}</a></p>\n${inline}`;
  const transformed = await transformHtml(html, async () => ({
    title: 'GitHub - starcat-app/Starcat: Native macOS knowledge base',
    description: 'Turn GitHub Stars into a searchable knowledge base.',
    imageUrl: 'https://repository-images.githubusercontent.com/1/example'
  }));

  assert.match(transformed, /class="hexo-github-card"/);
  assert.match(transformed, /repository-images\.githubusercontent\.com/);
  assert.ok(transformed.endsWith(inline), 'non-card HTML must remain byte-for-byte unchanged');
});

test('keeps custom-text, issue and failed-preview links unchanged', async () => {
  const customText = `<p><a href="${STARCAT_URL}">Starcat repository</a></p>`;
  const issue = '<p><a href="https://github.com/starcat-app/Starcat/issues/1">https://github.com/starcat-app/Starcat/issues/1</a></p>';
  const bare = `<p><a href="${STARCAT_URL}">${STARCAT_URL}</a></p>`;

  assert.equal(await transformHtml(customText, async () => assert.fail('resolver should not run')), customText);
  assert.equal(await transformHtml(issue, async () => assert.fail('resolver should not run')), issue);
  assert.equal(await transformHtml(bare, async () => null), bare);
});

test('escapes Open Graph text before rendering HTML', () => {
  const card = renderRepositoryCard(STARCAT_REPOSITORY, {
    title: '<script>alert("title")</script>',
    description: '<img src=x onerror=alert(1)>',
    imageUrl: 'javascript:alert(1)'
  });

  assert.doesNotMatch(card, /<script>/);
  assert.doesNotMatch(card, /<img src=x/);
  assert.doesNotMatch(card, /javascript:/);
  assert.match(card, /&lt;script&gt;/);
  assert.match(card, /hexo-github-card--without-image/);
});

test('normalizes GitHub description suffixes', () => {
  assert.equal(
    normalizeDescription('A native macOS app. - starcat-app/Starcat', STARCAT_REPOSITORY),
    'A native macOS app.'
  );
});

test('extracts title, description and image from scraper results', async () => {
  const metadata = await fetchRepositoryMetadata(async () => ({
    error: false,
    result: {
      ogTitle: 'GitHub - starcat-app/Starcat: A native macOS app',
      ogDescription: 'A native macOS app. - starcat-app/Starcat',
      ogImage: [{ url: 'https://repository-images.githubusercontent.com/1/example' }]
    }
  }), STARCAT_REPOSITORY, { timeoutSeconds: 3 });

  assert.deepEqual(metadata, {
    title: 'GitHub - starcat-app/Starcat: A native macOS app',
    description: 'A native macOS app.',
    imageUrl: 'https://repository-images.githubusercontent.com/1/example'
  });
});

test('persists fresh metadata and exposes it as stale after TTL', () => {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'hexo-github-card-test-'));
  const cacheFile = path.join(temporaryDirectory, 'metadata.json');
  let now = 1_000;

  try {
    const cache = new MetadataCache(cacheFile, () => now);
    cache.set(STARCAT_REPOSITORY.cacheKey, { title: 'Starcat' });
    assert.deepEqual(cache.get(STARCAT_REPOSITORY.cacheKey, 10), {
      value: { title: 'Starcat' },
      fresh: true
    });

    now += 11_000;
    const reloaded = new MetadataCache(cacheFile, () => now);
    assert.deepEqual(reloaded.get(STARCAT_REPOSITORY.cacheKey, 10), {
      value: { title: 'Starcat' },
      fresh: false
    });
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

test('registers the stylesheet asset, head injection and render filter', () => {
  const registrations = {
    generators: [],
    injectors: [],
    filters: []
  };
  const fakeHexo = {
    base_dir: '/tmp/hexo-github-card-test',
    config: {
      url: 'https://example.com',
      root: '/blog/',
      github_card: { enable: true }
    },
    extend: {
      generator: {
        register: (...args) => registrations.generators.push(args)
      },
      injector: {
        register: (...args) => registrations.injectors.push(args)
      },
      filter: {
        register: (...args) => registrations.filters.push(args)
      }
    },
    log: { warn: () => {} }
  };

  registerPlugin(fakeHexo);

  assert.equal(registrations.generators[0][0], 'github_card_assets');
  assert.deepEqual(registrations.injectors[0], [
    'head_end',
    '<link rel="stylesheet" href="&#x2F;blog&#x2F;hexo-plugin-github-card&#x2F;github-card.css">',
    'default'
  ]);
  assert.equal(registrations.filters[0][0], 'after_post_render');
  assert.equal(registrations.filters[0][2], 20);
});
