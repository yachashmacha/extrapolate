"use client";

import { RPC_BUSY, softenRpcText } from "@/lib/ingest/rpc-message";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  const message = softenRpcText(error.message);
  if (message === RPC_BUSY) {
    return (
      <main className="shell narrow">
        <p className="note">{message}</p>
      </main>
    );
  }
  return (
    <main className="shell narrow">
      <p className="kicker">Extrapolate</p>
      <h1>The desk hit an error.</h1>
      <p className="lede">{message}</p>
      <button type="button" className="primary" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
