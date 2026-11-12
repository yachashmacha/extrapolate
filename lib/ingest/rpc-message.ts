/** Shown only when a page has no wallet data at all. Never include an RPC payload. */
export const RPC_BUSY = "The public RPC is busy, so this wallet could not be read. Wait a moment and reread.";

export function softenRpcText(text: string): string {
  if (/jsonrpc|too many requests|RPC status\s*\d+/i.test(text)) return RPC_BUSY;
  return text;
}
