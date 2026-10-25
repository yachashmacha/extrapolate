import Link from "next/link";
import { Mark } from "@/components/mark";
import { fmtMc, fmtUsd, fmtWhen } from "@/lib/format";
import type { GropyView } from "@/lib/gropy/view";
import { traderSearch } from "@/lib/trader";
import styles from "./gropy.module.css";

export function GropyBoard({ view }: { view: GropyView }) {
  const search = traderSearch();
  const showSize = view.copies.some((row) => typeof row.amountUsd === "number");
  const showCap = view.copies.some((row) => typeof row.entryMarketCapUsd === "number");

  return (
    <main className={`shell desk ${styles.page}`}>
      <header className="desk-bar">
        <div className="bar-start">
          <Link className="wordmark" href="/">
            <Mark />
            extrapolate
          </Link>
          <nav className="page-switch" aria-label="Book pages">
            <Link href={`/desk${search}`}>Desk</Link>
            <Link href={`/portfolio${search}`}>Portfolio</Link>
            <Link href="/gropy" aria-current="page">
              gropy
            </Link>
          </nav>
        </div>
      </header>

      <div className={styles.intro}>
        <p className="kicker">Grokbot copy book</p>
        <h1>gropy</h1>
        <p className="lede">
          gropy follows one wallet from the KOL list. The seat has to be profitable on verified closed trades. Losing trades are counted while that wallet is being copied. More than {view.fireLossLimit} losses fires them, and the next seat has to be a different wallet with a better verified result. A fired wallet stays off the book. The rows below are paper copies of real buys. gropy does not hold a key and does not send a transaction.
        </p>
      </div>

      <p className={styles.stats}>
        <span>
          KOL list<b>{view.catalogSize.toLocaleString("en-US")}</b>
        </span>
        <span>
          Verified closes<b>{view.verifiedCloses.toLocaleString("en-US")}</b>
        </span>
        <span>
          Profitable<b>{view.eligibleCount.toLocaleString("en-US")}</b>
        </span>
      </p>

      <div className={styles.grid}>
        <section className={styles.card} aria-labelledby="gropy-seat">
          <p className="kicker" id="gropy-seat">
            Copying now
          </p>
          {view.copying ? (
            <>
              <h2 className={styles.name}>{view.copying}</h2>
              {typeof view.copyingRealizedUsd === "number" && typeof view.copyingCloses === "number" ? (
                <p className={styles.realized}>
                  Verified realized {fmtUsd(view.copyingRealizedUsd)} across {view.copyingCloses} closed {view.copyingCloses === 1 ? "trade" : "trades"}.
                </p>
              ) : null}
              <div className={styles.meter} aria-label="Losing trades toward the fire line">
                {Array.from({ length: view.fireLossLimit + 1 }, (_, index) => {
                  const step = index + 1;
                  const hit = view.lossesTowardFire >= step;
                  const fire = step > view.fireLossLimit;
                  return (
                    <span key={step} className={`${styles.pip} ${hit ? styles.pipOn : ""} ${fire ? styles.pipFire : ""}`}>
                      {fire ? "Third loss fires" : `Loss ${step}`}
                    </span>
                  );
                })}
              </div>
              <p className={styles.note}>{lossSentence(view.lossesTowardFire, view.fireLossLimit)}</p>
            </>
          ) : (
            <>
              <h2 className={styles.name}>Nobody</h2>
              <p className={styles.note}>{emptySeat(view)}</p>
            </>
          )}
        </section>

        <section className={styles.card}>
          <p className="kicker">Fire rule</p>
          <p className={styles.note}>
            More than {view.fireLossLimit} losing trades fires the wallet being copied. {view.fireLossLimit} losses does not. The replacement is a different KOL wallet whose verified realized result is better than the one just fired. If nobody is ahead of them, the seat stays empty.
          </p>
        </section>
      </div>

      <section className={styles.section}>
        <h2>Copies</h2>
        <p className={styles.note}>Mirrored from real buys while that wallet held the seat. A buy with no coin name is skipped.</p>
        {view.copies.length > 0 ? (
          <div className={styles.card}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Trader</th>
                  <th>Coin</th>
                    {showSize ? <th className={styles.num}>Size</th> : null}
                    {showCap ? <th className={styles.num}>Entry cap</th> : null}
                    <th className={styles.num}>Bought</th>
                </tr>
              </thead>
              <tbody>
                {view.copies.map((row) => (
                  <tr key={`${row.trader}-${row.coin}-${row.boughtAt}`}>
                    <td>{row.trader}</td>
                    <td className={styles.coin}>{row.coin}</td>
                    {showSize ? <td className={styles.num}>{typeof row.amountUsd === "number" ? fmtUsd(row.amountUsd) : ""}</td> : null}
                    {showCap ? <td className={styles.num}>{typeof row.entryMarketCapUsd === "number" ? fmtMc(row.entryMarketCapUsd) : ""}</td> : null}
                    <td className={styles.num}>{fmtWhen(row.boughtAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className={styles.note}>No buy has been mirrored.</p>
        )}
        {view.skippedUnnamedBuys > 0 ? (
          <p className={styles.note}>
            {view.skippedUnnamedBuys} {view.skippedUnnamedBuys === 1 ? "buy" : "buys"} from a copied wallet had no coin name on file, so {view.skippedUnnamedBuys === 1 ? "it was" : "they were"} skipped.
          </p>
        ) : null}
      </section>

      <section className={styles.section}>
        <h2>Fired</h2>
        {view.log.length > 0 ? (
          <ol className={styles.log}>
            {view.log.map((row) => (
              <li key={`${row.at}-${row.firedName}`}>
                <span className={styles.when}>{fmtWhen(row.at)}</span> Fired {row.firedName} after {row.losses} losing trades. Verified result {fmtUsd(row.firedRealizedUsd)}.{" "}
                {row.replacementName && typeof row.replacementRealizedUsd === "number"
                  ? `${row.replacementName} took the seat with a better verified result (${fmtUsd(row.replacementRealizedUsd)}).`
                  : "No other wallet has a better verified result, so the seat stays empty."}
              </li>
            ))}
          </ol>
        ) : (
          <p className={styles.note}>Nobody has been fired.</p>
        )}
      </section>

      {view.buyOnlyCount > 0 ? (
        <section className={styles.section}>
          <h2>Not scored</h2>
          <p className={styles.note}>
            {view.buyOnlyCount} {view.buyOnlyCount === 1 ? "wallet has" : "wallets have"} a buy time in the KOL scan and no verified closed trade. A buy time is not a result, so {view.buyOnlyCount === 1 ? "this wallet is" : "these wallets are"} not copied.
          </p>
          {view.unscoredNames.length > 0 ? (
            <div className={styles.chips}>
              {view.unscoredNames.map((name) => (
                <span key={name} className={styles.chip}>
                  {name}
                </span>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}

function lossSentence(losses: number, limit: number): string {
  if (losses === 0) return `No losing trades since this wallet was copied. Loss ${limit + 1} fires them.`;
  const noun = losses === 1 ? "losing trade" : "losing trades";
  return `${losses} ${noun} since this wallet was copied. More than ${limit} fires them.`;
}

function emptySeat(view: GropyView): string {
  if (view.log.length > 0) {
    return "The last trader was fired, and no other wallet has a better verified result.";
  }
  if (view.verifiedCloses === 0) {
    return `None of the ${view.catalogSize.toLocaleString("en-US")} KOL wallets have a verified closed trade, so none can be scored.`;
  }
  if (view.eligibleCount === 0) {
    return `${view.scoredWallets} ${view.scoredWallets === 1 ? "wallet has" : "wallets have"} verified closes, and none of those results are profitable.`;
  }
  return "No eligible wallet is free to copy.";
}
