import { describe, it, expect } from "vitest";
import { approveSubstitution } from "./services/substitutionGovernance";

describe("substitution governance guards", () => {
  it("cannot auto approve without pharmacist", () => {
    expect(() =>
      approveSubstitution({
        originalProductId: 1,
        substituteProductId: 2,
        reason: "alt",
        status: "pending",
      })
    ).toThrow();
  });
});
