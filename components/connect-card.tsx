"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { isWalletAddress } from "@/lib/address";
import { CSV_TEMPLATE, parseCsvBook } from "@/lib/ingest/csv";
import { TRADER_TERMINAL, TRADER_WALLET } from "@/lib/trader";
import { connectWallet, type WalletKind } from "@/lib/wallet";

const WALLETS: { id: WalletKind; name: string }[] = [
  { id: "phantom", name: "Phantom" },
  { id: "solflare", name: "Solflare" },
  { id: "backpack", name: "Backpack" },
];

export function ConnectCard() {
  const router = useRouter();
  const [address, setAddress] = useState(TRADER_WALLET);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  function openAddress(next: string) {
    const trimmed = next.trim();
    if (!isWalletAddress(trimmed)) {
      setError("Paste a Solana wallet address. It is 32 to 44 characters.");
      return;
    }
    setError("");
    router.push(`/desk?address=${encodeURIComponent(trimmed)}&terminal=${TRADER_TERMINAL}`);
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
      const book = parseCsvBook(text, TRADER_TERMINAL);
      sessionStorage.setItem("extrapolate:csv", JSON.stringify(book));
      router.push(`/desk?source=csv&terminal=${TRADER_TERMINAL}`);
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
      <div className="wallet-row">
        {WALLETS.map((wallet) => (
          <button key={wallet.id} type="button" className="ghost" onClick={() => onConnect(wallet.id)} disabled={busy !== ""}>
            {busy === wallet.id ? "Connecting…" : wallet.name}
          </button>
        ))}
      </div>
      <label className="field">
        <span>Wallet address</span>
        <input
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          placeholder="Solana wallet"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          aria-label="Solana wallet address"
        />
      </label>
      {error ? <p className="error">{error}</p> : null}
      <div className="actions">
        <button type="submit" className="primary">Read this wallet</button>
      </div>
      <details className="csv">
        <summary>Import a CSV of closed trades</summary>
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
