import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("RUN-03 live computer-use workflow", () => {
  it("is opt-in, installs Chromium, reads the encrypted key, and uploads only sanitized RUN-03 artifacts", async () => {
    const [workflow, packageJson] = await Promise.all([
      readFile(
        path.join(
          process.cwd(),
          ".github",
          "workflows",
          "live-computer-use.yml",
        ),
        "utf8",
      ),
      readFile(path.join(process.cwd(), "package.json"), "utf8"),
    ]);

    expect(workflow).toMatch(/^name: Live GPT-5.6 computer use$/mu);
    expect(workflow).toMatch(
      /^on:\n {2}workflow_dispatch:\n {2}push:\n {4}branches:\n {6}- live\/run-03-computer-use$/mu,
    );
    expect(workflow).not.toMatch(/^ {2}pull_request:/mu);
    expect(workflow).not.toContain("- main");
    expect(workflow).toMatch(/^permissions:\n {2}contents: read$/mu);
    expect(workflow).toContain("pnpm exec playwright install --with-deps chromium");
    expect(workflow).toContain(
      "OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}",
    );
    expect(workflow).toContain("run: pnpm test:live-computer-use");
    expect(workflow).toContain("run-03-live-computer-use-${{ github.run_id }}");
    expect(workflow).toContain(
      "path: artifacts/verification/RUN-03/live-upload/",
    );
    expect(workflow).toContain("if-no-files-found: error");
    expect(workflow).not.toContain("path: artifacts/verification/**");
    expect(packageJson).toContain(
      '"test:live-computer-use": "vitest run --project live-openai tests/live-openai/computer-use.live.test.ts"',
    );
  });
});
