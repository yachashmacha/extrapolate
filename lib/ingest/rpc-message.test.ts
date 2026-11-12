import { describe, expect, it } from "vitest";
import { RPC_BUSY, softenRpcText } from "@/lib/ingest/rpc-message";

describe("softenRpcText", () => {
  it("hides the raw public RPC 429 body", () => {
    const raw =
      'RPC status 429: {"jsonrpc":"2.0","error":{"code":429,"message":"Too many requests for a specific RPC call"},"id":1}';
    expect(softenRpcText(raw)).toBe(RPC_BUSY);
    expect(softenRpcText(raw)).not.toMatch(/jsonrpc|Too many requests/);
  });

  it("leaves an ordinary wallet note alone", () => {
    const text = "No SOL or USDC memecoin swaps showed up in the recent transactions. A CSV export from the terminal still works.";
    expect(softenRpcText(text)).toBe(text);
  });
});
