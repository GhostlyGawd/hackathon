export interface ArtifactSanitizationOptions {
  readonly repositoryRoot?: string;
  readonly secrets?: readonly string[];
}

const credentialPatterns = [
  /\bBearer\s+[A-Za-z0-9._~+/-]+=*/giu,
  /\bsk-[A-Za-z0-9_-]{8,}/gu,
  /\bgh[pousr]_[A-Za-z0-9_-]{8,}/gu,
];

function replaceAllLiteral(
  value: string,
  search: string,
  replacement: string,
): string {
  return search.length === 0 ? value : value.split(search).join(replacement);
}

export function sanitizeArtifactText(
  input: string,
  options: ArtifactSanitizationOptions = {},
): string {
  let sanitized = input;

  for (const secret of [...(options.secrets ?? [])].sort(
    (left, right) => right.length - left.length,
  )) {
    sanitized = replaceAllLiteral(sanitized, secret, "[REDACTED_SECRET]");
  }

  for (const pattern of credentialPatterns) {
    sanitized = sanitized.replace(pattern, "[REDACTED_CREDENTIAL]");
  }

  if (options.repositoryRoot) {
    sanitized = replaceAllLiteral(
      sanitized,
      options.repositoryRoot,
      "$REPOSITORY",
    );
    sanitized = replaceAllLiteral(
      sanitized,
      options.repositoryRoot.replaceAll("\\", "/"),
      "$REPOSITORY",
    );
  }

  sanitized = sanitized
    .replace(/([A-Za-z]:\\Users\\)[^\\\s/]+/gu, "$1$USER")
    .replace(/\/(home|Users)\/[^/\s]+/gu, "/$1/$USER");

  return sanitized;
}
