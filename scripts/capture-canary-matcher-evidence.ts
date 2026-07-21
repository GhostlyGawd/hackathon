import { Buffer } from "node:buffer";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  CANARY_MATCHER_VERSION,
  matchCanaryObservation,
} from "../packages/core/src/canary-matcher";
import type { Canary } from "../packages/core/src/domain";

function argument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index === -1 ? undefined : process.argv[index + 1];
  if (!value) throw new TypeError(`Missing ${name}`);
  return value;
}

const sourceCommitSha = argument("--source-commit");
if (!/^[a-f0-9]{40}$/u.test(sourceCommitSha)) {
  throw new TypeError("--source-commit must be a full Git commit SHA");
}
const outputPath = path.resolve(argument("--output"));
const workspaceId = "11111111-1111-4111-8111-111111111111";
const runId = "22222222-2222-4222-8222-222222222222";
const observedAt = "2026-07-20T12:00:00.000Z";
const emailCanary: Canary = {
  id: "44444444-4444-4444-8444-444444444444",
  workspaceId,
  runId,
  personaId: "55555555-5555-4555-8555-555555555555",
  sourceField: "email",
  value: "pw-0123456789abcdef0123456789abcdef@canary.pactwire.invalid",
  generatedAt: "2026-07-20T11:59:00.000Z",
};
const phraseCanary: Canary = {
  id: "66666666-6666-4666-8666-666666666666",
  workspaceId,
  runId,
  personaId: emailCanary.personaId,
  sourceField: "submissionPhrase",
  value: "PACTWIRE-FICTIONAL-ABCDEF0123456789ABCDEF0123456789",
  generatedAt: emailCanary.generatedAt,
};

function observation(id: string, sequence: number) {
  return {
    id,
    workspaceId,
    runId,
    source: "NETWORK" as const,
    recorderVersion: "pactwire-browser-cdp-recorder-v1",
    sequence,
    observedAt,
    payloadHash: sequence.toString(16).padStart(64, "0"),
    facts: { kind: "SANITIZED_DET_02_EVIDENCE_FIXTURE" },
  };
}

const acceptedAndBounded = matchCanaryObservation({
  observation: observation("77777777-7777-4777-8777-777777777777", 1),
  canaries: [emailCanary, phraseCanary],
  candidates: [
    { location: "BODY", path: "student.email", value: emailCanary.value },
    {
      location: "QUERY",
      path: "student_email",
      value: encodeURIComponent(emailCanary.value),
    },
    {
      location: "HEADER",
      path: "x-fictional-submission",
      value: Buffer.from(phraseCanary.value, "utf8").toString("base64"),
    },
    {
      location: "BODY",
      path: "narrative",
      value: `Similar mention: ${emailCanary.value}`,
    },
    {
      location: "STORAGE",
      path: "opaqueStudentReference",
      value: "opaque-0123456789abcdef01234567",
      requestedTransform: "UNSUPPORTED_OPAQUE",
    },
  ],
});
const collision = matchCanaryObservation({
  observation: observation("88888888-8888-4888-8888-888888888888", 2),
  canaries: [
    emailCanary,
    {
      ...emailCanary,
      id: "99999999-9999-4999-8999-999999999999",
      personaId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    },
  ],
  candidates: [
    { location: "BODY", path: "student.email", value: emailCanary.value },
  ],
});

const evidence = {
  schemaVersion: "1.0.0",
  taskId: "DET-02",
  matcherVersion: CANARY_MATCHER_VERSION,
  sourceCommitSha,
  capturedAt: new Date().toISOString(),
  authorityBoundary: {
    positiveMatchOwner: "DETERMINISTIC_ENUMERATED_MATCHER",
    modelUsed: false,
    wholeFieldOnly: true,
    acceptedTransforms: ["EXACT", "URL_ENCODED", "BASE64"],
    unsupportedResult: "UNSUPPORTED_TRANSFORM",
    collisionResult: "COLLISION",
  },
  generatedCorpus: {
    propertyId: "PROP-06",
    seed: 20_260_720,
    enumeratedTransformRuns: 1_000,
    arbitraryContainerRuns: 4_000,
    locations: ["BODY", "HEADER", "QUERY"],
  },
  reports: [acceptedAndBounded, collision],
};
const serialized = `${JSON.stringify(evidence, null, 2)}\n`;
for (const rawValue of [emailCanary.value, phraseCanary.value]) {
  if (serialized.includes(rawValue)) {
    throw new Error("Matcher evidence retained a raw fictional canary value");
  }
}
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, serialized, "utf8");
