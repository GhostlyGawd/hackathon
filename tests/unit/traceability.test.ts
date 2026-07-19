import { describe, expect, it } from "vitest";
import {
  checkFixedDecisionContract,
  checkRequirementTraceability,
} from "../../packages/evidence/src/traceability";

describe("requirement traceability", () => {
  it("reports FR-001 when the implementation plan leaves it orphaned", () => {
    const issues = checkRequirementTraceability(
      "| Requirement | Priority |\n| --- | --- |\n| FR-001 | P0 |",
      "| Requirement | Owner task |\n| --- | --- |",
    );

    expect(issues).toContainEqual(
      expect.objectContaining({
        code: "ORPHAN_PRD_REQUIREMENT",
        subject: "FR-001",
      }),
    );
  });

  it("rejects an owner task that is absent from the task index", () => {
    const issues = checkRequirementTraceability(
      "| Requirement | Priority |\n| --- | --- |\n| FR-001 | P0 |",
      "| Requirement | Owner task |\n| --- | --- |\n| FR-001 | AUT-99 | proof |",
    );

    expect(issues).toContainEqual(
      expect.objectContaining({
        code: "UNKNOWN_TASK_OWNER",
        subject: "FR-001",
      }),
    );
  });

  it("accepts a requirement with a real indexed owner", () => {
    const issues = checkRequirementTraceability(
      "| Requirement | Priority |\n| --- | --- |\n| FR-001 | P0 |",
      [
        "| Task | Priority | Depends on | Output | Status |",
        "| --- | --- | --- | --- | --- |",
        "| AUT-01 | P0 | — | Roles | NOT STARTED |",
        "| Requirement | Owner task | Primary proof |",
        "| --- | --- | --- |",
        "| FR-001 | AUT-01 | access tests |",
      ].join("\n"),
    );

    expect(issues).toEqual([]);
  });

  it("detects drift in the fixed product decisions", () => {
    const prd = [
      "## 23. Fixed decisions",
      "",
      "- Pactwire never automatically creates approval.",
      "",
      "## 24. Open implementation decisions",
    ].join("\n");

    expect(
      checkFixedDecisionContract(prd, {
        decisions: ["Pactwire may automatically create approval."],
      }),
    ).toContainEqual(
      expect.objectContaining({ code: "FIXED_DECISION_DRIFT" }),
    );
    expect(
      checkFixedDecisionContract(prd, {
        decisions: ["Pactwire never automatically creates approval."],
      }),
    ).toEqual([]);
  });
});
