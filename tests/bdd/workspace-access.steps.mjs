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
    this.browser = await chromium.launch();
    this.context = await this.browser.newContext({
      baseURL: baseUrl,
      viewport: { width: 1440, height: 1100 },
    });
    this.page = await this.context.newPage();
    this.context.on("page", (openedPage) => {
      if (openedPage !== this.page) this.unexpectedPopupCount += 1;
    });
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
        : pickle.tags.some((tag) => tag.name === "@AUT-03")
          ? "AUT-03"
          : pickle.tags.some((tag) => tag.name === "@AUT-04")
            ? "AUT-04"
            : pickle.tags.some((tag) => tag.name === "@JRN-01")
              ? "JRN-01"
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
    const proposal = this.page.getByTestId("requirement-proposal").first();
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
