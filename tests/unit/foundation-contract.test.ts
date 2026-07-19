import { describe, expect, it } from "vitest";
import { productIdentity } from "../../packages/core/src/index";
import { evidenceBoundary } from "../../packages/evidence/src/index";

describe("foundation package contract", () => {
  it("loads the core package with Pactwire's bounded product claim", () => {
    expect(productIdentity).toEqual({
      name: "Pactwire",
      truthBoundary:
        "A named test can witness a conflict; it cannot prove safety or compliance.",
    });
    expect(Object.isFrozen(productIdentity)).toBe(true);
  });

  it("loads the evidence package without treating model output as evidence", () => {
    expect(evidenceBoundary).toEqual({
      factsOwnedBy: "deterministic-instrumentation",
      modelOutputIsEvidence: false,
    });
    expect(Object.isFrozen(evidenceBoundary)).toBe(true);
  });
});
