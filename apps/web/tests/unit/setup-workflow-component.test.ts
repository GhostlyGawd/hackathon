import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SetupWorkflow } from "../../app/setup-workflow";

describe("SetupWorkflow component", () => {
  it("renders an accessible named loading state before saved prerequisites arrive", () => {
    const html = renderToStaticMarkup(
      createElement(SetupWorkflow, {
        workspaceId: "11111111-1111-4111-8111-111111111111",
        softwareId: "22222222-2222-4222-8222-222222222222",
        onClose: () => undefined,
      }),
    );

    expect(html).toContain('data-testid="setup-workflow"');
    expect(html).toContain('aria-labelledby="setup-heading"');
    expect(html).toContain('id="setup-heading"');
    expect(html).toContain("Loading software setup");
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("Checking saved prerequisites");
    expect(html).toContain('data-testid="refresh-setup-status"');
    expect(html).toContain("Checking…");
    expect(html).toContain("disabled");
  });
});
