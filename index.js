'use strict';

/**
 * Hexo GitHub Card plugin.
 *
 * The plugin deliberately works after Markdown rendering: only a paragraph
 * containing one auto-linked GitHub repository URL is replaced. This keeps
 * inline links, code blocks, issues, pull requests and file URLs untouched.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const { escapeHTML, url_for: urlFor } = require('hexo-util');
const ogs = require('open-graph-scraper');

const PLUGIN_NAME = 'hexo-plugin-github-card';
const ASSET_ROUTE = `${PLUGIN_NAME}/github-card.css`;
const PARAGRAPH_PATTERN = /<p(?:\s[^>]*)?>[\s\S]*?<\/p>/gi;
const REPOSITORY_PART_PATTERN = /^[A-Za-z0-9_.-]+$/;
const DEFAULT_CONFIG = Object.freeze({
  enable: true,
  cacheTtlSeconds: 7 * 24 * 60 * 60,
  timeoutSeconds: 8
});

// These first path segments are GitHub product routes rather than owners.
const RESERVED_OWNERS = new Set([
  'about',
  'apps',
  'collections',
  'customer-stories',
  'enterprise',
  'events',
  'explore',
  'features',
  'login',
  'marketplace',
  'notifications',
  'orgs',
  'pricing',
  'readme',
  'search',
  'security',
  'settings',
  'signup',
  'sponsors',
  'topics',
  'trending'
]);

/**
 * Converts a user value into the plugin's small, stable configuration model.
 * Invalid values fall back to safe defaults so configuration errors never
 * make a Hexo build fail unexpectedly.
 *
 * @param {object} rawConfig Raw `github_card` configuration.
 * @returns {{enable: boolean, cacheTtlSeconds: number, timeoutSeconds: number}}
 */
function normalizeConfig(rawConfig) {
  const config = rawConfig && typeof rawConfig === 'object' ? rawConfig : {};
  const cacheTtl = Number(config.cache_ttl);
  const timeout = Number(config.timeout);

  return {
    enable: config.enable !== false,
    cacheTtlSeconds: Number.isFinite(cacheTtl) && cacheTtl >= 0
      ? cacheTtl
      : DEFAULT_CONFIG.cacheTtlSeconds,
    timeoutSeconds: Number.isFinite(timeout) && timeout > 0
      ? timeout
      : DEFAULT_CONFIG.timeoutSeconds
  };
}

/**
 * Accepts only public GitHub repository root URLs and canonicalizes them.
 * Restricting the input to github.com also prevents the OG scraper from being
 * used as a general-purpose server-side request primitive.
 *
 * @param {string} value Candidate URL.
 * @returns {{owner: string, repository: string, canonicalUrl: string, cacheKey: string}|null}
 */
function parseGitHubRepositoryUrl(value) {
  try {
    const parsed = new URL(String(value || '').trim());
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
    if (!['http:', 'https:'].includes(parsed.protocol) || hostname !== 'github.com') {
      return null;
    }

    const segments = parsed.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    if (segments.length !== 2) {
      return null;
    }

    const owner = segments[0];
    const repository = segments[1].replace(/\.git$/i, '');
    if (
      RESERVED_OWNERS.has(owner.toLowerCase())
      || !REPOSITORY_PART_PATTERN.test(owner)
      || !REPOSITORY_PART_PATTERN.test(repository)
    ) {
      return null;
    }

    const canonicalUrl = `https://github.com/${owner}/${repository}`;
    return {
      owner,
      repository,
      canonicalUrl,
      cacheKey: canonicalUrl.toLowerCase()
    };
  } catch (_) {
    return null;
  }
}

/**
 * Ensures an externally supplied image remains an HTTP(S) URL before it is
 * emitted into the generated page.
 *
 * @param {string} value Candidate image URL.
 * @returns {string}
 */
function normalizeHttpUrl(value) {
  try {
    const parsed = new URL(String(value || '').trim());
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '';
  } catch (_) {
    return '';
  }
}

/**
 * Produces compact display text from Open Graph values.
 *
 * @param {unknown} value Raw metadata value.
 * @returns {string}
 */
function normalizeText(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

/**
 * Reads the first usable image from open-graph-scraper's array/object shapes.
 *
 * @param {object} result Open Graph result.
 * @returns {string}
 */
function readOpenGraphImage(result) {
  const candidates = Array.isArray(result.ogImage)
    ? result.ogImage
    : result.ogImage
      ? [result.ogImage]
      : [];

  for (const candidate of candidates) {
    const value = typeof candidate === 'string' ? candidate : candidate && candidate.url;
    const imageUrl = normalizeHttpUrl(value);
    if (imageUrl) {
      return imageUrl;
    }
  }
  return '';
}

/**
 * Removes GitHub's redundant repository suffix from `og:description` while
 * retaining the original project description.
 *
 * @param {string} description Raw description.
 * @param {{owner: string, repository: string}} repository Repository identity.
 * @returns {string}
 */
function normalizeDescription(description, repository) {
  const text = normalizeText(description);
  const suffix = ` - ${repository.owner}/${repository.repository}`;
  return text.toLowerCase().endsWith(suffix.toLowerCase())
    ? text.slice(0, -suffix.length).trim()
    : text;
}

/**
 * Fetches the GitHub repository page and extracts its official Open Graph
 * title, description and social preview image.
 *
 * @param {Function} scraper open-graph-scraper compatible function.
 * @param {{owner: string, repository: string, canonicalUrl: string}} repository Repository identity.
 * @param {{timeoutSeconds: number}} config Normalized plugin configuration.
 * @returns {Promise<{title: string, description: string, imageUrl: string}>}
 */
async function fetchRepositoryMetadata(scraper, repository, config) {
  const response = await scraper({
    url: repository.canonicalUrl,
    timeout: config.timeoutSeconds,
    onlyGetOpenGraphInfo: true,
    fetchOptions: {
      headers: {
        'accept-language': 'en-US,en;q=0.8',
        'user-agent': `${PLUGIN_NAME}/0.1 (+https://hexo.io/)`
      }
    }
  });

  if (!response || response.error || !response.result) {
    throw new Error('GitHub did not return usable Open Graph metadata.');
  }

  const result = response.result;
  const title = normalizeText(result.ogTitle) || `GitHub - ${repository.owner}/${repository.repository}`;
  return {
    title,
    description: normalizeDescription(result.ogDescription, repository),
    imageUrl: readOpenGraphImage(result)
  };
}

/**
 * Small JSON cache used to keep Hexo generation deterministic and friendly to
 * GitHub. Expired entries remain available as an offline fallback.
 */
class MetadataCache {
  /**
   * @param {string} cacheFile Absolute cache file path.
   * @param {Function} now Clock function for deterministic tests.
   */
  constructor(cacheFile, now = Date.now) {
    this.cacheFile = cacheFile;
    this.now = now;
    this.loaded = false;
    this.entries = {};
  }

  /** Loads the cache once; malformed cache files are ignored safely. */
  load() {
    if (this.loaded) {
      return;
    }
    this.loaded = true;
    try {
      this.entries = JSON.parse(fs.readFileSync(this.cacheFile, 'utf8'));
    } catch (_) {
      this.entries = {};
    }
  }

  /**
   * @param {string} key Canonical repository key.
   * @param {number} ttlSeconds Freshness window.
   * @returns {{value: object, fresh: boolean}|null}
   */
  get(key, ttlSeconds) {
    this.load();
    const entry = this.entries[key];
    if (!entry || !entry.value || !Number.isFinite(entry.fetchedAt)) {
      return null;
    }
    return {
      value: entry.value,
      fresh: this.now() - entry.fetchedAt <= ttlSeconds * 1000
    };
  }

  /**
   * Saves metadata atomically so an interrupted build cannot leave truncated
   * JSON behind for the next generation.
   *
   * @param {string} key Canonical repository key.
   * @param {object} value Metadata value.
   */
  set(key, value) {
    this.load();
    this.entries[key] = { value, fetchedAt: this.now() };

    const cacheDir = path.dirname(this.cacheFile);
    const temporaryFile = `${this.cacheFile}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    try {
      fs.mkdirSync(cacheDir, { recursive: true });
      fs.writeFileSync(temporaryFile, `${JSON.stringify(this.entries, null, 2)}\n`, 'utf8');
      fs.renameSync(temporaryFile, this.cacheFile);
    } catch (_) {
      // Cache persistence is an optimization and must never block generation.
      try {
        fs.unlinkSync(temporaryFile);
      } catch (_) {
        // The temporary file may not have been created.
      }
    }
  }
}

/**
 * Builds a deduplicated metadata resolver with fresh/stale cache semantics.
 *
 * @param {object} hexoInstance Active Hexo instance.
 * @param {object} config Normalized configuration.
 * @param {Function} scraper Open Graph scraper dependency.
 * @returns {Function}
 */
function createMetadataResolver(hexoInstance, config, scraper = ogs) {
  const cacheFile = path.join(
    hexoInstance.base_dir,
    'node_modules',
    '.cache',
    PLUGIN_NAME,
    'metadata.json'
  );
  const cache = new MetadataCache(cacheFile);
  const inFlight = new Map();
  const warnedRepositories = new Set();

  return function resolveMetadata(repository) {
    const cached = cache.get(repository.cacheKey, config.cacheTtlSeconds);
    if (cached && cached.fresh) {
      return Promise.resolve(cached.value);
    }
    if (inFlight.has(repository.cacheKey)) {
      return inFlight.get(repository.cacheKey);
    }

    const request = fetchRepositoryMetadata(scraper, repository, config)
      .then((metadata) => {
        cache.set(repository.cacheKey, metadata);
        return metadata;
      })
      .catch((error) => {
        if (!warnedRepositories.has(repository.cacheKey)) {
          warnedRepositories.add(repository.cacheKey);
          const fallback = cached ? 'using stale cache' : 'keeping the original link';
          hexoInstance.log.warn(
            `[${PLUGIN_NAME}] ${repository.canonicalUrl}: ${error.message}; ${fallback}.`
          );
        }
        return cached ? cached.value : null;
      })
      .finally(() => inFlight.delete(repository.cacheKey));

    inFlight.set(repository.cacheKey, request);
    return request;
  };
}

/**
 * Determines whether a rendered paragraph contains exactly one bare GitHub
 * repository link. Custom-text Markdown links are intentionally excluded.
 *
 * @param {string} paragraphHtml Rendered paragraph fragment.
 * @returns {{owner: string, repository: string, canonicalUrl: string, cacheKey: string}|null}
 */
function parseStandaloneRepositoryParagraph(paragraphHtml) {
  const $ = cheerio.load(paragraphHtml, {}, false);
  const paragraphs = $.root().children('p');
  if (paragraphs.length !== 1 || $.root().children().length !== 1) {
    return null;
  }

  const meaningfulNodes = paragraphs.first().contents().toArray().filter((node) => {
    return node.type === 'text' ? normalizeText(node.data) !== '' : node.type !== 'comment';
  });
  if (meaningfulNodes.length !== 1 || meaningfulNodes[0].type !== 'tag' || meaningfulNodes[0].name !== 'a') {
    return null;
  }

  const anchor = $(meaningfulNodes[0]);
  const hrefRepository = parseGitHubRepositoryUrl(anchor.attr('href'));
  const textRepository = parseGitHubRepositoryUrl(anchor.text());
  if (!hrefRepository || !textRepository || hrefRepository.cacheKey !== textRepository.cacheKey) {
    return null;
  }
  return hrefRepository;
}

/**
 * Renders an accessible, theme-aware repository card.
 *
 * @param {{owner: string, repository: string, canonicalUrl: string}} repository Repository identity.
 * @param {{title: string, description: string, imageUrl: string}} metadata Open Graph metadata.
 * @returns {string}
 */
function renderRepositoryCard(repository, metadata) {
  const repositoryName = `${repository.owner}/${repository.repository}`;
  const title = escapeHTML(metadata.title || `GitHub - ${repositoryName}`);
  const description = escapeHTML(metadata.description || 'View this repository on GitHub.');
  const href = escapeHTML(repository.canonicalUrl);
  const imageUrl = normalizeHttpUrl(metadata.imageUrl);
  const imageClass = imageUrl ? '' : ' hexo-github-card--without-image';
  const media = imageUrl
    ? `<span class="hexo-github-card__media"><img src="${escapeHTML(imageUrl)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"></span>`
    : '';

  return `<a class="hexo-github-card${imageClass}" href="${href}" target="_blank" rel="noopener noreferrer external" aria-label="Open ${escapeHTML(repositoryName)} on GitHub">
  <span class="hexo-github-card__site">
    <span class="hexo-github-card__site-label">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3h7v7h-2V6.41l-9.29 9.3-1.42-1.42 9.3-9.29H14V3Z"></path><path d="M5 5h6V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6h-2v6H5V5Z"></path></svg>
      github.com
    </span>
    <span class="hexo-github-card__repository">${escapeHTML(repositoryName)}</span>
  </span>
  <span class="hexo-github-card__body">
    ${media}
    <span class="hexo-github-card__content">
      <strong class="hexo-github-card__title">${title}</strong>
      <span class="hexo-github-card__description">${description}</span>
    </span>
  </span>
</a>`;
}

/**
 * Replaces matching paragraph ranges without reserializing the rest of the
 * article HTML, preserving code markup and theme-specific renderer output.
 *
 * @param {string} html Rendered article fragment.
 * @param {Function} resolveMetadata Repository metadata resolver.
 * @returns {Promise<string>}
 */
async function transformHtml(html, resolveMetadata) {
  if (typeof html !== 'string' || !html.includes('github.com')) {
    return html;
  }

  const candidates = [];
  const pattern = new RegExp(PARAGRAPH_PATTERN.source, PARAGRAPH_PATTERN.flags);
  let match;
  while ((match = pattern.exec(html)) !== null) {
    const repository = parseStandaloneRepositoryParagraph(match[0]);
    if (repository) {
      candidates.push({
        start: match.index,
        end: pattern.lastIndex,
        original: match[0],
        repository
      });
    }
  }
  if (candidates.length === 0) {
    return html;
  }

  const metadataValues = await Promise.all(
    candidates.map((candidate) => resolveMetadata(candidate.repository))
  );
  const output = [];
  let cursor = 0;

  candidates.forEach((candidate, index) => {
    output.push(html.slice(cursor, candidate.start));
    output.push(metadataValues[index]
      ? renderRepositoryCard(candidate.repository, metadataValues[index])
      : candidate.original);
    cursor = candidate.end;
  });
  output.push(html.slice(cursor));
  return output.join('');
}

/**
 * Registers filters and the stylesheet route on a Hexo instance.
 *
 * @param {object} hexoInstance Active Hexo instance.
 */
function registerPlugin(hexoInstance) {
  const config = normalizeConfig(hexoInstance.config.github_card);
  if (!config.enable) {
    return;
  }

  const resolveMetadata = createMetadataResolver(hexoInstance, config);
  const stylesheetPath = path.join(__dirname, 'assets', 'github-card.css');
  const stylesheetUrl = urlFor.call(hexoInstance, ASSET_ROUTE);

  hexoInstance.extend.generator.register('github_card_assets', function generateAssets() {
    return {
      path: ASSET_ROUTE,
      data: () => fs.createReadStream(stylesheetPath)
    };
  });

  // Loading one small stylesheet globally keeps the plugin independent from
  // theme internals and works correctly across PJAX navigation.
  hexoInstance.extend.injector.register(
    'head_end',
    `<link rel="stylesheet" href="${escapeHTML(stylesheetUrl)}">`,
    'default'
  );

  hexoInstance.extend.filter.register('after_post_render', async function transformPost(data) {
    if (!data || data.github_card === false) {
      return data;
    }

    for (const field of ['content', 'excerpt']) {
      if (typeof data[field] === 'string') {
        data[field] = await transformHtml(data[field], resolveMetadata);
      }
    }
    return data;
  }, 20);
}

if (typeof hexo !== 'undefined') {
  registerPlugin(hexo);
}

module.exports = {
  MetadataCache,
  createMetadataResolver,
  fetchRepositoryMetadata,
  normalizeConfig,
  normalizeDescription,
  parseGitHubRepositoryUrl,
  parseStandaloneRepositoryParagraph,
  registerPlugin,
  renderRepositoryCard,
  transformHtml
};
