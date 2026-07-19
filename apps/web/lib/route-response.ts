import {
  AuthenticationRequiredError,
  PermissionDeniedError,
  WorkspaceUnavailableError,
} from "@pactwire/core";
import { NextResponse } from "next/server";

export function authorizationErrorResponse(error: unknown): NextResponse {
  if (
    error instanceof AuthenticationRequiredError ||
    error instanceof PermissionDeniedError ||
    error instanceof WorkspaceUnavailableError
  ) {
    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: error.publicMessage,
          auditRecorded: !(error instanceof AuthenticationRequiredError),
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
