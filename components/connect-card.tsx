"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { isWalletAddress } from "@/lib/address";
import { CSV_TEMPLATE, parseCsvBook } from "@/lib/ingest/csv";
import { TERMINALS } from "@/lib/terminals";
import type { TerminalId } from "@/lib/types";
import { connectWallet, type WalletKind } from "@/lib/wallet";

const WALLETS: { id: WalletKind; name: string }[] = [
  { id: "phantom", name: "Phantom" },
  { id: "solflare", name: "Solflare" },
  { id: "backpack", name: "Backpack" },
];

export function ConnectCard() {
  const router = useRouter();
  const [terminal, setTerminal] = useState<TerminalId>("axiom");
  const [address, setAddress] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  function openSample() {
    router.push(`/desk?demo=1&terminal=${terminal}`);
  }

  function openAddress(next: string) {
    const trimmed = next.trim();
    if (!isWalletAddress(trimmed)) {
      setError("Paste the trading wallet your terminal signs with. It looks like a Solana address, 32 to 44 characters.");
      return;
    }
    setError("");
    router.push(`/desk?address=${encodeURIComponent(trimmed)}&terminal=${terminal}`);
  }

  async function onConnect(kind: WalletKind) {
    setBusy(kind);
    setError("");
    try {
      const next = await connectWallet(kind);
      setAddress(next);
      openAddress(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not connect.");
    } finally {
      setBusy("");
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError("");
    try {
      const text = await file.text();
      const book = parseCsvBook(text, terminal);
      sessionStorage.setItem("extrapolate:csv", JSON.stringify(book));
      router.push(`/desk?source=csv&terminal=${terminal}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not read that CSV.");
    }
  }

  return (
    <form
      className="connect"
      onSubmit={(event) => {
        event.preventDefault();
        openAddress(address);
      }}
    >
      <div>
        <p className="label">Terminal</p>
        <div className="terminal-grid" role="group" aria-label="Preferred terminal">
          {TERMINALS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={terminal === item.id}
              onClick={() => setTerminal(item.id)}
            >
              {item.name}
            </button>
          ))}
        </div>
      </div>
      <p className="note">
        The terminal is where you click buy. The wallet underneath it is what Extrapolate reads. On Axiom, Photon, and BullX that is sometimes a separate trading wallet from the vault.
      </p>
      <div className="wallet-row">
        {WALLETS.map((wallet) => (
          <button key={wallet.id} type="button" className="ghost" onClick={() => onConnect(wallet.id)} disabled={busy !== ""}>
            {busy === wallet.id ? "Connecting…" : wallet.name}
          </button>
        ))}
      </div>
      <label className="field">
        <span>Or paste the trading wallet</span>
        <input
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          placeholder="So1ana…trading wallet"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          aria-label="Solana wallet address"
        />
      </label>
      {error ? <p className="error">{error}</p> : null}
      <div className="actions">
        <button type="submit" className="primary">Read this wallet</button>
        <button type="button" className="ghost" onClick={openSample}>Open the sample book</button>
      </div>
      <details className="csv">
        <summary>Import a CSV from the terminal</summary>
        <p className="note">Use this when you already export fills, or when a public RPC cannot see far enough back.</p>
        <label className="field">
          <span>CSV file</span>
          <input
            type="file"
            accept=".csv,text/csv"
            aria-label="CSV of closed trades"
            onChange={(event) => onFile(event.target.files?.[0])}
          />
        </label>
        <pre>{CSV_TEMPLATE}</pre>
      </details>
    </form>
  );
}
