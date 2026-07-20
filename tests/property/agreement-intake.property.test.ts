import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { hashAgreementBytes } from "../../packages/core/src/agreement-intake";

const propertyOptions = { seed: 20_260_720, numRuns: 250 } as const;

describe("agreement intake properties", () => {
  it("exact bytes have one stable hash and any one-byte mutation changes it", () => {
    fc.assert(
      fc.property(
        fc.uint8Array({ minLength: 1, maxLength: 4_096 }),
        fc.nat(),
        (original, positionSeed) => {
          const replay = original.slice();
          const changed = original.slice();
          const position = positionSeed % changed.length;
          changed[position]! ^= 0xff;

          expect(hashAgreementBytes(replay)).toBe(hashAgreementBytes(original));
          expect(hashAgreementBytes(changed)).not.toBe(
            hashAgreementBytes(original),
          );
        },
      ),
      propertyOptions,
    );
  });
});
