import Link from "next/link";
import { fmtCoin, fmtUsdPlain } from "@/lib/format";
import { traderSearch } from "@/lib/trader";
import type { Book } from "@/lib/types";

export function BookNotices({ book }: { book: Book }) {
  return (
    <>
      {book.source === "sample" ? (
        <p className="banner">Sample book of invented coins. The arithmetic is real. Your wallet is not in these numbers.</p>
      ) : null}
      {book.warnings.map((warning) => (
        <p key={warning} className="warn">
          {warning}
        </p>
      ))}
      {book.opens.length > 0 ? (
        <p className="warn">
          Still open, and left out of the win rate:{" "}
          {book.opens
            .map(
              (open) =>
                `${open.symbol} ${fmtUsdPlain(open.costUsd)} at ${open.entryMarketCapUsd > 0 ? fmtCoin(open.entryMarketCapUsd) : "an unknown cap"}`,
            )
            .join(" · ")}
        </p>
      ) : null}
    </>
  );
}

export function BookError({ error }: { error: string }) {
  return (
    <div className="section">
      <p className="error">{error}</p>
      <p className="note">
        A public RPC reads the recent signatures on this wallet. Reread when the node answers, or import a CSV if the history sits further back.
      </p>
      <p>
        <Link className="primary" href={`/desk${traderSearch()}`}>
          Reread the wallet
        </Link>
      </p>
    </div>
  );
}
