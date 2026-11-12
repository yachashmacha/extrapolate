import Link from "next/link";
import { fmtCoin, fmtUsdPlain } from "@/lib/format";
import { RPC_BUSY, softenRpcText } from "@/lib/ingest/rpc-message";
import { traderSearch } from "@/lib/trader";
import type { Book } from "@/lib/types";

export function BookNotices({ book }: { book: Book }) {
  const hasRows = book.trades.length > 0 || book.opens.length > 0;
  const seen = new Set<string>();
  const notices = book.warnings.flatMap((warning) => {
    const plain = softenRpcText(warning);
    if (plain === RPC_BUSY && hasRows) return [];
    if (seen.has(plain)) return [];
    seen.add(plain);
    return [plain];
  });
  return (
    <>
      {book.source === "sample" ? (
        <p className="banner">Sample trades on invented coins. The arithmetic is real. Your wallet is not in these numbers.</p>
      ) : null}
      {notices.map((warning) => (
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
  const message = softenRpcText(error);
  if (message === RPC_BUSY) {
    return (
      <div className="section">
        <p className="note">{message}</p>
      </div>
    );
  }
  return (
    <div className="section">
      <p className="error">{message}</p>
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
