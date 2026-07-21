import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
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
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "@playwright/test";

setDefaultTimeout(60_000);

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
  const responseUrl = new URL(response.url());
  const pathname = responseUrl.pathname;
  const method = response.request().method();
  return (
    (responseUrl.hostname === "classroom.pactwire.test" &&
      ((method === "GET" && pathname === "/student" && response.status() === 410) ||
        (method === "POST" &&
          pathname === "/api/submissions" &&
          response.status() === 503) ||
        (method === "POST" &&
          pathname === "/api/risky-actions" &&
          response.status() === 409))) ||
    (method === "GET" &&
      pathname === "/api/demo/session" &&
      response.status() === 401) ||
    (method === "POST" &&
      pathname.endsWith("/roles") &&
      response.status() === 403) ||
    (method === "POST" &&
      pathname.endsWith("/software") &&
      response.status() === 403) ||
    (method === "POST" &&
      pathname.endsWith("/queue-check") &&
      response.status() === 409) ||
    (method === "POST" &&
      pathname.endsWith("/raw-access") &&
      response.status() === 403) ||
    (method === "GET" &&
      pathname.endsWith("/secrets") &&
      response.status() === 403) ||
    (method === "POST" &&
      pathname.endsWith("/agreements") &&
      response.status() === 422) ||
    (method === "POST" &&
      pathname.endsWith("/proposals") &&
      [422, 502].includes(response.status())) ||
    (method === "GET" &&
      pathname.endsWith("/setup") &&
      response.status() === 503) ||
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
  beforePolicyUrl;
  unexpectedPopupCount = 0;

  async openBrowser() {
    this.browser = await chromium.launch({
      args: ["--host-resolver-rules=MAP *.pactwire.test 127.0.0.1"],
    });
    this.context = await this.browser.newContext({
      baseURL: baseUrl,
      viewport: { width: 1440, height: 1100 },
    });
    this.page = await this.context.newPage();
    this.context.on("page", (openedPage) => {
      if (openedPage !== this.page) this.unexpectedPopupCount += 1;
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
      const taskId = pickle.tags.some((tag) => tag.name === "@UX-01")
        ? "UX-01"
        : pickle.tags.some((tag) => tag.name === "@DET-05")
          ? "DET-05"
        : pickle.tags.some((tag) => tag.name === "@DET-04")
          ? "DET-04"
        : pickle.tags.some((tag) => tag.name === "@DET-03")
          ? "DET-03"
        : pickle.tags.some((tag) => tag.name === "@RUN-05")
          ? "RUN-05"
        : pickle.tags.some((tag) => tag.name === "@JRN-02")
          ? "JRN-02"
          : pickle.tags.some((tag) => tag.name === "@DET-01")
            ? "DET-01"
        : pickle.tags.some((tag) => tag.name === "@FIX-01")
          ? "FIX-01"
        : pickle.tags.some((tag) => tag.name === "@AUT-02")
          ? "AUT-02"
        : pickle.tags.some((tag) => tag.name === "@AUT-03")
          ? "AUT-03"
          : pickle.tags.some((tag) => tag.name === "@AUT-04")
            ? "AUT-04"
            : pickle.tags.some((tag) => tag.name === "@JRN-01")
              ? "JRN-01"
              : pickle.tags.some((tag) => tag.name === "@AGR-03")
                ? "AGR-03"
                : pickle.tags.some((tag) => tag.name === "@AGR-02")
                  ? "AGR-02"
              : pickle.tags.some((tag) => tag.name === "@AGR-01")
                ? "AGR-01"
            : "AUT-01";
      await this.page.screenshot({
        fullPage: true,
        mask: [
          this.page.locator(
            "input[type='password'], [data-secret], [data-pactwire-sensitive], [autocomplete='current-password'], [autocomplete='new-password']",
          ),
        ],
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
      assert.equal(
        this.unexpectedPopupCount,
        0,
        "No out-of-policy popup was opened",
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

function shouldCaptureCurated(taskId) {
  if (process.env.PACTWIRE_CAPTURE_CURATED_EVIDENCE !== "1") return false;
  const requestedTask = process.env.PACTWIRE_EVIDENCE_TASK;
  return !requestedTask || requestedTask === taskId;
}

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
      if (shouldCaptureCurated("AUT-01")) {
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
  if (shouldCaptureCurated("AUT-02")) {
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

When("I continue setup for {string}", async function (softwareName) {
  const card = this.page
    .getByTestId("software-card")
    .filter({ hasText: softwareName });
  await card.getByTestId("continue-setup").click();
  await this.page.getByTestId("setup-workflow").waitFor();
});

Then("the inventory explains how to add the first software record", async function () {
  const empty = this.page.getByTestId("inventory-empty");
  await empty.getByText("No software matches this view", { exact: true }).waitFor();
  await empty
    .getByText("Add a school product or change the search and district-status filters.", {
      exact: true,
    })
    .waitFor();
});

When("the setup service becomes temporarily unavailable", async function () {
  this.setupRoutePattern = "**/api/workspaces/*/software/*/setup";
  await this.page.route(this.setupRoutePattern, async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error: { message: "Saved setup status is temporarily unavailable." },
      }),
    });
  });
});

Then("the setup explains that its saved status is unavailable", async function () {
  const workflow = this.page.getByTestId("setup-workflow");
  await workflow.getByRole("heading", { name: "Software setup" }).waitFor();
  const alert = workflow.getByRole("alert");
  await alert.getByText("Setup status unavailable", { exact: true }).waitFor();
  await alert
    .getByText("Saved setup status is temporarily unavailable.", { exact: true })
    .waitFor();
  await alert.getByRole("button", { name: "Try again" }).waitFor();
});

When("the setup service recovers and I retry", async function () {
  await this.page.unroute(this.setupRoutePattern);
  await this.page
    .getByTestId("setup-workflow")
    .getByRole("button", { name: "Try again" })
    .click();
});

Then("all six setup steps are visible", async function () {
  const steps = this.page.getByTestId("setup-step");
  await steps.first().waitFor();
  assert.equal(await steps.count(), 6);
});

Then(
  "setup step {string} needs action",
  async function (stepName) {
    const step = this.page.getByTestId("setup-step").filter({ hasText: stepName });
    await step.getByText("Needs action", { exact: true }).waitFor();
  },
);

Then(
  "setup step {string} explains that authorization is required first",
  async function (stepName) {
    const step = this.page.getByTestId("setup-step").filter({ hasText: stepName });
    await step
      .getByText("Complete Authorization and allowed scope first.", {
        exact: true,
      })
      .waitFor();
  },
);

When("I refresh the setup status", async function () {
  await this.page.getByTestId("refresh-setup-status").click();
});

Then(
  "setup step {string} is complete",
  async function (stepName) {
    const step = this.page.getByTestId("setup-step").filter({ hasText: stepName });
    await step.getByText("Complete", { exact: true }).waitFor();
  },
);

When("I reload the Pactwire page", async function () {
  await this.page.reload();
  await this.page.getByTestId("workspace-title").waitFor();
});

Then(
  "setup for {string} is resumed from the URL",
  async function (softwareName) {
    assert.equal(new URL(this.page.url()).searchParams.has("setup"), true);
    await this.page
      .getByTestId("setup-workflow")
      .getByText(softwareName, { exact: true })
      .waitFor();
  },
);

Then("the setup status identifies the original district source", async function () {
  await this.page
    .getByTestId("setup-status-provenance")
    .getByText("Imported from Fictional Cedar Ridge App Registry", {
      exact: true,
    })
    .waitFor();
});

Then("every setup step is complete", async function () {
  const steps = this.page.getByTestId("setup-step");
  await steps.first().waitFor();
  assert.equal(await steps.count(), 6);
  assert.equal(
    await steps.getByText("Complete", { exact: true }).count(),
    6,
  );
});

Then(
  "the setup is run-ready for a named fictional-data test",
  async function () {
    const workflow = this.page.getByTestId("setup-workflow");
    await workflow.getByText("Run-ready", { exact: true }).waitFor();
    await workflow
      .getByText("Queue a named fictional-data test", { exact: true })
      .waitFor();
  },
);

Then(
  "the inventory next safe action is {string}",
  async function (actionLabel) {
    await this.page
      .getByTestId("software-card")
      .filter({ hasText: "Northstar Classroom (Fictional)" })
      .getByText(actionLabel, { exact: true })
      .waitFor();
  },
);

When(
  "I select setup step {string} using only the keyboard",
  async function (stepName) {
    const buttons = this.page
      .getByTestId("setup-step")
      .getByRole("button");
    await buttons.first().focus();
    const targetIndex = await buttons.evaluateAll(
      (elements, name) =>
        elements.findIndex((element) => element.textContent?.includes(name)),
      stepName,
    );
    assert.ok(targetIndex >= 0, `Unknown setup step: ${stepName}`);
    for (let index = 0; index < targetIndex; index += 1) {
      await this.page.keyboard.press("Tab");
    }
    await this.page.keyboard.press("Enter");
  },
);

Then(
  "setup step {string} is the current step",
  async function (stepName) {
    const button = this.page
      .getByTestId("setup-step")
      .filter({ hasText: stepName })
      .getByRole("button");
    await button.waitFor();
    assert.equal(await button.getAttribute("aria-current"), "step");
  },
);

Then(
  "the setup has no automatically detectable WCAG A or AA violations",
  async function () {
    const popupCountBeforeAxe = this.unexpectedPopupCount;
    const results = await new AxeBuilder({ page: this.page })
      .include('[data-testid="setup-workflow"]')
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    // @axe-core/playwright opens and closes one same-context about:blank page
    // to merge partial results. It is test instrumentation, not a product popup.
    assert.equal(this.context.pages().length, 1);
    assert.equal(this.unexpectedPopupCount, popupCountBeforeAxe + 1);
    this.unexpectedPopupCount = popupCountBeforeAxe;
    assert.deepEqual(
      results.violations.map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        nodes: violation.nodes.map((node) => node.target),
      })),
      [],
    );
  },
);

async function captureUx01(world, name, locator) {
  const roots = [
    path.join(
      process.cwd(),
      "artifacts",
      "verification",
      "UX-01",
      "screenshots",
    ),
  ];
  if (shouldCaptureCurated("UX-01")) {
    roots.push(path.join(process.cwd(), "docs", "evidence", "UX-01"));
  }
  for (const root of roots) {
    await locator.screenshot({ path: path.join(root, `${name}.png`) });
  }
}

Then(
  "I capture the UX-01 blocked setup and six-step evidence",
  async function () {
    const workflow = this.page.getByTestId("setup-workflow");
    const steps = this.page.getByTestId("setup-step");
    const names = [
      "software",
      "authorization",
      "agreement",
      "requirements",
      "test-data",
      "journey",
    ];
    await captureUx01(
      this,
      "inventory-desktop",
      this.page.getByTestId("software-inventory"),
    );
    for (let index = 0; index < names.length; index += 1) {
      await steps.nth(index).getByRole("button").click();
      await captureUx01(
        this,
        `setup-step-${String(index + 1).padStart(2, "0")}-${names[index]}-desktop`,
        workflow,
      );
    }
    await this.page.setViewportSize({ width: 390, height: 844 });
    await captureUx01(this, "setup-blocked-narrow", workflow);
    await captureUx01(
      this,
      "inventory-narrow",
      this.page.getByTestId("software-inventory"),
    );
    await this.page.setViewportSize({ width: 1440, height: 1100 });
  },
);

Then(
  "I capture the UX-01 authorization recovery evidence",
  async function () {
    await captureUx01(
      this,
      "setup-authorization-recovered-desktop",
      this.page.getByTestId("setup-workflow"),
    );
  },
);

Then("I capture the UX-01 setup error evidence", async function () {
  const workflow = this.page.getByTestId("setup-workflow");
  await this.page.setViewportSize({ width: 390, height: 844 });
  await captureUx01(this, "setup-error-narrow", workflow);
  await this.page.setViewportSize({ width: 1440, height: 1100 });
});

Then(
  "I capture the UX-01 run-ready setup and inventory evidence",
  async function () {
    const workflow = this.page.getByTestId("setup-workflow");
    const inventory = this.page.getByTestId("software-inventory");
    await captureUx01(this, "setup-run-ready-desktop", workflow);
    await captureUx01(this, "inventory-run-ready-desktop", inventory);
    await this.page.setViewportSize({ width: 390, height: 844 });
    await captureUx01(this, "setup-run-ready-narrow", workflow);
    await captureUx01(this, "inventory-run-ready-narrow", inventory);
    await this.page.setViewportSize({ width: 1440, height: 1100 });
  },
);

Given("the fictional Northstar software exists", async function () {
  await fillSoftwareForm(this, softwareFixtures.northstar, "APPROVED");
  const creationResponse = this.page.waitForResponse((response) => {
    const request = response.request();
    return (
      request.method() === "POST" &&
      new URL(response.url()).pathname.endsWith("/software")
    );
  });
  await submitSoftware(this);
  assert.equal((await creationResponse).status(), 201);
  await this.page.reload();
  await this.page.getByTestId("workspace-title").waitFor();
  await this.page.getByTestId("authorization-panel").waitFor();
  await this.page
    .getByTestId("authorization-software-select")
    .locator("option")
    .filter({ hasText: "Northstar Classroom (Fictional)" })
    .waitFor({ state: "attached" });
});

async function defineAuthorization(world, expired) {
  await world.page.getByTestId("authorization-panel").waitFor();
  await world.page
    .getByTestId("authorization-software-select")
    .locator("option")
    .filter({ hasText: "Northstar Classroom (Fictional)" })
    .waitFor({ state: "attached" });
  await world.page.waitForFunction(() =>
    Boolean(
      globalThis.document.querySelector('[data-testid="authorization-form"]') ||
        globalThis.document.querySelector('[data-testid="new-authorization"]'),
    ),
  );
  const form = world.page.getByTestId("authorization-form");
  if ((await form.count()) === 0) {
    await world.page.getByTestId("new-authorization").click();
  }
  await form.waitFor();
  await world.page
    .getByTestId("authority-basis")
    .fill("District-owned fictional training tenant.");
  await world.page
    .getByTestId("authorization-base-url")
    .fill("https://cedar.northstar.invalid/classroom");
  await world.page
    .getByTestId("authorization-supporting-domains")
    .fill("assets.northstar.invalid");
  await world.page
    .getByTestId("authorization-valid-from")
    .fill(expired ? "2026-07-18T18:00" : "2026-07-19T20:00");
  await world.page
    .getByTestId("authorization-review-at")
    .fill(expired ? "2026-07-19T18:30" : "2026-07-20T20:00");
  await world.page
    .getByTestId("authorization-expires-at")
    .fill(expired ? "2026-07-19T19:00" : "2026-07-21T20:00");
  await world.page.getByTestId("authority-confirmed").check();
  await world.page.getByTestId("synthetic-confirmed").check();
  await world.page.getByTestId("save-authorization").click();
  await world.page.getByTestId("authorization-current").waitFor();
}

When(
  "I define a current authorization for the fictional Northstar software",
  async function () {
    await defineAuthorization(this, false);
  },
);

When(
  "I define an expired authorization for the fictional Northstar software",
  async function () {
    await defineAuthorization(this, true);
  },
);

Then("the authorization is shown as {string}", async function (status) {
  await this.page
    .getByTestId("authorization-status")
    .getByText(status, { exact: true })
    .waitFor();
});

Then(
  "the authorization names the human attestation and authority basis",
  async function () {
    const current = this.page.getByTestId("authorization-current");
    await current
      .getByText("District-owned fictional training tenant.", { exact: true })
      .waitFor();
    const proof = this.page.getByTestId("attestation-proof");
    await proof
      .getByText("Human attestation recorded", { exact: true })
      .waitFor();
    await proof.getByText("fictional-officer-a", { exact: false }).waitFor();
  },
);

Then(
  "the authorization shows its base URL, review date, expiry, allowed actions, and prohibited actions",
  async function () {
    const scope = this.page.getByTestId("authorization-scope");
    await scope
      .getByText("https://cedar.northstar.invalid/classroom", { exact: true })
      .waitFor();
    await scope.getByText("NAVIGATE", { exact: true }).waitFor();
    await scope.getByText("DELETE", { exact: true }).waitFor();
    const dates = this.page.getByTestId("authorization-dates");
    await dates.getByText("Review by", { exact: true }).waitFor();
    await dates.getByText("Expires", { exact: true }).waitFor();
  },
);

When("I check whether the authorized run can queue", async function () {
  await this.page.getByTestId("queue-check").click();
  await this.page.getByTestId("policy-result").waitFor();
});

Then("the run queue is blocked because {string}", async function (reason) {
  const result = this.page.getByTestId("policy-result");
  await result.getByText("Blocked by stored policy", { exact: true }).waitFor();
  await result.getByText(reason, { exact: true }).waitFor();
});

Then("the blocked run queue attempt is recorded", async function () {
  await this.page
    .getByTestId("policy-result")
    .getByText("Blocked attempt recorded", { exact: true })
    .waitFor();
  await this.page
    .getByTestId("policy-decisions")
    .getByText("AUTHORIZATION_EXPIRED", { exact: false })
    .waitFor();
});

async function checkTargetAttempt(world, kind, targetUrl) {
  world.beforePolicyUrl = world.page.url();
  await world.page.getByTestId("attempt-kind").selectOption(kind);
  await world.page.getByTestId("attempt-url").fill(targetUrl);
  await world.page.getByTestId("check-policy-attempt").click();
  await world.page.getByTestId("policy-result").waitFor();
}

When("the runner attempts a redirect to {string}", async function (targetUrl) {
  await checkTargetAttempt(this, "REDIRECT", targetUrl);
});

Then(
  "the redirect is blocked before the browser leaves Pactwire",
  async function () {
    assert.equal(this.page.url(), this.beforePolicyUrl);
    assert.equal(this.unexpectedPopupCount, 0);
    await this.page
      .getByTestId("policy-result")
      .getByText("DOMAIN_NOT_ALLOWED", { exact: false })
      .waitFor();
  },
);

Then("the reason says {string}", async function (reason) {
  await this.page
    .getByTestId("policy-result")
    .getByText(reason, { exact: true })
    .waitFor();
});

When("the runner attempts a popup to {string}", async function (targetUrl) {
  await checkTargetAttempt(this, "POPUP", targetUrl);
});

When(
  "the runner attempts the prohibited {string} action",
  async function (action) {
    await this.page.getByTestId("attempt-kind").selectOption("ACTION");
    await this.page.getByTestId("attempt-action").selectOption(action);
    await this.page.getByTestId("check-policy-attempt").click();
    await this.page.getByTestId("policy-result").waitFor();
  },
);

Then(
  "all three blocked attempts are recorded with bounded reasons",
  async function () {
    const history = this.page.getByTestId("policy-decisions");
    await history.locator("li").nth(2).waitFor();
    assert.equal(await history.locator("li").count(), 3);
    const text = await history.innerText();
    assert.match(text, /DOMAIN_NOT_ALLOWED/u);
    assert.match(text, /POPUP_BLOCKED/u);
    assert.match(text, /ACTION_PROHIBITED/u);
    assert.equal(text.includes("?student=fictional"), false);
  },
);

async function captureAuthorization(world, name, narrow) {
  if (narrow) await world.page.setViewportSize({ width: 390, height: 844 });
  const capture = async (root) => {
    await world.page.getByTestId("authorization-panel").screenshot({
      path: path.join(root, `${name}.png`),
    });
  };
  await capture(
    path.join(
      process.cwd(),
      "artifacts",
      "verification",
      "AUT-03",
      "screenshots",
    ),
  );
  if (shouldCaptureCurated("AUT-03")) {
    await capture(path.join(process.cwd(), "docs", "evidence", "AUT-03"));
  }
  if (narrow) await world.page.setViewportSize({ width: 1440, height: 1100 });
}

Then(
  "I capture the {string} authorization evidence",
  async function (evidenceName) {
    await captureAuthorization(this, evidenceName, false);
  },
);

Then(
  "I capture the {string} narrow authorization evidence",
  async function (evidenceName) {
    await captureAuthorization(this, evidenceName, true);
  },
);

function configuredRepresentations(secret) {
  const percentEncoded = encodeURIComponent(secret);
  const formEncoded = new URLSearchParams({ value: secret })
    .toString()
    .slice("value=".length);
  return [
    secret,
    percentEncoded.replace(/%[0-9A-F]{2}/giu, (match) => match.toUpperCase()),
    percentEncoded.replace(/%[0-9A-F]{2}/giu, (match) => match.toLowerCase()),
    formEncoded,
    Buffer.from(secret, "utf8").toString("base64"),
    Buffer.from(secret, "utf8").toString("base64url"),
    JSON.stringify(secret).slice(1, -1),
  ].filter((value, index, values) => value && values.indexOf(value) === index);
}

function assertNoSecretRepresentation(candidate, secret) {
  const leaked = configuredRepresentations(secret).some((representation) =>
    candidate.includes(representation),
  );
  assert.equal(leaked, false, "No configured credential representation is present");
}

async function selectNorthstarSecretSoftware(world) {
  const select = world.page.getByTestId("secret-software-select");
  await select.waitFor();
  const option = select
    .locator("option")
    .filter({ hasText: "Northstar Classroom (Fictional)" });
  await option.waitFor({ state: "attached" });
  const value = await option.getAttribute("value");
  assert.ok(value, "Northstar software has a selectable identifier");
  await select.selectOption(value);
}

When("I store a generated fictional browser credential", async function () {
  this.generatedSecret = `fixture/${randomUUID()}?token=${randomUUID()}&mode=test`;
  await selectNorthstarSecretSoftware(this);
  await this.page
    .getByTestId("secret-label")
    .fill("Generated fictional browser credential");
  await this.page.getByTestId("secret-kind").selectOption("PASSWORD");
  await this.page.getByTestId("secret-value").fill(this.generatedSecret);
  const creation = this.page.waitForResponse((response) => {
    const request = response.request();
    return (
      request.method() === "POST" &&
      new URL(response.url()).pathname.endsWith("/secrets")
    );
  });
  await this.page.getByTestId("store-secret").click();
  const response = await creation;
  this.secretCreationResponse = await response.text();
  assert.equal(response.status(), 201);
  assertNoSecretRepresentation(this.secretCreationResponse, this.generatedSecret);
  await this.page
    .getByTestId("secret-record")
    .getByText("Generated fictional browser credential", { exact: true })
    .waitFor();
  assert.equal(await this.page.getByTestId("secret-value").inputValue(), "");
});

When(
  "an untrusted page asks Pactwire to reveal the saved credential",
  async function () {
    const rawResponse = this.page.waitForResponse((response) =>
      new URL(response.url()).pathname.endsWith("/raw-access"),
    );
    await this.page.getByTestId("raw-secret-access").click();
    const response = await rawResponse;
    this.rawAccessStatus = response.status();
    this.rawAccessResponse = await response.text();
  },
);

Then("raw secret access is blocked and marked as audited", async function () {
  assert.equal(this.rawAccessStatus, 403);
  const notice = this.page.getByTestId("secret-notice");
  await notice.getByText("Raw access blocked", { exact: true }).waitFor();
  await notice
    .getByText("The denied attempt was recorded.", { exact: false })
    .waitFor();
  assert.match(this.rawAccessResponse, /SECRET_RAW_ACCESS_DENIED/u);
  assert.match(this.rawAccessResponse, /"auditRecorded":true/u);
});

Then(
  "the page response contains no configured secret representation",
  async function () {
    assertNoSecretRepresentation(this.rawAccessResponse, this.generatedSecret);
    assertNoSecretRepresentation(
      await this.page.getByTestId("secret-panel").innerText(),
      this.generatedSecret,
    );
  },
);

When(
  "I preview normal evidence containing encoded credential variants",
  async function () {
    const previewResponse = this.page.waitForResponse((response) =>
      new URL(response.url()).pathname.endsWith("/preview"),
    );
    await this.page.getByTestId("preview-secret-redaction").click();
    const response = await previewResponse;
    this.redactionPreviewResponse = await response.text();
    assert.equal(response.status(), 200);
    await this.page.getByTestId("redaction-preview").waitFor();
  },
);

Then("every configured credential representation is redacted", async function () {
  assertNoSecretRepresentation(
    this.redactionPreviewResponse,
    this.generatedSecret,
  );
  assertNoSecretRepresentation(
    await this.page.getByTestId("secret-panel").innerText(),
    this.generatedSecret,
  );
  await this.page
    .getByTestId("redaction-preview")
    .getByText("[REDACTED_SECRET]", { exact: false })
    .first()
    .waitFor();
});

Then(
  "the workspace export contains secret metadata but no secret value",
  async function () {
    const { body, status } = await this.page.evaluate(async () => {
      const response = await fetch(
        "/api/workspaces/11111111-1111-4111-8111-111111111111/export",
      );
      return { body: await response.text(), status: response.status };
    });
    assert.equal(status, 200);
    assert.match(body, /"secretMetadata"/u);
    assert.match(body, /"rawValuesIncluded":false/u);
    assertNoSecretRepresentation(body, this.generatedSecret);
  },
);

Then("saved credential metadata is no longer visible", async function () {
  const panel = this.page.getByTestId("secret-panel");
  await panel
    .getByText("Saved credential metadata unavailable", { exact: true })
    .waitFor();
  assert.equal(
    await panel
      .getByText("Generated fictional browser credential", { exact: true })
      .count(),
    0,
  );
  assertNoSecretRepresentation(await panel.innerText(), this.generatedSecret);
});

async function captureSecretEvidence(world, name, narrow) {
  if (narrow) await world.page.setViewportSize({ width: 390, height: 844 });
  const panel = world.page.getByTestId("secret-panel");
  await panel.scrollIntoViewIfNeeded();
  const mask = world.page.locator(
    "input[type='password'], [data-secret], [data-pactwire-sensitive], [autocomplete='current-password'], [autocomplete='new-password']",
  );
  const capture = async (root) => {
    await panel.screenshot({
      mask: [mask],
      path: path.join(root, `${name}.png`),
    });
  };
  await capture(
    path.join(
      process.cwd(),
      "artifacts",
      "verification",
      "AUT-04",
      "screenshots",
    ),
  );
  if (shouldCaptureCurated("AUT-04")) {
    await capture(path.join(process.cwd(), "docs", "evidence", "AUT-04"));
  }
  if (narrow) await world.page.setViewportSize({ width: 1440, height: 1100 });
}

Then(
  "I capture the {string} secret evidence",
  async function (evidenceName) {
    await captureSecretEvidence(this, evidenceName, false);
  },
);

Then(
  "I capture the {string} narrow secret evidence",
  async function (evidenceName) {
    await captureSecretEvidence(this, evidenceName, true);
  },
);

When(
  "I enter a routable student email and numeric district identifier",
  async function () {
    this.submittedLikelyRealEmail = "taylor@real-school.edu";
    this.submittedLikelyRealIdentifier = "123456789";
    await this.page.getByTestId("synthetic-data-panel").waitFor();
    await this.page.getByTestId("persona-role").selectOption("STUDENT");
    await this.page
      .getByTestId("persona-display-name")
      .fill("Taylor Morgan");
    await this.page
      .getByTestId("persona-email")
      .fill(this.submittedLikelyRealEmail);
    await this.page
      .getByTestId("persona-activity-field")
      .selectOption("studentId");
    await this.page
      .getByTestId("persona-activity-value")
      .fill(this.submittedLikelyRealIdentifier);
  },
);

When(
  "I confirm the persona is fictional and try to save it",
  async function () {
    await this.page.getByTestId("persona-confirmation").check();
    const scanResponse = this.page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        response.request().method() === "POST" &&
        url.pathname.endsWith("/personas/scan")
      );
    });
    await this.page.getByTestId("save-fictional-persona").click();
    const response = await scanResponse;
    this.personaScanResponse = await response.text();
    assert.equal(response.status(), 200);
  },
);

Then(
  "Pactwire blocks the likely real data without echoing it",
  async function () {
    const notice = this.page.getByTestId("synthetic-notice");
    await notice.getByText("Likely real data blocked", { exact: true }).waitFor();
    await notice
      .getByText("Nothing was saved.", { exact: false })
      .waitFor();
    const pageText = await this.page.getByTestId("synthetic-data-panel").innerText();
    assert.equal(pageText.includes(this.submittedLikelyRealEmail), false);
    assert.equal(pageText.includes(this.submittedLikelyRealIdentifier), false);
    assert.equal(this.personaScanResponse.includes(this.submittedLikelyRealEmail), false);
    assert.equal(
      this.personaScanResponse.includes(this.submittedLikelyRealIdentifier),
      false,
    );
    assert.equal(await this.page.getByTestId("persona-email").inputValue(), "");
    assert.equal(
      await this.page.getByTestId("persona-activity-value").inputValue(),
      "",
    );
  },
);

Then("no fictional persona is saved", async function () {
  await this.page
    .getByTestId("persona-list")
    .getByText("No fictional personas saved.", { exact: true })
    .waitFor();
  assert.equal(
    await this.page.getByTestId("persona-list").locator("article").count(),
    0,
  );
});

async function saveFictionalPersona(world, role) {
  const panel = world.page.getByTestId("synthetic-data-panel");
  await panel.waitFor();
  await world.page.getByTestId("persona-role").selectOption(role);
  await world.page.getByTestId("persona-confirmation").check();
  const createdResponse = world.page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      response.request().method() === "POST" &&
      /\/api\/workspaces\/[^/]+\/personas$/u.test(url.pathname)
    );
  });
  await world.page.getByTestId("save-fictional-persona").click();
  const response = await createdResponse;
  assert.equal(response.status(), 201);
  const body = JSON.parse(await response.text());
  world.savedPersonaIds ??= [];
  world.savedPersonaIds.push(body.persona.id);
  await panel.getByText(body.persona.displayName, { exact: true }).waitFor();
}

When("I save an obviously fictional teacher persona", async function () {
  await saveFictionalPersona(this, "TEACHER");
});

When("I save an obviously fictional student persona", async function () {
  await saveFictionalPersona(this, "STUDENT");
});

async function selectPreparedRun(world, label) {
  const select = world.page.getByTestId("prepared-run-select");
  const option = select.locator("option", { hasText: label });
  const value = await option.getAttribute("value");
  assert.ok(value, `Prepared run ${label} has a value`);
  const responsePromise = world.page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      response.request().method() === "GET" &&
      url.pathname.endsWith(`/runs/${value}/canaries`)
    );
  });
  await select.selectOption(value);
  const response = await responsePromise;
  assert.equal(response.status(), 200);
  world.selectedPreparedRunId = value;
}

async function assertDefaultSourcesSelected(world) {
  for (const personaId of world.savedPersonaIds ?? []) {
    const persona = world.page.locator(`[data-persona-id="${personaId}"]`).first();
    const checkboxes = persona.locator("input[type='checkbox']");
    assert.equal(await checkboxes.count(), 2);
    for (let index = 0; index < 2; index += 1) {
      if (!(await checkboxes.nth(index).isChecked())) {
        await checkboxes.nth(index).check();
      }
    }
  }
}

When(
  "I select their email and activity fields for {string}",
  async function (label) {
    await selectPreparedRun(this, label);
    await assertDefaultSourcesSelected(this);
  },
);

When(
  "I select its email and activity fields for {string}",
  async function (label) {
    await selectPreparedRun(this, label);
    await assertDefaultSourcesSelected(this);
  },
);

async function currentCanaryValues(world) {
  return world.page
    .getByTestId("canary-mappings")
    .locator("[data-canary-value]")
    .evaluateAll((rows) =>
      rows.map((row) => row.getAttribute("data-canary-value") ?? ""),
    );
}

async function generatePreparedCanaries(world) {
  const responsePromise = world.page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      response.request().method() === "POST" &&
      url.pathname.endsWith(`/runs/${world.selectedPreparedRunId}/canaries`)
    );
  });
  await world.page.getByTestId("generate-run-canaries").click();
  const response = await responsePromise;
  assert.equal(response.status(), 201);
  await world.page
    .getByTestId("synthetic-notice")
    .getByText("Run canaries ready", { exact: true })
    .waitFor();
  const values = await currentCanaryValues(world);
  world.canaryValuesByRun ??= {};
  world.canaryValuesByRun[world.selectedPreparedRunId] = values;
}

When("I generate canaries for the prepared run", async function () {
  await generatePreparedCanaries(this);
});

Then(
  "every selected field maps to one persona and one non-reused value",
  async function () {
    const rows = this.page
      .getByTestId("canary-mappings")
      .locator("[data-canary-value]");
    assert.equal(await rows.count(), 4);
    const mappings = await rows.evaluateAll((items) =>
      items.map((item) => ({
        personaId: item.getAttribute("data-persona-id"),
        sourceField: item.getAttribute("data-source-field"),
        value: item.getAttribute("data-canary-value"),
      })),
    );
    assert.equal(new Set(mappings.map((mapping) => mapping.value)).size, 4);
    assert.equal(
      mappings.every(
        (mapping) =>
          Boolean(mapping.personaId) &&
          Boolean(mapping.sourceField) &&
          Boolean(mapping.value),
      ),
      true,
    );
    for (const personaId of this.savedPersonaIds) {
      assert.equal(
        mappings.filter((mapping) => mapping.personaId === personaId).length,
        2,
      );
    }
  },
);

Then(
  "every generated email address uses a reserved non-deliverable domain",
  async function () {
    const rows = this.page
      .getByTestId("canary-mappings")
      .locator('[data-source-field="email"]');
    assert.equal(await rows.count(), 2);
    const values = await rows.evaluateAll((items) =>
      items.map((item) => item.getAttribute("data-canary-value") ?? ""),
    );
    assert.equal(values.every((value) => value.endsWith(".invalid")), true);
  },
);

When(
  "I switch to {string} and generate the same selected fields",
  async function (label) {
    await selectPreparedRun(this, label);
    await assertDefaultSourcesSelected(this);
    await generatePreparedCanaries(this);
  },
);

Then("the two prepared runs have disjoint canary values", function () {
  const valueSets = Object.values(this.canaryValuesByRun ?? {}).filter(
    (values) => values.length > 0,
  );
  assert.equal(valueSets.length, 2);
  const [first, second] = valueSets;
  assert.equal(first.some((value) => second.includes(value)), false);
});

Then("an unrelated prepared run has no canaries", async function () {
  const priorValues = Object.values(this.canaryValuesByRun).flat();
  await selectPreparedRun(this, "Unrelated prepared run");
  await this.page.getByTestId("canary-empty").waitFor();
  assert.equal(await currentCanaryValues(this).then((values) => values.length), 0);
  const panelText = await this.page.getByTestId("canary-mappings").innerText();
  assert.equal(priorValues.some((value) => panelText.includes(value)), false);
});

async function captureSyntheticDataEvidence(world, name, narrow) {
  if (narrow) await world.page.setViewportSize({ width: 390, height: 844 });
  const panel = world.page.getByTestId("synthetic-data-panel");
  await panel.scrollIntoViewIfNeeded();
  const capture = async (root) => {
    await panel.screenshot({ path: path.join(root, `${name}.png`) });
  };
  await capture(
    path.join(
      process.cwd(),
      "artifacts",
      "verification",
      "JRN-01",
      "screenshots",
    ),
  );
  if (shouldCaptureCurated("JRN-01")) {
    await capture(path.join(process.cwd(), "docs", "evidence", "JRN-01"));
  }
  if (narrow) await world.page.setViewportSize({ width: 1440, height: 1100 });
}

Then(
  "I capture the {string} synthetic-data evidence",
  async function (evidenceName) {
    await captureSyntheticDataEvidence(this, evidenceName, false);
  },
);

Then(
  "I capture the {string} narrow synthetic-data evidence",
  async function (evidenceName) {
    await captureSyntheticDataEvidence(this, evidenceName, true);
  },
);

const agreementFixture = Object.freeze({
  name: "Northstar-DPA-fictional.txt",
  mimeType: "text/plain",
  pageOne:
    "Fictional Cedar Ridge DPA\nPurpose: classroom instruction only.",
  pageTwo:
    "Fictional Cedar Ridge DPA\nRecipients: district-authorized subprocessors only.",
});

function agreementBytes(changed = false) {
  return Buffer.from(
    `${agreementFixture.pageOne}\f${agreementFixture.pageTwo}${changed ? "!" : ""}`,
    "utf8",
  );
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function selectNorthstarAgreementSoftware(world) {
  const panel = world.page.getByTestId("agreement-panel");
  await panel.waitFor();
  const select = world.page.getByTestId("agreement-software-select");
  const option = select
    .locator("option")
    .filter({ hasText: "Northstar Classroom (Fictional)" });
  await option.waitFor({ state: "attached" });
  const softwareId = await option.getAttribute("value");
  assert.ok(softwareId, "Northstar software has a selectable identifier");
  await select.selectOption(softwareId);
}

async function uploadAgreementFixture(world, bytes, expectedStatus, file = {}) {
  await selectNorthstarAgreementSoftware(world);
  await world.page.getByTestId("agreement-file").setInputFiles({
    name: file.name ?? agreementFixture.name,
    mimeType: file.mimeType ?? agreementFixture.mimeType,
    buffer: bytes,
  });
  const responsePromise = world.page.waitForResponse((response) => {
    const request = response.request();
    return (
      request.method() === "POST" &&
      new URL(response.url()).pathname.endsWith("/agreements")
    );
  });
  await world.page.getByTestId("submit-agreement").click();
  const response = await responsePromise;
  assert.equal(response.status(), expectedStatus);
  return response;
}

When(
  "I upload the fictional two-page text agreement with effective dates",
  async function () {
    this.agreementVersionOneBytes = agreementBytes();
    this.agreementVersionOneHash = sha256(this.agreementVersionOneBytes);
    await selectNorthstarAgreementSoftware(this);
    await this.page
      .getByTestId("agreement-effective-from")
      .fill("2026-07-01");
    await this.page
      .getByTestId("agreement-effective-until")
      .fill("2027-06-30");
    await uploadAgreementFixture(this, this.agreementVersionOneBytes, 201);
    await this.page.getByTestId("agreement-current-version").waitFor();
  },
);

Then(
  "agreement version 1 shows its file name, byte count, hash, uploader, and effective dates",
  async function () {
    const record = this.page.getByTestId("agreement-current-version");
    await record
      .getByText(agreementFixture.name, { exact: true })
      .waitFor();
    const expectedBytes = new Intl.NumberFormat("en-US").format(
      this.agreementVersionOneBytes.length,
    );
    await record.getByText(`${expectedBytes} bytes`, { exact: true }).waitFor();
    await record
      .getByText("fictional-officer-a", { exact: true })
      .waitFor();
    await record
      .getByText("2026-07-01 → 2027-06-30", { exact: true })
      .waitFor();
    assert.equal(
      await this.page.getByTestId("agreement-source-hash-1").innerText(),
      this.agreementVersionOneHash,
    );
  },
);

Then(
  "the source viewer reproduces both fictional pages with verified page hashes",
  async function () {
    const viewer = this.page.getByTestId("agreement-source-viewer");
    await viewer.waitFor();
    for (const [index, text] of [
      agreementFixture.pageOne,
      agreementFixture.pageTwo,
    ].entries()) {
      const page = this.page.getByTestId(`agreement-page-${index + 1}`);
      await page.getByText(text, { exact: true }).waitFor();
      await page
        .getByText(sha256(Buffer.from(text, "utf8")), { exact: true })
        .waitFor();
    }
  },
);

Then(
  "downloading the original agreement reproduces the displayed source hash",
  async function () {
    const [download] = await Promise.all([
      this.page.waitForEvent("download"),
      this.page.getByTestId("download-agreement-source").click(),
    ]);
    const downloadedPath = await download.path();
    assert.ok(downloadedPath, "The original agreement download completed");
    assert.equal(sha256(await readFile(downloadedPath)), this.agreementVersionOneHash);
    assert.equal(download.suggestedFilename(), agreementFixture.name);
  },
);

When("I upload the exact same agreement again", async function () {
  await uploadAgreementFixture(this, this.agreementVersionOneBytes, 200);
});

Then(
  "Pactwire reports that the existing immutable version was reused",
  async function () {
    const notice = this.page.getByTestId("agreement-notice");
    await notice.getByText("Existing version reused", { exact: true }).waitFor();
    await notice
      .getByText(
        "These exact bytes already exist, so Pactwire reused the existing immutable version.",
        { exact: true },
      )
      .waitFor();
    assert.equal(
      await this.page.getByTestId("agreement-version-list").locator("button[data-testid^='agreement-version-']").count(),
      1,
    );
  },
);

When("I upload a one-byte-changed agreement", async function () {
  this.agreementVersionTwoBytes = agreementBytes(true);
  this.agreementVersionTwoHash = sha256(this.agreementVersionTwoBytes);
  await uploadAgreementFixture(this, this.agreementVersionTwoBytes, 201);
  await this.page.getByTestId("agreement-version-2").waitFor();
});

Then("agreement version 2 has a different source hash", async function () {
  assert.notEqual(this.agreementVersionTwoHash, this.agreementVersionOneHash);
  assert.equal(
    await this.page.getByTestId("agreement-source-hash-2").innerText(),
    this.agreementVersionTwoHash,
  );
});

Then(
  "agreement version 1 still has its original source hash and pages",
  async function () {
    await this.page.getByTestId("agreement-version-1").click();
    assert.equal(
      await this.page.getByTestId("agreement-source-hash-1").innerText(),
      this.agreementVersionOneHash,
    );
    await this.page
      .getByTestId("agreement-page-1")
      .getByText(agreementFixture.pageOne, { exact: true })
      .waitFor();
    await this.page
      .getByTestId("agreement-page-2")
      .getByText(agreementFixture.pageTwo, { exact: true })
      .waitFor();
  },
);

When("I try to upload a malformed fictional PDF", async function () {
  await uploadAgreementFixture(
    this,
    Buffer.from("%PDF-1.7\nnot a complete fictional document", "utf8"),
    422,
    { name: "malformed-fictional.pdf", mimeType: "application/pdf" },
  );
});

Then("the agreement upload is blocked as an invalid PDF", async function () {
  const notice = this.page.getByTestId("agreement-notice");
  await notice.getByText("Invalid PDF blocked", { exact: true }).waitFor();
  await notice
    .getByText(
      "Pactwire could not read this agreement. Check the file and try again.",
      { exact: true },
    )
    .waitFor();
});

Then("no agreement version is stored", async function () {
  await this.page
    .getByTestId("agreement-version-list")
    .getByText("No agreement version stored.", { exact: true })
    .waitFor();
  assert.equal(
    await this.page
      .getByTestId("agreement-version-list")
      .locator("button[data-testid^='agreement-version-']")
      .count(),
    0,
  );
});

async function captureAgreementEvidence(world, name, narrow) {
  if (narrow) await world.page.setViewportSize({ width: 390, height: 844 });
  const panel = world.page.getByTestId("agreement-panel");
  await panel.scrollIntoViewIfNeeded();
  const capture = async (root) => {
    await panel.screenshot({ path: path.join(root, `${name}.png`) });
  };
  await capture(
    path.join(
      process.cwd(),
      "artifacts",
      "verification",
      "AGR-01",
      "screenshots",
    ),
  );
  if (shouldCaptureCurated("AGR-01")) {
    await capture(path.join(process.cwd(), "docs", "evidence", "AGR-01"));
  }
  if (narrow) await world.page.setViewportSize({ width: 1440, height: 1100 });
}

Then(
  "I capture the {string} agreement evidence",
  async function (evidenceName) {
    await captureAgreementEvidence(this, evidenceName, false);
  },
);

Then(
  "I capture the {string} narrow agreement evidence",
  async function (evidenceName) {
    await captureAgreementEvidence(this, evidenceName, true);
  },
);

When("I upload the fictional model-refusal agreement", async function () {
  this.expectProposalRefusal = true;
  this.agreementVersionOneBytes = agreementBytes();
  await uploadAgreementFixture(this, this.agreementVersionOneBytes, 201, {
    name: "model-refusal-Northstar-DPA-fictional.txt",
    mimeType: "text/plain",
  });
  await this.page.getByTestId("agreement-current-version").waitFor();
});

When("I request structured requirement proposals", async function () {
  const responsePromise = this.page.waitForResponse((response) => {
    const request = response.request();
    return (
      request.method() === "POST" &&
      new URL(response.url()).pathname.endsWith("/proposals")
    );
  });
  await this.page.getByTestId("generate-requirement-proposals").click();
  const response = await responsePromise;
  assert.equal(response.status(), this.expectProposalRefusal ? 422 : 201);
  this.requirementProposalResponse = JSON.parse(await response.text());
});

Then(
  "a proposal shows the exact purpose quote on page {int}",
  async function (pageNumber) {
    const proposal = this.page.getByTestId("requirement-proposal").first();
    await proposal.waitFor();
    assert.equal(
      (await proposal.getByTestId("proposal-source-quote").innerText()).includes(
        "Purpose: classroom instruction only.",
      ),
      true,
    );
    await proposal
      .getByText(`Page ${pageNumber} · offsets`, { exact: false })
      .waitFor();
    assert.equal(
      this.requirementProposalResponse.proposals[0].citation.page,
      pageNumber,
    );
  },
);

Then(
  "the proposal includes every observable restriction and suggested test",
  async function () {
    const proposal = this.page
      .getByTestId("requirement-proposal")
      .first()
      .getByTestId("proposal-structured-fields");
    for (const value of [
      "Fictional student account and classroom activity data",
      "Collect and use",
      "District-authorized service providers only",
      "Classroom instruction only",
      "No ambiguity identified",
      "Submit a unique fictional classroom value and record every request carrying it.",
    ]) {
      await proposal.getByText(value, { exact: true }).waitFor();
    }
  },
);

Then(
  "the proposal is clearly non-executable until a person reviews it",
  async function () {
    const panel = this.page.getByTestId("requirement-proposal-panel");
    await panel.getByText("Non-executable draft", { exact: true }).waitFor();
    await panel
      .getByText("Draft only — not an agreement rule", { exact: true })
      .waitFor();
    await panel
      .getByText(
        "A proposal cannot run a test, create a finding, or change software approval. A person must review it in the next stage.",
        { exact: true },
      )
      .waitFor();
    assert.equal(this.requirementProposalResponse.proposals[0].executable, false);
  },
);

Then("the proposal run identifies its adapter and cost record", async function () {
  const run = this.page.getByTestId("proposal-run");
  await run
    .getByText("Fixture replay — not a live GPT-5.6 result", { exact: true })
    .waitFor();
  assert.equal(await run.getByTestId("proposal-cost").innerText(), "$0.000000");
  assert.equal(
    this.requirementProposalResponse.run.provider,
    "DETERMINISTIC_FIXTURE",
  );
});

Then(
  "the model refusal is shown as a non-executable intake error",
  async function () {
    const notice = this.page.getByTestId("proposal-notice");
    await notice
      .getByText("Model did not return a proposal", { exact: true })
      .waitFor();
    await notice
      .getByText(
        "The model declined to propose requirements. No proposal was created.",
        { exact: true },
      )
      .waitFor();
    await this.page
      .getByTestId("proposal-run")
      .getByText("No proposal accepted", { exact: true })
      .waitFor();
  },
);

Then("no requirement proposal is stored", async function () {
  assert.equal(
    await this.page.getByTestId("requirement-proposal").count(),
    0,
  );
  await this.page
    .getByTestId("requirement-proposal-list")
    .getByText("No requirement proposal was stored from this run.", {
      exact: false,
    })
    .waitFor();
  assert.deepEqual(this.requirementProposalResponse.proposals, []);
});

Then("manual agreement review remains available", async function () {
  await this.page.getByTestId("agreement-source-viewer").waitFor();
  await this.page.getByTestId("download-agreement-source").waitFor();
  await this.page
    .getByText("The stored source remains available for manual review.", {
      exact: false,
    })
    .waitFor();
});

async function captureProposalEvidence(world, name, narrow) {
  if (narrow) await world.page.setViewportSize({ width: 390, height: 844 });
  const panel = world.page.getByTestId("requirement-proposal-panel");
  await panel.scrollIntoViewIfNeeded();
  const capture = async (root) => {
    await panel.screenshot({ path: path.join(root, `${name}.png`) });
  };
  await capture(
    path.join(
      process.cwd(),
      "artifacts",
      "verification",
      "AGR-02",
      "screenshots",
    ),
  );
  if (shouldCaptureCurated("AGR-02")) {
    await capture(path.join(process.cwd(), "docs", "evidence", "AGR-02"));
  }
  if (narrow) await world.page.setViewportSize({ width: 1440, height: 1100 });
}

Then(
  "I capture the {string} proposal evidence",
  async function (evidenceName) {
    await captureProposalEvidence(this, evidenceName, false);
  },
);

Then(
  "I capture the {string} narrow proposal evidence",
  async function (evidenceName) {
    await captureProposalEvidence(this, evidenceName, true);
  },
);

When("I edit the proposed action to {string}", async function (action) {
  const editor = this.page.getByTestId("requirement-review-editor").first();
  await editor.waitFor();
  await editor.getByTestId("review-action").fill(action);
});

async function submitRequirementReview(world, buttonTestId, rationale) {
  const editor = world.page.getByTestId("requirement-review-editor").first();
  await editor.getByTestId("review-rationale").fill(rationale);
  const responsePromise = world.page.waitForResponse((response) => {
    const request = response.request();
    return (
      request.method() === "POST" &&
      new URL(response.url()).pathname.endsWith("/requirements")
    );
  });
  await editor.getByTestId(buttonTestId).click();
  const response = await responsePromise;
  assert.equal(response.status(), 201);
  world.requirementReviewResponse = JSON.parse(await response.text());
  await world.page.getByTestId("current-requirement").waitFor();
}

When(
  "I confirm the requirement with rationale {string}",
  async function (rationale) {
    await submitRequirementReview(this, "confirm-requirement", rationale);
  },
);

Then(
  "requirement version {int} is executable and human-confirmed",
  async function (versionNumber) {
    const current = this.page.getByTestId("current-requirement");
    await current
      .getByText(`Current requirement · version ${versionNumber}`, {
        exact: true,
      })
      .waitFor();
    await current
      .getByText("Human-confirmed test rule", { exact: true })
      .waitFor();
    await current.getByText("Executable", { exact: true }).waitFor();
    await current.getByText("Transmit", { exact: true }).waitFor();
    await current
      .getByText("Decided by fictional-officer-a", { exact: true })
      .waitFor();
    assert.equal(this.requirementReviewResponse.version, versionNumber);
    assert.equal(this.requirementReviewResponse.status, "CONFIRMED");
    assert.equal(this.requirementReviewResponse.executable, true);
    assert.equal(
      this.requirementReviewResponse.confirmedBy.actorId,
      "fictional-officer-a",
    );
  },
);

Then(
  "the exact source quote remains beside the confirmed rule",
  async function () {
    const current = this.page.getByTestId("current-requirement");
    const quote = await current.getByTestId("current-source-quote").innerText();
    assert.equal(quote.includes("Purpose: classroom instruction only."), true);
    await current.getByText("Exact stored source", { exact: true }).waitFor();
    assert.deepEqual(
      this.requirementReviewResponse.citation,
      this.requirementProposalResponse.proposals[0].citation,
    );
  },
);

Then(
  "version history preserves the non-executable proposal as version {int}",
  async function (versionNumber) {
    const history = this.page.getByTestId("requirement-version-history");
    const proposalVersion = history
      .locator('[data-testid="requirement-history-version"][data-requirement-status="PROPOSED"]');
    await proposalVersion.waitFor();
    await proposalVersion
      .getByText(`Version ${versionNumber}`, { exact: true })
      .waitFor();
    await proposalVersion
      .getByText("PROPOSED · Non-executable model draft", { exact: true })
      .waitFor();
    await proposalVersion
      .getByText("Source proposal preserved. It cannot run a test.", {
        exact: true,
      })
      .waitFor();
    assert.equal(
      this.requirementReviewResponse.sourceVersionId,
      this.requirementProposalResponse.proposals[0].id,
    );
  },
);

When(
  "I mark the requirement ambiguous with rationale {string}",
  async function (rationale) {
    await submitRequirementReview(this, "ambiguous-requirement", rationale);
  },
);

Then(
  "the current requirement is ambiguous and cannot run a test",
  async function () {
    const current = this.page.getByTestId("current-requirement");
    await current
      .getByText("Ambiguous — human clarification required", { exact: true })
      .waitFor();
    await current.getByText("Not executable", { exact: true }).waitFor();
    assert.equal(this.requirementReviewResponse.status, "AMBIGUOUS");
    assert.equal(this.requirementReviewResponse.executable, false);
    assert.equal("predicate" in this.requirementReviewResponse, false);
  },
);

When(
  "I reject the requirement with rationale {string}",
  async function (rationale) {
    await submitRequirementReview(this, "reject-requirement", rationale);
  },
);

Then(
  "the current requirement is rejected and cannot run a test",
  async function () {
    const current = this.page.getByTestId("current-requirement");
    await current.getByText("Rejected model draft", { exact: true }).waitFor();
    await current.getByText("Not executable", { exact: true }).waitFor();
    assert.equal(this.requirementReviewResponse.status, "REJECTED");
    assert.equal(this.requirementReviewResponse.executable, false);
    assert.equal("predicate" in this.requirementReviewResponse, false);
  },
);

Then(
  "version history preserves the rejected decision and original proposal",
  async function () {
    const history = this.page.getByTestId("requirement-version-history");
    const versions = history.getByTestId("requirement-history-version");
    assert.equal(await versions.count(), 2);
    await history
      .locator('[data-testid="requirement-history-version"][data-requirement-status="REJECTED"]')
      .getByText("REJECTED · Non-executable human decision", { exact: true })
      .waitFor();
    await history
      .locator('[data-testid="requirement-history-version"][data-requirement-status="PROPOSED"]')
      .getByText("PROPOSED · Non-executable model draft", { exact: true })
      .waitFor();
  },
);

async function captureRequirementEvidence(world, name, narrow, historyOnly) {
  if (narrow) await world.page.setViewportSize({ width: 390, height: 844 });
  const target = world.page.getByTestId(
    historyOnly ? "requirement-version-history" : "requirement-review-panel",
  );
  await target.scrollIntoViewIfNeeded();
  const capture = async (root) => {
    await target.screenshot({ path: path.join(root, `${name}.png`) });
  };
  await capture(
    path.join(
      process.cwd(),
      "artifacts",
      "verification",
      "AGR-03",
      "screenshots",
    ),
  );
  if (shouldCaptureCurated("AGR-03")) {
    await capture(path.join(process.cwd(), "docs", "evidence", "AGR-03"));
  }
  if (narrow) await world.page.setViewportSize({ width: 1440, height: 1100 });
}

Then(
  "I capture the {string} requirement-review evidence",
  async function (evidenceName) {
    await captureRequirementEvidence(this, evidenceName, false, false);
  },
);

Then(
  "I capture the {string} narrow requirement-review evidence",
  async function (evidenceName) {
    await captureRequirementEvidence(this, evidenceName, true, false);
  },
);

Then(
  "I capture the {string} requirement-history evidence",
  async function (evidenceName) {
    await captureRequirementEvidence(this, evidenceName, false, true);
  },
);

const destinationSchedule = Object.freeze({
  name: "fictional-destination-schedule.txt",
  text: [
    "Fictional Cedar Ridge destination schedule.",
    "classroom-service.pactwire.test is operated by Northstar Learning Systems (Fictional) and is an allowed instructional recipient.",
    "fixture-analytics.pactwire.test is operated by Signal Quarry Analytics (Fictional) and is a prohibited advertising recipient.",
  ].join("\n"),
});

When("I upload the fictional destination schedule", async function () {
  const bytes = Buffer.from(destinationSchedule.text, "utf8");
  this.destinationScheduleHash = sha256(bytes);
  await uploadAgreementFixture(this, bytes, 201, {
    name: destinationSchedule.name,
    mimeType: "text/plain",
  });
  await this.page.getByTestId("destination-refresh").click();
});

function destinationCard(world, hostname) {
  return world.page
    .getByTestId("destination-card")
    .filter({ has: world.page.getByRole("heading", { name: hostname, exact: true }) });
}

When("I record the observed destination {string}", async function (hostname) {
  this.currentDestinationHostname = hostname;
  const panel = this.page.getByTestId("destination-registry-panel");
  await panel.scrollIntoViewIfNeeded();
  await this.page.getByTestId("destination-refresh").click();
  const observationHash = sha256(
    Buffer.from(`deterministic-recorder:${hostname}`, "utf8"),
  );
  await this.page.getByTestId("destination-hostname").fill(hostname);
  await this.page
    .getByTestId("destination-observation-hash")
    .fill(observationHash);
  await this.page
    .getByTestId("destination-observation-locator")
    .fill(`run://fictional-det-01/observation/${hostname}`);
  const responsePromise = this.page.waitForResponse((response) => {
    const request = response.request();
    return (
      request.method() === "POST" &&
      /\/api\/workspaces\/[^/]+\/destinations$/u.test(
        new URL(response.url()).pathname,
      )
    );
  });
  await this.page.getByTestId("observe-destination").click();
  const response = await responsePromise;
  assert.equal(response.status(), 201);
  this.currentDestination = JSON.parse(await response.text());
  await destinationCard(this, hostname).waitFor();
});

Then(
  "the destination remains {string} until a person reviews it",
  async function (status) {
    assert.equal(status, "UNKNOWN");
    const card = destinationCard(this, this.currentDestinationHostname);
    await card.getByTestId("destination-status").getByText(status, { exact: true }).waitFor();
    await card
      .getByText(
        "No company or agreement status assigned. A person has not confirmed the entity mapping.",
        { exact: true },
      )
      .waitFor();
    assert.equal(this.currentDestination.ownership.status, "UNKNOWN");
    assert.deepEqual(this.currentDestination.classifications, []);
  },
);

Then(
  "no company or agreement status is inferred for the destination",
  async function () {
    const card = destinationCard(this, this.currentDestinationHostname);
    assert.equal(await card.getByText(/Human-confirmed by/u).count(), 0);
    assert.equal(await card.getByText(/Exact agreement version:/u).count(), 0);
    assert.deepEqual(this.currentDestination.classifications, []);
  },
);

When(
  "I confirm {string} as entity {string} with status {string}",
  async function (hostname, entityName, status) {
    assert.ok(["ALLOWED", "PROHIBITED"].includes(status));
    const card = destinationCard(this, hostname);
    await card.getByTestId("select-destination").click();
    const agreementSelect = this.page.getByTestId("destination-agreement-select");
    const scheduleOption = agreementSelect
      .locator("option")
      .filter({ hasText: destinationSchedule.name });
    await scheduleOption.waitFor({ state: "attached" });
    const agreementVersionId = await scheduleOption.getAttribute("value");
    assert.ok(agreementVersionId, "An exact agreement version is selected");
    await agreementSelect.selectOption(agreementVersionId);
    this.selectedDestinationAgreementVersionId = agreementVersionId;
    const entityId = entityName
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/gu, "-")
      .replaceAll(/^-|-$/gu, "");
    const relation = `${hostname} is operated by ${entityName}`;
    const agreementQuote =
      status === "ALLOWED"
        ? `${relation} and is an allowed instructional recipient.`
        : `${relation} and is a prohibited advertising recipient.`;
    const fields = [
      ["destination-entity-id", entityId],
      ["destination-entity-name", entityName],
      ["destination-mapping-title", destinationSchedule.name],
      [
        "destination-mapping-locator",
        `agreement://${agreementVersionId}/page/1`,
      ],
      ["destination-mapping-hash", this.destinationScheduleHash],
      ["destination-mapping-excerpt", relation],
      ["destination-agreement-quote", agreementQuote],
      [
        "destination-review-rationale",
        "I checked the exact hostname, fictional company, and recipient rule in the selected stored agreement version.",
      ],
    ];
    for (const [testId, value] of fields) {
      await this.page.getByTestId(testId).fill(value);
    }
    await this.page.getByTestId("destination-classification").selectOption(status);
    await this.page.getByTestId("destination-mapping-kind").selectOption("SIGNED_AGREEMENT");
    const responsePromise = this.page.waitForResponse((response) => {
      const request = response.request();
      return (
        request.method() === "POST" &&
        /\/api\/workspaces\/[^/]+\/destinations\/[^/]+\/review$/u.test(
          new URL(response.url()).pathname,
        )
      );
    });
    await this.page.getByTestId("confirm-destination").click();
    const response = await responsePromise;
    assert.equal(response.status(), 201);
    this.currentDestination = JSON.parse(await response.text());
    this.currentDestinationHostname = hostname;
  },
);

Then(
  "the destination shows human-confirmed status {string} for the selected agreement",
  async function (status) {
    const card = destinationCard(this, this.currentDestinationHostname);
    await card.getByTestId("destination-status").getByText(status, { exact: true }).waitFor();
    await card
      .getByText("Human-confirmed by fictional-officer-a", { exact: true })
      .waitFor();
    await card
      .getByText(
        `Exact agreement version: ${this.selectedDestinationAgreementVersionId}`,
        { exact: true },
      )
      .waitFor();
    assert.equal(this.currentDestination.ownership.status, "CONFIRMED");
    assert.equal(this.currentDestination.classifications.at(-1).status, status);
  },
);

async function captureDestinationEvidence(world, name, narrow) {
  if (narrow) await world.page.setViewportSize({ width: 390, height: 844 });
  const target = destinationCard(world, world.currentDestinationHostname);
  await target.scrollIntoViewIfNeeded();
  const capture = async (root) => {
    await target.screenshot({ path: path.join(root, `${name}.png`) });
  };
  await capture(
    path.join(
      process.cwd(),
      "artifacts",
      "verification",
      "DET-01",
      "screenshots",
    ),
  );
  if (shouldCaptureCurated("DET-01")) {
    await capture(path.join(process.cwd(), "docs", "evidence", "DET-01"));
  }
  if (narrow) await world.page.setViewportSize({ width: 1440, height: 1100 });
}

Then(
  "I capture the {string} destination-registry evidence",
  async function (evidenceName) {
    await captureDestinationEvidence(this, evidenceName, false);
  },
);

Then(
  "I capture the {string} narrow destination-registry evidence",
  async function (evidenceName) {
    await captureDestinationEvidence(this, evidenceName, true);
  },
);

When("I refresh the named journey prerequisites", async function () {
  const historyResponsePromise = this.page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      response.request().method() === "GET" &&
      /\/api\/workspaces\/[^/]+\/software\/[^/]+\/journeys$/u.test(
        url.pathname,
      )
    );
  });
  await this.page.getByTestId("refresh-journey-prerequisites").click();
  const historyResponse = await historyResponsePromise;
  assert.equal(historyResponse.status(), 200);
  this.journeyHistoryUrl = historyResponse.url();
  await this.page.getByTestId("journey-prerequisites-ready").waitFor();
});

When("I choose the {string} named journey", async function (role) {
  const option = role.toUpperCase();
  assert.ok(["TEACHER", "STUDENT"].includes(option), `Unknown role: ${role}`);
  await this.page.getByTestId("journey-role-select").selectOption(option);
  assert.equal(
    await this.page.getByTestId("journey-role-select").inputValue(),
    option,
  );
  await this.page
    .getByTestId("current-journey")
    .getByText(`${role} journey`, { exact: true })
    .waitFor();
});

async function saveNamedJourney(world) {
  const responsePromise = world.page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      response.request().method() === "POST" &&
      /\/api\/workspaces\/[^/]+\/software\/[^/]+\/journeys$/u.test(
        url.pathname,
      )
    );
  });
  await world.page.getByTestId("save-journey").click();
  const response = await responsePromise;
  assert.equal(response.status(), 201);
  world.savedJourney = JSON.parse(await response.text()).journey;
  await world.page
    .getByTestId("current-journey")
    .getByText(`Version ${world.savedJourney.version.version}`, { exact: true })
    .waitFor();
}

When("I save the named journey", async function () {
  await saveNamedJourney(this);
});

When("I save a new named journey version", async function () {
  await saveNamedJourney(this);
});

Then(
  "the current named journey is runnable as version {int}",
  async function (version) {
    assert.equal(this.savedJourney.readiness.status, "RUNNABLE");
    assert.equal(this.savedJourney.version.version, version);
    const current = this.page.getByTestId("current-journey");
    await current.getByText("RUNNABLE", { exact: true }).waitFor();
    await current.getByText(`Version ${version}`, { exact: true }).waitFor();
  },
);

Then(
  "its causal chain shows the confirmed rule, fictional field, and required checkpoint",
  async function () {
    assert.ok(this.savedJourney.causalLinks.length > 0);
    const chain = this.page.getByTestId("journey-causal-chain");
    for (const link of this.savedJourney.causalLinks) {
      assert.ok(link.requirementText, "The saved link includes confirmed rule text");
      await chain
        .getByText(link.requirementText, { exact: true })
        .first()
        .waitFor();
      await chain
        .getByText(`Fictional field · ${link.sourceField}`, { exact: true })
        .waitFor();
      for (const checkpointId of link.checkpointIds) {
        await chain.getByText(checkpointId, { exact: true }).first().waitFor();
      }
    }
    await chain.getByText("Required visibility", { exact: true }).first().waitFor();
  },
);

When("I change the named journey goal to {string}", async function (goal) {
  await this.page.getByTestId("journey-goal").fill(goal);
});

Then(
  "named journey history preserves versions {int} and {int}",
  async function (newest, original) {
    const versions = await this.page
      .getByTestId("journey-version-history")
      .locator("[data-journey-version]")
      .evaluateAll((records) =>
        records.map((record) => Number(record.getAttribute("data-journey-version"))),
      );
    assert.deepEqual(versions, [newest, original]);
  },
);

Then(
  "the editor says no successful run or repair has been recorded yet",
  async function () {
    const future = this.page.getByTestId("journey-future-state");
    await future
      .getByText("No successful run recorded yet.", { exact: true })
      .waitFor();
    await future
      .getByText("No repair history recorded yet.", { exact: true })
      .waitFor();
  },
);

async function captureJourneyEvidence(world, name, narrow) {
  if (narrow) await world.page.setViewportSize({ width: 390, height: 844 });
  const panel = world.page.getByTestId("journey-authoring-panel");
  await panel.scrollIntoViewIfNeeded();
  const capture = async (root) => {
    await panel.screenshot({ path: path.join(root, `${name}.png`) });
  };
  await capture(
    path.join(
      process.cwd(),
      "artifacts",
      "verification",
      "JRN-02",
      "screenshots",
    ),
  );
  if (shouldCaptureCurated("JRN-02")) {
    await capture(path.join(process.cwd(), "docs", "evidence", "JRN-02"));
  }
  if (narrow) await world.page.setViewportSize({ width: 1440, height: 1100 });
}

Then(
  "I capture the {string} journey-editor evidence",
  async function (evidenceName) {
    await captureJourneyEvidence(this, evidenceName, false);
  },
);

Then(
  "I capture the {string} narrow journey-editor evidence",
  async function (evidenceName) {
    await captureJourneyEvidence(this, evidenceName, true);
  },
);

When("I turn off required checkpoint visibility", async function () {
  await this.page.getByTestId("journey-required-visibility").uncheck();
});

When("I try to save the named journey", async function () {
  const button = this.page.getByTestId("save-journey");
  assert.equal(await button.isDisabled(), true);
  this.blockedJourneyPostObserved = false;
  const listener = (request) => {
    if (
      request.method() === "POST" &&
      new URL(request.url()).pathname.endsWith("/journeys")
    ) {
      this.blockedJourneyPostObserved = true;
    }
  };
  this.page.on("request", listener);
  await button.evaluate((element) => element.click());
  await this.page.waitForTimeout(150);
  this.page.off("request", listener);
});

Then(
  "the journey editor blocks saving until required visibility is restored",
  async function () {
    assert.equal(this.blockedJourneyPostObserved, false);
    const notice = this.page.getByTestId("journey-blocked-notice");
    await notice
      .getByText("Required visibility is missing", { exact: true })
      .waitFor();
    await notice
      .getByText(
        "A runnable journey must say what evidence has to be visible. Restore this checkpoint before saving.",
        { exact: true },
      )
      .waitFor();
  },
);

Then("no named journey version is stored", async function () {
  assert.ok(this.journeyHistoryUrl, "The journey history URL was captured");
  const result = await this.page.evaluate(async (url) => {
    const response = await fetch(url, {
      cache: "no-store",
      credentials: "same-origin",
    });
    return { status: response.status, body: await response.json() };
  }, this.journeyHistoryUrl);
  assert.equal(result.status, 200);
  const history = result.body;
  assert.equal(history.versions.length, 0);
  assert.equal(history.current.length, 0);
  assert.equal(
    await this.page
      .getByTestId("journey-version-history")
      .locator("[data-journey-version]")
      .count(),
    0,
  );
});
