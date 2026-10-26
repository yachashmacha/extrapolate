export interface FeedItem {
  title: string;
  url: string;
  publishedAt: string;
  excerpt: string;
}

const EXCERPT_LIMIT = 240;

export function parseFeed(xml: string): FeedItem[] {
  const blocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? xml.match(/<entry\b[\s\S]*?<\/entry>/gi) ?? [];
  const items: FeedItem[] = [];
  for (const block of blocks) {
    const title = clean(textOf(block, ["title"]));
    const url = absolute(linkOf(block));
    const publishedAt = iso(textOf(block, ["pubDate", "published", "updated", "dc:date"]));
    if (!title || !url || !publishedAt) continue;
    items.push({
      title,
      url,
      publishedAt,
      excerpt: excerpt(textOf(block, ["description", "summary", "content"])),
    });
  }
  return items;
}

function textOf(block: string, names: string[]): string {
  for (const name of names) {
    const match = block.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, "i"));
    if (match?.[1]) return match[1];
  }
  return "";
}

function linkOf(block: string): string {
  const wrapped = textOf(block, ["link"]);
  if (/^https?:\/\//i.test(clean(wrapped))) return wrapped;
  const tags = [...block.matchAll(/<link\b([^>]*)\/?>/gi)];
  const alternate = tags.find((tag) => /rel=["']alternate["']/i.test(tag[1] ?? ""));
  const href = (alternate ?? tags[0])?.[1]?.match(/href=["']([^"']+)["']/i)?.[1];
  return href ?? wrapped;
}

function absolute(value: string): string | null {
  const url = clean(value);
  if (!/^https?:\/\//i.test(url)) return null;
  return url;
}

function iso(value: string): string | null {
  const text = clean(value);
  if (!text) return null;
  const time = Date.parse(text);
  if (!Number.isFinite(time)) return null;
  return new Date(time).toISOString();
}

function excerpt(value: string): string {
  const text = clean(value)
    .replace(/\s*The post [\s\S]+ appeared first on [\s\S]+$/i, "")
    .replace(/\s*The post [\s\S]+ first appeared on [\s\S]+$/i, "")
    .trim();
  if (text.length <= EXCERPT_LIMIT) return text;
  const cut = text.slice(0, EXCERPT_LIMIT);
  const space = cut.lastIndexOf(" ");
  return `${(space > 160 ? cut.slice(0, space) : cut).trim()}…`;
}

export function clean(value: string): string {
  const withoutCdata = value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  const decoded = withoutCdata
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => {
      const point = Number(code);
      return Number.isInteger(point) && point > 0 && point < 0x110000 ? String.fromCodePoint(point) : "";
    });
  return decoded.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
