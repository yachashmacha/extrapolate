import type { WalletKind } from "@/lib/wallet";

/** Brand marks for the connect row. Sized by CSS; keep viewBox square. */
export function WalletLogo({ kind }: { kind: WalletKind }) {
  if (kind === "phantom") {
    return (
      <svg viewBox="0 0 40 40" aria-hidden="true">
        <rect width="40" height="40" rx="12" fill="#AB9FF2" />
        <path
          fill="#fff"
          d="M31.2 20.1c0-6.7-5.5-10.8-12.3-10.8-5.7 0-10.5 3.7-12.1 9-.1.2.1.4.3.4h4.5c.1 0 .2-.1.3-.2 1.1-3.1 3.9-5.2 7-5.2 4.2 0 7.1 2.7 7.1 6.9s-2.9 6.9-7.1 6.9c-3.1 0-5.9-2.1-7-5.2-.1-.1-.2-.2-.3-.2H7.1c-.2 0-.4.2-.3.4 1.6 5.3 6.4 9 12.1 9 6.8 0 12.3-4.1 12.3-10.8Z"
        />
        <circle cx="22.4" cy="18.4" r="1.7" fill="#4B4482" />
        <circle cx="27.4" cy="18.4" r="1.7" fill="#4B4482" />
      </svg>
    );
  }
  if (kind === "solflare") {
    return (
      <svg viewBox="0 0 40 40" aria-hidden="true">
        <rect width="40" height="40" rx="12" fill="#FC7227" />
        <circle cx="20" cy="20" r="9.5" fill="none" stroke="#fff" strokeWidth="2.4" />
        <circle cx="20" cy="20" r="4.2" fill="#fff" />
        <path
          fill="#fff"
          d="M20 6.2 21.1 9.5 20 12.8 18.9 9.5ZM20 27.2 21.1 30.5 20 33.8 18.9 30.5ZM6.2 20 9.5 18.9 12.8 20 9.5 21.1ZM27.2 20 30.5 18.9 33.8 20 30.5 21.1Z"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true">
      <rect width="40" height="40" rx="12" fill="#E33E3F" />
      <path
        fill="#fff"
        d="M12.5 13.2c0-1.3 1.1-2.4 2.4-2.4h10.2c1.3 0 2.4 1.1 2.4 2.4v5.8c0 .8-.4 1.5-1.1 1.9L20 26.2 13.6 20.9c-.7-.4-1.1-1.1-1.1-1.9v-5.8Zm0 14.2c0-.8.6-1.4 1.4-1.4h12.2c.8 0 1.4.6 1.4 1.4s-.6 1.4-1.4 1.4H13.9c-.8 0-1.4-.6-1.4-1.4Z"
      />
    </svg>
  );
}
