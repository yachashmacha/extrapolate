import type { NewsImage } from "@/lib/news/types";

export type { NewsImage };

const SKIP = /(?:pixel|spacer|tracking|favicon|badge|1x1)/i;

export function readWireImage(block: string): NewsImage | null {
  const found: NewsImage[] = [];
  for (const tag of block.matchAll(/<(media:content|media:thumbnail|enclosure)\b([^>]*)>/gi)) {
    const kind = tag[1].toLowerCase();
    const attrs = tag[2] ?? "";
    const type = attr(attrs, "type") ?? "";
    const medium = (attr(attrs, "medium") ?? "").toLowerCase();
    if (/^(audio|video)\//i.test(type)) continue;
    if (kind === "media:content" && medium && medium !== "image") continue;
    if (kind === "enclosure" && type && !/^image\//i.test(type)) continue;
    const url = httpsImage(attr(attrs, "url"));
    if (!url || SKIP.test(url)) continue;
    const width = dim(attr(attrs, "width"));
    const height = dim(attr(attrs, "height"));
    if (tiny(width, height)) continue;
    found.push({ url, width, height });
  }
  for (const tag of block.matchAll(/<link\b([^>]*)\/?>/gi)) {
    const attrs = tag[1] ?? "";
    if (!/rel=["']enclosure["']/i.test(attrs)) continue;
    const type = attr(attrs, "type") ?? "";
    if (type && !/^image\//i.test(type)) continue;
    const url = httpsImage(attr(attrs, "href"));
    if (!url || SKIP.test(url)) continue;
    const width = dim(attr(attrs, "width"));
    const height = dim(attr(attrs, "height"));
    if (tiny(width, height)) continue;
    found.push({ url, width, height });
  }
  const pool = found.length > 0 ? found : inlineImages(block);
  if (pool.length === 0) return null;
  const best = pool.slice().sort((left, right) => score(right) - score(left))[0];
  return sharpen(best);
}

export function sharpen(image: NewsImage): NewsImage {
  try {
    return { ...image, url: upgrade(new URL(image.url)) };
  } catch {
    return image;
  }
}

export function httpsImage(value: string | null | undefined): string | null {
  if (!value) return null;
  const url = decode(value).trim();
  if (!url.startsWith("https://") || url.length > 2000 || /\s/.test(url)) return null;
  return url;
}

function inlineImages(block: string): NewsImage[] {
  const out: NewsImage[] = [];
  for (const tag of block.matchAll(/<img\b([^>]*)>/gi)) {
    const attrs = tag[1] ?? "";
    const url = httpsImage(attr(attrs, "src"));
    if (!url || SKIP.test(url)) continue;
    const width = dim(attr(attrs, "width"));
    const height = dim(attr(attrs, "height"));
    if (tiny(width, height)) continue;
    out.push({ url, width, height });
    break;
  }
  return out;
}

function upgrade(parsed: URL): string {
  const host = parsed.hostname;
  if (host === "img.decrypt.co") {
    const match = parsed.pathname.match(/\/plain\/(https?:\/\/.+?)(?:@(?:png|jpe?g|webp|avif))?$/i);
    if (match) {
      const original = decodeURIComponent(match[1]);
      if (original.startsWith("https://")) return original;
    }
  }
  if (host.endsWith("sanity.io")) {
    const target = Math.min(1600, sourceWidth(parsed.pathname) ?? 1600);
    const w = num(parsed.searchParams.get("w"));
    const h = num(parsed.searchParams.get("h"));
    if (w && w < target) {
      if (h) parsed.searchParams.set("h", String(Math.max(1, Math.round(h * (target / w)))));
      parsed.searchParams.set("w", String(target));
    } else if (!w) {
      parsed.searchParams.set("w", String(target));
      if (!parsed.searchParams.get("fit")) parsed.searchParams.set("fit", "max");
    }
    const q = num(parsed.searchParams.get("q"));
    if (q && q < 80) parsed.searchParams.set("q", "80");
    return parsed.toString();
  }
  if (host.endsWith("imgix.net") && !parsed.searchParams.has("w")) {
    const target = Math.min(1600, sourceWidth(parsed.pathname) ?? 1600);
    parsed.searchParams.set("w", String(target));
    parsed.searchParams.set("fit", "max");
    parsed.searchParams.set("q", "80");
    parsed.searchParams.set("auto", "format");
    return parsed.toString();
  }
  if (host.endsWith("tbstat.com")) {
    parsed.pathname = parsed.pathname.replace(/quality=(\d+)/, (_, quality: string) => `quality=${Math.max(Number(quality), 90)}`);
    return parsed.toString();
  }
  if (host === "pbs.twimg.com") {
    const name = parsed.searchParams.get("name");
    if (name && name !== "orig" && name !== "large") parsed.searchParams.set("name", "large");
    return parsed.toString();
  }
  if (host === "cdn.dexscreener.com") {
    const w = num(parsed.searchParams.get("width"));
    const h = num(parsed.searchParams.get("height"));
    if (w && h && w <= h && w < 480) {
      const target = 256;
      parsed.searchParams.set("height", String(Math.round(h * (target / w))));
      parsed.searchParams.set("width", String(target));
    } else if (w && h && w > h * 1.8 && w < 1400) {
      const target = 1500;
      parsed.searchParams.set("height", String(Math.round(h * (target / w))));
      parsed.searchParams.set("width", String(target));
    } else if (w && !h && w < 480) {
      parsed.searchParams.set("width", "256");
    }
    return parsed.toString();
  }
  return parsed.toString();
}

function sourceWidth(pathname: string): number | null {
  const match = pathname.match(/-(\d{3,5})x(\d{3,5})(?:\.|$)/);
  return match ? Number(match[1]) : null;
}

function score(image: NewsImage): number {
  return image.width ?? 1200;
}

function tiny(width: number | null, height: number | null): boolean {
  if (width != null && height != null) return width < 80 && height < 80;
  if (width != null) return width < 120;
  if (height != null) return height < 80;
  return false;
}

function dim(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function num(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function attr(source: string, name: string): string | null {
  const match = source.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i"));
  if (!match) return null;
  return decode(match[1] ?? match[2] ?? match[3] ?? "");
}

function decode(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => {
      const point = Number(code);
      return Number.isInteger(point) && point > 0 && point < 0x110000 ? String.fromCodePoint(point) : "";
    });
}
