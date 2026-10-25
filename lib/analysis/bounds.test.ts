import { describe, expect, it } from "vitest";
import { bookBounds, clampTicketAmounts } from "@/lib/analysis/bounds";
import type { TradingRule } from "@/lib/rules";

const trades = [
  { amountUsd: 150, pnlUsd: 40 },
  { amountUsd: 150, pnlUsd: 20 },
  { amountUsd: 150, pnlUsd: 10 },
  { amountUsd: 480, pnlUsd: -200 },
];

describe("book bounds", () => {
  it("keeps the ticket on the winning size when the account can carry it", () => {
    const bounds = bookBounds({ trades, accountUsd: 8_000 });
    expect(bounds.ticketUsd).toBe(150);
    expect(bounds.ticketReason).toBe("winners");
  });

  it("cuts the ticket to a slice of the wallet", () => {
    const bounds = bookBounds({ trades, accountUsd: 400 });
    expect(bounds.ticketUsd).toBe(20);
    expect(bounds.ticketReason).toBe("account");
  });

  it("keeps a small wallet at five percent instead of a one-dollar floor", () => {
    const bounds = bookBounds({ trades, accountUsd: 9.9 });
    expect(bounds.ticketUsd).toBe(0.5);
    expect(bounds.ticketReason).toBe("account");
  });

  it("uses an active size rule and ignores an inactive one", () => {
    const bounds = bookBounds({
      trades,
      accountUsd: 8_000,
      rules: [rule("Next buy is $10", true), rule("Next buy is $200", false)],
    });
    expect(bounds.ticketUsd).toBe(10);
    expect(bounds.ticketReason).toBe("rule");
    expect(bounds.sizeRule).toMatch(/\$10/);
  });

  it("will not name a ticket larger than the cash in the wallet", () => {
    const bounds = bookBounds({
      trades,
      accountUsd: 8,
      rules: [rule("Next buy is $10", true)],
    });
    expect(bounds.ticketUsd).toBe(8);
    expect(bounds.ticketReason).toBe("account-rule");
  });

  it("reads a market-cap ceiling from a rule", () => {
    const bounds = bookBounds({
      trades,
      rules: [rule("Pass above $20k market cap", true)],
    });
    expect(bounds.maxMcUsd).toBe(20_000);
  });

  it("clamps instruction dollars and leaves market caps alone", () => {
    expect(clampTicketAmounts("Preset the ticket at $150. Pass above $60k.", 10)).toBe(
      "Preset the ticket at $10. Pass above $60k.",
    );
  });
});

function rule(text: string, active: boolean): TradingRule {
  return { id: text, text, active };
}
