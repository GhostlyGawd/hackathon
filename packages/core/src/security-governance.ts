import { z } from "zod";

const nonEmpty = z.string().trim().min(1);
const timestamp = z.string().datetime({ offset: true });
const uuid = z.string().uuid();

export const securityThreatIdSchema = z.enum([
  "REAL_DATA_ENTRY",
  "PROMPT_INJECTION",
  "CREDENTIAL_LEAKAGE",
  "OUT_OF_SCOPE_EGRESS",
  "HARMFUL_AUTHORIZED_ACTION",
  "CROSS_WORKSPACE_LEAKAGE",
  "EVIDENCE_TAMPERING",
  "FALSE_DESTINATION_ATTRIBUTION",
  "INCOMPLETE_CAPTURE_ASSURANCE",
  "UNAUTHORIZED_PUBLICATION",
  "EXCESSIVE_EVIDENCE_RETENTION",
]);
export type SecurityThreatId = z.infer<typeof securityThreatIdSchema>;

export const SECURITY_THREAT_CATALOG = Object.freeze([
  {
    id: "REAL_DATA_ENTRY",
    risk: "A user enters real student information into a controlled test.",
    control:
      "Synthetic-only confirmation and deterministic likely-real-data scanning block persistence and redact the attempted values.",
    residualRisk:
      "Heuristic scanning cannot identify every real value, so operators remain responsible for using fictional accounts and reserved domains.",
  },
  {
    id: "PROMPT_INJECTION",
    risk: "Untrusted page content attempts to direct the model or expand authority.",
    control:
      "Page content is labeled untrusted and every browser action is checked beneath the model against frozen domain and action scope.",
    residualRisk:
      "A permitted page can still contain adversarial content, so deterministic action mediation remains required for every step.",
  },
  {
    id: "CREDENTIAL_LEAKAGE",
    risk: "A browser credential appears in model context, logs, evidence, or exports.",
    control:
      "Secret values are isolated from the model and redacted across raw, URL, form, base64, base64url, and JSON representations.",
    residualRisk:
      "Novel encodings are not automatically recognized and require an explicit regression before they are covered.",
  },
  {
    id: "OUT_OF_SCOPE_EGRESS",
    risk: "A run browses or sends data to a destination outside its authorization.",
    control:
      "Protocol, hostname, popup, redirect, and action checks fail closed against the frozen authorization before execution.",
    residualRisk:
      "Authorization scope must be configured correctly by a human before a run begins.",
  },
  {
    id: "HARMFUL_AUTHORIZED_ACTION",
    risk: "A technically in-scope action could message a person, purchase, delete, or administer data.",
    control:
      "Harmful action classes are prohibited or require a visible human handoff even when the destination itself is authorized.",
    residualRisk:
      "New action classes require explicit classification before they can be automated.",
  },
  {
    id: "CROSS_WORKSPACE_LEAKAGE",
    risk: "One district can read, mutate, reference, or infer another district's records.",
    control:
      "Signed active-workspace checks and compound workspace keys conceal cross-workspace targets and prevent mutation.",
    residualRisk:
      "Deployment credentials and database roles must preserve the same workspace boundary.",
  },
  {
    id: "EVIDENCE_TAMPERING",
    risk: "Captured evidence is altered after the run.",
    control:
      "Content-addressed artifacts, immutable receipt metadata, and independent hash verification make one-byte changes invalid.",
    residualRisk:
      "Integrity proves that bytes match a receipt; it does not prove that the original observation was complete or meaningful.",
  },
  {
    id: "FALSE_DESTINATION_ATTRIBUTION",
    risk: "A hostname is presented as belonging to a company without sufficient evidence.",
    control:
      "Destination identity remains UNKNOWN until a human confirms bounded evidence; model output cannot establish ownership.",
    residualRisk:
      "Corporate ownership can change after a confirmation and must be re-reviewed when evidence changes.",
  },
  {
    id: "INCOMPLETE_CAPTURE_ASSURANCE",
    risk: "Missing or invisible paths are presented as a clean, safe, or compliant result.",
    control:
      "Coverage gaps deterministically produce NOT_TESTED, NOT_VISIBLE, or NEEDS_REVIEW and can never produce a clean finding.",
    residualRisk:
      "A complete named run remains bounded to its named journeys, roles, fields, time window, and visible instrumentation.",
  },
  {
    id: "UNAUTHORIZED_PUBLICATION",
    risk: "Private evidence or an unsupported accusation is published externally.",
    control:
      "The P0 release policy permits only sanitized private review by an authorized human and denies public delivery.",
    residualRisk:
      "A human can still copy a private export outside Pactwire, so exported files carry an explicit private-review boundary.",
  },
  {
    id: "EXCESSIVE_EVIDENCE_RETENTION",
    risk: "Sensitive evidence remains available longer than the product needs it.",
    control:
      "Pactwire uses a bounded product retention policy, stores artifact bytes only in the encrypted object store, and supports confirmed idempotent deletion with immutable tombstones.",
    residualRisk:
      "Infrastructure backups and replicas need deployment-specific deletion validation before a production retention claim is made.",
  },
] as const satisfies readonly {
  readonly id: SecurityThreatId;
  readonly risk: string;
  readonly control: string;
  readonly residualRisk: string;
}[]);

const securityThreatResultSchema = z
  .object({
    threatId: securityThreatIdSchema,
    status: z.enum(["PASS", "FAIL"]),
    evidence: z.array(nonEmpty.max(500)).min(1),
  })
  .strict();

export function buildSecurityThreatReport(candidate: {
  readonly generatedAt: string;
  readonly results: readonly z.input<typeof securityThreatResultSchema>[];
}) {
  const generatedAt = timestamp.parse(candidate.generatedAt);
  const results = candidate.results.map((result) =>
    securityThreatResultSchema.parse(result),
  );
  for (const threat of SECURITY_THREAT_CATALOG) {
    if (results.filter(({ threatId }) => threatId === threat.id).length !== 1) {
      throw new TypeError(
        `Security threat ${threat.id} requires exactly one result`,
      );
    }
  }
  if (results.length !== SECURITY_THREAT_CATALOG.length) {
    throw new TypeError("Security threat report requires exactly one result per catalog entry");
  }
  const ordered = SECURITY_THREAT_CATALOG.map((threat) => ({
    ...threat,
    ...results.find(({ threatId }) => threatId === threat.id)!,
  }));
  return Object.freeze({
    reportVersion: "pactwire-security-threat-report-v1" as const,
    generatedAt,
    status: ordered.every(({ status }) => status === "PASS")
      ? ("PASS" as const)
      : ("FAIL" as const),
    threats: Object.freeze(ordered),
  });
}

export const evidenceDeliverySchema = z.enum([
  "PRIVATE_REVIEW",
  "EXTERNAL_PUBLIC",
]);

const evidenceReleaseRequestSchema = z
  .object({
    actorKind: z.enum(["HUMAN", "AUTOMATION", "MODEL"]),
    delivery: evidenceDeliverySchema,
    sanitized: z.boolean(),
    permissions: z.array(z.string()),
  })
  .strict();

export type EvidenceReleaseDecision = Readonly<{
  decision: "ALLOW" | "DENY";
  reason:
    | "PRIVATE_REVIEW_AUTHORIZED"
    | "PUBLICATION_NOT_SUPPORTED"
    | "HUMAN_REQUIRED"
    | "UNSANITIZED_EVIDENCE"
    | "REQUIRED_PERMISSION_MISSING";
}>;

export class EvidenceReleaseDeniedError extends Error {
  readonly code = "EVIDENCE_RELEASE_DENIED";
  readonly status = 403;
  readonly publicMessage =
    "Pactwire evidence can only be downloaded for authorized private review.";

  constructor(readonly reason: EvidenceReleaseDecision["reason"]) {
    super(`Evidence release denied: ${reason}`);
    this.name = "EvidenceReleaseDeniedError";
  }
}

export function evaluateEvidenceReleasePolicy(
  candidate: z.input<typeof evidenceReleaseRequestSchema>,
): EvidenceReleaseDecision {
  const request = evidenceReleaseRequestSchema.parse(candidate);
  if (request.delivery === "EXTERNAL_PUBLIC") {
    return { decision: "DENY", reason: "PUBLICATION_NOT_SUPPORTED" };
  }
  if (request.actorKind !== "HUMAN") {
    return { decision: "DENY", reason: "HUMAN_REQUIRED" };
  }
  if (!request.sanitized) {
    return { decision: "DENY", reason: "UNSANITIZED_EVIDENCE" };
  }
  const permissions = new Set(request.permissions);
  if (
    !permissions.has("WORKSPACE_EXPORT") ||
    !permissions.has("EVIDENCE_REVIEW")
  ) {
    return { decision: "DENY", reason: "REQUIRED_PERMISSION_MISSING" };
  }
  return { decision: "ALLOW", reason: "PRIVATE_REVIEW_AUTHORIZED" };
}

export const DEFAULT_EVIDENCE_RETENTION_DAYS = 30 as const;

export const evidenceRetentionPolicySchema = z
  .object({
    workspaceId: uuid,
    retentionDays: z.number().int().min(1).max(365),
    basis: z.enum(["PACTWIRE_PRODUCT_DEFAULT", "HUMAN_CONFIGURED"]),
    updatedAt: timestamp,
    updatedBy: z.discriminatedUnion("kind", [
      z
        .object({ kind: z.literal("HUMAN"), actorId: nonEmpty.max(500) })
        .strict(),
      z
        .object({
          kind: z.literal("AUTOMATION"),
          actorId: nonEmpty.max(500),
        })
        .strict(),
    ]),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      (value.basis === "PACTWIRE_PRODUCT_DEFAULT" &&
        value.updatedBy.kind !== "AUTOMATION") ||
      (value.basis === "HUMAN_CONFIGURED" && value.updatedBy.kind !== "HUMAN")
    ) {
      context.addIssue({
        code: "custom",
        path: ["updatedBy", "kind"],
        message: "Retention policy provenance must match its basis",
      });
    }
  });
export type EvidenceRetentionPolicy = z.infer<
  typeof evidenceRetentionPolicySchema
>;
