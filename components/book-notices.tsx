import Link from "next/link";
import { fmtUsdPlain } from "@/lib/format";
import type { Book, TerminalId } from "@/lib/types";

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
                `${open.symbol} ${fmtUsdPlain(open.costUsd)} at ${open.entryMarketCapUsd > 0 ? `$${Math.round(open.entryMarketCapUsd / 1000)}k` : "an unknown cap"}`,
            )
            .join(" · ")}
        </p>
      ) : null}
    </>
  );
}

export function BookError({ error, terminal }: { error: string; terminal: TerminalId }) {
  return (
    <div className="section">
      <p className="error">{error}</p>
      <p className="note">
        A public RPC only sees recent transactions, and some wallets trade through a different address than the vault. The sample book is a full reading you can open while you sort the wallet out.
      </p>
      <p>
        <Link className="primary" href={`/desk?demo=1&terminal=${terminal}`}>
          Open the sample book
        </Link>
      </p>
    </div>
  );
}
