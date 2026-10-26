import Link from "next/link";
import { Mark } from "@/components/mark";
import { SiteNav } from "@/components/site-nav";
import { GropyCopyList, GropySpendProvider, GropyWalletCard } from "@/components/gropy/connect";
import { GropyControls } from "@/components/gropy/controls";
import { GropyPnlChart } from "@/components/gropy/pnl-chart";
import { GropyReasoning } from "@/components/gropy/reasoning";
import { fmtUsd, fmtWhen } from "@/lib/format";
import { fmtSol } from "@/lib/gropy/sol";
import type { GropyView } from "@/lib/gropy/view";
import styles from "./gropy.module.css";

export function GropyBoard({ view }: { view: GropyView }) {
  return (
    <GropySpendProvider premadeAddress={view.botAddress} premadeBalance={view.balanceSol} drafts={view.drafts}>
    <main className={`shell desk ${styles.page}`}>
      <header className="desk-bar">
        <div className="bar-start">
          <Link className="wordmark" href="/">
            <Mark />
            extrapolate
          </Link>
          <SiteNav current="gropy" />
        </div>
      </header>

      <GropyPnlChart points={view.pnl} />
      <GropyControls />

      <div className={styles.work}>
        <div className={styles.mainCol}>
      <GropyWalletCard />

      <p className="lede">
        Gropy Trade copies KOL wallets from their own swaps. A wallet is seated only when those closes are profitable. More than {view.fireLossLimit} losing trades while copied fires them. A saved instruction can also be the reason the bot leaves, when the closes meet it. The next wallet has to be a different one with a better verified result. This page does not send a swap.
      </p>

      <p className={styles.stats}>
        <span>
          KOL list<b>{view.catalogSize.toLocaleString("en-US")}</b>
        </span>
        <span>
          Swaps read<b>{view.readCount.toLocaleString("en-US")}</b>
        </span>
        <span>
          Verified closes<b>{view.verifiedCloses.toLocaleString("en-US")}</b>
        </span>
        <span>
          Unreadable<b>{view.unreadableCount.toLocaleString("en-US")}</b>
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
              {typeof view.copyingRealized === "number" && typeof view.copyingCloses === "number" ? (
                <p className={styles.realized}>
                  Verified realized {fmtResult(view.copyingRealized, view.unit)} across {view.copyingCloses} closed {view.copyingCloses === 1 ? "trade" : "trades"}.
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

      <GropyCopyList copies={view.copies} unfunded={view.unfunded} balanceSol={view.balanceSol} skippedUnnamedBuys={view.skippedUnnamedBuys} />

      <section className={styles.section}>
        <h2>Fired</h2>
        {view.log.length > 0 ? (
          <ol className={styles.log}>
            {view.log.map((row) => (
              <li key={`${row.at}-${row.firedName}`}>
                <span className={styles.when}>{fmtWhen(row.at)}</span> Fired {row.firedName} after {row.losses} losing trades. Verified result {fmtResult(row.firedRealized, view.unit)}.{" "}
                {row.replacementName && typeof row.replacementRealized === "number"
                  ? `${row.replacementName} took the seat with a better verified result (${fmtResult(row.replacementRealized, view.unit)}).`
                  : "No other wallet has a better verified result, so the seat stays empty."}
              </li>
            ))}
          </ol>
        ) : (
          <p className={styles.note}>Nobody has been fired.</p>
        )}
      </section>

      {view.readCount > 0 || view.unreadableCount > 0 ? (
        <section className={styles.section}>
          <h2>Not scored</h2>
          <p className={styles.note}>{skippedLine(view)}</p>
          {view.skippedNames.length > 0 && view.skippedNames.length <= 24 ? (
            <div className={styles.chips}>
              {view.skippedNames.map((name) => (
                <span key={name} className={styles.chip}>
                  {name}
                </span>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}
        </div>
        <GropyReasoning
          switches={view.switches}
          unit={view.unit}
          seat={{ name: view.copying, losses: view.lossesTowardFire, streak: view.copyingStreak, lost: view.copyingLost }}
        />
      </div>
    </main>
    </GropySpendProvider>
  );
}

function fmtResult(value: number, unit: "sol" | "usd"): string {
  return unit === "sol" ? fmtSol(value, true) : fmtUsd(value);
}

function lossSentence(losses: number, limit: number): string {
  if (losses === 0) return `No losing trades since this wallet was copied. Loss ${limit + 1} fires them.`;
  const noun = losses === 1 ? "losing trade" : "losing trades";
  return `${losses} ${noun} since this wallet was copied. More than ${limit} fires them.`;
}

function emptySeat(view: GropyView): string {
  if (view.log.length > 0) return "The last trader was fired, and no other wallet has a better verified result.";
  if (view.readCount === 0 && view.unreadableCount > 0) return "Those wallets' closed trades could not be read, so none are copied.";
  if (view.verifiedCloses === 0) return "No verified close has been read from these wallets' own swaps, so none are copied.";
  if (view.eligibleCount === 0) {
    return `${view.scoredWallets} ${view.scoredWallets === 1 ? "wallet has" : "wallets have"} verified closes, and none of those results are profitable.`;
  }
  return "No eligible wallet is free to copy.";
}

function skippedLine(view: GropyView): string {
  const skipped = `${view.skippedCount} ${view.skippedCount === 1 ? "wallet was" : "wallets were"} read and had no verified close, so ${view.skippedCount === 1 ? "it is" : "they are"} not copied.`;
  const missed = view.unreadableCount > 0 ? ` ${view.unreadableCount} ${view.unreadableCount === 1 ? "wallet" : "wallets"} could not be read and ${view.unreadableCount === 1 ? "was" : "were"} skipped.` : "";
  return `${skipped}${missed}`;
}
