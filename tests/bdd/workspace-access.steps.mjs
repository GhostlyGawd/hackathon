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
    (method === "POST" &&
      pathname.endsWith("/software") &&
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
    await this.page.route("**/api/demo/session", async (route) => {
      if (route.request().method() === "GET") {
        await new Promise((resolve) => setTimeout(resolve, 350));
      }
      await route.continue();
    });
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
      const taskId = pickle.tags.some((tag) => tag.name === "@AUT-02")
        ? "AUT-02"
        : "AUT-01";
      await this.page.screenshot({
        fullPage: true,
        path: path.join(
          process.cwd(),
          "artifacts",
          "verification",
          taskId,
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
      if (
        process.env.PACTWIRE_CAPTURE_CURATED_EVIDENCE === "1" &&
        process.env.PACTWIRE_EVIDENCE_TASK !== "AUT-02"
      ) {
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

const softwareFixtures = Object.freeze({
  northstar: Object.freeze({
    name: "Northstar Classroom (Fictional)",
    vendor: "Northstar Learning Labs (Fictional)",
    tenant: "https://cedar.northstar.invalid",
    owner: "Curriculum and Instruction",
    version: "2026.7-fixture",
    setterKind: "IMPORTED_SYSTEM",
    setterId: "fictional-district-registry",
    setterName: "Fictional Cedar Ridge App Registry",
    source: "district inventory export",
    reference: "AP-2042",
    reason: "Imported existing district approval record.",
  }),
  beacon: Object.freeze({
    name: "Beacon Assessment (Fictional)",
    vendor: "Beacon Measurement Studio (Fictional)",
    tenant: "https://cedar.beacon.invalid",
    owner: "Assessment and Accountability",
    version: "fixture-4.2",
    setterKind: "HUMAN",
    setterId: "fictional-approver-a",
    setterName: "Dana Lopez (Fictional)",
    reference: "AR-901",
    reason: "District application review decision.",
  }),
});

async function fillSoftwareForm(world, fixture, approvalState) {
  const form = world.page.getByTestId("software-form");
  if ((await form.count()) === 0) {
    await world.page.getByTestId("open-software-form").click();
  }
  await form.waitFor();
  await world.page.getByTestId("software-name").fill(fixture.name);
  await world.page.getByTestId("software-vendor").fill(fixture.vendor);
  await world.page.getByTestId("software-tenant").fill(fixture.tenant);
  await world.page.getByTestId("software-owner").fill(fixture.owner);
  await world.page.getByTestId("software-version").fill(fixture.version);
  await world.page.getByTestId("approval-state").selectOption(approvalState);
  await world.page.getByTestId("setter-kind").selectOption(fixture.setterKind);
  await world.page.getByTestId("setter-name").fill(fixture.setterName);
  await world.page.getByTestId("setter-id").fill(fixture.setterId);
  if (fixture.setterKind === "IMPORTED_SYSTEM") {
    await world.page.getByTestId("setter-source").fill(fixture.source);
  }
  await world.page.getByTestId("source-reference").fill(fixture.reference);
  await world.page.getByTestId("approval-reason").fill(fixture.reason);
}

async function submitSoftware(world) {
  await world.page.getByTestId("submit-software").click();
}

When(
  "I add the fictional Northstar software with an imported {string} status",
  async function (approvalState) {
    await fillSoftwareForm(this, softwareFixtures.northstar, approvalState);
    await submitSoftware(this);
    await this.page
      .getByTestId("inventory-feedback")
      .getByText("Software added", { exact: true })
      .waitFor();
  },
);

When(
  "I add the fictional Beacon software with a human {string} status",
  async function (approvalState) {
    await fillSoftwareForm(this, softwareFixtures.beacon, approvalState);
    await submitSoftware(this);
    await this.page
      .getByTestId("inventory-feedback")
      .getByText("Software added", { exact: true })
      .waitFor();
  },
);

When("I try to add the fictional Beacon software", async function () {
  await fillSoftwareForm(this, softwareFixtures.beacon, "UNKNOWN");
  await submitSoftware(this);
});

Then("the inventory shows {string}", async function (softwareName) {
  await this.page
    .getByTestId("software-list")
    .getByText(softwareName, { exact: true })
    .waitFor();
});

Then("the inventory does not show {string}", async function (softwareName) {
  assert.equal(
    await this.page
      .getByTestId("software-list")
      .getByText(softwareName, { exact: true })
      .count(),
    0,
  );
});

Then("the status source says {string}", async function (sourceLabel) {
  await this.page
    .getByTestId("approval-source")
    .getByText(sourceLabel, { exact: true })
    .waitFor();
});

Then(
  "the inventory says the status is a district record, not a Pactwire conclusion",
  async function () {
    await this.page
      .getByTestId("approval-source")
      .getByText("District record · not a Pactwire conclusion", {
        exact: true,
      })
      .waitFor();
  },
);

Then("the latest run says {string}", async function (summary) {
  await this.page
    .getByTestId("latest-run")
    .getByText(summary, { exact: true })
    .waitFor();
});

Then("software creation is denied and marked as audited", async function () {
  const feedback = this.page.getByTestId("inventory-feedback");
  await feedback
    .getByText("Software creation denied", { exact: true })
    .waitFor();
  await feedback
    .getByText("Recorded in the active workspace audit.", { exact: true })
    .waitFor();
});

When("I filter the inventory to {string}", async function (approvalState) {
  await this.page
    .getByTestId("inventory-status-filter")
    .selectOption(approvalState);
  await this.page
    .getByTestId("inventory-count")
    .getByText("1 RECORD", { exact: true })
    .waitFor();
});

async function captureInventory(world, name, narrow) {
  if (narrow) await world.page.setViewportSize({ width: 390, height: 844 });
  const capture = async (root) => {
    await world.page.getByTestId("software-inventory").screenshot({
      path: path.join(root, `${name}.png`),
    });
  };
  await capture(
    path.join(
      process.cwd(),
      "artifacts",
      "verification",
      "AUT-02",
      "screenshots",
    ),
  );
  if (
    process.env.PACTWIRE_CAPTURE_CURATED_EVIDENCE === "1" &&
    process.env.PACTWIRE_EVIDENCE_TASK !== "AUT-01"
  ) {
    await capture(
      path.join(process.cwd(), "docs", "evidence", "AUT-02"),
    );
  }
  if (narrow) await world.page.setViewportSize({ width: 1440, height: 1100 });
}

Then(
  "I capture the {string} inventory evidence",
  async function (evidenceName) {
    await captureInventory(this, evidenceName, false);
  },
);

Then(
  "I capture the {string} narrow inventory evidence",
  async function (evidenceName) {
    await captureInventory(this, evidenceName, true);
  },
);
