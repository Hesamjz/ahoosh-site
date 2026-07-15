// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// ── Sitemap hygiene (2026-07-15) ─────────────────────────────────────────────
// @astrojs/sitemap enumerates every route in src/pages/, which previously meant
// the sitemap advertised ~120 /writing/* URLs that only 301 to /articles/*, an
// internal templates page, and /hokm/ — which already carries <meta robots
// noindex>, so the sitemap and the page were telling Google opposite things.
// A sitemap should list final, indexable, 200-status URLs and nothing else.
const SITEMAP_EXCLUDE = [
  /^\/writing(\/|$)/,        // legacy paths — 301 to /articles/*
  /^\/home-v2\/?$/,          // duplicate of the homepage
  /^\/hokm\/?$/,             // already noindex
  /^\/reply-templates\/?$/,  // internal-only
  /^\/contact\/thanks\/?$/,  // post-submit page
  /^\/assess\/report\/?$/,   // per-user result page
];

// The homepage and the main money pages are hand-built static files in public/,
// not Astro routes, so the sitemap integration cannot see them and left them out
// entirely — the site's most important URLs were the ones missing. List them here.
// (/fa/ is deliberately retired to a 404 and must NOT be added back.)
const SITEMAP_STATIC_PAGES = [
  'https://ahoosh.ai/',
  'https://ahoosh.ai/about/',
  'https://ahoosh.ai/services/',
  'https://ahoosh.ai/news/',
  'https://ahoosh.ai/contact/',
  'https://ahoosh.ai/assess/',
];

export default defineConfig({
  site: 'https://ahoosh.ai',
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
    routing: { prefixDefaultLocale: false },
  },
  integrations: [
    mdx(),
    sitemap({
      filter: (page) =>
        !SITEMAP_EXCLUDE.some((re) => re.test(new URL(page).pathname)),
      customPages: SITEMAP_STATIC_PAGES,
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
