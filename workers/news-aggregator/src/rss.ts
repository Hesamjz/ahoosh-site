// Minimal, dependency-free RSS/Atom item extractor for the Workers runtime.
// Pulls title, link, summary, pubDate from <item> (RSS) and <entry> (Atom).

export type RawItem = { title: string; link: string; summary: string; published: string | null };

function decode(s: string): string {
    return s
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
      .replace(/<[^>]+>/g, " ")
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ")
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
      .replace(/\s+/g, " ")
      .trim();
}

function tag(block: string, name: string): string {
    const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
    return m ? decode(m[1]) : "";
}

function atomLink(block: string): string {
    const m = block.match(/<link[^>]*href="([^"]+)"[^>]*\/?>/ );
    return m ? m[1] : "";
}

// Detect garbage titles with repeated words (e.g. "الف الف الف" or "سهام سهام سهام")
function hasRepetition(title: string): boolean {
    if (!title || title.length < 20) return false;
    const words = title.split(/[\s،,]+/).filter((w: string) => w.length >= 2);
    if (words.length < 4) return false;
    const freq: Record<string, number> = {};
    for (const w of words) {
          freq[w] = (freq[w] || 0) + 1;
          if (freq[w] >= 3) return true;
    }
    return false;
}

// Detect bracket/number spam like "[۱][۱][۱]" or "[][][][]"
function hasBracketSpam(title: string): boolean {
    return /(\[[\d۰-۹]*\]){3,}/.test(title);
}

export function parseFeed(xml: string, max = 8): RawItem[] {
    const out: RawItem[] = [];
    const isAtom = /<entry[\s>]/i.test(xml) && !/<item[\s>]/i.test(xml);
    const re = isAtom ? /<entry[\s>][\s\S]*?<\/entry>/gi : /<item[\s>][\s\S]*?<\/item>/gi;
    const blocks = xml.match(re) || [];
    for (const b of blocks.slice(0, max)) {
          const title = tag(b, "title");
          const link = isAtom ? atomLink(b) || tag(b, "id") : tag(b, "link") || (b.match(/<link>([^<]+)<\/link>/i)?.[1] ?? "");
          const summary = tag(b, "description") || tag(b, "summary") || tag(b, "content");
          const published = tag(b, "pubDate") || tag(b, "published") || tag(b, "updated") || null;
          if (title && link && !hasRepetition(title) && !hasBracketSpam(title))
                  out.push({ title, link: link.trim(), summary: summary.slice(0, 600), published });
    }
    return out;
}
