import { describe, expect, it } from "vitest";
import { Decimal } from "@prisma/client/runtime/client";
import { SuperJSON } from "./superjson";

describe("SuperJSON Decimal round-trip", () => {
  it("serializes and deserializes a Decimal back to an equal Decimal", () => {
    const original = new Decimal("1234.56");
    const { json, meta } = SuperJSON.serialize(original);
    const restored = SuperJSON.deserialize({ json, meta }) as Decimal;

    expect(restored).toBeInstanceOf(Decimal);
    expect(restored.equals(original)).toBe(true);
  });

  it("preserves Decimal fields nested inside an object (e.g. an Account)", () => {
    const account = { name: "Conto corrente", openingBalance: new Decimal("500.00") };
    const { json, meta } = SuperJSON.serialize(account);
    const restored = SuperJSON.deserialize({ json, meta }) as typeof account;

    expect(restored.openingBalance).toBeInstanceOf(Decimal);
    expect(restored.openingBalance.equals(new Decimal("500.00"))).toBe(true);
  });
});
