import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  computerUseRunConfigSchema,
  evaluateComputerActionPolicy,
} from "../../apps/runner/src/computer-use";

const seed = 20260721;
const numRuns = 250;

const basePolicy = computerUseRunConfigSchema.parse({
  workspaceId: "11111111-1111-4111-8111-111111111111",
  runId: "22222222-2222-4222-8222-222222222222",
  model: "gpt-5.6-sol",
  reasoningEffort: "medium",
  authorizedGoal: "Submit only the controlled fictional response.",
  startUrl: "https://classroom.pactwire.test/student",
  allowedOrigins: ["https://classroom.pactwire.test"],
  allowedComputerActions: ["screenshot", "click", "type", "wait"],
  trustedControls: [
    {
      dataTestId: "submit-assignment",
      authorizationAction: "SUBMIT",
      disposition: "ALLOW",
    },
    {
      dataTestId: "risky-action",
      authorizationAction: "MESSAGE",
      disposition: "HUMAN_REQUIRED",
    },
  ],
  maxTurns: 8,
  maxActions: 32,
  maxTransportRetries: 1,
  requestTimeoutMs: 30_000,
});

const pageText = fc.string({ maxLength: 1_000 });
const controlCharacters = "abcdefghijklmnopqrstuvwxyz0123456789".split("");
const unknownControl = fc
  .array(fc.constantFrom(...controlCharacters), { minLength: 1, maxLength: 31 })
  .map((characters) => characters.join(""))
  .filter(
    (value) =>
      value !== "submit-assignment" && value !== "risky-action",
  );

describe("RUN-03 generated authorization boundaries", () => {
  it("PROP-13: arbitrary page instructions and unreviewed controls cannot expand authority", () => {
    fc.assert(
      fc.property(pageText, unknownControl, fc.nat(2_000), (text, id, point) => {
        const before = structuredClone(basePolicy);
        const input = {
          action: {
            type: "click" as const,
            x: point,
            y: point,
            button: "left" as const,
          },
          target: {
            origin: "https://classroom.pactwire.test",
            dataTestIds: [id],
            tagName: "button",
            inputType: "button",
            href: null,
            formAction: null,
          },
          secretValues: [],
        };
        const decision = evaluateComputerActionPolicy(basePolicy, {
          ...input,
          pageText: text,
        });
        const withoutPageInstructions = evaluateComputerActionPolicy(
          basePolicy,
          input,
        );
        expect(decision).toMatchObject({
          allowed: false,
          outcome: "BLOCK",
          reason: "UNTRUSTED_CONTROL",
        });
        expect(basePolicy).toEqual(before);
        expect(decision).toEqual(withoutPageInstructions);
        expect(decision).not.toHaveProperty("pageText");
      }),
      { seed, numRuns },
    );
  });

  it("PROP-13: every generated origin outside the exact allowlist is denied", () => {
    fc.assert(
      fc.property(fc.domain(), fc.webPath(), (domain, pathname) => {
        fc.pre(domain !== "classroom.pactwire.test");
        const destination = `https://${domain}${pathname}`;
        const decision = evaluateComputerActionPolicy(basePolicy, {
          action: { type: "click", x: 1, y: 1, button: "left" },
          target: {
            origin: "https://classroom.pactwire.test",
            dataTestIds: ["submit-assignment"],
            tagName: "a",
            inputType: null,
            href: destination,
            formAction: null,
          },
          secretValues: [],
        });
        expect(decision).toMatchObject({
          allowed: false,
          outcome: "BLOCK",
          reason: "DESTINATION_OUTSIDE_SCOPE",
        });
      }),
      { seed, numRuns },
    );
  });

  it("PROP-15: generated configured-secret representations never reach an executable type action or decision output", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 12, maxLength: 80 }),
        fc.constantFrom("raw", "base64", "url"),
        (secret, representation) => {
          const rendered =
            representation === "base64"
              ? Buffer.from(secret).toString("base64")
              : representation === "url"
                ? encodeURIComponent(secret)
                : secret;
          const decision = evaluateComputerActionPolicy(basePolicy, {
            action: { type: "type", text: `prefix-${rendered}-suffix` },
            target: {
              origin: "https://classroom.pactwire.test",
              dataTestIds: ["submit-assignment"],
              tagName: "textarea",
              inputType: null,
              href: null,
              formAction: null,
            },
            secretValues: [secret],
          });
          expect(decision).toMatchObject({
            allowed: false,
            outcome: "BLOCK",
            reason: "SECRET_REPRESENTATION_BLOCKED",
          });
          expect(JSON.stringify(decision)).not.toContain(rendered);
        },
      ),
      { seed, numRuns },
    );
  });
});
