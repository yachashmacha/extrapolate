import Link from "next/link";
import { fmtUsdPlain } from "@/lib/format";
import { namesSharingWalletCount } from "@/lib/kols";
import { traderSearch } from "@/lib/trader";
import type { Book } from "@/lib/types";
import type { KolScanProgress } from "@/components/use-book";

export function BookNotices({ book, kolScan }: { book: Book; kolScan?: KolScanProgress | null }) {
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
      {kolScan && kolScan.total > 0 ? <KolScanNotice scan={kolScan} /> : null}
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

function KolScanNotice({ scan }: { scan: KolScanProgress }) {
  const shared = namesSharingWalletCount();
  const checked = scan.checked.toLocaleString("en-US");
  const total = scan.total.toLocaleString("en-US");
  const sharedLine = `${shared} names are used by more than one wallet, so the wallet stays on the label.`;
  if (!scan.pending && scan.matches === 0) {
    return (
      <p className="warn">
        Checked {checked} of {total} tracked wallets against these coins. None of those wallets bought in. {sharedLine}
      </p>
    );
  }
  const found = scan.matches === 1 ? "1 buy is on the tape" : `${scan.matches.toLocaleString("en-US")} buys are on the tape`;
  return (
    <p className="warn">
      {scan.pending ? `Checking tracked wallets against these coins: ${checked} of ${total}.` : `Checked ${checked} of ${total} tracked wallets against these coins.`}{" "}
      {scan.matches > 0 ? `${found}, each name with its wallet.` : "Matches show up here as they are found."} {sharedLine}
    </p>
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
