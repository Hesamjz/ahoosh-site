// Central UI strings for the 4 site languages.
// en = default (no URL prefix) · fa = فارسی (RTL) · de = Deutsch · sr = Srpski
// Page body copy lives in the per-locale page files; this file holds the
// shared chrome (nav, footer, switcher) + locale metadata.

export type Locale = 'en' | 'fa' | 'de' | 'sr';

export const LOCALES: Locale[] = ['en', 'fa', 'de', 'sr'];

export const LOCALE_META: Record<
  Locale,
  { label: string; dir: 'ltr' | 'rtl'; lang: string; base: string }
> = {
  en: { label: 'EN', dir: 'ltr', lang: 'en', base: '' },
  fa: { label: 'فا', dir: 'rtl', lang: 'fa', base: '/fa' },
  de: { label: 'DE', dir: 'ltr', lang: 'de', base: '/de' },
  sr: { label: 'SR', dir: 'ltr', lang: 'sr', base: '/sr' },
};

// Routes that exist in every locale (used for hreflang + the switcher).
export const LOCALIZED_ROUTES = [
  '',
  '/about',
  '/consulting',
  '/contact',
  '/articles',
  '/assess',
  '/markets',
];

export const CHROME: Record<
  Locale,
  {
    consulting: string;
    articles: string;
    about: string;
    markets: string;
    assess: string;
    bookCall: string;
    contact: string;
    bookDiscovery: string;
    footerTagline: string;
  }
> = {
  en: {
    consulting: 'Consulting',
    articles: 'Articles',
    about: 'About',
    markets: 'Markets',
    assess: 'Assess ✦',
    bookCall: 'Book a Call',
    contact: 'Contact',
    bookDiscovery: 'Book a Discovery Call',
    footerTagline: 'AI · Market Data · Research · Consulting',
  },
  fa: {
    consulting: 'مشاوره',
    articles: 'مقالات',
    about: 'درباره ما',
    markets: 'بازارها',
    assess: 'آزمون‌ها ✦',
    bookCall: 'تماس با ما',
    contact: 'تماس',
    bookDiscovery: 'گفت‌وگو با آهوش',
    footerTagline: 'هوش مصنوعی · داده بازار · پژوهش · مشاوره',
  },
  de: {
    consulting: 'Beratung',
    articles: 'Artikel',
    about: 'Über uns',
    markets: 'Märkte',
    assess: 'Tests ✦',
    bookCall: 'Gespräch buchen',
    contact: 'Kontakt',
    bookDiscovery: 'Erstgespräch buchen',
    footerTagline: 'KI · Marktdaten · Research · Beratung',
  },
  sr: {
    consulting: 'Konsalting',
    articles: 'Članci',
    about: 'O nama',
    markets: 'Tržišta',
    assess: 'Testovi ✦',
    bookCall: 'Zakaži razgovor',
    contact: 'Kontakt',
    bookDiscovery: 'Zakaži uvodni razgovor',
    footerTagline: 'AI · Tržišni podaci · Istraživanje · Konsalting',
  },
};

/** Strip a locale prefix from a path: /fa/about → /about ; /about → /about */
export function stripLocale(pathname: string): string {
  const clean = pathname.replace(/\/$/, '') || '/';
  for (const l of LOCALES) {
    const base = LOCALE_META[l].base;
    if (base && (clean === base || clean.startsWith(base + '/'))) {
      return clean.slice(base.length) || '';
    }
  }
  return clean === '/' ? '' : clean;
}

/** Detect the locale of a path. */
export function localeOf(pathname: string): Locale {
  const clean = pathname.replace(/\/$/, '') || '/';
  for (const l of LOCALES) {
    const base = LOCALE_META[l].base;
    if (base && (clean === base || clean.startsWith(base + '/'))) return l;
  }
  return 'en';
}
