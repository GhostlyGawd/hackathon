import { Ajv2020, type ErrorObject } from "ajv/dist/2020.js";
import type { FormatsPlugin } from "ajv-formats";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

export interface VerificationCommand {
  readonly phase: "RED" | "GREEN" | "REGRESSION";
  readonly name: string;
  readonly command: string;
  readonly exitCode: number;
  readonly durationMs: number;
  readonly expectedFailure?: string;
  readonly outputPath?: string;
}

export interface VerificationManifest {
  readonly schemaVersion: "1.0.0";
  readonly taskId: string;
  readonly title: string;
  readonly status: "IN_PROGRESS" | "COMPLETE";
  readonly prdSections: readonly number[];
  readonly functionalRequirements: readonly string[];
  readonly sourceCommitSha: string;
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly artifactRoot: string;
  readonly curatedEvidenceRoot: string;
  readonly environment: Readonly<Record<string, unknown>>;
  readonly commands: readonly VerificationCommand[];
  readonly testSummary: Readonly<Record<string, number>>;
  readonly propertyTests: Readonly<Record<string, unknown>>;
  readonly bdd: Readonly<Record<string, unknown>>;
  readonly visualEvidence: Readonly<Record<string, unknown>>;
  readonly proofs: readonly Readonly<Record<string, string>>[];
  readonly sanitization: Readonly<Record<string, unknown>>;
  readonly knownLimitations: readonly string[];
  readonly reviewer: string;
}

export interface ManifestValidationIssue {
  readonly instancePath: string;
  readonly keyword: string;
  readonly message: string;
}

export interface VisualEvidenceAsset {
  readonly path: string;
  readonly kind: "screenshot" | "trace" | "video" | "chart" | "diagram";
  readonly capturedAt: string;
  readonly viewport: {
    readonly width: number;
    readonly height: number;
  };
  readonly altText: string;
  readonly caption: string;
  readonly provenance: "captured" | "generated";
  readonly sourceCommitSha: string;
}

export type ValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: readonly ManifestValidationIssue[] };

export type ManifestValidationResult = ValidationResult<VerificationManifest>;

const schemaUrl = new URL(
  "../schema/verification-manifest.schema.json",
  import.meta.url,
);

export const verificationManifestSchema = JSON.parse(
  readFileSync(schemaUrl, "utf8"),
) as object;

const loadCommonJs = createRequire(import.meta.url);
const formatsPlugin: unknown = loadCommonJs("ajv-formats");
if (typeof formatsPlugin !== "function") {
  throw new Error("ajv-formats did not expose its CommonJS plugin function");
}
const addFormats = formatsPlugin as FormatsPlugin;

const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  strictRequired: false,
});
addFormats(ajv);

const validate = ajv.compile<VerificationManifest>(verificationManifestSchema);
const validateVisualAsset = ajv.getSchema<VisualEvidenceAsset>(
  "https://pactwire.local/schemas/verification-manifest.schema.json#/$defs/visualAsset",
);

function normalizeIssue(error: ErrorObject): ManifestValidationIssue {
  return {
    instancePath: error.instancePath || "/",
    keyword: error.keyword,
    message: error.message ?? "failed schema validation",
  };
}

function semanticIssues(
  manifest: VerificationManifest,
): ManifestValidationIssue[] {
  const issues: ManifestValidationIssue[] = [];
  const artifactRoot = `artifacts/verification/${manifest.taskId}/`;
  const curatedRoot = `docs/evidence/${manifest.taskId}/`;

  if (manifest.artifactRoot !== artifactRoot) {
    issues.push({
      instancePath: "/artifactRoot",
      keyword: "taskRoot",
      message: `must equal ${artifactRoot}`,
    });
  }
  if (manifest.curatedEvidenceRoot !== curatedRoot) {
    issues.push({
      instancePath: "/curatedEvidenceRoot",
      keyword: "taskRoot",
      message: `must equal ${curatedRoot}`,
    });
  }
  if (
    manifest.completedAt &&
    Date.parse(manifest.completedAt) < Date.parse(manifest.startedAt)
  ) {
    issues.push({
      instancePath: "/completedAt",
      keyword: "chronology",
      message: "must not precede startedAt",
    });
  }

  for (const [index, command] of manifest.commands.entries()) {
    if (command.outputPath && !command.outputPath.startsWith(artifactRoot)) {
      issues.push({
        instancePath: `/commands/${index}/outputPath`,
        keyword: "taskRoot",
        message: `must be inside ${artifactRoot}`,
      });
    }
  }

  const assets = manifest.visualEvidence["assets"];
  if (Array.isArray(assets)) {
    for (const [index, asset] of (assets as unknown[]).entries()) {
      if (
        typeof asset === "object" &&
        asset !== null &&
        "path" in asset &&
        typeof asset.path === "string" &&
        !asset.path.startsWith(curatedRoot)
      ) {
        issues.push({
          instancePath: `/visualEvidence/assets/${index}/path`,
          keyword: "taskRoot",
          message: `must be inside ${curatedRoot}`,
        });
      }
    }
  }

  return issues;
}

export function validateVerificationManifest(
  candidate: unknown,
): ManifestValidationResult {
  if (validate(candidate)) {
    const issues = semanticIssues(candidate);
    return issues.length === 0
      ? { ok: true, value: candidate }
      : { ok: false, issues };
  }

  return {
    ok: false,
    issues: (validate.errors ?? []).map(normalizeIssue),
  };
}

export function validateScreenshotMetadata(
  candidate: unknown,
): ValidationResult<VisualEvidenceAsset> {
  if (!validateVisualAsset) {
    throw new Error("Visual evidence schema is not registered");
  }
  if (!validateVisualAsset(candidate)) {
    return {
      ok: false,
      issues: (validateVisualAsset.errors ?? []).map(normalizeIssue),
    };
  }
  const asset = candidate as VisualEvidenceAsset;
  if (asset.kind !== "screenshot") {
    return {
      ok: false,
      issues: [
        {
          instancePath: "/kind",
          keyword: "const",
          message: "must be screenshot",
        },
      ],
    };
  }
  return { ok: true, value: asset };
}
