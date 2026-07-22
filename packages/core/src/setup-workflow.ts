import { z } from "zod";

const uuid = z.string().uuid();
const nonEmpty = z.string().trim().min(1);
const timestamp = z.iso.datetime({ offset: true });

const approvalStateSchema = z.enum([
  "UNKNOWN",
  "APPROVED",
  "HOLD",
  "REJECTED",
  "RETIRED",
]);

const approvalSetterSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("HUMAN"),
      actorId: nonEmpty,
      displayName: nonEmpty,
    })
    .strict(),
  z
    .object({
      kind: z.literal("IMPORTED_SYSTEM"),
      actorId: nonEmpty,
      displayName: nonEmpty,
    })
    .strict(),
]);

const setupWorkflowInputSchema = z
  .object({
    software: z
      .object({
        id: uuid,
        workspaceId: uuid,
        name: nonEmpty,
        approvalState: approvalStateSchema,
        approvalOrigin: z
          .object({
            state: approvalStateSchema,
            setBy: approvalSetterSchema,
            reason: nonEmpty,
            sourceReference: nonEmpty.optional(),
            recordedAt: timestamp,
          })
          .strict(),
      })
      .strict()
      .superRefine((software, context) => {
        if (software.approvalState !== software.approvalOrigin.state) {
          context.addIssue({
            code: "custom",
            path: ["approvalOrigin", "state"],
            message: "Displayed status must match its stored approval origin",
          });
        }
      }),
    authorizations: z.array(
      z
        .object({
          id: uuid,
          version: z.number().int().positive().optional(),
          effectiveStatus: z.enum([
            "ACTIVE",
            "NOT_YET_VALID",
            "REVIEW_DUE",
            "EXPIRED",
            "REVOKED",
          ]),
          reviewAt: timestamp,
          expiresAt: timestamp,
        })
        .strict(),
    ),
    agreements: z.array(
      z
        .object({
          id: uuid,
          version: z.number().int().positive(),
        })
        .strict(),
    ),
    currentRequirements: z.array(
      z
        .object({
          agreementVersionId: uuid,
          status: z.enum(["PROPOSED", "CONFIRMED", "REJECTED", "AMBIGUOUS"]),
          executable: z.boolean(),
        })
        .strict(),
    ),
    personas: z.array(
      z
        .object({
          role: z.enum(["TEACHER", "STUDENT"]),
          fieldCount: z.number().int().nonnegative(),
        })
        .strict(),
    ),
    currentJourneys: z.array(
      z
        .object({
          agreementVersionId: uuid,
          readinessStatus: z.enum(["RUNNABLE", "BLOCKED"]),
          requiredCheckpointCount: z.number().int().nonnegative(),
          requiredVisibleCheckpointCount: z.number().int().nonnegative(),
        })
        .strict(),
    ),
    // This is accepted only so tests can prove model prose has no authority over
    // a district status or deterministic readiness result.
    untrustedModelSummary: z.string().optional(),
  })
  .strict();

export type SetupStepId =
  | "software"
  | "authorization"
  | "agreement"
  | "requirements"
  | "test-data"
  | "journey";

export type SetupStepStatus = "COMPLETE" | "ACTION_REQUIRED" | "BLOCKED";

export interface SetupStepView {
  readonly id: SetupStepId;
  readonly number: number;
  readonly label: string;
  readonly description: string;
  readonly status: SetupStepStatus;
  readonly detail: string;
  readonly blocker?: string;
  readonly targetId: string;
}

export interface SetupWorkflowView {
  readonly software: { readonly id: string; readonly name: string };
  readonly configuration: {
    readonly agreementVersion: number | null;
    readonly authorizationReviewAt: string | null;
  };
  readonly statusProvenance: {
    readonly state: z.infer<typeof approvalStateSchema>;
    readonly label: string;
    readonly sourceLabel: string;
    readonly sourceReference?: string;
    readonly reason: string;
    readonly recordedAt: string;
    readonly isPactwireConclusion: false;
  };
  readonly steps: readonly SetupStepView[];
  readonly completedStepCount: number;
  readonly currentStepId: SetupStepId | null;
  readonly runReady: boolean;
  readonly nextAction: { readonly code: string; readonly label: string };
}

export class SetupSoftwareUnavailableError extends Error {
  readonly code = "SOFTWARE_UNAVAILABLE";
  readonly status = 404;
  readonly publicMessage = "Software not found or not available.";

  constructor() {
    super("The requested software is outside the readable setup boundary");
    this.name = "SetupSoftwareUnavailableError";
  }
}

interface StepDefinition {
  readonly id: SetupStepId;
  readonly label: string;
  readonly description: string;
  readonly targetId: string;
  readonly complete: boolean;
  readonly completeDetail: string;
  readonly actionDetail: string;
  readonly actionBlocker?: string;
  readonly actionCode: string;
  readonly actionLabel: string;
}

const approvalLabels = Object.freeze({
  UNKNOWN: "Unknown",
  APPROVED: "Approved",
  HOLD: "Hold",
  REJECTED: "Rejected",
  RETIRED: "Retired",
} satisfies Readonly<Record<z.infer<typeof approvalStateSchema>, string>>);

function immutableClone<T>(value: T): T {
  const clone = structuredClone(value);
  const freeze = (candidate: unknown): void => {
    if (
      typeof candidate !== "object" ||
      candidate === null ||
      Object.isFrozen(candidate)
    ) {
      return;
    }
    for (const nested of Object.values(candidate)) freeze(nested);
    Object.freeze(candidate);
  };
  freeze(clone);
  return clone;
}

function authorizationBlocker(
  status:
    | "ACTIVE"
    | "NOT_YET_VALID"
    | "REVIEW_DUE"
    | "EXPIRED"
    | "REVOKED"
    | undefined,
): string {
  switch (status) {
    case "EXPIRED":
      return "The latest authorization is expired. Record current authority before continuing.";
    case "REVOKED":
      return "The latest authorization was revoked. Record new authority before continuing.";
    case "NOT_YET_VALID":
      return "The latest authorization is not valid yet. Record a current testing window before continuing.";
    case "REVIEW_DUE":
      return "The latest authorization needs human review before testing can continue.";
    default:
      return "No current authorization exists. Confirm the allowed tenant, actions, and testing window.";
  }
}

export function deriveSetupWorkflow(candidate: unknown): SetupWorkflowView {
  const input = setupWorkflowInputSchema.parse(candidate);
  const latestAuthorization = [...input.authorizations].sort(
    (left, right) => (right.version ?? 0) - (left.version ?? 0),
  )[0];
  const latestAgreement = [...input.agreements].sort(
    (left, right) => right.version - left.version,
  )[0];
  const executableRequirements = latestAgreement
    ? input.currentRequirements.filter(
        (requirement) =>
          requirement.agreementVersionId === latestAgreement.id &&
          requirement.status === "CONFIRMED" &&
          requirement.executable,
      )
    : [];
  const usablePersonas = input.personas.filter(
    (persona) => persona.fieldCount > 0,
  );
  const runnableJourneys = latestAgreement
    ? input.currentJourneys.filter(
        (journey) =>
          journey.agreementVersionId === latestAgreement.id &&
          journey.readinessStatus === "RUNNABLE" &&
          journey.requiredCheckpointCount > 0 &&
          journey.requiredVisibleCheckpointCount ===
            journey.requiredCheckpointCount,
      )
    : [];

  const definitions: readonly StepDefinition[] = [
    {
      id: "software",
      label: "Software and district status",
      description: "Name the exact school software tenant and preserve who set its district status.",
      targetId: "inventory",
      complete: true,
      completeDetail: `${input.software.name} is recorded with source provenance.`,
      actionDetail: "Record the software and original district-status source.",
      actionCode: "RECORD_SOFTWARE",
      actionLabel: "Record software and district status",
    },
    {
      id: "authorization",
      label: "Authorization and allowed scope",
      description: "Confirm the exact tenant, dates, domains, and actions the district permits Pactwire to test.",
      targetId: "authorization",
      complete: latestAuthorization?.effectiveStatus === "ACTIVE",
      completeDetail: "Current human-attested test authority is active.",
      actionDetail: authorizationBlocker(latestAuthorization?.effectiveStatus),
      actionBlocker: authorizationBlocker(latestAuthorization?.effectiveStatus),
      actionCode: "DEFINE_AUTHORIZATION",
      actionLabel: "Define test authorization and scope",
    },
    {
      id: "agreement",
      label: "Agreement upload",
      description: "Store the district agreement as an immutable source version.",
      targetId: "agreements",
      complete: Boolean(latestAgreement),
      completeDetail: latestAgreement
        ? `Agreement version ${latestAgreement.version} is stored.`
        : "Agreement source is stored.",
      actionDetail: "No agreement source has been uploaded for this software.",
      actionCode: "UPLOAD_AGREEMENT",
      actionLabel: "Upload the district agreement",
    },
    {
      id: "requirements",
      label: "Requirement confirmation",
      description: "A person checks model proposals against cited agreement text before any rule can execute.",
      targetId: "requirement-review",
      complete: executableRequirements.length > 0,
      completeDetail: `${executableRequirements.length} executable requirement${executableRequirements.length === 1 ? "" : "s"} confirmed by a person.`,
      actionDetail: "No executable agreement requirement has been confirmed by a person.",
      actionCode: "CONFIRM_REQUIREMENTS",
      actionLabel: "Review and confirm a requirement",
    },
    {
      id: "test-data",
      label: "Fictional accounts and test fields",
      description: "Create visibly fictional users with reserved addresses and the fields needed by the named journey.",
      targetId: "synthetic-data",
      complete: usablePersonas.length > 0,
      completeDetail: `${usablePersonas.length} fictional account${usablePersonas.length === 1 ? "" : "s"} with test fields ${usablePersonas.length === 1 ? "is" : "are"} ready.`,
      actionDetail: "No fictional account with a test field is ready.",
      actionCode: "CONFIGURE_TEST_DATA",
      actionLabel: "Create fictional accounts and fields",
    },
    {
      id: "journey",
      label: "Journeys and required visibility",
      description: "Connect a confirmed rule, fictional field, allowed action, and required checkpoint into one named test.",
      targetId: "journeys",
      complete: runnableJourneys.length > 0,
      completeDetail: `${runnableJourneys.length} named journey${runnableJourneys.length === 1 ? " is" : "s are"} runnable with required visible checkpoints.`,
      actionDetail:
        input.currentJourneys.length > 0
          ? "The current journey is blocked by a missing or stale prerequisite."
          : "No runnable named journey has been configured.",
      actionCode: "CONFIGURE_JOURNEYS",
      actionLabel: "Configure a named journey and checkpoints",
    },
  ];

  const firstIncompleteIndex = definitions.findIndex(
    (definition) => !definition.complete,
  );
  const steps = definitions.map((definition, index): SetupStepView => {
    if (definition.complete && (firstIncompleteIndex < 0 || index < firstIncompleteIndex)) {
      return {
        id: definition.id,
        number: index + 1,
        label: definition.label,
        description: definition.description,
        status: "COMPLETE",
        detail: definition.completeDetail,
        targetId: definition.targetId,
      };
    }
    if (index === firstIncompleteIndex) {
      return {
        id: definition.id,
        number: index + 1,
        label: definition.label,
        description: definition.description,
        status: "ACTION_REQUIRED",
        detail: definition.actionDetail,
        ...(definition.actionBlocker
          ? { blocker: definition.actionBlocker }
          : {}),
        targetId: definition.targetId,
      };
    }
    const prerequisite = definitions[firstIncompleteIndex];
    return {
      id: definition.id,
      number: index + 1,
      label: definition.label,
      description: definition.description,
      status: "BLOCKED",
      detail: definition.complete
        ? "This record exists, but the earlier setup prerequisite still needs attention."
        : definition.actionDetail,
      blocker: `Complete ${prerequisite?.label ?? "the prior step"} first.`,
      targetId: definition.targetId,
    };
  });

  const runReady = firstIncompleteIndex < 0;
  const nextDefinition = runReady ? undefined : definitions[firstIncompleteIndex];
  const source = input.software.approvalOrigin;
  return immutableClone({
    software: { id: input.software.id, name: input.software.name },
    configuration: {
      agreementVersion: latestAgreement?.version ?? null,
      authorizationReviewAt: latestAuthorization?.reviewAt ?? null,
    },
    statusProvenance: {
      state: source.state,
      label: approvalLabels[source.state],
      sourceLabel:
        source.setBy.kind === "IMPORTED_SYSTEM"
          ? `Imported from ${source.setBy.displayName}`
          : `Set by ${source.setBy.displayName}`,
      ...(source.sourceReference
        ? { sourceReference: source.sourceReference }
        : {}),
      reason: source.reason,
      recordedAt: source.recordedAt,
      isPactwireConclusion: false,
    },
    steps,
    completedStepCount: steps.filter((step) => step.status === "COMPLETE").length,
    currentStepId: runReady ? null : (nextDefinition?.id ?? null),
    runReady,
    nextAction: runReady
      ? {
          code: "READY_FOR_NAMED_RUN",
          label: "Queue a named fictional-data test",
        }
      : {
          code: nextDefinition?.actionCode ?? "REVIEW_SETUP",
          label: nextDefinition?.actionLabel ?? "Review setup prerequisites",
        },
  });
}
