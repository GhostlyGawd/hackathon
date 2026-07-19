import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  validateVerificationManifest,
  type VerificationManifest,
} from "./manifest.js";

export type TraceabilityIssueCode =
  | "ORPHAN_PRD_REQUIREMENT"
  | "UNKNOWN_PLAN_REQUIREMENT"
  | "UNKNOWN_TASK_OWNER"
  | "ORPHAN_PRD_SECTION"
  | "MISSING_COMPLETION_MANIFEST"
  | "INVALID_MANIFEST"
  | "MANIFEST_TASK_MISMATCH"
  | "UNKNOWN_EVIDENCE_TASK"
  | "BROKEN_EVIDENCE_LINK"
  | "BROKEN_PROOF_PATH"
  | "ORPHAN_TEST"
  | "ORPHAN_EVIDENCE_ASSET"
  | "MISSING_FIXED_DECISIONS"
  | "FIXED_DECISION_DRIFT"
  | "UNREADABLE_EVIDENCE";

export interface TraceabilityIssue {
  readonly code: TraceabilityIssueCode;
  readonly subject: string;
  readonly message: string;
}

export interface RepositoryEvidenceReport {
  readonly ok: boolean;
  readonly issues: readonly TraceabilityIssue[];
  readonly counts: {
    readonly requirements: number;
    readonly sections: number;
    readonly tasks: number;
    readonly manifests: number;
    readonly proofFiles: number;
  };
}

const requirementRow = /^\|\s*(FR-[0-9]{3})\s*\|/gmu;
const ownerRow =
  /^\|\s*(FR-[0-9]{3})\s*\|\s*([^|]+?)\s*\|/gmu;
const taskRow = /^\|\s*([A-Z]{2,4}-[0-9]{2})\s*\|/gmu;
const taskStatusRow =
  /^\|\s*([A-Z]{2,4}-[0-9]{2})\s*\|[^|]*\|[^|]*\|[^|]*\|\s*(NOT STARTED|IN PROGRESS|COMPLETE(?: \(P0\))?)\s*\|/gmu;
const taskId = /[A-Z]{2,4}-[0-9]{2}/u;
const prdSectionHeading = /^##\s+([0-9]+)\./gmu;
const planSectionGate = /^\|\s*([0-9]+)\.\s+[^|]+\|/gmu;
const markdownLink = /\[[^\]]*\]\(([^)]+)\)/gu;

function extractMatches(markdown: string, pattern: RegExp): Set<string> {
  return new Set(
    Array.from(markdown.matchAll(pattern), (match) => match[1]).filter(
      (value): value is string => value !== undefined,
    ),
  );
}

function taskStatuses(planMarkdown: string): Map<string, string> {
  const statuses = new Map<string, string>();
  for (const match of planMarkdown.matchAll(taskStatusRow)) {
    if (match[1] && match[2]) {
      statuses.set(match[1], match[2]);
    }
  }
  return statuses;
}

export function checkRequirementTraceability(
  prdMarkdown: string,
  planMarkdown: string,
): TraceabilityIssue[] {
  const prdRequirements = extractMatches(prdMarkdown, requirementRow);
  const planRequirements = extractMatches(planMarkdown, requirementRow);
  const planTasks = extractMatches(planMarkdown, taskRow);
  const owners = new Map<string, string>();

  for (const match of planMarkdown.matchAll(ownerRow)) {
    const requirement = match[1];
    const owner = match[2]?.match(taskId)?.[0];
    if (requirement && owner) {
      owners.set(requirement, owner);
    }
  }

  const issues: TraceabilityIssue[] = [];

  for (const requirement of [...prdRequirements].sort()) {
    if (!planRequirements.has(requirement) || !owners.has(requirement)) {
      issues.push({
        code: "ORPHAN_PRD_REQUIREMENT",
        subject: requirement,
        message: `${requirement} has no owning task in the implementation traceability table`,
      });
    }
  }

  for (const requirement of [...planRequirements].sort()) {
    if (!prdRequirements.has(requirement)) {
      issues.push({
        code: "UNKNOWN_PLAN_REQUIREMENT",
        subject: requirement,
        message: `${requirement} is mapped by the plan but does not exist in the PRD`,
      });
    }
  }

  for (const [requirement, owner] of [...owners.entries()].sort()) {
    if (!planTasks.has(owner)) {
      issues.push({
        code: "UNKNOWN_TASK_OWNER",
        subject: requirement,
        message: `${requirement} names unknown owner task ${owner}`,
      });
    }
  }

  return issues;
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function walkFiles(root: string): Promise<string[]> {
  if (!(await exists(root))) {
    return [];
  }
  const entries = await readdir(root, { withFileTypes: true });
  const ignoredDirectories = new Set([
    ".git",
    ".next",
    "artifacts",
    "dist",
    "node_modules",
  ]);
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(root, entry.name);
      return entry.isDirectory() && !ignoredDirectories.has(entry.name)
        ? walkFiles(entryPath)
        : entry.isDirectory()
          ? []
          : [entryPath];
    }),
  );
  return nested.flat();
}

function repositoryPath(repositoryRoot: string, filePath: string): string {
  return path.relative(repositoryRoot, filePath).replaceAll(path.sep, "/");
}

function isInside(root: string, candidate: string): boolean {
  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = path.resolve(candidate);
  return (
    resolvedCandidate === resolvedRoot ||
    resolvedCandidate.startsWith(resolvedRoot + path.sep)
  );
}

export async function checkCuratedEvidenceLinks(
  repositoryRoot: string,
  markdownFiles: readonly string[],
): Promise<TraceabilityIssue[]> {
  const issues: TraceabilityIssue[] = [];
  for (const markdownFile of markdownFiles) {
    const markdown = await readFile(markdownFile, "utf8");
    for (const match of markdown.matchAll(markdownLink)) {
      const rawTarget = match[1]?.trim().replace(/^<|>$/gu, "");
      if (
        !rawTarget ||
        rawTarget.startsWith("#") ||
        /^[a-z][a-z0-9+.-]*:/iu.test(rawTarget)
      ) {
        continue;
      }
      const pathOnly = rawTarget.split("#", 1)[0];
      if (!pathOnly) {
        continue;
      }
      let decoded: string;
      try {
        decoded = decodeURIComponent(pathOnly);
      } catch {
        decoded = pathOnly;
      }
      const target = path.resolve(path.dirname(markdownFile), decoded);
      if (!isInside(repositoryRoot, target) || !(await exists(target))) {
        const subject = `${repositoryPath(repositoryRoot, markdownFile)} -> ${rawTarget}`;
        issues.push({
          code: "BROKEN_EVIDENCE_LINK",
          subject,
          message: `Curated evidence link does not resolve: ${subject}`,
        });
      }
    }
  }
  return issues;
}

function extractFixedDecisions(prdMarkdown: string): string[] {
  const section = prdMarkdown.match(
    /^## 23\. Fixed decisions\s*([\s\S]*?)^## 24\./mu,
  )?.[1];
  if (!section) {
    return [];
  }
  return Array.from(section.matchAll(/^- (.+)$/gmu), (match) => match[1]).filter(
    (value): value is string => value !== undefined,
  );
}

function readDecisionContract(candidate: unknown): string[] | undefined {
  if (
    typeof candidate !== "object" ||
    candidate === null ||
    !("decisions" in candidate) ||
    !Array.isArray(candidate.decisions) ||
    !candidate.decisions.every((decision) => typeof decision === "string")
  ) {
    return undefined;
  }
  return candidate.decisions;
}

export function checkFixedDecisionContract(
  prdMarkdown: string,
  candidate: unknown,
): TraceabilityIssue[] {
  const contract = readDecisionContract(candidate);
  const actual = extractFixedDecisions(prdMarkdown);
  if (contract && JSON.stringify(contract) === JSON.stringify(actual)) {
    return [];
  }
  return [
    {
      code: "FIXED_DECISION_DRIFT",
      subject: "PRD section 23",
      message:
        "PRD fixed decisions differ from docs/fixed-decisions.json; update both only through an explicit PRD revision",
    },
  ];
}

function manifestVisualPaths(manifest: VerificationManifest): string[] {
  const value = manifest.visualEvidence;
  const assets = value["assets"];
  if (!Array.isArray(assets)) {
    return [];
  }
  const paths: string[] = [];
  for (const asset of assets as unknown[]) {
    if (
      typeof asset === "object" &&
      asset !== null &&
      "path" in asset &&
      typeof asset.path === "string"
    ) {
      paths.push(asset.path);
    }
  }
  return paths;
}

export async function checkRepositoryEvidence(
  repositoryRoot: string,
): Promise<RepositoryEvidenceReport> {
  const prdPath = path.join(repositoryRoot, "docs", "PRD.md");
  const planPath = path.join(repositoryRoot, "docs", "IMPLEMENTATION_PLAN.md");
  const [prdMarkdown, planMarkdown] = await Promise.all([
    readFile(prdPath, "utf8"),
    readFile(planPath, "utf8"),
  ]);
  const issues = checkRequirementTraceability(prdMarkdown, planMarkdown);
  const statuses = taskStatuses(planMarkdown);
  const planTasks = new Set(statuses.keys());

  const prdSections = extractMatches(prdMarkdown, prdSectionHeading);
  const planSections = extractMatches(planMarkdown, planSectionGate);
  for (const section of [...prdSections].sort(
    (left, right) => Number(left) - Number(right),
  )) {
    if (!planSections.has(section)) {
      issues.push({
        code: "ORPHAN_PRD_SECTION",
        subject: section,
        message: `PRD section ${section} has no section completion gate`,
      });
    }
  }

  const evidenceRoot = path.join(repositoryRoot, "docs", "evidence");
  const evidenceFiles = await walkFiles(evidenceRoot);
  const manifestFiles = evidenceFiles.filter(
    (filePath) => path.basename(filePath) === "manifest.json",
  );
  const manifests = new Map<string, VerificationManifest>();
  const referencedProofs = new Set<string>();
  const referencedVisuals = new Set<string>();

  for (const manifestFile of manifestFiles) {
    const relativeManifest = repositoryPath(repositoryRoot, manifestFile);
    let candidate: unknown;
    try {
      candidate = JSON.parse(await readFile(manifestFile, "utf8")) as unknown;
    } catch (error) {
      issues.push({
        code: "UNREADABLE_EVIDENCE",
        subject: relativeManifest,
        message: `${relativeManifest} is not readable JSON: ${error instanceof Error ? error.message : String(error)}`,
      });
      continue;
    }
    const result = validateVerificationManifest(candidate);
    if (!result.ok) {
      for (const issue of result.issues) {
        issues.push({
          code: "INVALID_MANIFEST",
          subject: relativeManifest,
          message: `${relativeManifest}${issue.instancePath} ${issue.message}`,
        });
      }
      continue;
    }
    const directoryTask = path.basename(path.dirname(manifestFile));
    if (directoryTask !== result.value.taskId) {
      issues.push({
        code: "MANIFEST_TASK_MISMATCH",
        subject: relativeManifest,
        message: `${relativeManifest} declares ${result.value.taskId}`,
      });
    }
    if (!planTasks.has(result.value.taskId)) {
      issues.push({
        code: "UNKNOWN_EVIDENCE_TASK",
        subject: result.value.taskId,
        message: `${relativeManifest} belongs to a task absent from the plan index`,
      });
    }
    manifests.set(result.value.taskId, result.value);

    for (const proof of result.value.proofs) {
      const proofPath = proof["path"];
      if (typeof proofPath !== "string") {
        continue;
      }
      referencedProofs.add(proofPath);
      const absoluteProof = path.resolve(repositoryRoot, proofPath);
      if (!isInside(repositoryRoot, absoluteProof) || !(await exists(absoluteProof))) {
        issues.push({
          code: "BROKEN_PROOF_PATH",
          subject: proofPath,
          message: `${result.value.taskId} references missing proof ${proofPath}`,
        });
      }
    }
    for (const visualPath of manifestVisualPaths(result.value)) {
      referencedVisuals.add(visualPath);
      const absoluteVisual = path.resolve(repositoryRoot, visualPath);
      if (!isInside(repositoryRoot, absoluteVisual) || !(await exists(absoluteVisual))) {
        issues.push({
          code: "BROKEN_PROOF_PATH",
          subject: visualPath,
          message: `${result.value.taskId} references missing visual ${visualPath}`,
        });
      }
    }
  }

  for (const [task, status] of statuses) {
    if (status.startsWith("COMPLETE") && !manifests.has(task)) {
      issues.push({
        code: "MISSING_COMPLETION_MANIFEST",
        subject: task,
        message: `${task} is complete but docs/evidence/${task}/manifest.json is missing or invalid`,
      });
    }
  }

  const candidateTestFiles = (
    await Promise.all([
      walkFiles(path.join(repositoryRoot, "tests")),
      walkFiles(path.join(repositoryRoot, "apps")),
      walkFiles(path.join(repositoryRoot, "packages")),
    ])
  ).flat();
  const testFiles = candidateTestFiles
    .filter((filePath) => /(?:\.test\.ts|\.feature)$/u.test(filePath))
    .map((filePath) => repositoryPath(repositoryRoot, filePath));
  for (const testFile of testFiles) {
    if (!referencedProofs.has(testFile)) {
      issues.push({
        code: "ORPHAN_TEST",
        subject: testFile,
        message: `${testFile} is not referenced by a task verification manifest`,
      });
    }
  }

  for (const evidenceFile of evidenceFiles) {
    const baseName = path.basename(evidenceFile);
    if (baseName === "README.md" || baseName === "manifest.json") {
      continue;
    }
    const relativeEvidence = repositoryPath(repositoryRoot, evidenceFile);
    if (
      !referencedProofs.has(relativeEvidence) &&
      !referencedVisuals.has(relativeEvidence)
    ) {
      issues.push({
        code: "ORPHAN_EVIDENCE_ASSET",
        subject: relativeEvidence,
        message: `${relativeEvidence} is not referenced by a verification manifest`,
      });
    }
  }

  issues.push(
    ...(await checkCuratedEvidenceLinks(
      repositoryRoot,
      evidenceFiles.filter((filePath) => filePath.endsWith(".md")),
    )),
  );

  const fixedDecisionsPath = path.join(
    repositoryRoot,
    "docs",
    "fixed-decisions.json",
  );
  if (!(await exists(fixedDecisionsPath))) {
    issues.push({
      code: "MISSING_FIXED_DECISIONS",
      subject: "docs/fixed-decisions.json",
      message: "The machine-readable fixed-decision contract is missing",
    });
  } else {
    let candidate: unknown;
    try {
      candidate = JSON.parse(
        await readFile(fixedDecisionsPath, "utf8"),
      ) as unknown;
    } catch {
      candidate = undefined;
    }
    issues.push(...checkFixedDecisionContract(prdMarkdown, candidate));
  }

  return {
    ok: issues.length === 0,
    issues,
    counts: {
      requirements: extractMatches(prdMarkdown, requirementRow).size,
      sections: prdSections.size,
      tasks: statuses.size,
      manifests: manifests.size,
      proofFiles: referencedProofs.size,
    },
  };
}
