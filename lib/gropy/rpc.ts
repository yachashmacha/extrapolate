const RPC = process.env.SOLANA_RPC_URL || "https://solana-rpc.publicnode.com";

export async function gropyRpc(method: string, params: unknown[]): Promise<unknown> {
  const response = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "gropy" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`RPC status ${response.status}`);
  const body = (await response.json()) as { result?: unknown; error?: { message?: string } };
  if (body.error) throw new Error(body.error.message || "RPC error");
  return body.result ?? null;
}
