// Structured data (JSON-LD) — single source of truth for the Astro layouts.
// Kept in sync by hand with the same blocks in public/index.html (static homepage).
//
// Built from the AEO Kit's own Snippet 2 (Organization) and Snippet 9 (Person).
// Kit rule: replace every placeholder with real details, and DELETE any line that
// does not apply rather than leaving placeholder text in. Accordingly:
//   - the registered-legal-name field is omitted: no legal entity exists.
//   - the founding-date field is omitted: the real date is not established.
//   - LocalBusiness / geo are not used: AHoosh is a remote consultancy with no
//     walk-in premises, so claiming a local storefront would be dishonest.

export const orgSchema = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'AHoosh',
  description:
    'AHoosh helps small businesses across Europe get found and quoted by AI assistants such as ChatGPT and Perplexity, through answer engine optimisation, AI readiness consulting and self-serve products.',
  url: 'https://ahoosh.ai',
  logo: 'https://ahoosh.ai/lab/Ahoosh_Vectore_Logo.webp',
  email: 'contact@ahoosh.ai',
  founder: {
    '@type': 'Person',
    name: 'Hesam Jafarzadeh',
  },
  address: {
    '@type': 'PostalAddress',
    addressLocality: 'Belgrade',
    addressCountry: 'RS',
  },
  areaServed: {
    '@type': 'Place',
    name: 'Europe',
  },
  sameAs: ['https://linkedin.com/company/ahoosh', 'https://t.me/ahooshai'],
};

export const personSchema = {
  '@context': 'https://schema.org',
  '@type': 'Person',
  name: 'Hesam Jafarzadeh',
  jobTitle: 'Founder and business consultant',
  description:
    'Hesam Jafarzadeh is a business consultant with 15+ years across B2C, B2B and B2G, and the founder of AHoosh. He is a PhD candidate in Software Engineering and E-Business at the University of Belgrade (FON), 2023-2027.',
  image: 'https://ahoosh.ai/lab/image19.webp',
  worksFor: {
    '@type': 'Organization',
    name: 'AHoosh',
    url: 'https://ahoosh.ai',
  },
  knowsAbout: [
    'Answer engine optimisation',
    'Business consulting',
    'AI readiness for small businesses',
  ],
};
