import { z } from "zod";

export const REDACTED_SECRET = "[REDACTED_SECRET]";

export const secretValueSchema = z
  .string()
  .min(12)
  .max(4_096)
  .refine((value) => value.isWellFormed(), "Secret values must be valid Unicode")
  .refine(
    (value) => !value.includes(REDACTED_SECRET),
    "Secret values cannot contain the reserved redaction marker",
  );

export const SECRET_SCREENSHOT_MASK_SELECTORS = Object.freeze([
  "input[type='password']",
  "[data-secret]",
  "[data-pactwire-sensitive]",
  "[autocomplete='current-password']",
  "[autocomplete='new-password']",
] as const);

const sensitiveKey = /^(?:authorization|proxy-authorization|cookie|set-cookie|x-api-key|api[_-]?key|password|passcode|(?:access|refresh|id|auth)?[_-]?token|session(?:[_-]?id)?|(?:client[_-]?)?secret|credential)$/iu;

function percentEncodingWithCase(value: string, caseMode: "LOWER" | "UPPER"): string {
  return encodeURIComponent(value).replace(/%[0-9A-F]{2}/giu, (match) =>
    caseMode === "LOWER" ? match.toLowerCase() : match.toUpperCase(),
  );
}

function formEncoded(value: string): string {
  return new URLSearchParams({ value }).toString().slice("value=".length);
}

export function configuredSecretRepresentations(
  secretCandidate: unknown,
): readonly string[] {
  const secret = secretValueSchema.parse(secretCandidate);
  const jsonEncoded = JSON.stringify(secret).slice(1, -1);
  const representations = [
    secret,
    percentEncodingWithCase(secret, "UPPER"),
    percentEncodingWithCase(secret, "LOWER"),
    formEncoded(secret),
    Buffer.from(secret, "utf8").toString("base64"),
    Buffer.from(secret, "utf8").toString("base64url"),
    jsonEncoded,
  ];
  return Object.freeze(
    [...new Set(representations)]
      .filter((value) => value.length > 0)
      .sort((left, right) => right.length - left.length || left.localeCompare(right)),
  );
}

function unredactedSegments(value: string): readonly string[] {
  return value.split(REDACTED_SECRET);
}

function replaceOutsideMarkers(
  input: string,
  search: string,
): { readonly value: string; readonly count: number } {
  let count = 0;
  const value = unredactedSegments(input)
    .map((segment) => {
      const pieces = segment.split(search);
      count += Math.max(0, pieces.length - 1);
      return pieces.join(REDACTED_SECRET);
    })
    .join(REDACTED_SECRET);
  return { value, count };
}

export interface RedactionResult<T> {
  readonly value: T;
  readonly redactionCount: number;
}

export function redactSecretTextWithCount(
  input: string,
  secretCandidates: readonly string[],
): RedactionResult<string> {
  let value = input;
  let redactionCount = 0;
  const representations = [
    ...new Set(
      secretCandidates.flatMap((secret) => configuredSecretRepresentations(secret)),
    ),
  ].sort((left, right) => right.length - left.length || left.localeCompare(right));

  for (const representation of representations) {
    const replaced = replaceOutsideMarkers(value, representation);
    value = replaced.value;
    redactionCount += replaced.count;
  }
  return Object.freeze({ value, redactionCount });
}

export function redactSecretText(
  input: string,
  secrets: readonly string[],
): string {
  return redactSecretTextWithCount(input, secrets).value;
}

export function containsSecretRepresentation(
  input: string,
  secretCandidates: readonly string[],
): boolean {
  const segments = unredactedSegments(input);
  return secretCandidates.some((secret) =>
    configuredSecretRepresentations(secret).some((representation) =>
      segments.some((segment) => segment.includes(representation)),
    ),
  );
}

function redactStructured(
  candidate: unknown,
  secrets: readonly string[],
  seen: WeakMap<object, unknown>,
): RedactionResult<unknown> {
  if (typeof candidate === "string") {
    return redactSecretTextWithCount(candidate, secrets);
  }
  if (candidate === null || typeof candidate !== "object") {
    return { value: candidate, redactionCount: 0 };
  }
  if (candidate instanceof Date) {
    return { value: new Date(candidate), redactionCount: 0 };
  }
  const prior = seen.get(candidate);
  if (prior !== undefined) {
    return { value: prior, redactionCount: 0 };
  }
  if (Array.isArray(candidate)) {
    const output: unknown[] = [];
    seen.set(candidate, output);
    let redactionCount = 0;
    for (const item of candidate) {
      const redacted = redactStructured(item, secrets, seen);
      output.push(redacted.value);
      redactionCount += redacted.redactionCount;
    }
    return { value: output, redactionCount };
  }

  const output: Record<string, unknown> = {};
  seen.set(candidate, output);
  let redactionCount = 0;
  for (const [key, nested] of Object.entries(candidate)) {
    if (sensitiveKey.test(key)) {
      output[key] = REDACTED_SECRET;
      redactionCount += 1;
      continue;
    }
    const redacted = redactStructured(nested, secrets, seen);
    output[key] = redacted.value;
    redactionCount += redacted.redactionCount;
  }
  return { value: output, redactionCount };
}

export function redactStructuredValueWithCount<T>(
  input: T,
  secrets: readonly string[],
): RedactionResult<T> {
  const redacted = redactStructured(input, secrets, new WeakMap());
  return Object.freeze({
    value: redacted.value as T,
    redactionCount: redacted.redactionCount,
  });
}

export function redactStructuredValue<T>(input: T, secrets: readonly string[]): T {
  return redactStructuredValueWithCount(input, secrets).value;
}
