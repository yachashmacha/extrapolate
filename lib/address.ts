const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function isWalletAddress(value: string): boolean {
  return BASE58.test(value.trim());
}
