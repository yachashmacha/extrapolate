import { describe, expect, it } from "vitest";
import { bookBounds, clampTicketAmounts } from "@/lib/analysis/bounds";
import { baseRules, type TradingRule } from "@/lib/rules";

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

  it("cuts the ticket to 10% of the portfolio", () => {
    const bounds = bookBounds({ trades, accountUsd: 400 });
    expect(bounds.ticketUsd).toBe(40);
    expect(bounds.ticketReason).toBe("account");
    expect(bounds.portfolioShare).toBe(0.1);
  });

  it("keeps a small wallet at 10% of the portfolio instead of a one-dollar floor", () => {
    const bounds = bookBounds({ trades, accountUsd: 9.9 });
    expect(bounds.ticketUsd).toBe(0.99);
    expect(bounds.ticketReason).toBe("account");
    expect(bounds.portfolioRule).toMatch(/10 percent of your portfolio/);
  });

  it("reads the base rules without treating 50% as a dollar cap", () => {
    const bounds = bookBounds({ trades, accountUsd: 9.82, rules: baseRules() });
    expect(bounds.ticketUsd).toBe(0.98);
    expect(bounds.ticketReason).toBe("account");
    expect(bounds.sizeRule).toBeNull();
  });

  it("will not name a ticket above the cash when 10% of the portfolio is more", () => {
    const bounds = bookBounds({ trades, accountUsd: 100, cashUsd: 8, rules: baseRules() });
    expect(bounds.ticketUsd).toBe(8);
    expect(bounds.cashBinds).toBe(true);
    expect(bounds.ticketReason).toBe("account-rule");
    expect(bounds.portfolioRule).toMatch(/10 percent/);
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
