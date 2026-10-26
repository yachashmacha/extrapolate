import { describe, expect, it } from "vitest";
import { lanesFor } from "@/lib/news/lanes";
import { assembleNews } from "@/lib/news/load";
import { parseFeed } from "@/lib/news/parse";
import { mentionsMarket } from "@/lib/news/relevance";
import { tapeSentence } from "@/lib/news/tape";
import type { AttentionCoin } from "@/lib/news/types";

const rss = `<?xml version="1.0"?>
<rss><channel>
  <title>Wire</title>
  <item>
    <title><![CDATA[Memecoin momentum is the strategy desks are naming]]></title>
    <link>https://example.com/meme?utm=1</link>
    <pubDate>Sat, 24 Oct 2026 15:00:00 GMT</pubDate>
    <description><![CDATA[<p>A Solana narrative &amp; a funding rate setup.</p>]]></description>
    <media:content url="https://cdn.sanity.io/images/s3y3vcno/production/desk-1920x1080.jpg?w=800&amp;h=450" type="image/*" medium="image"/>
  </item>
  <item>
    <title>No date</title>
    <link>https://example.com/skip</link>
    <description>Missing a clock.</description>
  </item>
</channel></rss>`;

const atom = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>SEC bill targets stablecoin issuers</title>
    <link rel="alternate" href="https://example.com/sec"/>
    <updated>2026-10-25T12:00:00Z</updated>
    <summary>Congress published the text.</summary>
  </entry>
</feed>`;

describe("news wire", () => {
  it("reads rss and atom items and drops a story with no time", () => {
    const items = parseFeed(rss);
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("Memecoin momentum is the strategy desks are naming");
    expect(items[0].excerpt).toBe("A Solana narrative & a funding rate setup.");
    expect(items[0].url).toBe("https://example.com/meme?utm=1");
    expect(items[0].image?.url).toContain("w=1600");
    expect(items[0].image?.url).toContain("h=900");
    const policy = parseFeed(atom);
    expect(policy[0].url).toBe("https://example.com/sec");
    expect(policy[0].publishedAt).toBe("2026-10-25T12:00:00.000Z");
    const footer = parseFeed(`<?xml version="1.0"?><rss><channel><item>
      <title>Phantom starts prediction markets</title>
      <link>https://example.com/phantom</link>
      <pubDate>Sat, 24 Oct 2026 15:00:00 GMT</pubDate>
      <description><![CDATA[Trades run through Kalshi. The post Phantom starts prediction markets appeared first on Unchained.]]></description>
    </item></channel></rss>`);
    expect(footer[0].excerpt).toBe("Trades run through Kalshi.");
  });

  it("files a headline by what it actually says", () => {
    expect(lanesFor("Memecoin momentum is the strategy desks are naming", "A Solana narrative")).toEqual(
      expect.arrayContaining(["memecoin", "solana", "strategy"]),
    );
    expect(lanesFor("SEC bill targets stablecoin issuers", "Congress published the text.")).toEqual(
      expect.arrayContaining(["rules", "markets"]),
    );
    expect(lanesFor("Desk opens for the week", "No coin, no policy.")).toEqual(["markets"]);
    expect(lanesFor("Solid returns for a console maker", "")).toEqual(["markets"]);
    expect(lanesFor("Strategy, Strive face a balancing act between bitcoin buying", "")).toEqual(["markets"]);
    expect(lanesFor("API Key Rotation: what redeployment changes", "")).toEqual(["markets"]);
    expect(lanesFor("Crypto longs lose $404 million as bitcoin slips", "")).toEqual(["markets"]);
    expect(lanesFor("Dogecoin Foundation and House of Doge end the brand deal", "")).toEqual(["memecoin"]);
    expect(lanesFor("Trading stocks against a ticker is the latest trend", "")).toEqual(["strategy"]);
    expect(lanesFor("Phantom rolls out prediction markets", "")).toEqual(expect.arrayContaining(["solana", "strategy"]));
  });

  it("counts the boosted tape and drops a linked post that is not about a market", () => {
    const coins: AttentionCoin[] = [
      { symbol: "AXE", name: "Axe", url: "https://dexscreener.com/solana/a", marketCapUsd: 1000, volumeUsd: 12, changePct: -3.2, boosts: 40, blurb: null, imageUrl: null, headerUrl: null },
      { symbol: "TIT", name: "Tit", url: "https://dexscreener.com/solana/b", marketCapUsd: 200, volumeUsd: 900, changePct: 10, boosts: 10, blurb: null, imageUrl: null, headerUrl: null },
    ];
    expect(tapeSentence(coins)).toBe("2 boosted pairs are on this read. 1 up and 1 down on the day. 1 has more 24-hour volume than market cap. Widest day move: TIT +10.0%. Heaviest volume: TIT $900.");
    expect(tapeSentence([])).toBeNull();
    expect(mentionsMarket("Volume faded after the entry.")).toBe(true);
    expect(mentionsMarket("Scientists modeled the exact dance moves men should use.")).toBe(false);
    expect(mentionsMarket("Pretty weird, sent from a sol wallet.")).toBe(false);
  });

  it("keeps a boosted coin and the X post it links, and still returns the wire when one outlet fails", async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("coindesk")) return new Response("nope", { status: 500 });
      if (url.includes("rss") || url.includes("feed")) return new Response(rss, { status: 200 });
      if (url.endsWith("token-boosts/top/v1")) {
        return Response.json([
          {
            chainId: "solana",
            tokenAddress: "Mint111",
            description: "The project wrote this line.",
            icon: "not-a-url",
            header: "https://cdn.dexscreener.com/cms/images/small-banner?width=900&height=300&quality=95",
            totalAmount: 40,
            links: [{ url: "https://x.com/trader/status/100" }],
          },
        ]);
      }
      if (url.endsWith("token-profiles/latest/v1")) {
        return Response.json([
          {
            chainId: "solana",
            tokenAddress: "Mint222",
            links: [{ url: "https://x.com/dancer/status/200" }, { url: "https://x.com/scout/status/300" }],
          },
        ]);
      }
      if (url.includes("/tokens/v1/solana/")) {
        return Response.json([
          {
            chainId: "solana",
            url: "https://dexscreener.com/solana/pair",
            baseToken: { address: "Mint111", name: "Axe", symbol: "AXE" },
            volume: { h24: 12 },
            priceChange: { h24: -3.2 },
            liquidity: { usd: 9 },
            marketCap: 1000,
            info: {
              imageUrl: "https://cdn.dexscreener.com/cms/images/axe?width=800&height=800&quality=95",
              header: "https://cdn.dexscreener.com/cms/images/axe-banner?width=1500&height=500&quality=95",
            },
          },
        ]);
      }
      if (url.includes("fxtwitter.com/trader/status/100")) {
        return Response.json({
          tweet: {
            url: "https://x.com/trader/status/100",
            text: "Volume faded after the entry.",
            created_at: "Sat, 25 Oct 2026 16:00:00 GMT",
            author: { name: "Trader", screen_name: "trader" },
            media: { photos: [{ url: "https://pbs.twimg.com/media/axe.jpg?name=small", width: 800, height: 600 }] },
          },
        });
      }
      if (url.includes("fxtwitter.com/dancer/status/200")) {
        return Response.json({
          tweet: {
            url: "https://x.com/dancer/status/200",
            text: "Scientists modeled the exact dance moves men should use.",
            created_at: "Sat, 25 Oct 2026 17:00:00 GMT",
            author: { name: "Dancer", screen_name: "dancer" },
          },
        });
      }
      if (url.includes("fxtwitter.com/scout/status/300")) {
        return Response.json({
          tweet: {
            url: "https://x.com/scout/status/300",
            text: "Pump.fun fees are the story on this coin.",
            created_at: "Sat, 25 Oct 2026 18:00:00 GMT",
            author: { name: "Scout", screen_name: "scout" },
          },
        });
      }
      throw new Error(url);
    };

    const desk = await assembleNews(fetchImpl, new Date("2026-10-25T18:00:00.000Z"));
    expect(desk.missed).toContain("CoinDesk");
    expect(desk.wires.length).toBeGreaterThan(0);
    expect(desk.wires[0].lanes).toEqual(expect.arrayContaining(["memecoin", "strategy"]));
    expect(desk.coins).toEqual([
      expect.objectContaining({
        symbol: "AXE",
        marketCapUsd: 1000,
        volumeUsd: 12,
        changePct: -3.2,
        boosts: 40,
        blurb: "The project wrote this line.",
        imageUrl: "https://cdn.dexscreener.com/cms/images/axe?width=800&height=800&quality=95",
        headerUrl: "https://cdn.dexscreener.com/cms/images/axe-banner?width=1500&height=500&quality=95",
      }),
    ]);
    expect(desk.posts.map((post) => post.text)).toEqual([
      "Volume faded after the entry.",
      "Pump.fun fees are the story on this coin.",
    ]);
    expect(desk.posts[0]).toEqual(expect.objectContaining({ handle: "trader", coinSymbol: "AXE" }));
    expect(desk.posts[0].photos).toEqual([{ url: "https://pbs.twimg.com/media/axe.jpg?name=large", width: 800, height: 600 }]);
    expect(desk.wires[0].image?.url).toContain("desk-1920x1080.jpg");
    expect(desk.wires[0].image?.url).toContain("w=1600");
    expect(desk.posts[1].coinSymbol).toBeNull();
    expect(JSON.stringify(desk.posts)).not.toContain("dance");
    expect(desk.wires[0].marks).toEqual([]);
    expect(desk.posts[0].marks).toEqual([]);
    expect(desk.posts[1].marks).toEqual([]);
    expect(desk.missed).not.toContain("coin prices");
  });

  it("notes the day change when a story or post names a coin", async () => {
    const marked = `<?xml version="1.0"?>
<rss><channel>
  <item>
    <title>Dogecoin slips while bitcoin holds</title>
    <link>https://example.com/doge</link>
    <pubDate>Sat, 25 Oct 2026 12:00:00 GMT</pubDate>
    <description>Funding stays elevated.</description>
  </item>
  <item>
    <title>Trump spoke at a rally</title>
    <link>https://example.com/rally</link>
    <pubDate>Sat, 25 Oct 2026 11:00:00 GMT</pubDate>
    <description>No coin in this copy.</description>
  </item>
  <item>
    <title>AXE leads the hour</title>
    <link>https://example.com/axe</link>
    <pubDate>Sat, 25 Oct 2026 10:00:00 GMT</pubDate>
    <description>Volume is the tell.</description>
  </item>
</channel></rss>`;
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("coindesk")) return new Response("nope", { status: 500 });
      if (url.includes("rss") || url.includes("feed")) return new Response(marked, { status: 200 });
      if (url.endsWith("token-boosts/top/v1")) {
        return Response.json([
          {
            chainId: "solana",
            tokenAddress: "Mint111",
            totalAmount: 40,
            links: [{ url: "https://x.com/trader/status/100" }, { url: "https://x.com/scout/status/300" }],
          },
        ]);
      }
      if (url.endsWith("token-profiles/latest/v1")) return Response.json([]);
      if (url.includes("/tokens/v1/solana/")) {
        return Response.json([
          {
            chainId: "solana",
            url: "https://dexscreener.com/solana/pair",
            baseToken: { address: "Mint111", name: "Axe", symbol: "AXE" },
            volume: { h24: 12 },
            priceChange: { h24: -3.2 },
            liquidity: { usd: 9 },
            marketCap: 1000,
          },
        ]);
      }
      if (url.includes("fxtwitter.com/trader/status/100")) {
        return Response.json({
          tweet: {
            url: "https://x.com/trader/status/100",
            text: "Volume faded after the entry.",
            created_at: "Sat, 25 Oct 2026 16:00:00 GMT",
            author: { name: "Trader", screen_name: "trader" },
          },
        });
      }
      if (url.includes("fxtwitter.com/scout/status/300")) {
        return Response.json({
          tweet: {
            url: "https://x.com/scout/status/300",
            text: "AXE volume is the whole story on this coin.",
            created_at: "Sat, 25 Oct 2026 18:00:00 GMT",
            author: { name: "Scout", screen_name: "scout" },
          },
        });
      }
      if (url.includes("api.coingecko.com")) {
        return Response.json({
          dogecoin: { usd: 0.19, usd_24h_change: 0.195 },
          bitcoin: { usd: 80099, usd_24h_change: -0.494 },
        });
      }
      throw new Error(url);
    };

    const desk = await assembleNews(fetchImpl, new Date("2026-10-25T18:00:00.000Z"));
    const byTitle = new Map(desk.wires.map((item) => [item.title, item.marks]));
    expect(byTitle.get("Dogecoin slips while bitcoin holds")).toEqual([
      { symbol: "DOGE", changePct: 0.195 },
      { symbol: "BTC", changePct: -0.494 },
    ]);
    expect(byTitle.get("Trump spoke at a rally")).toEqual([]);
    expect(byTitle.get("AXE leads the hour")).toEqual([{ symbol: "AXE", changePct: -3.2 }]);
    expect(desk.posts.find((post) => post.handle === "trader")?.marks).toEqual([]);
    expect(desk.posts.find((post) => post.handle === "scout")?.marks).toEqual([{ symbol: "AXE", changePct: -3.2 }]);
    expect(desk.posts.find((post) => post.handle === "trader")?.coinSymbol).toBe("AXE");
  });
});
