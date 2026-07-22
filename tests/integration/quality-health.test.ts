import { describe, expect, it } from "vitest";

import { GET } from "../../apps/web/app/health/route.js";

describe("quality service health", () => {
  it("publishes the exact quality profile without cacheable or sensitive state", async () => {
    const response = GET();
    const body = (await response.json()) as unknown;

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(body).toMatchObject({
      product: "Pactwire",
      service: "web",
      status: "ok",
      qualityProfile: {
        version: "pactwire-quality-profile-v1",
        accessibility: "WCAG 2.2 AA",
        consoleInteractionP95Ms: 500,
        runProgressP95Ms: 2000,
        packagedBrowser: "Chromium 149.0.7827.55 (revision 1228)",
      },
    });
    expect(JSON.stringify(body)).not.toMatch(/secret|studentEmail|requestBody|password/iu);
  });
});
