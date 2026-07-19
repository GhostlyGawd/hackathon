import { spawn } from "node:child_process";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  validateVerificationManifest,
  type VerificationCommand,
} from "./manifest.js";
import { sanitizeArtifactText } from "./sanitize.js";

const taskIdPattern = /^[A-Z]{2,4}-[0-9]{2}$/u;

export interface ArtifactLayout {
  readonly root: string;
  readonly manifest: string;
  readonly red: string;
  readonly green: string;
  readonly regression: string;
  readonly reports: string;
  readonly traces: string;
  readonly screenshots: string;
  readonly videos: string;
}

export interface CollectCommandOptions {
  readonly repositoryRoot: string;
  readonly taskId: string;
  readonly phase: VerificationCommand["phase"];
  readonly name: string;
  readonly executable: string;
  readonly args?: readonly string[];
  readonly cwd?: string;
  readonly secrets?: readonly string[];
  readonly expectedFailure?: string;
}

function assertTaskId(taskId: string): void {
  if (!taskIdPattern.test(taskId)) {
    throw new Error(`Invalid task ID: ${taskId}`);
  }
}

export function getArtifactLayout(
  repositoryRoot: string,
  taskId: string,
): ArtifactLayout {
  assertTaskId(taskId);
  const root = path.resolve(repositoryRoot, "artifacts", "verification", taskId);
  const expectedParent = path.resolve(repositoryRoot, "artifacts", "verification");
  if (!root.startsWith(expectedParent + path.sep)) {
    throw new Error("Artifact root escapes the repository verification directory");
  }

  return {
    root,
    manifest: path.join(root, "manifest.json"),
    red: path.join(root, "red.txt"),
    green: path.join(root, "green.txt"),
    regression: path.join(root, "regression.txt"),
    reports: path.join(root, "reports"),
    traces: path.join(root, "traces"),
    screenshots: path.join(root, "screenshots"),
    videos: path.join(root, "videos"),
  };
}

export async function ensureArtifactLayout(
  repositoryRoot: string,
  taskId: string,
): Promise<ArtifactLayout> {
  const layout = getArtifactLayout(repositoryRoot, taskId);
  await Promise.all(
    [layout.reports, layout.traces, layout.screenshots, layout.videos].map(
      (directory) => mkdir(directory, { recursive: true }),
    ),
  );
  return layout;
}

function phaseFile(layout: ArtifactLayout, phase: VerificationCommand["phase"]): string {
  switch (phase) {
    case "RED":
      return layout.red;
    case "GREEN":
      return layout.green;
    case "REGRESSION":
      return layout.regression;
  }
}

export async function collectCommandEvidence(
  options: CollectCommandOptions,
): Promise<VerificationCommand> {
  const layout = await ensureArtifactLayout(
    options.repositoryRoot,
    options.taskId,
  );
  const args = [...(options.args ?? [])];
  const startedAt = performance.now();
  const child = spawn(options.executable, args, {
    cwd: options.cwd ?? options.repositoryRoot,
    env: process.env,
    shell: false,
    windowsHide: true,
  });
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
  child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));

  const exitCode = await new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => resolve(code ?? 1));
  });
  const durationMs = Math.round(performance.now() - startedAt);
  const command = [options.executable, ...args].join(" ");
  const rawOutput = [
    `$ ${command}`,
    Buffer.concat(stdout).toString("utf8"),
    Buffer.concat(stderr).toString("utf8"),
    `Exit code: ${exitCode}`,
    "",
  ].join("\n");
  const sanitizationOptions = {
    repositoryRoot: options.repositoryRoot,
    ...(options.secrets ? { secrets: options.secrets } : {}),
  };
  const sanitized = sanitizeArtifactText(rawOutput, sanitizationOptions);
  const outputFile = phaseFile(layout, options.phase);
  await appendFile(outputFile, sanitized, "utf8");
  const outputPath = path
    .relative(options.repositoryRoot, outputFile)
    .replaceAll(path.sep, "/");

  return {
    phase: options.phase,
    name: options.name,
    command: sanitizeArtifactText(command, {
      ...(options.secrets ? { secrets: options.secrets } : {}),
    }),
    exitCode,
    durationMs,
    ...(options.expectedFailure
      ? { expectedFailure: options.expectedFailure }
      : {}),
    outputPath,
  };
}

export async function writeVerificationManifest(
  repositoryRoot: string,
  candidate: unknown,
): Promise<string> {
  const result = validateVerificationManifest(candidate);
  if (!result.ok) {
    throw new Error(
      `Invalid verification manifest: ${result.issues
        .map((issue) => `${issue.instancePath} ${issue.message}`)
        .join("; ")}`,
    );
  }
  const layout = await ensureArtifactLayout(repositoryRoot, result.value.taskId);
  await writeFile(
    layout.manifest,
    `${JSON.stringify(result.value, null, 2)}\n`,
    "utf8",
  );
  return layout.manifest;
}
