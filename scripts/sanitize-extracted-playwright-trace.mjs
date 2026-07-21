import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const [traceRootCandidate, repositoryRootCandidate] = process.argv.slice(2);
if (!traceRootCandidate || !repositoryRootCandidate) {
  throw new Error(
    "Usage: node scripts/sanitize-extracted-playwright-trace.mjs <trace-root> <repository-root>",
  );
}

const traceRoot = path.resolve(traceRootCandidate);
const repositoryRoot = path.resolve(repositoryRootCandidate);
const verificationRoot = path.resolve(
  process.cwd(),
  "artifacts",
  "verification",
);
const relativeTraceRoot = path.relative(verificationRoot, traceRoot);
const traceSegments = relativeTraceRoot.split(path.sep);
if (
  relativeTraceRoot === "" ||
  relativeTraceRoot === ".." ||
  relativeTraceRoot.startsWith(`..${path.sep}`) ||
  path.isAbsolute(relativeTraceRoot) ||
  traceSegments.length < 2 ||
  !/^[A-Z][A-Z0-9-]{1,31}$/u.test(traceSegments[0] ?? "")
) {
  throw new Error(
    "The extracted trace root must stay inside a task-specific verification artifact directory.",
  );
}

async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const resolved = path.join(directory, entry.name);
      return entry.isDirectory() ? filesUnder(resolved) : [resolved];
    }),
  );
  return nested.flat();
}

const textTraceNames = new Set([
  "trace.trace",
  "trace.network",
  "trace.stacks",
  "test.trace",
]);
const replacements = [
  repositoryRoot,
  repositoryRoot.replaceAll("\\", "/"),
  repositoryRoot.replaceAll("/", "\\"),
].filter((value, index, values) => value && values.indexOf(value) === index);
let replacementCount = 0;
let scannedTextFiles = 0;

for (const file of await filesUnder(traceRoot)) {
  if (!textTraceNames.has(path.basename(file))) continue;
  scannedTextFiles += 1;
  let text = await readFile(file, "utf8");
  for (const value of replacements) {
    const pieces = text.split(value);
    replacementCount += Math.max(0, pieces.length - 1);
    text = pieces.join("$REPOSITORY");
  }
  if (
    text.includes(repositoryRoot) ||
    /\bsk-[A-Za-z0-9_-]{12,}\b/u.test(text) ||
    /OPENAI_API_KEY/u.test(text) ||
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u.test(text)
  ) {
    throw new Error(`Sensitive trace text remained in ${path.basename(file)}.`);
  }
  await writeFile(file, text, "utf8");
}

await writeFile(
  path.join(traceRoot, "sanitization.json"),
  `${JSON.stringify(
    {
      schemaVersion: "1.0.0",
      source: "PACTWIRE_PLAYWRIGHT_TRACE_SANITIZER",
      scannedTextFiles,
      repositoryPathReplacements: replacementCount,
      credentialPatternsFound: 0,
      passed: true,
    },
    null,
    2,
  )}\n`,
  "utf8",
);
