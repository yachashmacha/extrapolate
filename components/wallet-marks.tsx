"use client";

import type { WalletKind } from "@/lib/wallet";

const WALLETS: { id: WalletKind; name: string; src: string }[] = [
  { id: "phantom", name: "Phantom", src: "/wallets/phantom.svg" },
  { id: "solflare", name: "Solflare", src: "/wallets/solflare.svg" },
  { id: "backpack", name: "Backpack", src: "/wallets/backpack.png" },
];

export function WalletMarks({
  busy,
  onConnect,
}: {
  busy: string;
  onConnect: (kind: WalletKind) => void;
}) {
  return (
    <div className="wallet-row">
      {WALLETS.map((wallet) => {
        const connecting = busy === wallet.id;
        return (
          <button
            key={wallet.id}
            type="button"
            className="wallet-mark"
            aria-label={connecting ? `Connecting ${wallet.name}` : wallet.name}
            aria-busy={connecting}
            disabled={busy !== ""}
            onClick={() => onConnect(wallet.id)}
          >
            <img src={wallet.src} alt="" width={18} height={18} />
          </button>
        );
      })}
    </div>
  );
}
