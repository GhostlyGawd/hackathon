import assert from "node:assert/strict";
import path from "node:path";
import process from "node:process";
import {
  After,
  Before,
  Given,
  Then,
  When,
  setDefaultTimeout,
  setWorldConstructor,
} from "@cucumber/cucumber";
import { chromium } from "@playwright/test";

setDefaultTimeout(30_000);

const baseUrl =
  process.env.PACTWIRE_BDD_BASE_URL ?? "http://127.0.0.1:3210";
const roleKeys = Object.freeze({
  "Privacy officer": "officer",
  "Test operator": "operator",
  Reviewer: "reviewer",
});
const roleValues = Object.freeze({
  "Privacy officer": "PRIVACY_OFFICER",
  "Test operator": "TEST_OPERATOR",
  Reviewer: "REVIEWER",
});

function isExpectedAuthorizationFailure(response) {
  const pathname = new URL(response.url()).pathname;
  const method = response.request().method();
  return (
    (method === "GET" &&
      pathname === "/api/demo/session" &&
      response.status() === 401) ||
    (method === "POST" &&
      pathname.endsWith("/roles") &&
      response.status() === 403) ||
    (method === "GET" &&
      pathname ===
        "/api/workspaces/22222222-2222-4222-8222-222222222222" &&
      response.status() === 404)
  );
}

class AccessWorld {
  browser;
  consoleErrors = [];
  context;
  expectedHttpErrorStatuses = [];
  unexpectedHttpFailures = [];
  page;

  async openBrowser() {
    this.browser = await chromium.launch();
    this.context = await this.browser.newContext({
      baseURL: baseUrl,
      viewport: { width: 1440, height: 1100 },
    });
    this.page = await this.context.newPage();
    this.page.on("console", (message) => {
      if (message.type() === "error") this.consoleErrors.push(message.text());
    });
    this.page.on("pageerror", (error) => {
      this.consoleErrors.push(error.message);
    });
    this.page.on("response", (response) => {
      if (response.status() < 400) return;
      if (isExpectedAuthorizationFailure(response)) {
        this.expectedHttpErrorStatuses.push(response.status());
        return;
      }
      this.unexpectedHttpFailures.push(
        `${response.request().method()} ${new URL(response.url()).pathname} ${response.status()}`,
      );
    });
  }

  async closeBrowser() {
    await this.context?.close();
    await this.browser?.close();
  }
}

setWorldConstructor(AccessWorld);

Before(async function () {
  await this.openBrowser();
});

After(async function ({ result, pickle }) {
  try {
    if (result?.status === "FAILED" && this.page) {
      const slug = pickle.name.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-");
      await this.page.screenshot({
        fullPage: true,
        path: path.join(
          process.cwd(),
          "artifacts",
          "verification",
          "AUT-01",
          "screenshots",
          `${slug}-failure.png`,
        ),
      });
    }
    if (result?.status === "PASSED" && this.page) {
      const bodyText = await this.page.locator("body").innerText();
      const overlayCount = await this.page
        .locator(
          "[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay",
        )
        .count();
      const availableExpectedStatuses = [...this.expectedHttpErrorStatuses];
      const unexpectedConsoleErrors = this.consoleErrors.filter((message) => {
        const status = /status of (\d{3})/.exec(message)?.[1];
        const matchingIndex = availableExpectedStatuses.indexOf(Number(status));
        if (matchingIndex < 0) return true;
        availableExpectedStatuses.splice(matchingIndex, 1);
        return false;
      });
      assert.ok(bodyText.trim().length > 100, "The page rendered meaningful content");
      assert.equal(overlayCount, 0, "No framework error overlay is visible");
      assert.deepEqual(
        this.unexpectedHttpFailures,
        [],
        "No unexpected HTTP request failed",
      );
      assert.deepEqual(
        unexpectedConsoleErrors,
        [],
        "No unexpected browser errors were emitted",
      );
    }
  } finally {
    await this.closeBrowser();
  }
});

Given("the fictional workspace access fixture is reset", async function () {
  const response = await this.context.request.post("/api/demo/reset");
  assert.equal(response.status(), 200);
  await this.page.goto("/");
});

async function startSession(world, role) {
  const key = roleKeys[role];
  assert.ok(key, `Unknown fixture role: ${role}`);
  await world.page.getByTestId("session-select").selectOption(key);
  await world.page.getByTestId("start-session").click();
  await world.page.getByTestId("workspace-title").waitFor();
  await world.page
    .getByTestId("active-roles")
    .getByText(role, { exact: true })
    .waitFor();
}

Given(
  "I start a signed session as the {string}",
  async function (role) {
    await startSession(this, role);
  },
);

When(
  "I switch the signed session to the {string}",
  async function (role) {
    await startSession(this, role);
  },
);

When(
  "I assign the {string} role to {string}",
  async function (role, userId) {
    const value = roleValues[role];
    assert.ok(value, `Unknown assignable role: ${role}`);
    await this.page.getByTestId("target-user").fill(userId);
    await this.page.getByTestId("target-role").selectOption(value);
    await this.page.getByTestId("assign-role").click();
  },
);

Then("the role assignment is allowed", async function () {
  const feedback = this.page.getByTestId("feedback");
  await feedback.getByText("Role assigned", { exact: true }).waitFor();
  await feedback
    .getByText("Recorded in the active workspace audit.", { exact: true })
    .waitFor();
});

Then(
  "the role assignment is denied and marked as audited",
  async function () {
    const feedback = this.page.getByTestId("feedback");
    await feedback.getByText("Action denied", { exact: true }).waitFor();
    await feedback
      .getByText("Recorded in the active workspace audit.", { exact: true })
      .waitFor();
  },
);

Then(
  "the active workspace audit shows {string}",
  async function (eventName) {
    await this.page
      .getByTestId("audit-list")
      .getByText(eventName, { exact: true })
      .first()
      .waitFor();
  },
);

When("I check workspace ID {string}", async function (workspaceId) {
  await this.page.getByTestId("lookup-id").fill(workspaceId);
  await this.page.getByTestId("lookup-workspace").click();
});

Then(
  "the response says only that the workspace is unavailable",
  async function () {
    const feedback = this.page.getByTestId("feedback");
    await feedback.getByText("Workspace unavailable", { exact: true }).waitFor();
    await feedback
      .getByText("Workspace not found or not available.", { exact: true })
      .waitFor();
  },
);

Then("no other workspace name or user is visible", async function () {
  const pageText = await this.page.locator("body").innerText();
  assert.equal(pageText.includes("Fictional Harbor School District"), false);
  assert.equal(pageText.includes("Avery Stone"), false);
  assert.equal(pageText.includes("fictional-officer-b"), false);
});

Then(
  "I capture the {string} access evidence",
  async function (evidenceName) {
    const capture = async (name) => {
      await this.page.screenshot({
        fullPage: true,
        path: path.join(
          process.cwd(),
          "artifacts",
          "verification",
          "AUT-01",
          "screenshots",
          `${name}.png`,
        ),
      });
      if (process.env.PACTWIRE_CAPTURE_CURATED_EVIDENCE === "1") {
        await this.page.screenshot({
          fullPage: true,
          path: path.join(
            process.cwd(),
            "docs",
            "evidence",
            "AUT-01",
            `${name}.png`,
          ),
        });
      }
    };

    await capture(evidenceName);
    if (evidenceName === "denied-desktop") {
      await this.page.setViewportSize({ width: 390, height: 844 });
      await capture("denied-narrow");
      await this.page.setViewportSize({ width: 1440, height: 1100 });
    }
  },
);
