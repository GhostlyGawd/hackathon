import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("live OpenAI workflow", () => {
  it("is isolated to an explicit live branch, reads the encrypted key, and publishes only the sanitized manifest", async () => {
    const workflow = await readFile(
      path.join(process.cwd(), ".github", "workflows", "live-openai.yml"),
      "utf8",
    );

    expect(workflow).toMatch(/^name: Live OpenAI contract$/mu);
    expect(workflow).toMatch(
      /^on:\n {2}workflow_dispatch:\n {2}push:\n {4}branches:\n {6}- live\/agr-02-contract$/mu,
    );
    expect(workflow).not.toMatch(/^ {2}pull_request:/mu);
    expect(workflow).not.toContain("- main");
    expect(workflow).toMatch(/^permissions:\n {2}contents: read$/mu);
    expect(workflow).toContain(
      "OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}",
    );
    expect(workflow).toContain("run: pnpm test:live-openai");
    expect(workflow).toContain(
      "path: artifacts/verification/AGR-02/live-openai-contract.json",
    );
    expect(workflow).toContain("if-no-files-found: error");
    expect(workflow).not.toContain("artifacts/verification/**");
  });
});
