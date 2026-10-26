"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { isWalletAddress } from "@/lib/address";
import { fmtWhen } from "@/lib/format";
import { fundedCopies, GROPY_SPEND_KEY, parseSpendWallet } from "@/lib/gropy/spend-wallet";
import { fmtSol } from "@/lib/gropy/sol";
import type { GropyCopyDraft, GropyCopyRow } from "@/lib/gropy/view";
import { connectWallet, type WalletKind } from "@/lib/wallet";
import styles from "./gropy.module.css";

const WALLETS: { id: WalletKind; name: string }[] = [
  { id: "phantom", name: "Phantom" },
  { id: "solflare", name: "Solflare" },
  { id: "backpack", name: "Backpack" },
];

const NAMES: Record<WalletKind, string> = {
  phantom: "Phantom",
  solflare: "Solflare",
  backpack: "Backpack",
};

type Connected = {
  kind: WalletKind;
  address: string;
  balanceSol: number | null;
  phase: "reading" | "ready";
};

type SpendValue = {
  usingYours: boolean;
  phase: "premade" | "reading" | "ready";
  kind: WalletKind | null;
  kindName: string | null;
  address: string;
  balanceSol: number | null;
  copies: GropyCopyRow[];
  error: string;
  busy: string;
  connect: (kind: WalletKind) => Promise<void>;
  disconnect: () => void;
};

const SpendContext = createContext<SpendValue | null>(null);

export function GropySpendProvider({
  premadeAddress,
  premadeBalance,
  drafts,
  children,
}: {
  premadeAddress: string;
  premadeBalance: number | null;
  drafts: readonly GropyCopyDraft[];
  children: ReactNode;
}) {
  const [connected, setConnected] = useState<Connected | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const request = useRef(0);

  useEffect(() => {
    const stored = parseSpendWallet(window.localStorage.getItem(GROPY_SPEND_KEY));
    if (!stored) return;
    const id = ++request.current;
    void (async () => {
      try {
        const address = await connectWallet(stored.kind, { onlyIfTrusted: true });
        if (request.current !== id || !isWalletAddress(address)) return;
        setConnected({ kind: stored.kind, address, balanceSol: null, phase: "reading" });
        const balanceSol = await fetchBalance(address);
        if (request.current !== id) return;
        window.localStorage.setItem(GROPY_SPEND_KEY, JSON.stringify({ kind: stored.kind, address }));
        setConnected({ kind: stored.kind, address, balanceSol, phase: "ready" });
      } catch {
        if (request.current === id) window.localStorage.removeItem(GROPY_SPEND_KEY);
      }
    })();
    return () => {
      request.current += 1;
    };
  }, []);

  async function connect(kind: WalletKind) {
    const id = ++request.current;
    setBusy(kind);
    setError("");
    try {
      const address = await connectWallet(kind);
      if (request.current !== id) return;
      if (!isWalletAddress(address)) throw new Error("The wallet did not return an address.");
      setConnected({ kind, address, balanceSol: null, phase: "reading" });
      window.localStorage.setItem(GROPY_SPEND_KEY, JSON.stringify({ kind, address }));
      const balanceSol = await fetchBalance(address);
      if (request.current !== id) return;
      setConnected({ kind, address, balanceSol, phase: "ready" });
    } catch (caught) {
      if (request.current !== id) return;
      setConnected(null);
      window.localStorage.removeItem(GROPY_SPEND_KEY);
      setError(caught instanceof Error ? caught.message : "Could not connect.");
    } finally {
      if (request.current === id) setBusy("");
    }
  }

  function disconnect() {
    request.current += 1;
    window.localStorage.removeItem(GROPY_SPEND_KEY);
    setConnected(null);
    setError("");
    setBusy("");
  }

  const usingYours = connected != null;
  const value: SpendValue = {
    usingYours,
    phase: connected?.phase ?? "premade",
    kind: connected?.kind ?? null,
    kindName: connected ? NAMES[connected.kind] : null,
    address: usingYours ? connected.address : premadeAddress,
    balanceSol: usingYours ? connected.balanceSol : premadeBalance,
    copies: usingYours && connected.phase === "ready" ? fundedCopies(drafts, connected.balanceSol) : [],
    error,
    busy,
    connect,
    disconnect,
  };

  return <SpendContext.Provider value={value}>{children}</SpendContext.Provider>;
}

export function GropyWalletCard() {
  const spend = useGropySpend();
  return (
    <section className={styles.card} aria-labelledby="gropy-wallet">
      <p className="kicker" id="gropy-wallet">
        {spend.usingYours ? "Your wallet" : "Bot wallet"}
      </p>
      {spend.usingYours ? (
        <>
          <h2 className={styles.name}>{spend.kindName}</h2>
          <p className={styles.address}>{spend.address}</p>
          <p className={styles.note}>
            Copies are sized from the SOL in this wallet. This page does not send a swap.
          </p>
          <p className={styles.realized}>{spend.phase === "reading" ? "Reading the balance." : balanceLine(spend.balanceSol)}</p>
          <button type="button" className="texty" onClick={spend.disconnect}>
            Use the bot wallet
          </button>
        </>
      ) : (
        <>
          <p className={styles.address}>{spend.address}</p>
          <p className={styles.note}>Load this wallet with SOL, or connect yours and gropy will size copies from that balance.</p>
          <div className="wallet-row">
            {WALLETS.map((wallet) => (
              <button key={wallet.id} type="button" className="ghost" onClick={() => void spend.connect(wallet.id)} disabled={spend.busy !== ""}>
                {spend.busy === wallet.id ? "Connecting…" : wallet.name}
              </button>
            ))}
          </div>
          <p className={styles.realized}>{balanceLine(spend.balanceSol)}</p>
        </>
      )}
      {spend.error ? <p className="error">{spend.error}</p> : null}
    </section>
  );
}

export function GropyCopyList({
  copies,
  unfunded,
  balanceSol,
  skippedUnnamedBuys,
}: {
  copies: readonly GropyCopyRow[];
  unfunded: boolean;
  balanceSol: number | null;
  skippedUnnamedBuys: number;
}) {
  const spend = useGropySpend();
  const using = spend.usingYours;
  const shown = using ? spend.copies : copies;
  const reading = using && spend.phase === "reading";
  const balance = using ? spend.balanceSol : balanceSol;
  const empty = using ? spend.phase !== "ready" || !(typeof balance === "number" && balance > 0) : unfunded;

  return (
    <section className={styles.section}>
      <h2>Copies</h2>
      {reading ? (
        <p className={styles.note}>Reading the SOL in this wallet.</p>
      ) : empty ? (
        <p className={styles.note}>
          {balance === 0 ? "No copy was sent. This wallet has no SOL to spend." : "No copy was sent. The SOL balance could not be read."}
        </p>
      ) : shown.length > 0 ? (
        <div className={styles.card}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Trader</th>
                <th>Coin</th>
                <th className={styles.num}>Size</th>
                <th className={styles.num}>Bought</th>
                <th className={styles.num}>Status</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <tr key={`${row.trader}-${row.coin}-${row.boughtAt}`}>
                  <td>{row.trader}</td>
                  <td className={styles.coin}>{row.coin}</td>
                  <td className={styles.num}>{row.sol == null ? "" : fmtSol(row.sol)}</td>
                  <td className={styles.num}>{fmtWhen(row.boughtAt)}</td>
                  <td className={styles.num}>Not sent</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className={styles.note}>No buy has been mirrored.</p>
      )}
      {skippedUnnamedBuys > 0 ? (
        <p className={styles.note}>
          {skippedUnnamedBuys} {skippedUnnamedBuys === 1 ? "buy had" : "buys had"} no coin name on the swap, so {skippedUnnamedBuys === 1 ? "it was" : "they were"} skipped.
        </p>
      ) : null}
    </section>
  );
}

function balanceLine(balanceSol: number | null): string {
  if (balanceSol == null) return "Balance unavailable.";
  return fmtSol(balanceSol);
}

export function useGropySpend(): SpendValue {
  const value = useContext(SpendContext);
  if (!value) throw new Error("gropy spend wallet is missing.");
  return value;
}

async function fetchBalance(address: string): Promise<number | null> {
  const response = await fetch(`/api/gropy/balance?address=${encodeURIComponent(address)}`, { cache: "no-store" });
  const body = (await response.json()) as { balanceSol?: unknown; error?: unknown };
  if (!response.ok) {
    throw new Error(typeof body.error === "string" ? body.error : "The balance could not be read.");
  }
  if (typeof body.balanceSol === "number" && Number.isFinite(body.balanceSol) && body.balanceSol >= 0) return body.balanceSol;
  return null;
}
