// Astro static JSON endpoint — built at deploy time.
// Returns the 15 most recent EN blog articles for use in the news feed.
import { getCollection } from 'astro:content';

export async function GET() {
  const posts = await getCollection('blog');
  const en = posts
    .filter((p) => !p.data.draft && !/^(fa|de|sr)\//.test(p.id))
    .sort((a, b) => new Date(b.data.pubDate).getTime() - new Date(a.data.pubDate).getTime())
    .slice(0, 15)
    .map((p) => ({
      title: p.data.title,
      description: p.data.description || '',
      pubDate: p.data.pubDate,
      slug: p.id,
      tags: p.data.tags || [],
      source: 'AHoosh',
      lang: 'en',
    }));

  return new Response(JSON.stringify(en), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
