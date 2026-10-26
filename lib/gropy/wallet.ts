import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Keypair } from "@solana/web3.js";
import { gropyRpc } from "@/lib/gropy/rpc";

export const BOT_WALLET_FILE = ".gropy-wallet.json";

export function botWalletPath(file = BOT_WALLET_FILE): string {
  return path.isAbsolute(file) ? file : path.join(process.cwd(), file);
}

/** The saved bot address, or null when no wallet file exists. Does not create one. */
export function savedBotAddress(file = BOT_WALLET_FILE): string | null {
  return readPair(botWalletPath(file));
}

/** Public address only. The secret stays in the gitignored file. */
export function loadBotWallet(file = BOT_WALLET_FILE): { publicKey: string } {
  const full = botWalletPath(file);
  const existing = readPair(full);
  if (existing) return { publicKey: existing };
  const keypair = Keypair.generate();
  const body = JSON.stringify({
    publicKey: keypair.publicKey.toBase58(),
    secretKey: Array.from(keypair.secretKey),
  });
  try {
    writeFileSync(full, body, { encoding: "utf8", mode: 0o600, flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  try {
    chmodSync(full, 0o600);
  } catch {
    // The file is already on disk. The mode is best-effort.
  }
  const saved = readPair(full);
  if (!saved) throw new Error("The bot wallet could not be saved.");
  return { publicKey: saved };
}

export async function readSolBalance(
  address: string,
  rpc: (method: string, params: unknown[]) => Promise<unknown> = gropyRpc,
): Promise<number | null> {
  try {
    const result = await rpc("getBalance", [address]);
    const lamports = lamportsOf(result);
    if (lamports == null) return null;
    return lamports / 1_000_000_000;
  } catch {
    return null;
  }
}

function lamportsOf(result: unknown): number | null {
  if (typeof result === "number" && Number.isFinite(result) && result >= 0) return result;
  if (result && typeof result === "object" && "value" in result) {
    const value = (result as { value?: unknown }).value;
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  }
  return null;
}

function readPair(full: string): string | null {
  try {
    const parsed = JSON.parse(readFileSync(full, "utf8")) as { publicKey?: unknown; secretKey?: unknown };
    if (typeof parsed.publicKey !== "string" || !Array.isArray(parsed.secretKey) || parsed.secretKey.length !== 64) return null;
    const secret = Uint8Array.from(parsed.secretKey.map((part) => Number(part)));
    if (secret.length !== 64 || secret.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
    const keypair = Keypair.fromSecretKey(secret);
    if (keypair.publicKey.toBase58() !== parsed.publicKey) return null;
    return parsed.publicKey;
  } catch {
    return null;
  }
}
