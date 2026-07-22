import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const executeFile = promisify(execFile);

export type RepositorySecretRuleId =
  | "OPENAI_API_KEY"
  | "GITHUB_TOKEN"
  | "AWS_ACCESS_KEY"
  | "PRIVATE_KEY_MATERIAL"
  | "TRACKED_ENV_FILE";

export interface RepositorySecretFinding {
  readonly ruleId: RepositorySecretRuleId;
  readonly path: string;
  readonly line: number;
  readonly fingerprint: string;
}

export interface RepositorySecretScanReport {
  readonly reportVersion: "pactwire-repository-secret-scan-v1";
  readonly status: "PASS" | "FAIL";
  readonly filesScanned: number;
  readonly findings: readonly RepositorySecretFinding[];
}

const contentRules: readonly {
  readonly ruleId: Exclude<RepositorySecretRuleId, "TRACKED_ENV_FILE">;
  readonly expression: RegExp;
}[] = [
  {
    ruleId: "OPENAI_API_KEY",
    expression: new RegExp(`${["sk", "proj"].join("-")}-[A-Za-z0-9_-]{20,}`, "gu"),
  },
  {
    ruleId: "GITHUB_TOKEN",
    expression: new RegExp(
      `(?:${["ghp", ""].join("_")}[A-Za-z0-9]{30,}|${[
        "github",
        "pat",
        "",
      ].join("_")}[A-Za-z0-9_]{30,})`,
      "gu",
    ),
  },
  {
    ruleId: "AWS_ACCESS_KEY",
    expression: new RegExp(`${["AK", "IA"].join("")}[A-Z0-9]{16}`, "gu"),
  },
  {
    ruleId: "PRIVATE_KEY_MATERIAL",
    expression: new RegExp(
      `${["-----BEGIN", ""].join("[ \\t]+")}(?:(?:RSA|EC|OPENSSH)[ \\t]+)?${[
        "PRIVATE",
        "KEY-----",
      ].join("[ \\t]+")}`,
      "gu",
    ),
  },
];

function normalizedRepositoryPath(filePath: string): string {
  return filePath.replaceAll("\\", "/");
}

function isTrackedEnvironmentFile(filePath: string): boolean {
  const name = path.posix.basename(normalizedRepositoryPath(filePath));
  if (name === ".env.example" || name === ".env.template") return false;
  return name === ".env" || name.startsWith(".env.");
}

function lineFor(text: string, index: number): number {
  let line = 1;
  for (let position = 0; position < index; position += 1) {
    if (text.charCodeAt(position) === 10) line += 1;
  }
  return line;
}

function finding(
  ruleId: RepositorySecretRuleId,
  filePath: string,
  line: number,
  matchedValue: string,
): RepositorySecretFinding {
  return Object.freeze({
    ruleId,
    path: normalizedRepositoryPath(filePath),
    line,
    fingerprint: createHash("sha256").update(matchedValue).digest("hex").slice(0, 16),
  });
}

export function scanTextForSecrets(
  filePath: string,
  text: string,
): readonly RepositorySecretFinding[] {
  const findings: RepositorySecretFinding[] = [];
  if (isTrackedEnvironmentFile(filePath)) {
    findings.push(finding("TRACKED_ENV_FILE", filePath, 1, filePath));
  }
  for (const rule of contentRules) {
    rule.expression.lastIndex = 0;
    for (const match of text.matchAll(rule.expression)) {
      const matchedValue = match[0];
      if (!matchedValue) continue;
      findings.push(
        finding(rule.ruleId, filePath, lineFor(text, match.index), matchedValue),
      );
    }
  }
  return Object.freeze(findings);
}

export async function scanRepositoryForSecrets(
  repositoryRoot: string,
): Promise<RepositorySecretScanReport> {
  const resolvedRoot = path.resolve(repositoryRoot);
  const { stdout } = await executeFile(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    {
      cwd: resolvedRoot,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  const trackedFiles = stdout.split("\0").filter(Boolean).sort();
  const findings: RepositorySecretFinding[] = [];
  let filesScanned = 0;
  for (const relativePath of trackedFiles) {
    const absolutePath = path.resolve(resolvedRoot, relativePath);
    if (
      absolutePath !== resolvedRoot &&
      !absolutePath.startsWith(`${resolvedRoot}${path.sep}`)
    ) {
      throw new Error("Tracked repository path escaped the repository root");
    }
    const bytes = await readFile(absolutePath);
    if (bytes.byteLength > 2 * 1024 * 1024 || bytes.includes(0)) continue;
    filesScanned += 1;
    findings.push(...scanTextForSecrets(relativePath, bytes.toString("utf8")));
  }
  findings.sort((left, right) =>
    `${left.path}:${left.line}:${left.ruleId}`.localeCompare(
      `${right.path}:${right.line}:${right.ruleId}`,
    ),
  );
  return Object.freeze({
    reportVersion: "pactwire-repository-secret-scan-v1",
    status: findings.length === 0 ? "PASS" : "FAIL",
    filesScanned,
    findings: Object.freeze(findings),
  });
}
