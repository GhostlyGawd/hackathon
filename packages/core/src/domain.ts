import { z } from "zod";

const uuid = z.string().uuid();
const timestamp = z.string().datetime({ offset: true });
const sha256 = z.string().regex(/^[a-f0-9]{64}$/u);
const nonEmpty = z.string().trim().min(1);

function hasDuplicates(values: readonly string[]): boolean {
  return new Set(values).size !== values.length;
}

function hasOverlap(left: readonly string[], right: readonly string[]): boolean {
  const rightValues = new Set(right);
  return left.some((value) => rightValues.has(value));
}

export const approvalStateSchema = z.enum([
  "UNKNOWN",
  "APPROVED",
  "HOLD",
  "REJECTED",
  "RETIRED",
]);
export type ApprovalState = z.infer<typeof approvalStateSchema>;

export const approvalReasonSchema = z.enum([
  "WITNESSED_CONFLICT",
  "REQUIRED_VISIBILITY_LOSS",
  "HUMAN_DECISION",
  "IMPORTED_DECISION",
  "HUMAN_HOLD",
  "HUMAN_REJECTION",
  "HUMAN_RETIREMENT",
]);
export type ApprovalReason = z.infer<typeof approvalReasonSchema>;

type ApprovalActorKind =
  | "HUMAN"
  | "IMPORTED_SYSTEM"
  | "AUTOMATION"
  | "MODEL";

interface ApprovalTransitionRule {
  readonly actorKind: ApprovalActorKind;
  readonly from: readonly ApprovalState[];
  readonly to: ApprovalState;
  readonly reasons: readonly ApprovalReason[];
}

const nonRetiredApprovalStates: readonly ApprovalState[] = Object.freeze([
  "UNKNOWN",
  "APPROVED",
  "HOLD",
  "REJECTED",
]);

export const approvalTransitionTable: readonly ApprovalTransitionRule[] =
  immutableClone<readonly ApprovalTransitionRule[]>([
    {
      actorKind: "AUTOMATION",
      from: ["APPROVED"],
      to: "HOLD",
      reasons: ["WITNESSED_CONFLICT", "REQUIRED_VISIBILITY_LOSS"],
    },
    {
      actorKind: "HUMAN",
      from: nonRetiredApprovalStates,
      to: "UNKNOWN",
      reasons: ["HUMAN_DECISION"],
    },
    {
      actorKind: "HUMAN",
      from: nonRetiredApprovalStates,
      to: "APPROVED",
      reasons: ["HUMAN_DECISION"],
    },
    {
      actorKind: "HUMAN",
      from: nonRetiredApprovalStates,
      to: "HOLD",
      reasons: ["HUMAN_HOLD"],
    },
    {
      actorKind: "HUMAN",
      from: nonRetiredApprovalStates,
      to: "REJECTED",
      reasons: ["HUMAN_REJECTION"],
    },
    {
      actorKind: "HUMAN",
      from: nonRetiredApprovalStates,
      to: "RETIRED",
      reasons: ["HUMAN_RETIREMENT"],
    },
    ...(["UNKNOWN", "APPROVED", "HOLD", "REJECTED"] as const).map(
      (to): ApprovalTransitionRule => ({
        actorKind: "IMPORTED_SYSTEM",
        from: nonRetiredApprovalStates,
        to,
        reasons: ["IMPORTED_DECISION"],
      }),
    ),
  ]);

function expectedApprovalTransition(event: {
  readonly actorKind: ApprovalActorKind;
  readonly from: ApprovalState;
  readonly to: ApprovalState;
  readonly reason: ApprovalReason;
}): boolean {
  return approvalTransitionTable.some(
    (rule) =>
      rule.actorKind === event.actorKind &&
      rule.from.includes(event.from) &&
      rule.to === event.to &&
      rule.reasons.includes(event.reason),
  );
}

export const runStateSchema = z.enum([
  "QUEUED",
  "RUNNING",
  "COMPLETED",
  "PARTIAL",
  "FAILED",
  "CANCELED",
]);
export type RunState = z.infer<typeof runStateSchema>;

export const runEventTypeSchema = z.enum([
  "RETRY_QUEUED",
  "RUN_STARTED",
  "RUN_COMPLETED",
  "RUN_PARTIAL",
  "RUN_FAILED",
  "RUN_CANCELED",
]);
export type RunEventType = z.infer<typeof runEventTypeSchema>;

const terminalRunStates = new Set<RunState>([
  "COMPLETED",
  "PARTIAL",
  "FAILED",
  "CANCELED",
]);

interface RunTransitionRule {
  readonly eventType: RunEventType;
  readonly from: readonly RunState[];
  readonly to: RunState;
}

export const runTransitionTable: readonly RunTransitionRule[] = immutableClone([
  { eventType: "RUN_STARTED", from: ["QUEUED"], to: "RUNNING" },
  { eventType: "RUN_COMPLETED", from: ["RUNNING"], to: "COMPLETED" },
  { eventType: "RUN_PARTIAL", from: ["RUNNING"], to: "PARTIAL" },
  { eventType: "RUN_FAILED", from: ["RUNNING"], to: "FAILED" },
  {
    eventType: "RUN_CANCELED",
    from: ["QUEUED", "RUNNING"],
    to: "CANCELED",
  },
  {
    eventType: "RETRY_QUEUED",
    from: ["COMPLETED", "PARTIAL", "FAILED", "CANCELED"],
    to: "QUEUED",
  },
]);

function expectedRunTransition(event: {
  readonly eventType: RunEventType;
  readonly from: RunState;
  readonly to: RunState;
}): boolean {
  return runTransitionTable.some(
    (rule) =>
      rule.eventType === event.eventType &&
      rule.from.includes(event.from) &&
      rule.to === event.to,
  );
}

export const findingStateSchema = z.enum([
  "WITNESSED_CONFLICT",
  "NO_CONFLICT_OBSERVED_IN_NAMED_TESTS",
  "NOT_REOBSERVED_IN_NAMED_TESTS",
  "NOT_TESTED",
  "NOT_VISIBLE",
  "NEEDS_REVIEW",
]);
export type FindingState = z.infer<typeof findingStateSchema>;

const actorBase = z.object({ actorId: nonEmpty });
export const humanActorSchema = actorBase
  .extend({ kind: z.literal("HUMAN") })
  .strict();
export const importedSystemActorSchema = actorBase
  .extend({ kind: z.literal("IMPORTED_SYSTEM"), source: nonEmpty })
  .strict();
export const automationActorSchema = actorBase
  .extend({ kind: z.literal("AUTOMATION"), component: nonEmpty })
  .strict();
export const modelActorSchema = actorBase
  .extend({ kind: z.literal("MODEL"), model: nonEmpty })
  .strict();
export const actorSchema = z.discriminatedUnion("kind", [
  humanActorSchema,
  importedSystemActorSchema,
  automationActorSchema,
  modelActorSchema,
]);
export type Actor = z.infer<typeof actorSchema>;
export type HumanActor = z.infer<typeof humanActorSchema>;

export const humanApprovalSetterSchema = humanActorSchema
  .extend({ displayName: nonEmpty })
  .strict();
export const importedApprovalSetterSchema = importedSystemActorSchema
  .extend({ displayName: nonEmpty })
  .strict();
export const automatedApprovalSetterSchema = automationActorSchema
  .extend({ displayName: nonEmpty })
  .strict();
export const approvalSetterSchema = z.discriminatedUnion("kind", [
  humanApprovalSetterSchema,
  importedApprovalSetterSchema,
  automatedApprovalSetterSchema,
]);
export type ApprovalSetter = z.infer<typeof approvalSetterSchema>;

export const workspaceSchema = z
  .object({
    id: uuid,
    name: nonEmpty,
    createdAt: timestamp,
    createdBy: z.union([humanActorSchema, importedSystemActorSchema]),
  })
  .strict();
export type Workspace = z.infer<typeof workspaceSchema>;

export const workspaceRoleSchema = z.enum([
  "PRIVACY_OFFICER",
  "TEST_OPERATOR",
  "REVIEWER",
  "APPLICATION_APPROVER",
  "SECURITY_REVIEWER",
]);
export type WorkspaceRole = z.infer<typeof workspaceRoleSchema>;

export const userRoleSchema = z
  .object({
    id: uuid,
    workspaceId: uuid,
    userId: nonEmpty,
    role: workspaceRoleSchema,
    assignedAt: timestamp,
    assignedBy: humanActorSchema,
  })
  .strict();
export type UserRole = z.infer<typeof userRoleSchema>;

export const approvalOriginSchema = z
  .object({
    id: uuid,
    workspaceId: uuid,
    softwareId: uuid,
    state: approvalStateSchema,
    setBy: approvalSetterSchema,
    reason: nonEmpty,
    sourceReference: nonEmpty.optional(),
    recordedBy: z.union([humanActorSchema, automationActorSchema]),
    recordedAt: timestamp,
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.setBy.kind === "IMPORTED_SYSTEM" &&
      (value.state === "HOLD" || value.state === "RETIRED")
    ) {
      context.addIssue({
        code: "custom",
        path: ["setBy"],
        message: `${value.state} must identify the human who set it`,
      });
    }
    if (
      value.setBy.kind === "AUTOMATION" &&
      (value.state !== "HOLD" ||
        !["WITNESSED_CONFLICT", "REQUIRED_VISIBILITY_LOSS"].includes(
          value.reason,
        ) ||
        !value.sourceReference ||
        value.recordedBy.kind !== "AUTOMATION")
    ) {
      context.addIssue({
        code: "custom",
        path: ["setBy"],
        message:
          "Automation may only record a receipt-linked deterministic HOLD",
      });
    }
    if (
      value.setBy.kind !== "AUTOMATION" &&
      value.recordedBy.kind !== "HUMAN"
    ) {
      context.addIssue({
        code: "custom",
        path: ["recordedBy"],
        message: "Human or imported approval provenance must be human-recorded",
      });
    }
  });
export type ApprovalOrigin = z.infer<typeof approvalOriginSchema>;

export const authorizedTenantUrlSchema = z
  .url()
  .superRefine((value, context) => {
    const url = new URL(value);
    if (url.protocol !== "https:") {
      context.addIssue({
        code: "custom",
        message: "Authorized tenant URLs must use HTTPS",
      });
    }
    if (url.username || url.password) {
      context.addIssue({
        code: "custom",
        message: "Authorized tenant URLs cannot contain credentials",
      });
    }
  });

export const softwareRecordSchema = z
  .object({
    id: uuid,
    workspaceId: uuid,
    name: nonEmpty,
    vendorName: nonEmpty,
    authorizedTenantUrl: authorizedTenantUrlSchema,
    districtOwner: nonEmpty,
    knownVersion: nonEmpty.optional(),
    approvalState: approvalStateSchema,
    approvalOrigin: approvalOriginSchema,
    createdAt: timestamp,
    createdBy: humanActorSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.approvalState !== value.approvalOrigin.state) {
      context.addIssue({
        code: "custom",
        path: ["approvalOrigin", "state"],
        message: "Approval origin state must match the current state",
      });
    }
    if (
      value.workspaceId !== value.approvalOrigin.workspaceId ||
      value.id !== value.approvalOrigin.softwareId
    ) {
      context.addIssue({
        code: "custom",
        path: ["approvalOrigin"],
        message: "Approval origin must belong to the same software record",
      });
    }
  });
export type SoftwareRecord = z.infer<typeof softwareRecordSchema>;

export const authorizationActionSchema = z.enum([
  "NAVIGATE",
  "SUBMIT",
  "DOWNLOAD",
  "UPLOAD",
  "MESSAGE",
  "PURCHASE",
  "DELETE",
  "ADMINISTER",
]);
export type AuthorizationAction = z.infer<typeof authorizationActionSchema>;

export const authorizationAttestationSchema = z
  .object({
    authorityConfirmed: z.literal(true),
    syntheticAccountsOnlyConfirmed: z.literal(true),
    statement: nonEmpty,
  })
  .strict();

const authorizedDomainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u,
    "Authorization domains must be exact hostnames without wildcards",
  );

export const authorizationSchema = z
  .object({
    id: uuid,
    workspaceId: uuid,
    softwareId: uuid,
    version: z.number().int().positive(),
    status: z.enum(["ACTIVE", "EXPIRED", "REVOKED"]),
    validFrom: timestamp,
    reviewAt: timestamp,
    expiresAt: timestamp,
    authorityBasis: nonEmpty,
    allowedBaseUrl: authorizedTenantUrlSchema,
    allowedDomains: z.array(authorizedDomainSchema).min(1),
    allowedActions: z.array(authorizationActionSchema).min(1),
    prohibitedActions: z.array(authorizationActionSchema).min(1),
    redirectPolicy: z.literal("ALLOW_LISTED_ONLY"),
    popupPolicy: z.enum(["BLOCK_ALL", "ALLOW_LISTED_ONLY"]),
    attestation: authorizationAttestationSchema,
    attestedBy: humanActorSchema,
    attestedAt: timestamp,
  })
  .strict()
  .superRefine((value, context) => {
    if (Date.parse(value.expiresAt) <= Date.parse(value.validFrom)) {
      context.addIssue({
        code: "custom",
        path: ["expiresAt"],
        message: "expiresAt must be after validFrom",
      });
    }
    if (
      Date.parse(value.reviewAt) <= Date.parse(value.validFrom) ||
      Date.parse(value.reviewAt) > Date.parse(value.expiresAt)
    ) {
      context.addIssue({
        code: "custom",
        path: ["reviewAt"],
        message: "reviewAt must be after validFrom and no later than expiresAt",
      });
    }
    const base = new URL(value.allowedBaseUrl);
    if (!value.allowedDomains.includes(base.hostname.toLowerCase())) {
      context.addIssue({
        code: "custom",
        path: ["allowedDomains"],
        message: "The authorized base URL hostname must be explicitly allowed",
      });
    }
    if (
      hasDuplicates(value.allowedDomains) ||
      hasDuplicates(value.allowedActions) ||
      hasDuplicates(value.prohibitedActions)
    ) {
      context.addIssue({
        code: "custom",
        message: "Authorization scope entries must be unique",
      });
    }
    if (hasOverlap(value.allowedActions, value.prohibitedActions)) {
      context.addIssue({
        code: "custom",
        message: "An authorization action cannot be both allowed and prohibited",
      });
    }
  });

export const agreementPageMapEntrySchema = z
  .object({
    pageNumber: z.number().int().positive(),
    startOffset: z.number().int().nonnegative(),
    endOffset: z.number().int().nonnegative(),
    text: z.string().max(2_000_000),
    textSha256: sha256,
  })
  .strict()
  .refine((value) => value.endOffset - value.startOffset === value.text.length, {
    message: "Agreement page offsets must span the stored page text",
  });

const agreementDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);

export const agreementVersionSchema = z
  .object({
    id: uuid,
    workspaceId: uuid,
    softwareId: uuid,
    version: z.number().int().positive(),
    sourceObjectKey: z
      .string()
      .regex(/^agreements\/sha256\/[a-f0-9]{64}\.(?:pdf|txt)$/u),
    sourceSha256: sha256,
    sourceMimeType: z.enum(["application/pdf", "text/plain"]),
    sourceFileName: z
      .string()
      .trim()
      .min(1)
      .max(255)
      .refine((value) => !/[\\/]/u.test(value), {
        message: "Agreement file name must not contain a path",
      }),
    sourceByteLength: z.number().int().positive().max(10 * 1024 * 1024),
    effectiveFrom: agreementDate.optional(),
    effectiveUntil: agreementDate.optional(),
    normalizedText: z.string().min(1).max(2_000_000),
    pageMap: z.array(agreementPageMapEntrySchema).min(1).max(500),
    createdAt: timestamp,
    createdBy: humanActorSchema,
  })
  .strict()
  .superRefine((value, context) => {
    const expectedExtension =
      value.sourceMimeType === "application/pdf" ? "pdf" : "txt";
    if (!value.sourceObjectKey.endsWith(`${value.sourceSha256}.${expectedExtension}`)) {
      context.addIssue({
        code: "custom",
        path: ["sourceObjectKey"],
        message: "Agreement object key must be derived from its source hash",
      });
    }
    if (
      value.effectiveFrom &&
      value.effectiveUntil &&
      value.effectiveUntil < value.effectiveFrom
    ) {
      context.addIssue({
        code: "custom",
        path: ["effectiveUntil"],
        message: "Agreement end date cannot precede its start date",
      });
    }
    value.pageMap.forEach((page, index) => {
      if (page.pageNumber !== index + 1) {
        context.addIssue({
          code: "custom",
          path: ["pageMap", index, "pageNumber"],
          message: "Agreement pages must be sequential",
        });
      }
      if (
        value.normalizedText.slice(page.startOffset, page.endOffset) !== page.text
      ) {
        context.addIssue({
          code: "custom",
          path: ["pageMap", index],
          message: "Agreement page map must resolve into normalized source text",
        });
      }
    });
  });
export type AgreementVersion = z.infer<typeof agreementVersionSchema>;

export const agreementCitationSchema = z
  .object({
    page: z.number().int().positive().optional(),
    startOffset: z.number().int().nonnegative(),
    endOffset: z.number().int().positive(),
    quotedTextSha256: sha256,
  })
  .strict()
  .refine((value) => value.endOffset > value.startOffset, {
    path: ["endOffset"],
    message: "endOffset must be greater than startOffset",
  });
export type AgreementCitation = z.infer<typeof agreementCitationSchema>;

export const requirementProposalDetailsSchema = z
  .object({
    plainLanguage: nonEmpty.max(2_000),
    sourceText: z.string().min(1).max(20_000),
    pageNumber: z.number().int().positive().nullable(),
    section: nonEmpty.max(500).nullable(),
    dataField: nonEmpty.max(1_000),
    action: nonEmpty.max(1_000),
    recipientRestriction: nonEmpty.max(2_000),
    purposeRestriction: nonEmpty.max(2_000).nullable(),
    ambiguity: z.enum(["CLEAR", "AMBIGUOUS"]),
    ambiguityReason: nonEmpty.max(2_000).nullable(),
    suggestedObservableTest: nonEmpty.max(4_000),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.pageNumber === null && value.section === null) {
      context.addIssue({
        code: "custom",
        path: ["pageNumber"],
        message: "A proposal citation needs a page number or section",
      });
    }
    if (value.ambiguity === "AMBIGUOUS" && value.ambiguityReason === null) {
      context.addIssue({
        code: "custom",
        path: ["ambiguityReason"],
        message: "An ambiguous proposal needs a reason",
      });
    }
    if (value.ambiguity === "CLEAR" && value.ambiguityReason !== null) {
      context.addIssue({
        code: "custom",
        path: ["ambiguityReason"],
        message: "A clear proposal cannot carry an ambiguity reason",
      });
    }
  });
export type RequirementProposalDetails = z.infer<
  typeof requirementProposalDetailsSchema
>;

export const proposedRequirementSchema = z
  .object({
    id: uuid,
    workspaceId: uuid,
    agreementVersionId: uuid,
    requirementKey: nonEmpty,
    version: z.number().int().positive(),
    modelRunId: uuid,
    status: z.literal("PROPOSED"),
    executable: z.literal(false),
    plainLanguage: nonEmpty,
    details: requirementProposalDetailsSchema,
    citation: agreementCitationSchema,
    proposedBy: actorSchema,
    createdAt: timestamp,
  })
  .strict();
export type ProposedRequirementVersion = z.infer<
  typeof proposedRequirementSchema
>;

export const requirementChangeSchema = z
  .object({
    field: nonEmpty.max(500),
    oldValue: z.string().max(50_000),
    newValue: z.string().max(50_000),
  })
  .strict();
export type RequirementChange = z.infer<typeof requirementChangeSchema>;

export const observableDataFlowPredicateSchema = z
  .object({
    kind: z.literal("OBSERVABLE_DATA_FLOW"),
    dataField: nonEmpty.max(1_000),
    action: nonEmpty.max(1_000),
    recipientRestriction: nonEmpty.max(2_000),
    purposeRestriction: nonEmpty.max(2_000).nullable(),
    suggestedObservableTest: nonEmpty.max(4_000),
  })
  .strict();
export type ObservableDataFlowPredicate = z.infer<
  typeof observableDataFlowPredicateSchema
>;

export const confirmedRequirementSchema = z
  .object({
    id: uuid,
    workspaceId: uuid,
    agreementVersionId: uuid,
    requirementKey: nonEmpty,
    version: z.number().int().positive(),
    sourceVersionId: uuid,
    status: z.literal("CONFIRMED"),
    executable: z.boolean(),
    plainLanguage: nonEmpty,
    details: requirementProposalDetailsSchema,
    citation: agreementCitationSchema,
    predicate: observableDataFlowPredicateSchema.optional(),
    confirmedBy: humanActorSchema,
    confirmedAt: timestamp,
    reviewRationale: nonEmpty.max(4_000),
    changes: z.array(requirementChangeSchema).min(1).max(100),
    createdAt: timestamp,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.executable && !value.predicate) {
      context.addIssue({
        code: "custom",
        path: ["predicate"],
        message: "Executable confirmed requirements need a deterministic predicate",
      });
    }
    if (!value.executable && value.predicate) {
      context.addIssue({
        code: "custom",
        path: ["predicate"],
        message: "Non-executable requirements cannot carry a predicate",
      });
    }
    if (value.executable && value.details.ambiguity === "AMBIGUOUS") {
      context.addIssue({
        code: "custom",
        path: ["details", "ambiguity"],
        message: "Ambiguous details cannot become an executable rule",
      });
    }
  });
export type ConfirmedRequirementVersion = z.infer<
  typeof confirmedRequirementSchema
>;

export const reviewedRequirementSchema = z
  .object({
    id: uuid,
    workspaceId: uuid,
    agreementVersionId: uuid,
    requirementKey: nonEmpty,
    version: z.number().int().positive(),
    sourceVersionId: uuid,
    status: z.enum(["REJECTED", "AMBIGUOUS"]),
    executable: z.literal(false),
    plainLanguage: nonEmpty,
    details: requirementProposalDetailsSchema,
    citation: agreementCitationSchema,
    reviewedBy: humanActorSchema,
    reviewedAt: timestamp,
    reviewRationale: nonEmpty.max(4_000),
    changes: z.array(requirementChangeSchema).min(1).max(100),
    createdAt: timestamp,
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.status === "AMBIGUOUS" &&
      (value.details.ambiguity !== "AMBIGUOUS" ||
        value.details.ambiguityReason !== value.reviewRationale)
    ) {
      context.addIssue({
        code: "custom",
        path: ["details", "ambiguity"],
        message: "Ambiguous reviews must preserve their human rationale",
      });
    }
  });
export type ReviewedRequirementVersion = z.infer<
  typeof reviewedRequirementSchema
>;

export const requirementVersionSchema = z.union([
  proposedRequirementSchema,
  confirmedRequirementSchema,
  reviewedRequirementSchema,
]);
export type RequirementVersion = z.infer<typeof requirementVersionSchema>;

export const destinationRecordSchema = z
  .object({
    id: uuid,
    workspaceId: uuid,
    hostname: nonEmpty,
    ownership: z.enum(["UNKNOWN", "CONFIRMED"]),
    entityName: nonEmpty.optional(),
    classification: z.enum(["ALLOWED", "PROHIBITED", "UNREVIEWED"]),
    confirmedBy: humanActorSchema.optional(),
    confirmedAt: timestamp.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const hasConfirmation = Boolean(
      value.entityName && value.confirmedBy && value.confirmedAt,
    );
    if (value.ownership === "CONFIRMED" && !hasConfirmation) {
      context.addIssue({
        code: "custom",
        message: "Confirmed ownership requires entity, actor, and time",
      });
    }
    if (
      value.ownership === "UNKNOWN" &&
      (value.entityName || value.confirmedBy || value.confirmedAt)
    ) {
      context.addIssue({
        code: "custom",
        message: "Unknown ownership cannot carry confirmation metadata",
      });
    }
    if (
      value.ownership === "UNKNOWN" &&
      value.classification !== "UNREVIEWED"
    ) {
      context.addIssue({
        code: "custom",
        path: ["classification"],
        message: "Unknown ownership must remain unreviewed",
      });
    }
  });

export const fictionalConfirmationSchema = z
  .object({
    statementVersion: z.literal("fictional-only-v1"),
    confirmedAt: timestamp,
    confirmedBy: humanActorSchema,
  })
  .strict();

export const clearPersonaScanResultSchema = z
  .object({
    scannerVersion: z.literal("likely-real-v1"),
    outcome: z.literal("CLEAR"),
    findings: z.array(z.never()).max(0),
  })
  .strict();

const personaFieldKey = z
  .string()
  .trim()
  .regex(/^[a-z][A-Za-z0-9]{0,63}$/u);
const personaFieldValue = z.string().trim().min(1).max(240);

export const personaSchema = z
  .object({
    id: uuid,
    workspaceId: uuid,
    role: z.enum(["TEACHER", "STUDENT"]),
    fictional: z.literal(true),
    displayName: nonEmpty.refine((value) => /fictional/iu.test(value), {
      message: "Synthetic persona names must be visibly marked fictional",
    }),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email()
      .refine((value) => value.endsWith(".invalid"), {
        message: "Synthetic persona email must use the reserved .invalid domain",
      }),
    fields: z
      .record(personaFieldKey, personaFieldValue)
      .refine((value) => Object.keys(value).length <= 12, {
        message: "Synthetic personas support at most twelve custom fields",
      }),
    fictionalConfirmation: fictionalConfirmationSchema,
    scanResult: clearPersonaScanResultSchema,
    createdAt: timestamp,
    createdBy: humanActorSchema,
  })
  .strict();
export type Persona = z.infer<typeof personaSchema>;

export const journeyTestFieldSchema = z
  .object({
    fieldId: nonEmpty,
    sourceField: nonEmpty,
    requirementVersionId: uuid,
  })
  .strict();

export const journeyCheckpointSchema = z
  .object({
    checkpointId: nonEmpty,
    required: z.boolean(),
    description: nonEmpty,
    observationSource: z.enum([
      "NETWORK",
      "SCREENSHOT",
      "BROWSER_STORAGE",
      "ACTION",
    ]),
    requiredVisibility: z.boolean(),
    requirementVersionIds: z.array(uuid),
    testFieldIds: z.array(nonEmpty),
  })
  .strict();

export const journeyStepSchema = z
  .object({
    stepId: nonEmpty,
    instruction: nonEmpty,
    action: authorizationActionSchema,
  })
  .strict();

export const journeyVersionSchema = z
  .object({
    id: uuid,
    workspaceId: uuid,
    softwareId: uuid,
    agreementVersionId: uuid,
    journeyId: uuid,
    version: z.number().int().positive(),
    sourceVersionId: uuid.nullable(),
    name: nonEmpty,
    role: z.enum(["TEACHER", "STUDENT"]),
    goal: nonEmpty,
    startState: nonEmpty,
    requirementVersionIds: z.array(uuid).min(1),
    authorizationId: uuid,
    personaId: uuid,
    testFields: z.array(journeyTestFieldSchema).min(1),
    allowedActions: z.array(authorizationActionSchema).min(1),
    prohibitedActions: z.array(authorizationActionSchema),
    checkpoints: z.array(journeyCheckpointSchema).min(1),
    steps: z.array(journeyStepSchema).min(1),
    createdAt: timestamp,
    createdBy: humanActorSchema,
  })
  .strict()
  .refine((value) => value.checkpoints.some((checkpoint) => checkpoint.required), {
    path: ["checkpoints"],
    message: "A journey needs at least one required checkpoint",
  })
  .superRefine((value, context) => {
    if (
      (value.version === 1 && value.sourceVersionId !== null) ||
      (value.version > 1 && value.sourceVersionId === null)
    ) {
      context.addIssue({
        code: "custom",
        path: ["sourceVersionId"],
        message: "Journey version lineage must start at null and append to a source",
      });
    }
    if (
      hasDuplicates(value.requirementVersionIds) ||
      hasDuplicates(value.allowedActions) ||
      hasDuplicates(value.prohibitedActions) ||
      hasDuplicates(value.testFields.map((field) => field.fieldId)) ||
      hasDuplicates(value.testFields.map((field) => field.sourceField)) ||
      hasDuplicates(value.checkpoints.map((checkpoint) => checkpoint.checkpointId)) ||
      hasDuplicates(value.steps.map((step) => step.stepId))
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Journey requirements, actions, fields, checkpoints, and steps must be unique",
      });
    }
    if (hasOverlap(value.allowedActions, value.prohibitedActions)) {
      context.addIssue({
        code: "custom",
        message: "A journey action cannot be both allowed and prohibited",
      });
    }
    const requirementIds = new Set(value.requirementVersionIds);
    const fieldIds = new Set(value.testFields.map((field) => field.fieldId));
    const requiredRequirementIds = new Set<string>();
    const requiredFieldIds = new Set<string>();
    for (const field of value.testFields) {
      if (!requirementIds.has(field.requirementVersionId)) {
        context.addIssue({
          code: "custom",
          path: ["testFields"],
          message: "Every fictional field must link to a journey requirement",
        });
      }
    }
    for (const checkpoint of value.checkpoints) {
      if (
        hasDuplicates(checkpoint.requirementVersionIds) ||
        hasDuplicates(checkpoint.testFieldIds) ||
        checkpoint.requirementVersionIds.some((id) => !requirementIds.has(id)) ||
        checkpoint.testFieldIds.some((id) => !fieldIds.has(id))
      ) {
        context.addIssue({
          code: "custom",
          path: ["checkpoints"],
          message:
            "Checkpoint requirement and fictional-field links must be unique members of this journey",
        });
      }
      if (
        checkpoint.required &&
        (!checkpoint.requiredVisibility ||
          checkpoint.requirementVersionIds.length === 0 ||
          checkpoint.testFieldIds.length === 0)
      ) {
        context.addIssue({
          code: "custom",
          path: ["checkpoints"],
          message:
            "Every required checkpoint needs required visibility, a requirement, and a fictional field",
        });
      }
      if (checkpoint.required) {
        for (const id of checkpoint.requirementVersionIds) {
          requiredRequirementIds.add(id);
        }
        for (const id of checkpoint.testFieldIds) requiredFieldIds.add(id);
      }
    }
    if (
      value.requirementVersionIds.some((id) => !requiredRequirementIds.has(id)) ||
      value.testFields.some((field) => !requiredFieldIds.has(field.fieldId))
    ) {
      context.addIssue({
        code: "custom",
        path: ["checkpoints"],
        message:
          "Every journey requirement and fictional field needs a required checkpoint",
      });
    }
    if (value.steps.some((step) => !value.allowedActions.includes(step.action))) {
      context.addIssue({
        code: "custom",
        path: ["steps"],
        message: "Every deterministic step action must be allowed by the journey",
      });
    }
  });
export type JourneyVersion = z.infer<typeof journeyVersionSchema>;

export const runSnapshotSchema = z
  .object({
    agreementVersionId: uuid,
    journeyVersionId: uuid,
    authorizationId: uuid,
    runnerConfigVersion: nonEmpty,
    snapshotHash: sha256,
  })
  .strict();
export type RunSnapshot = z.infer<typeof runSnapshotSchema>;

const integrityFailureSchema = z
  .object({ code: nonEmpty, message: nonEmpty })
  .strict();

export const runEventSchema = z
  .object({
    eventId: uuid,
    eventType: runEventTypeSchema,
    workspaceId: uuid,
    runId: uuid,
    sourceRunId: uuid.optional(),
    from: runStateSchema,
    to: runStateSchema,
    actor: actorSchema,
    occurredAt: timestamp,
    manifestHash: sha256.optional(),
    integrityFailure: integrityFailureSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (!expectedRunTransition(value)) {
      context.addIssue({
        code: "custom",
        path: ["eventType"],
        message: "Run event type must match its state transition",
      });
    }
    if (value.actor.kind === "MODEL") {
      context.addIssue({
        code: "custom",
        path: ["actor"],
        message: "Model actors cannot transition run state",
      });
    }
    const hasManifest = Boolean(value.manifestHash);
    const hasIntegrityFailure = Boolean(value.integrityFailure);
    if ((value.eventType === "RETRY_QUEUED") !== Boolean(value.sourceRunId)) {
      context.addIssue({
        code: "custom",
        path: ["sourceRunId"],
        message: "Only retry events require a source run",
      });
    }
    if (
      ["RETRY_QUEUED", "RUN_STARTED"].includes(value.eventType) &&
      (hasManifest || hasIntegrityFailure)
    ) {
      context.addIssue({
        code: "custom",
        message: "Non-terminal run events cannot contain terminal evidence",
      });
    }
    if (
      value.eventType === "RUN_COMPLETED" &&
      (!hasManifest || hasIntegrityFailure)
    ) {
      context.addIssue({
        code: "custom",
        message: "RUN_COMPLETED requires a manifest and no integrity failure",
      });
    }
    if (
      ["RUN_PARTIAL", "RUN_FAILED", "RUN_CANCELED"].includes(value.eventType) &&
      Number(hasManifest) + Number(hasIntegrityFailure) !== 1
    ) {
      context.addIssue({
        code: "custom",
        message: "Terminal run event requires exactly one manifest or integrity failure",
      });
    }
  });
export type RunEvent = z.infer<typeof runEventSchema>;

export const runSchema = z
  .object({
    id: uuid,
    workspaceId: uuid,
    softwareId: uuid,
    state: runStateSchema,
    snapshot: runSnapshotSchema,
    retryOfRunId: uuid.optional(),
    events: z.array(runEventSchema),
    queuedAt: timestamp,
    terminalAt: timestamp.optional(),
    manifestHash: sha256.optional(),
    integrityFailure: integrityFailureSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const terminal = terminalRunStates.has(value.state);
    if (!terminal && (value.terminalAt || value.manifestHash || value.integrityFailure)) {
      context.addIssue({
        code: "custom",
        message: "Non-terminal runs cannot contain terminal evidence",
      });
    }
    if (terminal && !value.terminalAt) {
      context.addIssue({
        code: "custom",
        path: ["terminalAt"],
        message: "Terminal runs require terminalAt",
      });
    }
    if (value.state === "COMPLETED") {
      if (!value.manifestHash || value.integrityFailure) {
        context.addIssue({
          code: "custom",
          message: "COMPLETED requires a manifest and cannot carry integrity failure",
        });
      }
    } else if (terminal) {
      const outcomes = Number(Boolean(value.manifestHash)) + Number(Boolean(value.integrityFailure));
      if (outcomes !== 1) {
        context.addIssue({
          code: "custom",
          message: "Terminal run requires exactly one manifest or integrity failure",
        });
      }
    }
    const eventIds = new Set<string>();
    let prior: RunEvent | undefined;
    for (const [eventIndex, event] of value.events.entries()) {
      if (event.workspaceId !== value.workspaceId || event.runId !== value.id) {
        context.addIssue({
          code: "custom",
          path: ["events"],
          message: "Run events must share the run workspace and ID",
        });
      }
      if (eventIds.has(event.eventId)) {
        context.addIssue({
          code: "custom",
          path: ["events"],
          message: "Run event IDs are append-only and unique",
        });
      }
      if (!expectedRunTransition(event)) {
        context.addIssue({
          code: "custom",
          path: ["events"],
          message: "Run history contains an invalid state transition",
        });
      }
      if (prior && prior.to !== event.from) {
        context.addIssue({
          code: "custom",
          path: ["events"],
          message: "Run history must form one append-only state chain",
        });
      }
      if (event.eventType === "RETRY_QUEUED") {
        if (
          eventIndex !== 0 ||
          !value.retryOfRunId ||
          event.sourceRunId !== value.retryOfRunId ||
          event.sourceRunId === value.id
        ) {
          context.addIssue({
            code: "custom",
            path: ["events", eventIndex],
            message: "A retry transition must begin a new run linked to its terminal source",
          });
        }
      } else if (eventIndex === 0 && event.from !== "QUEUED") {
        context.addIssue({
          code: "custom",
          path: ["events", eventIndex],
          message: "A new non-retry run must begin in QUEUED",
        });
      }
      eventIds.add(event.eventId);
      prior = event;
    }
    const beginsWithRetry = value.events[0]?.eventType === "RETRY_QUEUED";
    if (Boolean(value.retryOfRunId) !== beginsWithRetry) {
      context.addIssue({
        code: "custom",
        path: ["retryOfRunId"],
        message: "Retry lineage must match the first run event",
      });
    }
    if (value.state !== "QUEUED" && !prior) {
      context.addIssue({
        code: "custom",
        path: ["events"],
        message: "Every run transition requires an actor-provenance event",
      });
    }
    if (prior && prior.to !== value.state) {
      context.addIssue({
        code: "custom",
        path: ["state"],
        message: "Run state must equal the final history event",
      });
    }
    if (
      prior &&
      terminalRunStates.has(value.state) &&
      (prior.manifestHash !== value.manifestHash ||
        JSON.stringify(prior.integrityFailure) !==
          JSON.stringify(value.integrityFailure))
    ) {
      context.addIssue({
        code: "custom",
        path: ["events"],
        message: "Terminal run evidence must match its final provenance event",
      });
    }
    if (
      prior &&
      terminalRunStates.has(value.state) &&
      prior.occurredAt !== value.terminalAt
    ) {
      context.addIssue({
        code: "custom",
        path: ["terminalAt"],
        message: "Terminal time must match the final provenance event",
      });
    }
  });
export type Run = z.infer<typeof runSchema>;

export const canarySchema = z
  .object({
    id: uuid,
    workspaceId: uuid,
    runId: uuid,
    personaId: uuid,
    sourceField: nonEmpty,
    value: nonEmpty,
    generatedAt: timestamp,
  })
  .strict()
  .superRefine((candidate, context) => {
    const valid =
      candidate.sourceField === "email"
        ? /^pw-[a-f0-9]{32}@canary\.pactwire\.invalid$/u.test(candidate.value)
        : /^PACTWIRE-FICTIONAL-[A-F0-9]{32}$/u.test(candidate.value);
    if (!valid) {
      context.addIssue({
        code: "custom",
        path: ["value"],
        message: "Canary value does not match its generated source-field format",
      });
    }
  });
export type Canary = z.infer<typeof canarySchema>;

export const observationSchema = z
  .object({
    id: uuid,
    workspaceId: uuid,
    runId: uuid,
    source: z.enum(["BROWSER", "NETWORK", "STORAGE", "RECORDER"]),
    recorderVersion: nonEmpty,
    sequence: z.number().int().nonnegative(),
    observedAt: timestamp,
    payloadHash: sha256,
    facts: z.record(z.string(), z.unknown()),
  })
  .strict();

export const canaryMatchSchema = z
  .object({
    id: uuid,
    workspaceId: uuid,
    runId: uuid,
    canaryId: uuid,
    observationId: uuid,
    transform: z.enum(["EXACT", "URL_ENCODED", "BASE64"]),
    matchedValueHash: sha256,
    createdAt: timestamp,
  })
  .strict();

const checkpointResultSchema = z
  .object({
    checkpointId: nonEmpty,
    required: z.boolean(),
    exercised: z.boolean(),
    visible: z.boolean(),
  })
  .strict();

export const findingSchema = z
  .object({
    id: uuid,
    workspaceId: uuid,
    runId: uuid,
    requirementVersionId: uuid,
    state: findingStateSchema,
    checkpoints: z.array(checkpointResultSchema).min(1),
    observationIds: z.array(uuid),
    priorFindingId: uuid.optional(),
    limitations: z.array(nonEmpty).min(1),
    createdAt: timestamp,
  })
  .strict()
  .superRefine((value, context) => {
    const required = value.checkpoints.filter((checkpoint) => checkpoint.required);
    if (
      hasDuplicates(value.checkpoints.map((checkpoint) => checkpoint.checkpointId)) ||
      hasDuplicates(value.observationIds)
    ) {
      context.addIssue({
        code: "custom",
        message: "Finding checkpoint and observation identifiers must be unique",
      });
    }
    if (required.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["checkpoints"],
        message: "A finding needs at least one required checkpoint",
      });
    }
    const complete = required.every(
      (checkpoint) => checkpoint.exercised && checkpoint.visible,
    );
    if (
      [
        "NO_CONFLICT_OBSERVED_IN_NAMED_TESTS",
        "NOT_REOBSERVED_IN_NAMED_TESTS",
      ].includes(value.state) &&
      !complete
    ) {
      context.addIssue({
        code: "custom",
        path: ["checkpoints"],
        message: "Clean or not-reobserved findings require complete visible checkpoints",
      });
    }
    if (
      value.state === "NOT_TESTED" &&
      !required.some((checkpoint) => !checkpoint.exercised)
    ) {
      context.addIssue({
        code: "custom",
        path: ["checkpoints"],
        message: "NOT_TESTED requires an unexercised required checkpoint",
      });
    }
    if (
      value.state === "NOT_VISIBLE" &&
      !required.some((checkpoint) => !checkpoint.visible)
    ) {
      context.addIssue({
        code: "custom",
        path: ["checkpoints"],
        message: "NOT_VISIBLE requires an invisible required checkpoint",
      });
    }
    if (value.state === "WITNESSED_CONFLICT" && value.observationIds.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["observationIds"],
        message: "WITNESSED_CONFLICT requires deterministic observations",
      });
    }
    if (value.state === "NOT_REOBSERVED_IN_NAMED_TESTS" && !value.priorFindingId) {
      context.addIssue({
        code: "custom",
        path: ["priorFindingId"],
        message: "NOT_REOBSERVED requires a prior finding",
      });
    }
  });

export const evidenceReceiptSchema = z
  .object({
    id: uuid,
    workspaceId: uuid,
    runId: uuid,
    findingId: uuid,
    manifestHash: sha256,
    contentHash: sha256,
    artifactHashes: z.record(nonEmpty, sha256),
    supersedesReceiptId: uuid.optional(),
    createdAt: timestamp,
  })
  .strict();

export const approvalEventSchema = z
  .object({
    eventId: uuid,
    eventType: z.literal("APPROVAL_STATE_CHANGED").default("APPROVAL_STATE_CHANGED"),
    workspaceId: uuid,
    softwareId: uuid,
    from: approvalStateSchema,
    to: approvalStateSchema,
    reason: approvalReasonSchema,
    receiptId: uuid.optional(),
    idempotencyKey: nonEmpty.optional(),
    humanDecisionId: uuid.optional(),
    actor: actorSchema,
    occurredAt: timestamp,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.from === value.to) {
      context.addIssue({ code: "custom", message: "Approval transition must change state" });
    }
    if (value.from === "RETIRED") {
      context.addIssue({
        code: "custom",
        path: ["from"],
        message: "RETIRED is a terminal approval state",
      });
    }
    if (value.actor.kind === "MODEL") {
      context.addIssue({
        code: "custom",
        path: ["actor"],
        message: "Model actors cannot transition approval state",
      });
    } else if (
      !expectedApprovalTransition({
        actorKind: value.actor.kind,
        from: value.from,
        to: value.to,
        reason: value.reason,
      })
    ) {
      context.addIssue({
        code: "custom",
        message: "Approval actor, state path, and reason do not form an allowed transition",
      });
    }
    if (
      value.actor.kind === "HUMAN" &&
      value.to === "APPROVED" &&
      !value.humanDecisionId
    ) {
      context.addIssue({
        code: "custom",
        path: ["humanDecisionId"],
        message: "Human approval restoration requires a signed decision",
      });
    }
    if (
      value.humanDecisionId &&
      !(
        value.actor.kind === "HUMAN" &&
        value.to === "APPROVED" &&
        value.reason === "HUMAN_DECISION"
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["humanDecisionId"],
        message: "Signed restoration decisions may only support human approval",
      });
    }
  });
export type ApprovalEvent = z.infer<typeof approvalEventSchema>;

export const approvalAggregateSchema = z
  .object({
    workspaceId: uuid,
    softwareId: uuid,
    state: approvalStateSchema,
    events: z.array(approvalEventSchema),
  })
  .strict()
  .superRefine((value, context) => {
    const eventIds = new Set<string>();
    let prior: ApprovalEvent | undefined;
    for (const event of value.events) {
      if (
        event.workspaceId !== value.workspaceId ||
        event.softwareId !== value.softwareId
      ) {
        context.addIssue({
          code: "custom",
          path: ["events"],
          message: "Approval events must share the aggregate workspace and software",
        });
      }
      if (prior && prior.to !== event.from) {
        context.addIssue({
          code: "custom",
          path: ["events"],
          message: "Approval history must form one append-only state chain",
        });
      }
      if (eventIds.has(event.eventId)) {
        context.addIssue({
          code: "custom",
          path: ["events"],
          message: "Approval event IDs must be unique",
        });
      }
      eventIds.add(event.eventId);
      prior = event;
    }
    if (prior && prior.to !== value.state) {
      context.addIssue({
        code: "custom",
        path: ["state"],
        message: "Approval state must equal the final history event",
      });
    }
  });
export type ApprovalAggregate = z.infer<typeof approvalAggregateSchema>;

export const humanDecisionSchema = z
  .object({
    id: uuid,
    workspaceId: uuid,
    softwareId: uuid,
    runId: uuid.optional(),
    outcome: z.enum(["KEEP_HOLD", "RESTORE_APPROVED", "REJECT", "RETIRE"]),
    rationale: nonEmpty,
    namedScopeAcknowledged: z.literal(true),
    actor: humanActorSchema,
    signedAt: timestamp,
  })
  .strict();

export const auditEventSchema = z
  .object({
    eventId: uuid,
    eventType: z.literal("AUDIT_RECORDED"),
    workspaceId: uuid,
    subjectType: nonEmpty,
    subjectId: uuid,
    action: nonEmpty,
    actor: actorSchema,
    occurredAt: timestamp,
    details: z.record(z.string(), z.unknown()),
  })
  .strict();
export type AuditEvent = z.infer<typeof auditEventSchema>;

export function applyApprovalEvent(
  current: unknown,
  candidate: unknown,
): ApprovalAggregate {
  const aggregate = approvalAggregateSchema.parse(current);
  const event = approvalEventSchema.parse(candidate);
  if (
    event.workspaceId !== aggregate.workspaceId ||
    event.softwareId !== aggregate.softwareId ||
    event.from !== aggregate.state
  ) {
    throw new Error("Approval event does not match the current aggregate");
  }
  if (aggregate.events.some((prior) => prior.eventId === event.eventId)) {
    throw new Error("Approval event ID already exists");
  }
  if (
    !expectedApprovalTransition({
      actorKind: event.actor.kind,
      from: event.from,
      to: event.to,
      reason: event.reason,
    })
  ) {
    throw new Error("Approval actor is not authorized for this transition");
  }
  return immutableClone(
    approvalAggregateSchema.parse({
      ...aggregate,
      state: event.to,
      events: [...aggregate.events, event],
    }),
  );
}

export function applyRunEvent(current: unknown, candidate: unknown): Run {
  const run = runSchema.parse(current);
  const event = runEventSchema.parse(candidate);
  if (terminalRunStates.has(run.state)) {
    throw new Error("Terminal runs cannot transition");
  }
  if (
    event.workspaceId !== run.workspaceId ||
    event.runId !== run.id ||
    event.from !== run.state ||
    !expectedRunTransition(event)
  ) {
    throw new Error("Run event is not valid for the current run");
  }
  if (run.events.some((prior) => prior.eventId === event.eventId)) {
    throw new Error("Run event ID already exists");
  }
  return immutableClone(
    runSchema.parse({
      ...run,
      state: event.to,
      events: [...run.events, event],
      ...(terminalRunStates.has(event.to)
        ? {
            terminalAt: event.occurredAt,
            ...(event.manifestHash ? { manifestHash: event.manifestHash } : {}),
            ...(event.integrityFailure
              ? { integrityFailure: event.integrityFailure }
              : {}),
          }
        : {}),
    }),
  );
}

export function assertRetrySnapshot(
  source: RunSnapshot,
  retry: RunSnapshot,
): void {
  const original = runSnapshotSchema.parse(source);
  const candidate = runSnapshotSchema.parse(retry);
  if (JSON.stringify(original) !== JSON.stringify(candidate)) {
    throw new Error("Retry snapshot must exactly preserve frozen configuration");
  }
}

export function createRetryRun(
  sourceCandidate: unknown,
  input: {
    readonly id: string;
    readonly eventId: string;
    readonly queuedAt: string;
    readonly actor: Actor;
  },
): Run {
  const source = runSchema.parse(sourceCandidate);
  if (!terminalRunStates.has(source.state)) {
    throw new Error("Only terminal runs can be retried");
  }
  const event = runEventSchema.parse({
    eventId: input.eventId,
    eventType: "RETRY_QUEUED",
    workspaceId: source.workspaceId,
    runId: input.id,
    sourceRunId: source.id,
    from: source.state,
    to: "QUEUED",
    actor: input.actor,
    occurredAt: input.queuedAt,
  });
  return immutableClone(
    runSchema.parse({
      id: input.id,
      workspaceId: source.workspaceId,
      softwareId: source.softwareId,
      state: "QUEUED",
      snapshot: structuredClone(source.snapshot),
      retryOfRunId: source.id,
      events: [event],
      queuedAt: input.queuedAt,
    }),
  );
}

export const domainEventSchema = z.union([
  approvalEventSchema,
  runEventSchema,
  auditEventSchema,
]);
export type DomainEvent = z.infer<typeof domainEventSchema>;

export function serializeDomainEvent(candidate: unknown): string {
  return JSON.stringify(domainEventSchema.parse(candidate));
}

export function deserializeDomainEvent(serialized: string): DomainEvent {
  return domainEventSchema.parse(JSON.parse(serialized) as unknown);
}

export function appendAuditEvent(
  history: readonly z.infer<typeof auditEventSchema>[],
  candidate: unknown,
): readonly z.infer<typeof auditEventSchema>[] {
  const existing = history.map((event) => auditEventSchema.parse(event));
  const event = auditEventSchema.parse(candidate);
  if (existing.some((prior) => prior.eventId === event.eventId)) {
    throw new Error("Audit event ID already exists");
  }
  return immutableClone([...existing, event]);
}

export interface WorkspaceScopedRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly [key: string]: unknown;
}

function immutableClone<T>(value: T): T {
  const clone = structuredClone(value);
  const freeze = (candidate: unknown): void => {
    if (typeof candidate !== "object" || candidate === null || Object.isFrozen(candidate)) {
      return;
    }
    for (const nested of Object.values(candidate)) {
      freeze(nested);
    }
    Object.freeze(candidate);
  };
  freeze(clone);
  return clone;
}

export class WorkspaceBoundaryStore<T extends WorkspaceScopedRecord> {
  readonly #records = new Map<string, T>();

  insert(
    workspaceId: string,
    record: T,
    referencedIds: readonly string[] = [],
  ): T {
    if (record.workspaceId !== workspaceId) {
      throw new Error("Record workspace does not match the active workspace");
    }
    const recordKey = `${workspaceId}:${record.id}`;
    if (this.#records.has(recordKey)) {
      throw new Error("Record ID already exists");
    }
    for (const referenceId of referencedIds) {
      if (!this.#records.has(`${workspaceId}:${referenceId}`)) {
        throw new Error("Referenced record is not accessible in the active workspace");
      }
    }
    const stored = immutableClone(record);
    this.#records.set(recordKey, stored);
    return immutableClone(stored);
  }

  read(workspaceId: string, id: string): T | undefined {
    const record = this.#records.get(`${workspaceId}:${id}`);
    return record ? immutableClone(record) : undefined;
  }

  mutate(workspaceId: string, id: string, update: (record: T) => T): T {
    const current = this.#records.get(`${workspaceId}:${id}`);
    if (!current) {
      throw new Error("Record is not accessible in the active workspace");
    }
    const next = update(immutableClone(current));
    if (next.id !== id || next.workspaceId !== workspaceId) {
      throw new Error("Mutation cannot change record identity or workspace");
    }
    const stored = immutableClone(next);
    this.#records.set(`${workspaceId}:${id}`, stored);
    return immutableClone(stored);
  }

  exportWorkspace(workspaceId: string): readonly T[] {
    return [...this.#records.entries()]
      .filter(([, record]) => record.workspaceId === workspaceId)
      .map(([, record]) => immutableClone(record));
  }
}
