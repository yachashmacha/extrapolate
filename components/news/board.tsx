import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { Mark } from "@/components/mark";
import { fmtMc, fmtPct, fmtWhen } from "@/lib/format";
import { isNewsLane } from "@/lib/news/lanes";
import { tapeSentence } from "@/lib/news/tape";
import { NEWS_LANES, type CoinMark, type NewsDesk, type NewsLane, type WireItem } from "@/lib/news/types";
import { traderSearch } from "@/lib/trader";
import styles from "./news.module.css";

export function NewsBoard({ desk, lane }: { desk: NewsDesk; lane: NewsLane | "all" }) {
  const wires = lane === "all" ? desk.wires : desk.wires.filter((item) => item.lanes.includes(lane));
  const strategies = desk.wires.filter((item) => item.lanes.includes("strategy")).slice(0, 3);
  const counts = countLanes(desk.wires);
  const tape = tapeSentence(desk.coins);

  return (
    <main className="shell desk">
      <header className="desk-bar">
        <div className="bar-start">
          <Link className="wordmark" href="/">
            <Mark />
            extrapolate
          </Link>
          <SiteNav current="news" />
        </div>
        <div className="who">
          <strong>News</strong>
          <div className="note">Read at {fmtWhen(desk.loadedAt)} ET</div>
        </div>
      </header>

      <section className={styles.lead}>
        <p className="kicker">News</p>
        <h1>What the news and the boosted Solana coins are saying.</h1>
        <p className="lede">
          Headlines come from CoinDesk, Cointelegraph, Decrypt, The Block, DL News, Blockworks, Unchained, Bankless, and The Defiant. The coins are Solana pairs DexScreener is boosting now. A post appears only when one of those coins links it, the text can be read back from X, and that text is about a coin or the market.
        </p>
        <p className="note">
          Biases are still read from the closes on the <Link href={`/desk${traderSearch()}`}>desk</Link>. A headline here does not add one, and none of this is a signal.
        </p>
      </section>

      <section className="section" aria-label="Lanes in this read">
        <p className={styles.stats}>
          {counts.map((row) => (
            <span key={row.id}>
              {row.label}
              <b className="num">{row.count}</b>
            </span>
          ))}
        </p>
        <p className={`note ${styles.center}`}>
          A headline with no closer match goes under Markets. One headline can match more than one filter.
        </p>
      </section>

      <section className="section" aria-labelledby="attention">
        <div className="section-head">
          <div>
            <p className="kicker">Boosted coins</p>
            <h2 id="attention">Getting attention</h2>
          </div>
          <p>DexScreener boosts are paid placement. They show what is being promoted, not what is safe. Market cap, volume, and the day change are the pair. The line under the name is the project’s own text.</p>
        </div>
        {tape ? <p className={`panel ${styles.reading}`}>{tape}</p> : null}
        {desk.coins.length > 0 ? (
          <div className={styles.coins}>
            {desk.coins.map((coin) => (
              <article key={coin.url} className={`panel ${styles.card}`}>
                <p className="kicker">{coin.symbol}</p>
                <h3>{coin.name}</h3>
                {coin.blurb ? <p className="note">{coin.blurb}</p> : null}
                <p className={styles.meta}>
                  <span>Cap <b className="num">{coin.marketCapUsd == null ? "—" : fmtMc(coin.marketCapUsd)}</b></span>
                  <span>Volume <b className="num">{coin.volumeUsd == null ? "—" : fmtMc(coin.volumeUsd)}</b></span>
                  <span>
                    Day{" "}
                    <b className={coin.changePct == null ? "num" : coin.changePct < 0 ? "bad num" : coin.changePct > 0 ? "good num" : "num"}>
                      {coin.changePct == null ? "—" : fmtPct(coin.changePct, 1)}
                    </b>
                  </span>
                  {coin.boosts != null ? <span>Boosts <b className="num">{coin.boosts.toLocaleString("en-US")}</b></span> : null}
                </p>
                <p className={styles.links}>
                  <a href={coin.url} target="_blank" rel="noreferrer">DexScreener</a>
                </p>
              </article>
            ))}
          </div>
        ) : (
          <p className="note">No boosted Solana pair came back on this read.</p>
        )}
      </section>

      <section className="section" aria-labelledby="x-posts">
        <div className="section-head">
          <div>
            <p className="kicker">X</p>
            <h2 id="x-posts">Posts the coins linked</h2>
          </div>
          <p>The text is the post. If a coin did not link a post, X did not return it, or the text is not about a coin or the market, it is left off.</p>
        </div>
        {desk.posts.length > 0 ? (
          <div className={styles.posts}>
            {desk.posts.map((post) => (
              <article key={post.url} className={`panel ${styles.card}`}>
                <p className="kicker">{post.coinSymbol ? post.coinSymbol : `@${post.handle}`}</p>
                <h3>{post.author}</h3>
                <p>{post.text}</p>
                <GropyMarks marks={post.marks} />
                <p className="note">{fmtWhen(post.publishedAt)} ET · <span className={styles.handle}>{`@${post.handle}`}</span></p>
                <a href={post.url} target="_blank" rel="noreferrer">Open on X</a>
              </article>
            ))}
          </div>
        ) : (
          <p className="note">None of the coins in this read linked an X post that could be read.</p>
        )}
      </section>

      {lane === "all" ? (
        <section className="section" aria-labelledby="strategies">
          <div className="section-head">
            <div>
              <p className="kicker">Strategies</p>
              <h2 id="strategies">What the headlines named</h2>
            </div>
            <p>A story lands here when the headline names a way of trading or a trend. It is the outlet’s piece, not a rule for this desk.</p>
          </div>
          {strategies.length > 0 ? (
            <div className={styles.wire}>
              {strategies.map((item) => (
                <Story key={item.url} item={item} />
              ))}
            </div>
          ) : (
            <p className="note">No headline in this read names a way of trading or a trend.</p>
          )}
        </section>
      ) : null}

      <section className="section" aria-labelledby="wire">
        <div className="section-head">
          <div>
            <p className="kicker">Headlines</p>
            <h2 id="wire">{lane === "all" ? "Latest" : NEWS_LANES.find((row) => row.id === lane)?.label}</h2>
          </div>
          <p>{wires.length === 1 ? "1 story here." : `${wires.length} stories here.`}</p>
        </div>
        <div className={styles.lanes}>
          {NEWS_LANES.map((row) => (
            <Link key={row.id} className={`chip ${styles.lane}`} href={row.id === "all" ? "/news" : `/news?lane=${row.id}`} aria-current={lane === row.id ? "page" : undefined}>
              {row.label}
            </Link>
          ))}
        </div>
        {wires.length > 0 ? (
          <div className={styles.wire}>
            {wires.map((item) => (
              <Story key={item.url} item={item} />
            ))}
          </div>
        ) : (
          <p className="note">None of the headlines in this read match that filter.</p>
        )}
        {desk.missed.length > 0 ? <p className="note">Did not answer: {desk.missed.join(", ")}.</p> : null}
      </section>
    </main>
  );
}

function Story({ item }: { item: WireItem }) {
  return (
    <a className={`panel ${styles.story}`} href={item.url} target="_blank" rel="noreferrer">
      <span className={styles.when}>
        {item.source}
        <br />
        {fmtWhen(item.publishedAt)} ET
      </span>
      <span>
        <h3>{item.title}</h3>
        {item.excerpt ? <p className="note">{item.excerpt}</p> : null}
        <GropyMarks marks={item.marks} />
      </span>
    </a>
  );
}

function GropyMarks({ marks }: { marks: CoinMark[] }) {
  if (marks.length === 0) return null;
  return (
    <span className={styles.gropy}>
      {marks.map((mark) => (
        <span key={mark.symbol} className={styles.tick}>
          Gropy trading {mark.symbol}{" "}
          <b className={mark.changePct < 0 ? "bad num" : mark.changePct > 0 ? "good num" : "num"}>
            {fmtPct(mark.changePct, 1)}
          </b>
        </span>
      ))}
    </span>
  );
}

function countLanes(wires: WireItem[]): { id: NewsLane; label: string; count: number }[] {
  return NEWS_LANES.filter((row): row is { id: NewsLane; label: string } => isNewsLane(row.id)).map((row) => ({
    id: row.id,
    label: row.label,
    count: wires.filter((item) => item.lanes.includes(row.id)).length,
  }));
}
