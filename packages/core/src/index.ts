export const productIdentity = Object.freeze({
  name: "Pactwire",
  truthBoundary:
    "A named test can witness a conflict; it cannot prove safety or compliance.",
});

export * from "./domain.js";
export * from "./authorization.js";
export * from "./inventory.js";
export * from "./agreement-intake.js";
export * from "./approval-authority.js";
export * from "./requirement-proposals.js";
export * from "./requirement-review.js";
export * from "./test-authorization.js";
export * from "./secret-isolation.js";
export * from "./setup-workflow.js";
export * from "./synthetic-data.js";
export * from "./journey-authoring.js";
export * from "./deterministic-replay.js";
export * from "./run-orchestration.js";
export * from "./journey-repair.js";
export * from "./evidence.js";
export * from "./migrations.js";
export * from "./canary-matcher.js";
export * from "./destination-registry.js";
export * from "./finding-evaluation.js";
export * from "./evidence-receipt.js";
export * from "./quality-observability.js";
export * from "./security-governance.js";
export * from "./mechanism-validation.js";
