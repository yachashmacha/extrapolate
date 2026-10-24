"use client";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <main className="shell narrow">
      <p className="kicker">Extrapolate</p>
      <h1>The desk hit an error.</h1>
      <p className="lede">{error.message}</p>
      <button type="button" className="primary" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
