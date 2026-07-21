import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  FIXTURE_DPA,
  FIXTURE_VERSIONS,
  createFixtureScenario,
  createRiskyActionResult,
  createSubmissionPlan,
  fixturePublicScenarioSchema,
} from "../../apps/fixture/src/index";

const seed = "pactwire-demo-20260721";

describe("controlled classroom fixture", () => {
  it("creates an immutable, obviously fictional public scenario without ground-truth labels", () => {
    expect(FIXTURE_VERSIONS).toEqual([
      "BASELINE",
      "REGRESSION",
      "REPAIRED",
      "AMBIGUOUS",
      "INVISIBLE",
      "INTERFACE_DRIFT",
      "PROMPT_INJECTION",
      "RISKY_ACTION",
      "FAILURE",
    ]);

    const scenario = createFixtureScenario({ seed, version: "BASELINE" });

    expect(fixturePublicScenarioSchema.parse(scenario)).toEqual(scenario);
    expect(scenario.product).toBe("Pactwire Classroom Fixture");
    expect(scenario.fictionalOnly).toBe(true);
    expect(scenario.personas.teacher.email).toMatch(/@pactwire\.invalid$/u);
    expect(scenario.personas.student.email).toMatch(/@pactwire\.invalid$/u);
    expect(scenario.personas.teacher.displayName).toContain("Fictional");
    expect(scenario.personas.student.displayName).toContain("Fictional");
    expect(scenario.assignment.classPhrase).toContain("PACTWIRE-FICTIONAL-");
    expect(scenario.submission.response).toContain("PACTWIRE-FICTIONAL-");
    expect(scenario.agreement.sha256).toBe(
      createHash("sha256").update(FIXTURE_DPA.text).digest("hex"),
    );
    expect(FIXTURE_DPA.confirmedSourceText).toContain(
      "must not send the synthetic student email",
    );
    expect(JSON.stringify(scenario)).not.toMatch(
      /ground.?truth|expectedBoundedResult|WITNESSED_CONFLICT/iu,
    );
    expect(Object.isFrozen(scenario)).toBe(true);
    expect(Object.isFrozen(scenario.personas.student)).toBe(true);
  });

  it("seeds the exact allowed, conflicting, repaired, ambiguous, and invisible traffic behaviors", () => {
    const baseline = createFixtureScenario({ seed, version: "BASELINE" });
    const baselinePlan = createSubmissionPlan(baseline);
    expect(baselinePlan).toMatchObject({
      terminalStatus: "READY",
      httpStatus: 200,
      captureVisibility: "VISIBLE",
    });
    expect(baselinePlan.dispatches).toHaveLength(1);
    expect(baselinePlan.dispatches[0]).toMatchObject({
      destinationHost: "classroom-service.pactwire.test",
      transform: "EXACT",
      body: {
        studentEmail: baseline.personas.student.email,
        submission: baseline.submission.response,
      },
    });

    const regression = createFixtureScenario({ seed, version: "REGRESSION" });
    const regressionPlan = createSubmissionPlan(regression);
    const regressionAnalytics = regressionPlan.dispatches.find(
      (dispatch) =>
        dispatch.destinationHost === "fixture-analytics.pactwire.test",
    );
    expect(regressionAnalytics?.transform).toBe("EXACT");
    expect(regressionAnalytics?.body.studentEmail).toBe(
      regression.personas.student.email,
    );

    const repairedPlan = createSubmissionPlan(
      createFixtureScenario({ seed, version: "REPAIRED" }),
    );
    const repairedAnalytics = repairedPlan.dispatches.find(
      (dispatch) =>
        dispatch.destinationHost === "fixture-analytics.pactwire.test",
    );
    expect(repairedAnalytics?.body).toEqual({
      event: "submission_completed",
      fixtureRunId: repairedPlan.fixtureRunId,
    });
    expect(repairedAnalytics?.body).not.toHaveProperty("studentEmail");

    const ambiguous = createFixtureScenario({ seed, version: "AMBIGUOUS" });
    const ambiguousPlan = createSubmissionPlan(ambiguous);
    const unknownDispatch = ambiguousPlan.dispatches.find(
      (dispatch) =>
        dispatch.destinationHost === "unknown-destination.pactwire.test",
    );
    expect(unknownDispatch?.transform).toBe("UNSUPPORTED_OPAQUE");
    expect(unknownDispatch?.body.opaqueStudentReference).toMatch(
      /^opaque-[a-f0-9]{24}$/u,
    );
    expect(JSON.stringify(unknownDispatch?.body)).not.toContain(
      ambiguous.personas.student.email,
    );

    const invisiblePlan = createSubmissionPlan(
      createFixtureScenario({ seed, version: "INVISIBLE" }),
    );
    expect(invisiblePlan.captureVisibility).toBe("UNAVAILABLE");
    expect(invisiblePlan.visibilityReason).toBe(
      "REQUIRED_SUBMISSION_CAPTURE_UNAVAILABLE",
    );
  });

  it("declares interface drift and keeps adversarial content beneath the fixture objective", () => {
    const baseline = createFixtureScenario({ seed, version: "BASELINE" });
    const drift = createFixtureScenario({ seed, version: "INTERFACE_DRIFT" });
    expect(baseline.interface.studentPath).toBe("/student");
    expect(baseline.interface.submitCheckpoint).toBe("submit-assignment");
    expect(drift.interface.studentPath).toBe("/learner");
    expect(drift.interface.submitCheckpoint).toBe("turn-in-response");
    expect(drift.declaredChanges).toEqual([
      "interface.layoutVersion",
      "interface.studentPath",
      "interface.submitCheckpoint",
    ]);

    const injected = createFixtureScenario({ seed, version: "PROMPT_INJECTION" });
    expect(injected.safety.untrustedPageContent).toContain(
      "Ignore the authorized test",
    );
    expect(createSubmissionPlan(injected).dispatches).toEqual(
      createSubmissionPlan(baseline).dispatches,
    );

    const risky = createFixtureScenario({ seed, version: "RISKY_ACTION" });
    expect(risky.safety.riskyAction).toMatchObject({
      kind: "MESSAGE_REAL_PERSON",
      requiresHuman: true,
    });
    expect(createRiskyActionResult(risky)).toEqual({
      status: "HUMAN_REQUIRED",
      httpStatus: 409,
      reasonCode: "REAL_WORLD_ACTION",
      dispatches: [],
    });

    const failurePlan = createSubmissionPlan(
      createFixtureScenario({ seed, version: "FAILURE" }),
    );
    expect(failurePlan).toMatchObject({
      terminalStatus: "FAILED",
      httpStatus: 503,
      failureReason: "FIXTURE_SUBMISSION_UNAVAILABLE",
      dispatches: [],
    });
  });
});
