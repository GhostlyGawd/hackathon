import { createHash } from "node:crypto";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  DestinationRegistryService,
  InMemoryDestinationRegistryRepository,
  resolveDestination,
} from "../../packages/core/src/destination-registry";

const propertySeed = 20260723;
const propertyRuns = 250;
const workspaceId = "11111111-1111-4111-8111-111111111111";
const agreementVersionId = "22222222-2222-4222-8222-222222222222";

describe("destination registry properties", () => {
  it("PROP-04: every unseen hostname remains UNKNOWN and cannot produce a recipient classification", () => {
    fc.assert(
      fc.property(
        fc.array(fc.stringMatching(/^[a-z0-9](?:[a-z0-9-]{0,20}[a-z0-9])?$/u), {
          minLength: 2,
          maxLength: 4,
        }),
        (labels) => {
          const hostname = `${labels.join(".").toLowerCase()}.test`;
          const result = resolveDestination({ hostname, agreementVersionId });
          expect(result.status).toBe("UNKNOWN");
          expect(result).not.toHaveProperty("entityId");
          expect(result).not.toHaveProperty("classification");
        },
      ),
      { seed: propertySeed, numRuns: propertyRuns },
    );
  });

  it("PROP-04: observations never promote generated hostnames without a human review", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.stringMatching(/^[a-z][a-z0-9-]{1,20}[a-z0-9]$/u),
        async (label) => {
          let sequence = 0;
          const repository = new InMemoryDestinationRegistryRepository();
          const service = new DestinationRegistryService(
            repository,
            { checkPermission: () => Promise.resolve([]) },
            { getAgreement: () => Promise.reject(new Error("not used")) },
            {
              idFactory: () =>
                `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`,
              now: () => "2026-07-23T10:00:00.000Z",
            },
          );
          const hostname = `${label}.pactwire.test`;
          const observed = await service.observeDestination({
            principal: {
              userId: "fixture-observer",
              displayName: "Fixture Observer",
              activeWorkspaceId: workspaceId,
            },
            workspaceId,
            hostname,
            observationSha256: createHash("sha256").update(hostname).digest("hex"),
            sourceTitle: "Generated deterministic observation",
            sourceLocator: `run://fixture/${label}`,
          });

          expect(observed.ownership.status).toBe("UNKNOWN");
          expect(
            resolveDestination({ version: observed, agreementVersionId }).status,
          ).toBe("UNKNOWN");
        },
      ),
      { seed: propertySeed, numRuns: propertyRuns },
    );
  });
});
