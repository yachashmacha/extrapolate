export type WalletKind = "phantom" | "solflare" | "backpack";

interface SolanaProvider {
  isPhantom?: boolean;
  isSolflare?: boolean;
  connect: (options?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey: { toString(): string } }>;
}

interface WalletWindow extends Window {
  phantom?: { solana?: SolanaProvider };
  solflare?: SolanaProvider;
  backpack?: SolanaProvider;
  solana?: SolanaProvider;
}

const LABELS: Record<WalletKind, string> = {
  phantom: "Phantom",
  solflare: "Solflare",
  backpack: "Backpack",
};

export async function connectWallet(kind: WalletKind, options?: { onlyIfTrusted?: boolean }): Promise<string> {
  const provider = providerFor(kind);
  if (!provider) {
    throw new Error(`${LABELS[kind]} is not installed in this browser.`);
  }
  try {
    const result = await provider.connect(options?.onlyIfTrusted ? { onlyIfTrusted: true } : undefined);
    const address = result.publicKey?.toString();
    if (!address) throw new Error("The wallet did not return an address.");
    return address;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not connect.";
    if (/reject|cancel|denied|closed/i.test(message)) throw new Error("Connection cancelled.");
    throw error instanceof Error ? error : new Error(message);
  }
}

function providerFor(kind: WalletKind): SolanaProvider | null {
  if (typeof window === "undefined") return null;
  const wallet = window as WalletWindow;
  if (kind === "phantom") return wallet.phantom?.solana ?? (wallet.solana?.isPhantom ? wallet.solana : null);
  if (kind === "solflare") return wallet.solflare ?? (wallet.solana?.isSolflare ? wallet.solana : null);
  return wallet.backpack ?? null;
}
