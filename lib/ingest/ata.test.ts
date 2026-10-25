import { describe, expect, it } from "vitest";
import { associatedTokenAddress } from "@/lib/ingest/ata";

describe("associated token address", () => {
  it("derives the classic token account for a tracked wallet", () => {
    const address = associatedTokenAddress(
      "DYAn4XpAkN5mhiXkRB7dGq4Jadnx6XYgu8L5b3WGhbrt",
      "5Dw9h4ySRjRPcED7g23kabJ5KSpReKLitktM9TREpump",
      "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    );
    expect(address).toBe("2dc5VAFErRBkt3sDrZ4wS8BL7M3dPzkchZF7PB6xTHqQ");
  });
});
