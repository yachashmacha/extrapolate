import { gatedRpc, isRpcLimited, RpcLimitError } from "@/lib/ingest/rpc-gate";

export async function gropyRpc(method: string, params: unknown[]): Promise<unknown> {
  try {
    return await gatedRpc(method, params, { priority: "scan" });
  } catch (error) {
    if (isRpcLimited(error)) throw new RpcLimitError();
    throw error instanceof Error ? error : new Error("RPC failed");
  }
}
