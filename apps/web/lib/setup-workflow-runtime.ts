import {
  deriveSetupWorkflow,
  type SetupWorkflowView,
  type SoftwareInventoryItem,
  type WorkspacePrincipal,
} from "@pactwire/core";
import type { AccessRuntime } from "./access-fixture";

export async function deriveRuntimeSetupWorkflow(input: {
  readonly runtime: AccessRuntime;
  readonly principal: WorkspacePrincipal;
  readonly workspaceId: string;
  readonly item: SoftwareInventoryItem;
}): Promise<SetupWorkflowView> {
  const { runtime, principal, workspaceId, item } = input;
  const softwareId = item.software.id;
  const [authorizations, agreements, personas] = await Promise.all([
    runtime.testAuthorizationService.listAuthorizations({
      principal,
      workspaceId,
      softwareId,
    }),
    runtime.agreementService.listAgreements({
      principal,
      workspaceId,
      softwareId,
    }),
    runtime.syntheticDataService.listPersonas({ principal, workspaceId }),
  ]);
  const latestAgreement = agreements[0];
  const [requirements, journeys] = latestAgreement
    ? await Promise.all([
        runtime.requirementReviewService.listRequirementHistory({
          principal,
          workspaceId,
          softwareId,
          agreementVersionId: latestAgreement.id,
        }),
        runtime.journeyAuthoringService.listJourneys({
          principal,
          workspaceId,
          softwareId,
          agreementVersionId: latestAgreement.id,
        }),
      ])
    : [{ current: [] }, { current: [] }];
  const origin = item.software.approvalOrigin;
  return deriveSetupWorkflow({
    software: {
      id: item.software.id,
      workspaceId: item.software.workspaceId,
      name: item.software.name,
      approvalState: item.software.approvalState,
      approvalOrigin: {
        state: origin.state,
        setBy: {
          kind: origin.setBy.kind,
          actorId: origin.setBy.actorId,
          displayName: origin.setBy.displayName,
        },
        reason: origin.reason,
        ...(origin.sourceReference
          ? { sourceReference: origin.sourceReference }
          : {}),
        recordedAt: origin.recordedAt,
      },
    },
    authorizations: authorizations.map((authorization) => ({
      id: authorization.id,
      version: authorization.version,
      effectiveStatus: authorization.effectiveStatus,
      reviewAt: authorization.reviewAt,
      expiresAt: authorization.expiresAt,
    })),
    agreements: agreements.map((agreement) => ({
      id: agreement.id,
      version: agreement.version,
    })),
    currentRequirements: requirements.current.map((requirement) => ({
      agreementVersionId: requirement.agreementVersionId,
      status: requirement.status,
      executable: requirement.executable,
    })),
    personas: personas.map((persona) => ({
      role: persona.role,
      fieldCount: Object.keys(persona.fields).length,
    })),
    currentJourneys: journeys.current.map((journey) => {
      const required = journey.version.checkpoints.filter(
        (checkpoint) => checkpoint.required,
      );
      return {
        agreementVersionId: journey.version.agreementVersionId,
        readinessStatus: journey.readiness.status,
        requiredCheckpointCount: required.length,
        requiredVisibleCheckpointCount: required.filter(
          (checkpoint) => checkpoint.requiredVisibility,
        ).length,
      };
    }),
  });
}
