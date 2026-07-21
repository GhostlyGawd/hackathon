import {
  AgreementCorruptError,
  AgreementHashMismatchError,
  AgreementIntegrityError,
  AgreementTooLargeError,
  AgreementUnavailableError,
  AuthenticationRequiredError,
  CanaryGenerationExhaustedError,
  CanarySourceUnavailableError,
  DestinationEvidenceMismatchError,
  DestinationRegistryConflictError,
  DestinationUnavailableError,
  LikelyRealDataError,
  JourneyPrerequisiteError,
  JourneyVersionConflictError,
  JourneyVersionUnavailableError,
  PersonaUnavailableError,
  PolicyDeniedError,
  PermissionDeniedError,
  RawSecretAccessDeniedError,
  RequirementReviewConflictError,
  RequirementVersionUnavailableError,
  SecretUnavailableError,
  UnsupportedAgreementTypeError,
  WorkspaceUnavailableError,
} from "@pactwire/core";
import { NextResponse } from "next/server";

export function authorizationErrorResponse(error: unknown): NextResponse {
  if (
    error instanceof AgreementCorruptError ||
    error instanceof AgreementHashMismatchError ||
    error instanceof AgreementIntegrityError ||
    error instanceof AgreementTooLargeError ||
    error instanceof AgreementUnavailableError ||
    error instanceof UnsupportedAgreementTypeError
  ) {
    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: error.publicMessage,
          auditRecorded: false,
        },
      },
      { status: error.status },
    );
  }
  if (
    error instanceof DestinationEvidenceMismatchError ||
    error instanceof DestinationRegistryConflictError ||
    error instanceof DestinationUnavailableError ||
    error instanceof RequirementReviewConflictError ||
    error instanceof RequirementVersionUnavailableError ||
    error instanceof JourneyVersionConflictError ||
    error instanceof JourneyVersionUnavailableError
  ) {
    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: error.publicMessage,
          auditRecorded: false,
        },
      },
      { status: error.status },
    );
  }
  if (error instanceof JourneyPrerequisiteError) {
    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: error.publicMessage,
          auditRecorded: false,
          blockers: error.blockers,
        },
      },
      { status: error.status },
    );
  }
  if (error instanceof LikelyRealDataError) {
    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: error.publicMessage,
          auditRecorded: error.auditRecorded,
          findings: error.findings,
        },
      },
      { status: error.status },
    );
  }
  if (error instanceof RawSecretAccessDeniedError) {
    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: error.publicMessage,
          auditRecorded: error.auditRecorded,
        },
      },
      { status: error.status },
    );
  }
  if (error instanceof PolicyDeniedError) {
    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: error.publicMessage,
          reason: error.reason,
          auditRecorded: error.auditRecorded,
          decision: error.decision,
        },
      },
      { status: error.status },
    );
  }
  if (
    error instanceof AuthenticationRequiredError ||
    error instanceof CanaryGenerationExhaustedError ||
    error instanceof CanarySourceUnavailableError ||
    error instanceof PermissionDeniedError ||
    error instanceof PersonaUnavailableError ||
    error instanceof SecretUnavailableError ||
    error instanceof WorkspaceUnavailableError
  ) {
    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: error.publicMessage,
          auditRecorded:
            error instanceof PermissionDeniedError ||
            error instanceof SecretUnavailableError ||
            error instanceof WorkspaceUnavailableError,
        },
      },
      { status: error.status },
    );
  }
  if (
    error instanceof SyntaxError ||
    error instanceof TypeError ||
    (error instanceof Error && error.name === "ZodError")
  ) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_REQUEST",
          message: "The request could not be processed.",
          auditRecorded: false,
        },
      },
      { status: 400 },
    );
  }
  return NextResponse.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "Pactwire could not complete the request.",
        auditRecorded: false,
      },
    },
    { status: 500 },
  );
}
