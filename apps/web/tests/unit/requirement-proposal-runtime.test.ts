import { describe, expect, it } from "vitest";
import { createRequirementProposalAdapterFromEnvironment } from "../../lib/access-fixture";

describe("requirement proposal runtime adapter", () => {
  it("uses the deterministic adapter unless live OpenAI is explicitly selected", () => {
    const adapter = createRequirementProposalAdapterFromEnvironment({
      OPENAI_API_KEY: "test-key-that-must-not-change-the-default",
    });

    expect(adapter).toMatchObject({
      provider: "DETERMINISTIC_FIXTURE",
      requestedModel: "fixture-requirement-proposer-v1",
    });
  });

  it("constructs the GPT-5.6 Sol adapter only with explicit mode and a key", () => {
    const adapter = createRequirementProposalAdapterFromEnvironment({
      PACTWIRE_REQUIREMENT_PROPOSAL_ADAPTER: "openai",
      OPENAI_API_KEY: "test-openai-key",
    });

    expect(adapter).toMatchObject({
      provider: "OPENAI",
      requestedModel: "gpt-5.6-sol",
    });
  });

  it("fails closed when live mode lacks a key or the mode is unknown", () => {
    expect(() =>
      createRequirementProposalAdapterFromEnvironment({
        PACTWIRE_REQUIREMENT_PROPOSAL_ADAPTER: "openai",
      }),
    ).toThrow("OPENAI_API_KEY");
    expect(() =>
      createRequirementProposalAdapterFromEnvironment({
        PACTWIRE_REQUIREMENT_PROPOSAL_ADAPTER: "surprise-provider",
      }),
    ).toThrow("PACTWIRE_REQUIREMENT_PROPOSAL_ADAPTER");
  });
});
