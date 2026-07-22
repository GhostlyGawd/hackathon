import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function token(css: string, name: string): string {
  const match = new RegExp(`--${name}:\\s*(#[a-f0-9]{6})`, "iu").exec(css);
  if (!match?.[1]) throw new Error(`Missing CSS color token --${name}`);
  return match[1];
}

function luminance(hex: string): number {
  const channels = hex
    .slice(1)
    .match(/.{2}/gu)
    ?.map((value) => Number.parseInt(value, 16) / 255)
    .map((value) =>
      value <= 0.04045
        ? value / 12.92
        : ((value + 0.055) / 1.055) ** 2.4,
    );
  if (!channels || channels.length !== 3) throw new Error(`Invalid color ${hex}`);
  return (
    0.2126 * channels[0]! +
    0.7152 * channels[1]! +
    0.0722 * channels[2]!
  );
}

function contrast(left: string, right: string): number {
  const leftLuminance = luminance(left);
  const rightLuminance = luminance(right);
  return (
    (Math.max(leftLuminance, rightLuminance) + 0.05) /
    (Math.min(leftLuminance, rightLuminance) + 0.05)
  );
}

describe("QLT-01 color tokens", () => {
  it("keeps every small-text token at WCAG AA contrast on every product surface", () => {
    const css = readFileSync(
      path.join(process.cwd(), "apps", "web", "app", "globals.css"),
      "utf8",
    );
    const foregrounds = ["text", "muted", "faint", "cyan", "green", "amber", "red"];
    const backgrounds = ["bg", "surface", "surface-raised", "surface-soft"];

    for (const foreground of foregrounds) {
      for (const background of backgrounds) {
        expect(
          contrast(token(css, foreground), token(css, background)),
          `${foreground} on ${background}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});
