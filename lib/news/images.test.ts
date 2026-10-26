import { describe, expect, it } from "vitest";
import { readWireImage, sharpen } from "@/lib/news/images";

describe("news photos", () => {
  it("keeps the outlet photo and asks the CDN for a sharper frame", () => {
    const coinDesk = readWireImage(`<item>
      <media:content url="https://cdn.sanity.io/images/s3y3vcno/production/abc-1920x1080.jpg?fm=jpg&amp;w=800&amp;h=450&amp;fit=clip" type="image/*" medium="image"/>
    </item>`);
    expect(coinDesk?.url).toContain("w=1600");
    expect(coinDesk?.url).toContain("h=900");
    expect(coinDesk?.url).not.toContain("w=800");

    const smallMaster = readWireImage(`<item>
      <media:content url="https://cdn.sanity.io/images/s3y3vcno/production/abc-640x360.jpg?w=400&amp;h=225" medium="image"/>
    </item>`);
    expect(smallMaster?.url).toContain("w=640");
    expect(smallMaster?.url).not.toContain("w=1600");

    const defiant = readWireImage(`<item>
      <media:thumbnail url="https://cdn.sanity.io/images/6oftkxoa/production/abc-2048x1152.png?w=800&amp;fit=max&amp;q=70" width="800" height="450"/>
    </item>`);
    expect(defiant?.url).toContain("w=1600");
    expect(defiant?.url).toContain("q=80");
  });

  it("prefers the full file over a resized proxy and skips pixels and video", () => {
    const decrypt = readWireImage(`<item>
      <enclosure url="https://img.decrypt.co/insecure/rs:fill:1024:512:1:0/plain/https://cdn.decrypt.co/wp-content/uploads/2026/03/wells.png@png" type="image/png" length="10"/>
      <media:thumbnail url="https://cdn.decrypt.co/wp-content/uploads/2026/03/wells.png" width="1778" height="1000"/>
    </item>`);
    expect(decrypt?.url).toBe("https://cdn.decrypt.co/wp-content/uploads/2026/03/wells.png");
    expect(decrypt?.width).toBe(1778);

    const proxyOnly = readWireImage(`<item>
      <enclosure url="https://img.decrypt.co/insecure/rs:fill:1024:512:1:0/plain/https://cdn.decrypt.co/wp-content/uploads/2026/03/wells.png@png" type="image/png"/>
    </item>`);
    expect(proxyOnly?.url).toBe("https://cdn.decrypt.co/wp-content/uploads/2026/03/wells.png");

    const noisy = readWireImage(`<item>
      <enclosure url="https://example.com/pixel.gif" type="image/gif" width="1" height="1"/>
      <enclosure url="https://example.com/clip.mp4" type="video/mp4"/>
      <description><![CDATA[<img width="1672" height="941" src="https://unchainedcrypto.com/wp-content/uploads/2026/10/hacker.png">]]></description>
    </item>`);
    expect(noisy?.url).toBe("https://unchainedcrypto.com/wp-content/uploads/2026/10/hacker.png");
    expect(noisy?.width).toBe(1672);
  });

  it("reads an atom enclosure and leaves an ordinary url alone", () => {
    const blockworks = readWireImage(`<entry>
      <link href="https://blockworks.com/news/story"/>
      <link rel="enclosure" href="https://blockworks-co.imgix.net/wp-content/uploads/2026/01/bw-maduro.png" type="image/png"/>
    </entry>`);
    expect(blockworks?.url).toContain("blockworks-co.imgix.net");
    expect(blockworks?.url).toContain("w=1600");
    expect(blockworks?.url).toContain("q=80");
    expect(readWireImage(`<item><title>No art</title></item>`)).toBeNull();
    expect(sharpen({ url: "https://example.com/photo.jpg", width: 900, height: 600 }).url).toBe("https://example.com/photo.jpg");
  });

  it("asks X and DexScreener for a larger rendition of the same file", () => {
    expect(sharpen({ url: "https://pbs.twimg.com/media/abc.jpg?name=small", width: 400, height: 400 }).url).toBe(
      "https://pbs.twimg.com/media/abc.jpg?name=large",
    );
    expect(sharpen({ url: "https://pbs.twimg.com/media/abc.jpg?name=orig", width: 1024, height: 1024 }).url).toContain("name=orig");
    const logo = sharpen({ url: "https://cdn.dexscreener.com/cms/images/logo?width=64&height=64&quality=95", width: null, height: null });
    expect(logo.url).toContain("width=256");
    expect(logo.url).toContain("height=256");
    const banner = sharpen({
      url: "https://cdn.dexscreener.com/cms/images/banner?width=900&height=300&quality=95",
      width: null,
      height: null,
    });
    expect(banner.url).toContain("width=1500");
    expect(banner.url).toContain("height=500");
  });
});
